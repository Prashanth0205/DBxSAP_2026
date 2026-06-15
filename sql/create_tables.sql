-- Run in Databricks SQL Warehouse
-- Step 1: Create raw table

CREATE TABLE IF NOT EXISTS raw_facilities (
  facility_id     STRING,
  facility_name   STRING,
  state           STRING,
  city            STRING,
  latitude        DOUBLE,
  longitude       DOUBLE,
  postcode        STRING,
  description     STRING,
  capability      STRING,
  procedure_text  STRING,
  equipment       STRING,
  specialties     STRING,
  numberDoctors   INT,
  capacity        INT,
  yearEstablished INT,
  source_urls     STRING
) USING DELTA PARTITIONED BY (state);

-- Step 2: Load from CSV (update path to match your volume/DBFS path)
-- COPY INTO raw_facilities
-- FROM '/Volumes/<catalog>/<schema>/<volume>/facilities.csv'
-- FILEFORMAT = CSV
-- FORMAT_OPTIONS ('header' = 'true', 'inferSchema' = 'true');

-- Step 3: Claude-extracted capabilities (written by preprocessing/claude_batch.py)
CREATE TABLE IF NOT EXISTS facility_capabilities (
  facility_id    STRING NOT NULL,
  capability_tag STRING NOT NULL,
  confidence     DOUBLE,
  evidence_text  STRING,
  field_source   STRING
) USING DELTA;

-- Step 4: Aggregation view (run AFTER claude_batch.py finishes)
CREATE OR REPLACE VIEW capability_coverage AS
SELECT
  rf.state,
  rf.city,
  AVG(rf.latitude)                                                                    AS latitude,
  AVG(rf.longitude)                                                                   AS longitude,
  fc.capability_tag,
  COUNT(DISTINCT fc.facility_id)                                                      AS facility_count,
  ROUND(AVG(fc.confidence), 3)                                                        AS avg_confidence,
  ROUND(STDDEV(fc.confidence), 3)                                                     AS confidence_std,
  ROUND(
    AVG(CASE WHEN rf.equipment IS NOT NULL AND rf.equipment != '' THEN 1.0 ELSE 0.0 END),
    3
  )                                                                                   AS field_coverage_pct
FROM facility_capabilities fc
JOIN raw_facilities rf ON fc.facility_id = rf.facility_id
GROUP BY rf.state, rf.city, fc.capability_tag;

-- Verify:
-- SELECT * FROM capability_coverage WHERE capability_tag = 'dialysis' ORDER BY avg_confidence DESC LIMIT 20;
