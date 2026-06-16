"""
GET /api/districts/{district}/recommendations?capability=&state=

Returns AI-generated planning recommendations for a district.
Each recommendation is a specific, actionable card with:
  - type: upgrade | equip | new_facility | data_action
  - title: short headline
  - detail: specific action citing real facility names / NFHS-5 numbers
  - target: facility name if applicable (null for district-wide actions)
  - effort: Low | Medium | High
  - impact: Low | Medium | High
  - priority: 1-based rank
"""
import asyncio
import json
import logging
import time
from fastapi import APIRouter, Path, Query
from typing import Optional

from server.warehouse import (
    wh_query, alias_ctes,
    normalize_state, normalize_district,
    TBL_FACILITIES, TBL_NFHS5,
)
from server.agent import _call_with_retry, _extract_content
from server.lib.capability_keywords import build_ilike_conditions

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# In-process cache: (district_canon, state_canon, capability) → (timestamp, result)
_cache: dict[tuple, tuple[float, dict]] = {}
_CACHE_TTL = 300.0

RECOMMENDATIONS_SYSTEM_PROMPT = """You are a healthcare planning advisor for India.

Given data about a district — its facilities, health outcomes, and care gap category —
produce 4–5 specific, actionable recommendations for a government health planner.

Each recommendation must be concrete and cite actual data from the input (facility names,
NFHS-5 numbers, doctor counts, equipment gaps). Never give generic advice.

Return ONLY a JSON array, no markdown, no preamble:
[
  {
    "type": "upgrade | equip | new_facility | data_action | policy",
    "title": "Short headline (max 10 words)",
    "detail": "Specific action citing real names and numbers from the data (2-3 sentences)",
    "target": "Facility name if applicable, else null",
    "effort": "Low | Medium | High",
    "impact": "Low | Medium | High",
    "priority": 1
  }
]

Types:
- upgrade: existing facility can add the missing capability with modest changes
- equip: facility exists but lacks equipment to serve the capability
- new_facility: no facility exists in an area — new PHC/CHC needed
- data_action: data is missing/incomplete — field visit or registry update needed
- policy: government scheme or programme that applies to this gap

Priority 1 = most urgent. Sort by priority ascending."""


@router.get("/districts/{district}/recommendations")
async def get_recommendations(
    district: str = Path(...),
    capability: str = Query(...),
    state: Optional[str] = Query(None),
):
    if not state:
        return {"error": "state is required"}

    state_canon = normalize_state(state)
    district_canon = normalize_district(district)

    cache_key = (district_canon, state_canon, capability.lower())
    hit = _cache.get(cache_key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        LOGGER.info(f"recommendations | cache hit for {district}/{capability}")
        return hit[1]

    cap_condition = build_ilike_conditions(capability, [
        "LOWER(COALESCE(f.specialties,'') || ' ' || COALESCE(f.capability,'') || ' ' || COALESCE(f.description,''))"
    ])

    # ── Fetch facility + NFHS-5 data in parallel ─────────────────────────
    def _fetch_facilities():
        try:
            return wh_query(f"""
WITH {alias_ctes()}
SELECT
  f.name, f.organization_type,
  f.numberDoctors, f.capacity,
  f.specialties, f.capability, f.equipment, f.procedure,
  f.description, f.yearEstablished, f.address_city,
  CASE WHEN {cap_condition} THEN true ELSE false END AS has_capability
FROM {TBL_FACILITIES} f
JOIN pin_norm p ON CAST(f.address_zipOrPostcode AS STRING) = CAST(p.pincode AS STRING)
WHERE p.state_canon = :p1 AND p.district_canon = :p2
LIMIT 50
""", [state_canon, district_canon])
        except Exception as e:
            LOGGER.warning(f"recommendations | facility query failed: {e}")
            return []

    def _fetch_nfhs():
        try:
            rows = wh_query(f"""
WITH {alias_ctes()}
SELECT
  institutional_birth_5y_pct,
  births_attended_by_skilled_hp_5y_10_pct,
  mothers_who_had_at_least_4_anc_visits_lb5y_pct,
  child_u5_who_are_stunted_height_for_age_18_pct,
  hh_electricity_pct, hh_improved_water_pct,
  hh_member_covered_health_insurance_pct,
  w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct,
  w15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct
FROM nfhs_canon
WHERE state_canon = :p1 AND district_canon = :p2
LIMIT 1
""", [state_canon, district_canon])
            return rows[0] if rows else {}
        except Exception as e:
            LOGGER.warning(f"recommendations | NFHS-5 query failed: {e}")
            return {}

    loop = asyncio.get_event_loop()
    facilities, nfhs5 = await asyncio.gather(
        loop.run_in_executor(None, _fetch_facilities),
        loop.run_in_executor(None, _fetch_nfhs),
    )

    # ── Build LLM context ─────────────────────────────────────────────────
    matching = [f for f in facilities if f.get("has_capability")]
    non_matching = [f for f in facilities if not f.get("has_capability")]

    def summarise_facility(f: dict) -> dict:
        return {
            "name": f.get("name"),
            "city": f.get("address_city"),
            "type": f.get("organization_type"),
            "doctors": f.get("numberDoctors"),
            "capacity": f.get("capacity"),
            "specialties": f.get("specialties"),
            "equipment": f.get("equipment"),
            "year_established": f.get("yearEstablished"),
            "has_capability": f.get("has_capability"),
        }

    context = {
        "district": district,
        "state": state,
        "capability": capability,
        "total_facilities": len(facilities),
        "matching_facilities": len(matching),
        "non_matching_facilities": len(non_matching),
        "matching_facilities_detail": [summarise_facility(f) for f in matching[:10]],
        "non_matching_facilities_detail": [summarise_facility(f) for f in non_matching[:15]],
        "nfhs5_indicators": nfhs5,
    }

    user_message = (
        f"District: {district}, State: {state}\n"
        f"Capability gap: {capability}\n\n"
        f"Data:\n{json.dumps(context, indent=2, default=str)}\n\n"
        f"Generate 4-5 specific planning recommendations as a JSON array."
    )

    messages = [
        {"role": "system", "content": RECOMMENDATIONS_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        response = await _call_with_retry(messages, tools=None, max_tokens=2048)
        content = _extract_content(response)
        clean = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        recommendations = json.loads(clean)
        LOGGER.info(f"recommendations | generated {len(recommendations)} for {district}/{capability}")
        result = {"district": district, "state": state, "capability": capability, "recommendations": recommendations}
        _cache[cache_key] = (time.time(), result)
        return result
    except Exception as e:
        LOGGER.error(f"recommendations | LLM failed: {e}")
        return {
            "district": district, "state": state, "capability": capability,
            "recommendations": [],
            "error": "Could not generate recommendations — try again.",
        }
