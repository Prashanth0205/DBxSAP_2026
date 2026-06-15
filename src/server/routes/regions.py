import logging
from fastapi import APIRouter, Path, Query, HTTPException
from typing import Optional

from server.warehouse import (
    wh_query,
    alias_ctes,
    normalize_state,
    normalize_district,
    TBL_FACILITIES,
)

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/districts/{district}/facilities")
def get_district_facilities(
    district: str = Path(...),
    capability: str = Query(...),
    state: Optional[str] = Query(None),
):
    """Per-district facility list, ordered by has_capability desc, completeness desc."""
    if not state:
        raise HTTPException(status_code=400, detail="state query parameter is required")

    state_canon = normalize_state(state)
    district_canon = normalize_district(district)
    cap_pattern = f"%{capability.lower()}%"

    sql = f"""
WITH {alias_ctes()},
fac_district AS (
  SELECT
    f.unique_id, f.name, f.organization_type,
    f.address_city, f.address_stateOrRegion AS address_state,
    f.latitude, f.longitude,
    f.numberDoctors AS number_doctors, f.phone_numbers,
    f.specialties, f.capability, f.description,
    f.source, f.yearEstablished AS year_established,
    LOWER(
      COALESCE(f.specialties, '') || ' ' ||
      COALESCE(f.capability,  '') || ' ' ||
      COALESCE(f.description, '')
    ) AS hay,
    p.state_canon, p.district_canon
  FROM {TBL_FACILITIES} f
  JOIN pin_norm p
    ON CAST(f.address_zipOrPostcode AS STRING) = CAST(p.pincode AS STRING)
  WHERE f.address_zipOrPostcode IS NOT NULL
    AND f.address_zipOrPostcode NOT IN ('', 'null')
)
SELECT
  unique_id, name, organization_type,
  address_city, address_state,
  CAST(latitude  AS DOUBLE) AS latitude,
  CAST(longitude AS DOUBLE) AS longitude,
  number_doctors, phone_numbers,
  specialties, capability, description,
  source, year_established,
  CASE WHEN hay LIKE :p1 THEN TRUE ELSE FALSE END AS has_capability,
  CAST(
    (CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN longitude IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN description IS NOT NULL AND LENGTH(description) > 20 THEN 1 ELSE 0 END +
     CASE WHEN number_doctors IS NOT NULL AND number_doctors NOT IN ('', 'null') THEN 1 ELSE 0 END +
     CASE WHEN phone_numbers  IS NOT NULL AND phone_numbers  NOT IN ('', 'null', '[]') THEN 1 ELSE 0 END +
     CASE WHEN source         IS NOT NULL AND source         NOT IN ('', 'null') THEN 1 ELSE 0 END
    ) / 6.0 AS DOUBLE
  ) AS completeness
FROM fac_district
WHERE state_canon = :p2
  AND district_canon = :p3
ORDER BY has_capability DESC, completeness DESC
LIMIT 200
""".strip()

    rows = wh_query(sql, [cap_pattern, state_canon, district_canon])
    # Frontend expects verification fields too — surface as nulls until /verify is run
    for r in rows:
        r.setdefault("verdict", None)
        r.setdefault("verified_capabilities", None)
        r.setdefault("unverified_capabilities", None)
        r.setdefault("sources", None)
        r.setdefault("verified_at", None)
    return rows


@router.get("/districts/{district}/nfhs5")
def get_district_nfhs5(
    district: str = Path(...),
    state: Optional[str] = Query(None),
):
    """All NFHS-5 indicators for a district, with alias resolution."""
    if not state:
        raise HTTPException(status_code=400, detail="state query parameter is required")

    state_canon = normalize_state(state)
    district_canon = normalize_district(district)

    sql = f"""
WITH {alias_ctes()}
SELECT *
FROM nfhs_canon
WHERE state_canon    = :p1
  AND district_canon = :p2
LIMIT 1
""".strip()

    rows = wh_query(sql, [state_canon, district_canon])
    if not rows:
        return {}
    row = rows[0]
    # Drop the extra normalization columns from the response payload
    for k in ("state_norm_raw", "district_norm_raw", "state_canon", "district_canon"):
        row.pop(k, None)
    return row
