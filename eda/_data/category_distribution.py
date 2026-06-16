"""
Generate the 5-category classifier distribution per capability.

Replicates the runtime app logic (server/routes/coverage.py + types.ts categorizeDistrict)
end-to-end against Delta Sharing. Buckets every Indian district (~767) into:
  no_facilities / real_desert / data_poor / hidden_risk / adequate
for each of the 7 capabilities, and writes a tidy CSV.
"""
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

EDA = Path(__file__).resolve().parent.parent
PROFILE = "DEFAULT"

CAPABILITY_KEYWORDS = {
    "icu":        ["icu", "intensive care", "critical care", "ventilator", "ccm"],
    "maternity":  ["maternity", "obstetric", "delivery", "labour", "prenatal", "antenatal", "midwifery"],
    "emergency":  ["emergency", "casualty", "trauma", "accident", "a&e", "24 hour"],
    "dialysis":   ["dialysis", "renal", "nephrology", "kidney"],
    "oncology":   ["oncology", "cancer", "chemotherapy", "radiation", "tumour"],
    "trauma":     ["trauma", "orthopedic", "fracture", "spine", "neurosurgery"],
    "nicu":       ["nicu", "neonatal", "newborn intensive", "premature"],
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("&", "AND").replace("-", " ").upper().strip())


def load_state_aliases():
    rows = []
    with open(EDA / "state_aliases.csv") as f:
        r = csv.DictReader(f)
        for row in r:
            rows.append((row["nfhs_state_norm"], row["canonical_state_norm"]))
    return rows


def load_district_aliases():
    rows = []
    for fname in ("district_aliases_auto.csv", "district_aliases_manual.csv"):
        with open(EDA / fname) as f:
            r = csv.DictReader(f)
            for row in r:
                ns = _norm(row["nfhs_state_raw"])
                nd = _norm(row["nfhs_district_raw"])
                cs = row["canonical_state_norm"]
                cd = row["canonical_district_norm"]
                rows.append((ns, nd, cs, cd))
    return rows


def sqlstr(s):
    return "'" + s.replace("'", "''") + "'"


def build_sql():
    state_alias_rows = load_state_aliases()
    district_alias_rows = load_district_aliases()

    state_values = ",\n    ".join(
        f"({sqlstr(s)}, {sqlstr(c)})" for s, c in state_alias_rows
    )
    district_values = ",\n    ".join(
        f"({sqlstr(s)}, {sqlstr(d)}, {sqlstr(cs)}, {sqlstr(cd)})"
        for s, d, cs, cd in district_alias_rows
    )

    cap_branches = []
    for cap, kws in CAPABILITY_KEYWORDS.items():
        ors = " OR ".join(f"hay LIKE '%{kw}%'" for kw in kws)
        cap_branches.append(
            f"SUM(CASE WHEN {ors} THEN 1 ELSE 0 END) AS match_{cap}"
        )
    cap_match_sums = ",\n    ".join(cap_branches)

    sql = f"""
WITH nfhs_norm AS (
  SELECT
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(state_ut, '&', 'AND'))), '\\\\s+', ' ') AS state_norm_raw,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(REPLACE(district_name, '&', 'AND'), '-', ' '))), '\\\\s+', ' ') AS district_norm_raw,
    institutional_birth_5y_pct AS institutional_birth,
    child_u5_who_are_stunted_height_for_age_18_pct AS stunting
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
state_alias(nfhs_state_norm, canonical_state_norm) AS (
  VALUES
    {state_values}
),
district_alias(nfhs_state_norm, nfhs_district_norm, canonical_state_norm, canonical_district_norm) AS (
  VALUES
    {district_values}
),
nfhs_canon AS (
  SELECT
    COALESCE(da.canonical_state_norm, sa.canonical_state_norm, n.state_norm_raw) AS state_canon,
    COALESCE(da.canonical_district_norm, n.district_norm_raw) AS district_canon,
    TRY_CAST(n.institutional_birth AS DOUBLE) AS institutional_birth,
    TRY_CAST(n.stunting             AS DOUBLE) AS stunting
  FROM nfhs_norm n
  LEFT JOIN state_alias sa  ON n.state_norm_raw = sa.nfhs_state_norm
  LEFT JOIN district_alias da
    ON n.state_norm_raw = da.nfhs_state_norm
   AND n.district_norm_raw = da.nfhs_district_norm
),
pin_norm AS (
  SELECT DISTINCT
    REGEXP_REPLACE(UPPER(TRIM(statename)), '\\\\s+', ' ') AS state_canon,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))), '\\\\s+', ' ') AS district_canon,
    pincode
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
),
districts AS (
  SELECT DISTINCT state_canon, district_canon
  FROM pin_norm
  WHERE state_canon IS NOT NULL AND state_canon <> ''
    AND district_canon IS NOT NULL AND district_canon <> ''
),
fac AS (
  SELECT
    f.unique_id,
    CAST(f.address_zipOrPostcode AS STRING) AS pincode,
    LOWER(
      COALESCE(f.specialties, '') || ' ' ||
      COALESCE(f.capability,  '') || ' ' ||
      COALESCE(f.description, '')
    ) AS hay
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  WHERE f.address_zipOrPostcode IS NOT NULL
    AND f.address_zipOrPostcode NOT IN ('', 'null')
),
fac_district AS (
  SELECT f.*, p.state_canon, p.district_canon
  FROM fac f
  JOIN pin_norm p ON f.pincode = CAST(p.pincode AS STRING)
),
fac_agg AS (
  SELECT
    state_canon,
    district_canon,
    COUNT(*) AS total_facilities,
    {cap_match_sums}
  FROM fac_district
  GROUP BY state_canon, district_canon
),
joined AS (
  SELECT
    d.state_canon,
    d.district_canon,
    COALESCE(fa.total_facilities, 0) AS total_facilities,
    COALESCE(fa.match_icu, 0)        AS match_icu,
    COALESCE(fa.match_maternity, 0)  AS match_maternity,
    COALESCE(fa.match_emergency, 0)  AS match_emergency,
    COALESCE(fa.match_dialysis, 0)   AS match_dialysis,
    COALESCE(fa.match_oncology, 0)   AS match_oncology,
    COALESCE(fa.match_trauma, 0)     AS match_trauma,
    COALESCE(fa.match_nicu, 0)       AS match_nicu,
    n.institutional_birth,
    n.stunting
  FROM districts d
  LEFT JOIN fac_agg fa
    ON d.state_canon = fa.state_canon AND d.district_canon = fa.district_canon
  LEFT JOIN nfhs_canon n
    ON d.state_canon = n.state_canon AND d.district_canon = n.district_canon
)
SELECT * FROM joined
""".strip()
    return sql


