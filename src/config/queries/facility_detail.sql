-- @param facility_id STRING
SELECT
  unique_id AS facility_id,
  name AS facility_name,
  address_stateOrRegion AS state,
  address_city AS city,
  address_line1,
  address_line2,
  address_line3,
  address_zipOrPostcode AS postcode,
  latitude,
  longitude,
  facilityTypeId AS facility_type,
  operatorTypeId AS operator_type,
  description,
  specialties,
  procedure,
  equipment,
  capability,
  numberDoctors AS number_doctors,
  capacity,
  yearEstablished AS year_established,
  officialPhone AS phone,
  officialWebsite AS website,
  email,
  source_urls
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE unique_id = :facility_id
LIMIT 1
