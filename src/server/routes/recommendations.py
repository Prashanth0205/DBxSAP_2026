"""
GET /api/districts/{district}/recommendations?capability=&state=

Streams AI-generated planning recommendations as SSE, emitting each card
as it is parsed from the LLM token stream. The client renders cards
progressively — first card appears within ~2s instead of waiting ~9s for all.

SSE event types:
  card   — one complete Recommendation object (JSON)
  done   — stream finished, carries { total: N }
  error  — something went wrong, carries { message: str }
"""
import asyncio
import json
import logging
import time
from fastapi import APIRouter, Path, Query
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncIterator

from server.warehouse import (
    wh_query, alias_ctes,
    normalize_state, normalize_district,
    TBL_FACILITIES,
)
from server.agent import _call_with_retry, _extract_content, stream_llm_tokens
from server.lib.capability_keywords import build_ilike_conditions

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# In-process cache: (district_canon, state_canon, capability) → (timestamp, cards[])
_cache: dict[tuple, tuple[float, list]] = {}
_CACHE_TTL = 300.0

RECOMMENDATIONS_SYSTEM_PROMPT = """You are a healthcare planning advisor for India.

Given data about a district — its facilities, health outcomes, and care gap category —
produce 4–5 specific, actionable recommendations for a government health planner.

Each recommendation must be concrete and cite actual data from the input (facility names,
NFHS-5 numbers, doctor counts, equipment gaps). Never give generic advice.

IMPORTANT: Output a JSON array where each element is a complete, self-contained object.
Place each object on its own line, separated by commas. Start immediately with [ and end with ].
No markdown, no preamble.

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


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _parse_cards_from_buffer(buf: str) -> tuple[list[dict], str]:
    """Extract complete JSON objects from the token buffer."""
    cards = []
    i = 0
    while i < len(buf):
        start = buf.find('{', i)
        if start == -1:
            break
        depth = 0
        in_string = False
        escape_next = False
        j = start
        while j < len(buf):
            c = buf[j]
            if escape_next:
                escape_next = False
                j += 1
                continue
            if c == '\\' and in_string:
                escape_next = True
                j += 1
                continue
            if c == '"':
                in_string = not in_string
                j += 1
                continue
            if not in_string:
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        try:
                            cards.append(json.loads(buf[start:j + 1]))
                            i = j + 1
                        except Exception:
                            i = start + 1
                        break
            j += 1
        else:
            break
    return cards, buf[i:]


async def _stream_recommendations(
    district: str,
    state: str,
    state_canon: str,
    district_canon: str,
    capability: str,
    cache_key: tuple,
) -> AsyncIterator[str]:

    cap_condition = build_ilike_conditions(capability, [
        "LOWER(COALESCE(f.specialties,'') || ' ' || COALESCE(f.capability,'') || ' ' || COALESCE(f.description,''))"
    ])

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
            from server.warehouse import TBL_NFHS5
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

    loop = asyncio.get_running_loop()
    facilities, nfhs5 = await asyncio.gather(
        loop.run_in_executor(None, _fetch_facilities),
        loop.run_in_executor(None, _fetch_nfhs),
    )

    matching = [f for f in facilities if f.get("has_capability")]
    non_matching = [f for f in facilities if not f.get("has_capability")]

    def summarise(f: dict) -> dict:
        return {k: f.get(k) for k in
                ("name", "address_city", "organization_type", "numberDoctors",
                 "capacity", "specialties", "equipment", "yearEstablished", "has_capability")}

    context = {
        "district": district, "state": state, "capability": capability,
        "total_facilities": len(facilities),
        "matching_facilities": len(matching),
        "non_matching_facilities": len(non_matching),
        "matching_facilities_detail": [summarise(f) for f in matching[:10]],
        "non_matching_facilities_detail": [summarise(f) for f in non_matching[:15]],
        "nfhs5_indicators": nfhs5,
    }

    messages = [
        {"role": "system", "content": RECOMMENDATIONS_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f"District: {district}, State: {state}\nCapability gap: {capability}\n\n"
            f"Data:\n{json.dumps(context, indent=2, default=str)}\n\n"
            f"Generate 4-5 specific planning recommendations as a JSON array."
        )},
    ]

    # Drive the sync generator in a thread via a queue so tokens flow
    # to the parser as they arrive — not buffered into a list first.
    import queue as _queue
    buf = ""
    emitted: list[dict] = []
    token_q: _queue.Queue = _queue.Queue()
    _SENTINEL = object()

    def _produce():
        try:
            for tok in stream_llm_tokens(messages):
                token_q.put(tok)
        except Exception as exc:
            token_q.put(exc)
        finally:
            token_q.put(_SENTINEL)

    producer = loop.run_in_executor(None, _produce)
    try:
        while True:
            tok = await loop.run_in_executor(None, token_q.get)
            if tok is _SENTINEL:
                break
            if isinstance(tok, Exception):
                raise tok
            buf += tok
            cards, buf = _parse_cards_from_buffer(buf)
            for card in cards:
                emitted.append(card)
                yield _sse("card", card)
        await producer
    except Exception as e:
        LOGGER.error(f"recommendations | stream failed: {e}")
        yield _sse("error", {"message": "Could not generate recommendations — try again."})
        return

    if emitted:
        _cache[cache_key] = (time.time(), emitted)

    yield _sse("done", {"total": len(emitted)})


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
        async def _replay():
            for card in hit[1]:
                yield _sse("card", card)
            yield _sse("done", {"total": len(hit[1])})
        return StreamingResponse(_replay(), media_type="text/event-stream")

    return StreamingResponse(
        _stream_recommendations(district, state, state_canon, district_canon, capability, cache_key),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