def categorize(total, matching, instbirth, stunting):
    """Mirror types.ts categorizeDistrict() exactly."""
    if total == 0:
        return "no_facilities"
    gap_score = 10.0 * matching / total
    sparse = gap_score <= 3
    has_health = instbirth is not None or stunting is not None
    if has_health:
        low_birth = instbirth is not None and instbirth < 70
        high_stunt = stunting is not None and stunting > 35
        poor = low_birth or high_stunt
    else:
        poor = sparse
    if sparse and poor:
        return "real_desert"
    if sparse and not poor:
        return "data_poor"
    if not sparse and poor:
        return "hidden_risk"
    return "adequate"


def main():
    sql = build_sql()
    (EDA / "_data" / "category_distribution_query.sql").write_text(sql)
    print(f"SQL written to _data/category_distribution_query.sql ({len(sql)} chars)", file=sys.stderr)

    proc = subprocess.run(
        ["databricks", "experimental", "aitools", "tools", "query",
         "--profile", PROFILE, "--output", "json", sql],
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        print("Query failed:", proc.stderr[-2000:], file=sys.stderr)
        sys.exit(1)

    rows = json.loads(proc.stdout)
    print(f"Got {len(rows)} district rows", file=sys.stderr)

    caps = list(CAPABILITY_KEYWORDS.keys())
    counts = {cap: {"no_facilities": 0, "real_desert": 0, "data_poor": 0,
                    "hidden_risk": 0, "adequate": 0} for cap in caps}

    for row in rows:
        total = int(row.get("total_facilities", 0) or 0)
        def _f(v):
            if v is None or v == "" or v == "null":
                return None
            try:
                return float(v)
            except (ValueError, TypeError):
                return None
        instbirth = _f(row.get("institutional_birth"))
        stunting = _f(row.get("stunting"))
        for cap in caps:
            matching = int(row.get(f"match_{cap}", 0) or 0)
            cat = categorize(total, matching, instbirth, stunting)
            counts[cap][cat] += 1

    out = EDA / "category_distribution_by_capability.csv"
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["capability", "no_facilities", "real_desert", "data_poor",
                    "hidden_risk", "adequate", "total"])
        for cap in caps:
            c = counts[cap]
            total = sum(c.values())
            w.writerow([cap, c["no_facilities"], c["real_desert"], c["data_poor"],
                        c["hidden_risk"], c["adequate"], total])

    print(f"Wrote {out}", file=sys.stderr)
    for cap in caps:
        c = counts[cap]
        total = sum(c.values())
        print(f"  {cap:<10} no_fac={c['no_facilities']:>3}  desert={c['real_desert']:>3}  "
              f"data_poor={c['data_poor']:>3}  hidden_risk={c['hidden_risk']:>3}  "
              f"adequate={c['adequate']:>3}  total={total}", file=sys.stderr)


if __name__ == "__main__":
    main()
