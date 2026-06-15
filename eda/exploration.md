# Dataset Exploration — Pass 1

> Source: Delta Sharing catalog `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset` (read-only)
> Captured: 2026-06-15

We are consuming all three tables via Delta Sharing at runtime. Findings, summaries, and small derived aggregates live here in the repo. The full tables are not exported to CSV — `facilities` has very long free-text fields and `india_post_pincode_directory` is 166K rows.

## Tables

| Table | Rows | Role |
| --- | --- | --- |
| `facilities` | 10,088 | The 10K messy healthcare facility records (51 columns) |
| `india_post_pincode_directory` | 165,627 | Pincode → district → state lookup (India Post) |
| `nfhs_5_district_health_indicators` | 706 | NFHS-5 district-level health survey indicators (36 states/UTs, 698 unique districts) |

## Track 2 join graph

```
facilities.address_zipOrPostcode
        │
        ▼  (join on PIN)
india_post_pincode_directory.pincode → district, statename
        │
        ▼  (join on normalized district + state)
nfhs_5_district_health_indicators → ground-truth health outcomes per district
```

`facilities` → `pincode_directory` is the bridge that lets us aggregate facility evidence per district. `pincode_directory` → `nfhs` is the bridge that lets us compare facility coverage against actual health outcomes.

## Findings

### 1. Literal `"null"` strings, not SQL NULLs

Most string columns store the four characters `null` (or empty string) instead of SQL NULL. Aggregations using `IS NOT NULL` will silently overcount evidence by ~60% on fields like `numberDoctors`. Every coverage / quality check must normalize:

```sql
WHERE col IS NOT NULL AND col NOT IN ('', 'null', '[]')
```

### 2. Field coverage matches challenge spec (after normalization)

| Field | Populated | Coverage |
| --- | --- | --- |
| description | 10,006 | 99.2% |
| capability | 9,947 | 98.6% |
| specialties | 9,972 | 98.9% |
| pincode | 10,022 | 99.3% |
| latitude/longitude | 9,970 | 98.8% |
| procedure | 9,218 | 91.4% |
| equipment | 7,683 | 76.2% |
| yearEstablished | 4,804 | 47.6% |
| numberDoctors | 3,633 | 36.0% |
| capacity | 2,520 | 25.0% |

`capacity` and `numberDoctors` are the sparse fields. Any facility ranking that filters on those will drop ~65–75% of records.

### 3. Facility distribution skews heavily

Top 5 states hold ~42% of all facilities. Distribution is a long tail with 250+ distinct `address_stateOrRegion` values — many are mis-leveled (cities listed as states, "null", noise). See `facilities_by_state.csv`.

| State | Facilities |
| --- | --- |
| Maharashtra | 1,575 |
| Gujarat | 981 |
| Uttar Pradesh | 919 |
| Tamil Nadu | 780 |
| Karnataka | 529 |

Operator type is overwhelmingly private (8,842) vs public (469). Hospital + clinic dominate facility types (5,637 + 3,782 = 93%).

### 4. Pincode resolution: 95.5%

Of 10,022 facility rows with a non-null pincode, 9,568 (95.5%) match a pincode in the India Post directory. 454 rows have pincodes not in the directory — typo, decommissioned PIN, or non-Indian PIN.

### 5. NFHS ↔ pincode-directory district match: 76.8%

After case + `&`/`AND` normalization on state names, only 542 / 706 NFHS districts (76.8%) match exactly to a district in the pincode directory. 164 NFHS districts don't have an obvious match. Likely causes: district renames, abbreviations, splits/merges since 2019. **This is the single biggest engineering risk for Track 2** — without a clean facility→district→NFHS bridge, we cannot compare claimed coverage against ground-truth health outcomes.

State name format differences:

| Source | Format | Example |
| --- | --- | --- |
| `nfhs_5_district_health_indicators` | Title case, `&`, stray spaces | `" Lakshadweep "`, `"Andaman & Nicobar Islands"`, `"Jammu & Kashmir"` |
| `india_post_pincode_directory` | UPPERCASE, `AND` | `"ANDAMAN AND NICOBAR ISLANDS"`, `"JAMMU AND KASHMIR"` |

### 6. Rough capability claim counts (substring match, pre-trust-weighting)

These are upper bounds from naive substring matching across `capability`, `description`, `specialties`. They will be *over*-counted (e.g. "no ICU" still matches "icu") and serve only as headline numbers.

| Capability | Mentioning facilities | % of 10K |
| --- | --- | --- |
| Maternity / Obstetrics | 4,590 | 45.5% |
| Emergency | 3,828 | 37.9% |
| Oncology / Cancer | 2,521 | 25.0% |
| Dialysis / Nephrology | 2,272 | 22.5% |
| ICU | 1,900 | 18.8% |
| NICU / Neonatal | 1,462 | 14.5% |
| Trauma | 1,174 | 11.6% |

## Open engineering questions for Track 2

1. **District join repair.** What's the minimum fuzzy-matcher / lookup table needed to lift NFHS↔pincode-directory match from 77% to 95%+? Hand-curated alias table for the 164 unmatched NFHS districts is probably faster than a fuzzy matcher.
2. **Trust-weighting strategy.** A literal substring match for "ICU" gives a noisy upper bound. We need a per-(facility, capability) trust score: strong / partial / weak / none. Source attribution from `source` and `source_urls` should feed into this.
3. **Sparse-data vs real-gap signal.** "Medical desert" requires distinguishing low-evidence (no facility data) from low-outcome (NFHS shows poor maternal/child metrics). Probably a 2×2 matrix per district: [low/high facility coverage] × [low/high NFHS outcome score].
4. **Aggregation grain.** State is too coarse, PIN code is too fine. District is the natural unit because NFHS publishes at district grain. Confirmed.

## Derived artifacts in this directory

- `facilities_by_state.csv` — facility count + naive ICU/maternity/emergency claim counts per `address_stateOrRegion` (255 distinct values, includes noise). Quick offline reference.

All EDA writeups and small derived aggregates live under `/eda` in this repo.
