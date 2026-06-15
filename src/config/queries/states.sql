SELECT
  address_stateOrRegion AS state,
  COUNT(*) AS facility_count
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE address_country = 'India'
  AND address_stateOrRegion IS NOT NULL
  AND address_stateOrRegion <> ''
GROUP BY address_stateOrRegion
HAVING COUNT(*) >= 5
ORDER BY state ASC
