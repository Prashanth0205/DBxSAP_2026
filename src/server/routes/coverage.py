import logging
from fastapi import APIRouter, Query
from typing import Optional

from server.warehouse import (
    wh_query,
    alias_ctes,
    normalize_state,
    TBL_FACILITIES,
)

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/coverage")
def get_coverage(
    capability: str = Query(..., description="e.g. maternity, icu, dialysis"),
    state: Optional[str] = Query(None),
):
    """
    District-grain coverage: facility counts + capability-substring matches +
    NFHS-5 outcome indicators, joined via the pincode directory with NFHS
    state/district alias resolution.

    If `state` is omitted, returns all districts nationally (capped to keep
    the payload small). Returns rows sorted by gap_score asc (worst first),
    confidence desc.
    """
    state_canon = normalize_state(state) if state else None
    cap_pattern = f"%{capability.lower()}%"

    state_filter = "WHERE fd.state_canon = :p2" if state_canon else ""
    limit_clause = "" if state_canon else "LIMIT 500"

    sql = f"""
WITH {alias_ctes()},
fac AS (
  SELECT
    f.unique_id,
    CAST(f.address_zipOrPostcode AS STRING) AS pincode,
    LOWER(
      COALESCE(f.specialties, '') || ' ' ||
      COALESCE(f.capability,  '') || ' ' ||
      COALESCE(f.description, '')
    ) AS hay,
    f.latitude, f.longitude,
    f.description, f.numberDoctors, f.phone_numbers, f.source
  FROM {TBL_FACILITIES} f
  WHERE f.address_zipOrPostcode IS NOT NULL
    AND f.address_zipOrPostcode NOT IN ('', 'null')
),
fac_district AS (
  SELECT f.*, p.state_canon, p.district_canon
  FROM fac f
  JOIN pin_norm p ON f.pincode = CAST(p.pincode AS STRING)
),
agg AS (
  SELECT
    fd.state_canon,
    fd.district_canon,
    COUNT(*) AS total_facilities,
    SUM(CASE WHEN fd.hay LIKE :p1 THEN 1 ELSE 0 END) AS matching_facilities,
    ROUND(AVG(
      (CASE WHEN fd.latitude IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN fd.longitude IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN fd.description IS NOT NULL AND LENGTH(fd.description) > 20 THEN 1 ELSE 0 END +
       CASE WHEN fd.numberDoctors IS NOT NULL AND fd.numberDoctors NOT IN ('', 'null') THEN 1 ELSE 0 END +
       CASE WHEN fd.phone_numbers IS NOT NULL AND fd.phone_numbers NOT IN ('', 'null', '[]') THEN 1 ELSE 0 END +
       CASE WHEN fd.source IS NOT NULL AND fd.source NOT IN ('', 'null') THEN 1 ELSE 0 END
      ) / 6.0
    ), 2) AS confidence
  FROM fac_district fd
  {state_filter}
  GROUP BY fd.state_canon, fd.district_canon
)
SELECT
  INITCAP(LOWER(a.district_canon)) AS district,
  INITCAP(LOWER(a.state_canon))   AS state,
  CAST(a.total_facilities    AS BIGINT) AS total_facilities,
  CAST(a.matching_facilities AS BIGINT) AS matching_facilities,
  CAST(
    CASE WHEN a.total_facilities = 0 THEN 0.0
         ELSE 10.0 * a.matching_facilities / a.total_facilities
    END AS DOUBLE
  ) AS gap_score,
  CAST(a.confidence AS DOUBLE) AS confidence,
  CAST(n.institutional_birth_5y_pct                                  AS DOUBLE) AS institutional_birth_5y_pct,
  CAST(n.child_u5_who_are_stunted_height_for_age_18_pct              AS DOUBLE) AS child_stunting_pct,
  CAST(n.hh_electricity_pct                                          AS DOUBLE) AS hh_electricity_pct,
  CAST(n.hh_improved_water_pct                                       AS DOUBLE) AS hh_improved_water_pct,
  CAST(n.hh_use_improved_sanitation_pct                              AS DOUBLE) AS hh_use_improved_sanitation_pct
FROM agg a
LEFT JOIN nfhs_canon n
  ON a.state_canon    = n.state_canon
 AND a.district_canon = n.district_canon
ORDER BY gap_score ASC, confidence DESC
{limit_clause}
""".strip()

    params = [cap_pattern, state_canon] if state_canon else [cap_pattern]
    rows = wh_query(sql, params)
    return rows
