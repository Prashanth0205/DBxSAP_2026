-- Reusable normalization for joining NFHS district health indicators against
-- the India Post pincode directory (and, transitively, against facility records
-- via pincode lookup).
--
-- Used by:
--   - eda/* alias-mining queries
--   - the app's runtime join logic for Track 2 (Medical Desert Planner)
--
-- Why we need this:
--   NFHS-5 was published in 2019-21; the pincode directory is current India
--   Post administrative geography. Names diverge for three reasons that pure
--   string equality cannot bridge:
--     1. Pure formatting noise (whitespace, case, '&' vs 'AND', hyphens)
--     2. Spelling variants ("Aravali" vs "ARAVALLI")
--     3. Real govt renames + splits/merges since 2019 (Gurgaon → Gurugram,
--        Visakhapatnam splits, etc.)
--
-- This file handles class (1) only. Classes (2) and (3) are resolved by
-- eda/district_aliases.csv, which is left-joined against the normalized output.

-- ---------------------------------------------------------------------------
-- nfhs_norm: cleaned (state, district) keys for nfhs_5_district_health_indicators
-- ---------------------------------------------------------------------------
WITH nfhs_norm AS (
  SELECT
    REGEXP_REPLACE(
      UPPER(TRIM(REPLACE(state_ut, '&', 'AND'))),
      '\s+', ' '
    ) AS state_norm,
    REGEXP_REPLACE(
      UPPER(TRIM(REPLACE(REPLACE(district_name, '&', 'AND'), '-', ' '))),
      '\s+', ' '
    ) AS district_norm,
    state_ut    AS state_raw,
    district_name AS district_raw
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
),

-- ---------------------------------------------------------------------------
-- pin_norm: distinct cleaned (state, district) keys for pincode directory
-- ---------------------------------------------------------------------------
pin_norm AS (
  SELECT DISTINCT
    REGEXP_REPLACE(UPPER(TRIM(statename)),                     '\s+', ' ') AS state_norm,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))),   '\s+', ' ') AS district_norm
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
)

-- Default: NFHS rows annotated with whether they match the pincode directory
-- after normalization. Replace the SELECT below for ad-hoc analysis.
SELECT
  n.state_raw,
  n.district_raw,
  n.state_norm,
  n.district_norm,
  CASE WHEN p.district_norm IS NOT NULL THEN 1 ELSE 0 END AS matched_in_pincode_dir
FROM nfhs_norm n
LEFT JOIN pin_norm p
  ON n.state_norm = p.state_norm
 AND n.district_norm = p.district_norm
ORDER BY n.state_norm, n.district_norm;
