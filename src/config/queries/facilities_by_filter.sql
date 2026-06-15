-- @param state STRING
-- @param city STRING
-- @param capability_substring STRING
-- @param row_limit INT
SELECT
  unique_id AS facility_id,
  name AS facility_name,
  address_stateOrRegion AS state,
  address_city AS city,
  latitude,
  longitude,
  description,
  specialties,
  equipment,
  capability,
  CASE
    WHEN :capability_substring = '' THEN NULL
    WHEN capability ILIKE concat('%', :capability_substring, '%') THEN 'capability'
    WHEN specialties ILIKE concat('%', :capability_substring, '%') THEN 'specialties'
    WHEN equipment ILIKE concat('%', :capability_substring, '%') THEN 'equipment'
    WHEN procedure ILIKE concat('%', :capability_substring, '%') THEN 'procedure'
    WHEN description ILIKE concat('%', :capability_substring, '%') THEN 'description'
    ELSE NULL
  END AS evidence_field
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE address_country = 'India'
  AND (:state = '' OR address_stateOrRegion = :state)
  AND (:city = '' OR address_city = :city)
  AND (
    :capability_substring = ''
    OR capability ILIKE concat('%', :capability_substring, '%')
    OR specialties ILIKE concat('%', :capability_substring, '%')
    OR equipment ILIKE concat('%', :capability_substring, '%')
    OR procedure ILIKE concat('%', :capability_substring, '%')
    OR description ILIKE concat('%', :capability_substring, '%')
  )
ORDER BY facility_name ASC
LIMIT :row_limit
