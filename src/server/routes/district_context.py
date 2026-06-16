"""
GET /api/districts/{district}/context

Returns contextual data for the district analysis page:
- rank in state (worst-first by gap_score)
- total districts in state
- pincode_count as population proxy
- 3 neighbouring districts by gap score proximity
- confidence breakdown (which fields are missing and why)
"""
import logging
from fastapi import APIRouter, Path, Query
from typing import Optional

from server.warehouse import (
    wh_query,
    alias_ctes,
    normalize_state,
    normalize_district,
    TBL_FACILITIES,
    TBL_PINCODE,
)

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/districts/{district}/context")
def get_district_context(
    district: str = Path(...),
    capability: str = Query(...),
    state: Optional[str] = Query(None),
):
    if not state:
        return {"error": "state is required"}

    state_canon = normalize_state(state)
    district_canon = normalize_district(district)
    cap_pattern = f"%{capability.lower()}%"

    # ── 1. All districts in the state ranked by gap score ─────────────────
    rank_sql = f"""
WITH {alias_ctes()},
fac AS (
  SELECT
    CAST(f.address_zipOrPostcode AS STRING) AS pincode,
    LOWER(COALESCE(f.specialties,'') || ' ' || COALESCE(f.capability,'') || ' ' || COALESCE(f.description,'')) AS hay
  FROM {TBL_FACILITIES} f
  WHERE f.address_zipOrPostcode IS NOT NULL
    AND f.address_zipOrPostcode NOT IN ('','null')
),
by_district AS (
  SELECT
    p.district_canon,
    CAST(COUNT(*) AS BIGINT) AS total_facilities,
    CAST(SUM(CASE WHEN fac.hay LIKE :p1 THEN 1 ELSE 0 END) AS BIGINT) AS matching_facilities,
    CAST(ROUND((SUM(CASE WHEN fac.hay LIKE :p1 THEN 1 ELSE 0 END) * 10.0) / NULLIF(COUNT(*),0), 2) AS DOUBLE) AS gap_score,
    CAST(ROUND(AVG(
      (CASE WHEN f2.latitude IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN f2.longitude IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN f2.description IS NOT NULL AND LENGTH(f2.description) > 20 THEN 1 ELSE 0 END +
       CASE WHEN f2.numberDoctors IS NOT NULL AND f2.numberDoctors NOT IN ('','null') THEN 1 ELSE 0 END +
       CASE WHEN f2.phone_numbers IS NOT NULL AND f2.phone_numbers NOT IN ('','null','[]') THEN 1 ELSE 0 END +
       CASE WHEN f2.source IS NOT NULL AND f2.source NOT IN ('','null') THEN 1 ELSE 0 END
      ) / 6.0
    ), 2) AS DOUBLE) AS confidence
  FROM fac
  JOIN pin_norm p ON fac.pincode = CAST(p.pincode AS STRING)
  JOIN {TBL_FACILITIES} f2 ON CAST(f2.address_zipOrPostcode AS STRING) = fac.pincode
  WHERE p.state_canon = :p2
  GROUP BY p.district_canon
)
SELECT
  district_canon,
  total_facilities,
  matching_facilities,
  COALESCE(gap_score, 0.0) AS gap_score,
  confidence,
  ROW_NUMBER() OVER (ORDER BY COALESCE(gap_score,0) ASC, confidence DESC) AS rank_in_state
FROM by_district
ORDER BY rank_in_state ASC
""".strip()

    try:
        all_districts = wh_query(rank_sql, [cap_pattern, state_canon])
    except Exception as e:
        LOGGER.warning(f"context | rank query failed: {e}")
        all_districts = []

    total_districts = len(all_districts)
    this_rank = next(
        (int(r["rank_in_state"]) for r in all_districts
         if r["district_canon"].upper() == district_canon.upper()),
        None
    )

    # ── 2. Pincode count as population proxy ──────────────────────────────
    pop_sql = f"""
WITH {alias_ctes()}
SELECT COUNT(DISTINCT p.pincode) AS pincode_count
FROM {TBL_PINCODE} p
JOIN pin_norm pn ON CAST(p.pincode AS STRING) = CAST(pn.pincode AS STRING)
WHERE pn.state_canon = :p1
  AND pn.district_canon = :p2
""".strip()

    try:
        pop_rows = wh_query(pop_sql, [state_canon, district_canon])
        pincode_count = int(pop_rows[0]["pincode_count"]) if pop_rows else 0
    except Exception as e:
        LOGGER.warning(f"context | population proxy query failed: {e}")
        pincode_count = 0

    # ── 3. Nearby districts (closest gap scores) ──────────────────────────
    this_gap = next(
        (r["gap_score"] for r in all_districts
         if r["district_canon"].upper() == district_canon.upper()),
        0.0
    )
    nearby = sorted(
        [r for r in all_districts if r["district_canon"].upper() != district_canon.upper()],
        key=lambda r: abs((r.get("gap_score") or 0) - this_gap)
    )[:3]

    # ── 4. Confidence breakdown ────────────────────────────────────────────
    conf_sql = f"""
WITH {alias_ctes()}
SELECT
  CAST(COUNT(*) AS BIGINT) AS total,
  CAST(SUM(CASE WHEN f.latitude IS NOT NULL THEN 1 ELSE 0 END) AS BIGINT) AS has_coords,
  CAST(SUM(CASE WHEN f.description IS NOT NULL AND LENGTH(f.description) > 20 THEN 1 ELSE 0 END) AS BIGINT) AS has_description,
  CAST(SUM(CASE WHEN f.numberDoctors IS NOT NULL AND f.numberDoctors NOT IN ('','null') THEN 1 ELSE 0 END) AS BIGINT) AS has_doctors,
  CAST(SUM(CASE WHEN f.phone_numbers IS NOT NULL AND f.phone_numbers NOT IN ('','null','[]') THEN 1 ELSE 0 END) AS BIGINT) AS has_phone,
  CAST(SUM(CASE WHEN f.source IS NOT NULL AND f.source NOT IN ('','null') THEN 1 ELSE 0 END) AS BIGINT) AS has_source
FROM {TBL_FACILITIES} f
JOIN pin_norm p ON CAST(f.address_zipOrPostcode AS STRING) = CAST(p.pincode AS STRING)
WHERE p.state_canon = :p1
  AND p.district_canon = :p2
""".strip()

    try:
        conf_rows = wh_query(conf_sql, [state_canon, district_canon])
        conf = conf_rows[0] if conf_rows else {}
        total = int(conf.get("total") or 0)
        confidence_breakdown = {
            "total_facilities": total,
            "fields": [
                {"label": "Coordinates",  "count": int(conf.get("has_coords") or 0),      "total": total},
                {"label": "Description",  "count": int(conf.get("has_description") or 0), "total": total},
                {"label": "Doctors",      "count": int(conf.get("has_doctors") or 0),      "total": total},
                {"label": "Phone",        "count": int(conf.get("has_phone") or 0),        "total": total},
                {"label": "Source",       "count": int(conf.get("has_source") or 0),       "total": total},
            ]
        }
    except Exception as e:
        LOGGER.warning(f"context | confidence breakdown query failed: {e}")
        confidence_breakdown = {"total_facilities": 0, "fields": []}

    return {
        "district": district,
        "state": state,
        "capability": capability,
        "rank_in_state": this_rank,
        "total_districts_in_state": total_districts,
        "pincode_count": pincode_count,
        "gap_score": this_gap,
        "nearby_districts": [
            {
                "district": r["district_canon"].title(),
                "gap_score": r.get("gap_score") or 0,
                "confidence": r.get("confidence") or 0,
                "matching_facilities": r.get("matching_facilities") or 0,
                "total_facilities": r.get("total_facilities") or 0,
                "rank_in_state": int(r.get("rank_in_state") or 0),
            }
            for r in nearby
        ],
        "confidence_breakdown": confidence_breakdown,
    }
