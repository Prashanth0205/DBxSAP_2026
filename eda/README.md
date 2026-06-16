# EDA — Disha (Track 2, Medical Desert Planner)

Two passes of exploration over the Delta Sharing catalog `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset` shaped every product decision in the app. This README surfaces the five headline findings a reader (or a hackathon judge) should walk away with, then points at the writeups, derived data, and reproducibility scripts behind each one.

- **Pass 1** ([`findings/exploration.md`](findings/exploration.md)) — field coverage, the literal-`"null"`-string trap, pincode resolution (95.5%), and the NFHS↔pincode-directory district resolution (706/706 = 100% via three alias layers).
- **Pass 2** ([`findings/exploration_pass2.md`](findings/exploration_pass2.md)) — design validation: capability-keyword multipliers, 5-category classifier distribution, facility↔outcome correlations, NFHS-5 indicator distributions, data-quality outliers.

## Headline findings

Five things our dataset exploration proved, that directly shaped the app.

### 1. Facility count is a weak predictor of health outcomes (r ≈ 0.18) — so a one-axis "facility density" map would mislead planners

Across all 757 Indian districts, the Pearson correlation between *number of facilities* and *institutional birth rate* is **0.186** — explaining ~3.5% of the variance. Adding capability-specific filtering doesn't help (r moves from 0.186 → 0.192 for maternity-matching facilities). **This is the empirical reason our app uses a 5-category classifier, not a single coverage heatmap.** Source: [`data/facility_outcome_correlations.csv`](data/facility_outcome_correlations.csv).

### 2. The 5 categories produce a real spread, and the relative difficulty of capabilities surfaces clearly

District counts (out of 757):

| Capability | No facility records | Real desert | Data-poor | Hidden risk | Adequate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Maternity | 174 | 62 | 53 | 183 | **285** |
| Emergency | 174 | 75 | 75 | 172 | 261 |
| Trauma | 174 | 91 | 81 | 160 | 251 |
| Dialysis | 174 | 179 | 203 | 80 | 121 |
| ICU | 174 | 168 | 214 | 93 | 108 |
| Oncology | 174 | 197 | 228 | 64 | 94 |
| NICU | 174 | **232** | 295 | 37 | **19** |

**NICU is the worst capability we can show:** 70% of districts have a NICU problem of some kind, only 19 districts qualify as adequate. **Maternity is the best:** 285 adequate districts. These are real, defensible differences a planner can act on. Source: [`data/category_distribution_by_capability.csv`](data/category_distribution_by_capability.csv).

### 3. 174 of 757 districts (23%) have *zero* facility records — we surface this as a data hole, not as deserts

The same 174 districts show zero matching facility rows for every capability. The honest framing in the app: *we cannot judge supply* in those districts. They render in a distinct neutral color so a planner does not confuse a data hole for a desert. This is the difference between "we don't know" and "we know it's bad."

### 4. Capability keyword expansion does real work — without it, the maternity map would be nearly empty

The literal capability word alone matches a small fraction of the relevant facilities. Maternity expands **6.06×** when we add `obstetric`/`delivery`/`prenatal`/`antenatal`/`midwifery`. Dialysis expands 4.10× via `renal`/`nephrology`/`kidney`. Source: [`data/capability_keyword_expansion.csv`](data/capability_keyword_expansion.csv).

| Capability | Literal-word match | Full keyword match | Multiplier |
| --- | ---: | ---: | --- |
| Maternity | 781 | 4,730 | **6.06×** |
| Dialysis | 620 | 2,540 | 4.10× |
| Trauma | 1,517 | 4,415 | 2.91× |

### 5. Data quality is honest: we lose ~3% of facilities to malformed pincodes / bad coordinates and we surface it

Of 10,088 facility rows: 250 have malformed pincodes (160 of which are one-line-fix-able by stripping whitespace), 118 are missing coordinates, 6 have coordinates outside the India bounding box, and `address_stateOrRegion` has 254 distinct values for 36 actual states/UTs (which is why every join in the app routes through `pincode → district → state`, never the raw state column). The ~3% loss is the floor we surface as "no facility records" — papered-over data quality is what would make the app untrustworthy. Source: [`data/data_quality_outliers.csv`](data/data_quality_outliers.csv).

## Folder index

```
eda/
├── README.md                ← you are here
├── findings/                full markdown writeups
│   ├── exploration.md           pass 1 — coverage + alias resolution
│   └── exploration_pass2.md     pass 2 — keyword/classifier/correlation/data-quality validation
├── data/                    derived CSVs
│   ├── facilities_by_state.csv                    (pass 1) facility count + naive claim counts per state
│   ├── state_aliases.csv                          (pass 1) 3 NFHS → pincode-dir state aliases
│   ├── district_aliases_auto.csv                  (pass 1) 75 fuzzy-matched district aliases (≥0.90)
│   ├── district_aliases_manual.csv                (pass 1) 66 hand-curated district aliases
│   ├── district_alias_candidates.csv              (pass 1) full audit trail of fuzzy candidates
│   ├── capability_keyword_expansion.csv           (pass 2) literal vs expanded match counts per capability
│   ├── category_distribution_by_capability.csv    (pass 2) 5-bucket classifier counts × 7 capabilities
│   ├── nfhs_indicator_stats.csv                   (pass 2) percentile distributions for 5 NFHS indicators
│   ├── facility_outcome_correlations.csv          (pass 2) Pearson r between facility counts and outcomes
│   └── data_quality_outliers.csv                  (pass 2) malformed pincodes, bbox outliers, dupes
├── scripts/                 reproducibility — Python + JSON snapshots
│   ├── fuzzy_match.py                             (pass 1) generates district_aliases_auto.csv + candidates
│   ├── validate_coverage.py                       (pass 1) verifies 706/706 NFHS resolution end-to-end
│   ├── category_distribution.py                   (pass 2) regenerates category_distribution_by_capability.csv
│   ├── category_distribution_query.sql            (pass 2) SQL emitted by category_distribution.py
│   ├── pin_districts.json                         (pass 1) intermediate snapshot of pincode-dir districts
│   └── unmatched_nfhs.json                        (pass 1) intermediate snapshot of unmatched NFHS districts
├── sql/                     reusable SQL
│   └── district_normalize.sql                     (pass 1) join CTE — handles formatting noise
└── notes/                   audit trail
    └── district_alias_review.md                   (pass 1) residual fuzzy matcher cases needing human review
```

## Reproducibility

- 5-category classifier distribution: `python3 eda/scripts/category_distribution.py` (writes the SQL it ran to `eda/scripts/category_distribution_query.sql` and the bucket counts to `eda/data/category_distribution_by_capability.csv`).
- District alias generation: `python3 eda/scripts/fuzzy_match.py` (regenerates `eda/data/district_aliases_auto.csv`, `eda/data/district_alias_candidates.csv`, `eda/notes/district_alias_review.md`).
- End-to-end NFHS resolution check: `python3 eda/scripts/validate_coverage.py` (resolves all 142 originally-unmatched NFHS districts using the alias layers).
- Capability-expansion, NFHS-distribution, and data-quality numbers are produced by ad-hoc SQL via `databricks experimental aitools tools query`. The exact SQL is reproducible from the prose in [`findings/exploration_pass2.md`](findings/exploration_pass2.md); we did not commit one-off SQL files.
