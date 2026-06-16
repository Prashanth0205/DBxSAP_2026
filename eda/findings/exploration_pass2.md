# Dataset Exploration — Pass 2

> Source: Delta Sharing catalog `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset` (read-only)
> Captured: 2026-06-16
> Pass 1 (field coverage, pincode resolution, NFHS alias resolution): [`exploration.md`](exploration.md)

Pass 2 validates the design decisions we shipped on top of Pass 1 — the capability keyword lists, the 5-category classifier, the NFHS-5 indicators we chose to surface, and the data-quality `WHERE` clauses scattered across the backend. Each finding below is followed by **How it shaped the app** with a `file:line` pointer so the link from data → code is auditable.

The five supporting CSVs sit under [`../data/`](../data/):

- [`capability_keyword_expansion.csv`](../data/capability_keyword_expansion.csv)
- [`category_distribution_by_capability.csv`](../data/category_distribution_by_capability.csv)
- [`nfhs_indicator_stats.csv`](../data/nfhs_indicator_stats.csv)
- [`facility_outcome_correlations.csv`](../data/facility_outcome_correlations.csv)
- [`data_quality_outliers.csv`](../data/data_quality_outliers.csv)

---

## 1. Capability keyword expansion is doing real work

Across all 7 capabilities we expose, the literal capability word alone matches a small fraction of the facilities a planner would actually want:

| Capability | Narrow (literal word) | Expanded (full keyword list) | Multiplier |
| --- | --- | --- | --- |
| Maternity | 781 | 4,730 | **6.06×** |
| Dialysis | 620 | 2,540 | **4.10×** |
| Trauma | 1,517 | 4,415 | 2.91× |
| NICU | 590 | 866 | 1.47× |
| ICU | 1,973 | 2,514 | 1.27× |
| Emergency | 3,828 | 4,256 | 1.11× |
| Oncology | 2,333 | 2,562 | 1.10× |

Run against the same 9,956 facilities the production app queries (after the `address_zipOrPostcode IS NOT NULL AND NOT IN ('', 'null')` filter). Source CSV: [`capability_keyword_expansion.csv`](../data/capability_keyword_expansion.csv).

**Why maternity expanded 6×:** the literal word "maternity" appears in only 781 facility hay-strings, but `obstetric`, `delivery`, `prenatal`, `antenatal`, `midwifery` capture the rest. Without expansion the maternity map would have been almost empty.

**Why dialysis expanded 4×:** facilities use the medical-specialty term (`renal`, `nephrology`) far more often than the procedure name. A planner searching "dialysis" without expansion would miss most of the country's nephrology centers.

**Cross-contamination risk we accepted.** The `emergency` and `trauma` keyword lists overlap deliberately — `emergency` includes the literal `trauma` keyword, and `trauma` shares spillover with `orthopedic` / `fracture` / `spine` / `neurosurgery`. Of the 4,256 facilities matching `emergency`, **2,992 (70%)** also match `trauma` keywords. This reflects reality (most emergency departments handle trauma) but means a judge or planner should not read the two filters as disjoint sets.

**How it shaped the app.** Drove the keyword lists in [`src/server/lib/capability_keywords.py`](../../src/server/lib/capability_keywords.py) and the `build_ilike_conditions()` helper used by [`coverage.py:32`](../../src/server/routes/coverage.py) and [`agent.py:428`](../../src/server/agent.py). The map's "matching_facilities" count and the agent's per-district roster both depend on this.

---

## 2. The 5-category classifier produces a meaningful spread, not a single dominant bucket

Pass 1 left open: *"Sparse-data vs real-gap signal"* (open question 3). We resolved it with a 5-bucket classifier in [`types.ts:243–269`](../../src/client/src/lib/types.ts) (`categorizeDistrict()`). Pass 2 validates that the buckets are populated meaningfully across all 7 capabilities — none collapse into a single bucket, and the relative difficulty of each capability surfaces clearly.

District counts (out of 757 Indian districts, derived by joining the pincode directory's distinct districts against per-capability facility counts and NFHS-5 outcomes):

| Capability | No facilities | Real desert | Data-poor | Hidden risk | Adequate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Maternity | 174 | 62 | 53 | 183 | **285** |
| Emergency | 174 | 75 | 75 | 172 | 261 |
| Trauma | 174 | 91 | 81 | 160 | 251 |
| Dialysis | 174 | 179 | 203 | 80 | 121 |
| ICU | 174 | 168 | 214 | 93 | 108 |
| Oncology | 174 | 197 | 228 | 64 | 94 |
| NICU | 174 | **232** | 295 | 37 | 19 |

Source CSV: [`category_distribution_by_capability.csv`](../data/category_distribution_by_capability.csv).

**Three findings worth surfacing in a demo:**

1. **174 / 757 districts (23%) have zero facility records, period.** This is the same 174 every capability — they are the "no facility records" floor of the dataset. The honest framing is *we cannot judge supply* in those districts, not *they have zero hospitals*. The map renders these in a distinct neutral color so a planner does not confuse a data hole for a desert.
2. **NICU is the worst capability:** only 19 districts qualify as adequate, 232 are real deserts, 295 are data-poor. 70% of districts have a NICU problem of some kind, even after our keyword expansion. This is consistent with the well-documented NICU shortage in rural India.
3. **Maternity is the best:** 285 adequate districts, only 62 deserts. Combined with the 6× keyword expansion in §1, this means the dataset's coverage for maternity-style facilities is dense — but ICU/NICU/oncology coverage is genuinely sparse and will surface as the most actionable categories on the map.

**How it shaped the app.** The 5-category framing is the central product IP. Direct citations:
- The buckets and their labels: [`types.ts:193–232`](../../src/client/src/lib/types.ts) (`DistrictCategory`, `CATEGORY_META`).
- The `gap_score <= 3` "sparse coverage" threshold: [`types.ts:253`](../../src/client/src/lib/types.ts).
- The `institutional_birth < 70` and `stunting > 35` "poor outcomes" thresholds: [`types.ts:257–259`](../../src/client/src/lib/types.ts).
- The choropleth uses each bucket's color and renders stripe patterns for low-confidence buckets: [`CoverageMap.tsx:108`](../../src/client/src/components/CoverageMap.tsx).

---

## 3. Facility count is a weak predictor of health outcomes — empirical justification for the 2-axis split

The whole reason for the 5-category classifier (instead of just one "facility density" axis) is the hypothesis that supply and outcomes diverge. Pass 2 measures it directly. Pearson correlation across all 757 districts:

| Capability | Total facilities ↔ institutional birth | Total facilities ↔ stunting | Capability matches ↔ inst. birth | Capability matches ↔ stunting |
| --- | ---: | ---: | ---: | ---: |
| Maternity | 0.186 | -0.130 | 0.192 | -0.139 |
| ICU | 0.186 | -0.130 | 0.187 | -0.129 |
| NICU | 0.186 | -0.130 | 0.153 | -0.122 |
| Oncology | 0.186 | -0.130 | 0.179 | -0.123 |
| Emergency | 0.186 | -0.130 | 0.194 | -0.143 |

Source CSV: [`facility_outcome_correlations.csv`](../data/facility_outcome_correlations.csv).

**Reading these numbers.** Every correlation has the right sign (more facilities ↔ better outcomes, more facilities ↔ less stunting) but every magnitude is below 0.20. Adding capability-specific filtering (e.g. correlating *just* maternity-matching facilities against institutional birth) does not strengthen the signal meaningfully — the maternity capability filter pushes the institutional-birth correlation from 0.186 to 0.192. That is the difference between r² of 3.5% and 3.7%. It is essentially the same.

**Why this matters for the product.** If facility count predicted outcomes well (say r > 0.6), a single-axis "facility density" map would be a perfectly fine planning tool. At r ≈ 0.18, it is not. There is a large population of districts where the two axes disagree:
- **Hidden-risk districts** (160–183 of them, depending on capability) have plenty of facilities but bad NFHS-5 outcomes — capability-mismatch, low-trust evidence, or quality-not-quantity gaps.
- **Data-poor districts** (53–295 of them) have few facilities but acceptable outcomes — likely under-sampling in the source dataset, not actual under-service.

The 5-category split exists *because* of this finding. Without the NFHS-5 cross-reference we would conflate these two situations under a single "low coverage" label and mislead a planner.

### NFHS-5 indicator distributions (n=706 districts)

| Indicator | min | p10 | p25 | median | p75 | p90 | max | mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Institutional birth (%) | 21.4 | 73.9 | 83.7 | **92.2** | 97.4 | 99.4 | 100.0 | 88.7 |
| Child stunting (%) | 13.2 | 23.1 | 27.3 | **32.9** | 39.2 | 45.1 | 60.6 | 33.5 |
| HH electricity (%) | 68.4 | 92.3 | 96.4 | 98.7 | 99.5 | 99.8 | 100.0 | 97.0 |
| HH improved water (%) | 41.2 | 83.1 | 92.0 | 97.0 | 99.3 | 99.8 | 100.0 | 93.7 |
| HH sanitation (%) | 29.2 | 52.6 | 62.0 | 73.8 | 83.3 | 88.5 | 99.9 | 71.9 |

Source CSV: [`nfhs_indicator_stats.csv`](../data/nfhs_indicator_stats.csv).

**Why we threshold institutional birth at 70% and stunting at 35%.** Looking at the percentiles: institutional birth p10 = 73.9, so `< 70` flags roughly the bottom ~7%. Child stunting p75 = 39.2, so `> 35` flags roughly the worst ~30%. The two thresholds together produce a bimodal "poor outcomes" signal that catches both extreme low-supply districts and broader stunting-driven gaps.

**Why we surface electricity / water / sanitation in the API but don't gate on them.** Electricity is 97% saturated nationally — it's useful color for "this district is genuinely remote" but it cannot discriminate the middle of the distribution. Sanitation is the most discriminating of the three (median 73.8, p10 52.6) and is the strongest candidate to add to a future v2 of the classifier. They appear in [`types.ts:80–82`](../../src/client/src/lib/types.ts) (`Nfhs5` interface) and the agent's tool output but do not feed `categorizeDistrict()` directly.

---

## 4. Data quality outliers we filter at runtime

Source CSV: [`data_quality_outliers.csv`](../data/data_quality_outliers.csv).

| Outlier class | Count | % of 10,088 | What we do |
| --- | ---: | ---: | --- |
| `address_zipOrPostcode` literal `"null"` or empty | 66 + others | 0.65% (missing) | `WHERE pin IS NOT NULL AND pin NOT IN ('', 'null')` everywhere we join on PIN |
| Pincode malformed (not `^[0-9]{6}$`) | 250 | 2.48% | Lost from PIN-based aggregation; fixable for ~166 of them with `REPLACE(pin, ' ', '')` (160 with whitespace + 6 with leading zero stripped) |
| `latitude`/`longitude` NULL | 118 | 1.17% | Excluded from map markers; still aggregable by district |
| Coordinates outside India bbox (6–37°N, 68–97°E) | 6 | 0.06% | Geocoding errors — currently still rendered (low blast radius) |
| Probable duplicate records (same `name` + `pin`) | 16 | 0.16% | Currently both rendered; dedupe is a tractable v2 task |
| Coordinate dupes (same lat/lon) | 53 | 0.53% | Likely campus / centroid-geocoding artifacts; currently both rendered |
| `address_stateOrRegion` mis-leveled | — | — | 254 distinct values for 36 actual Indian states/UTs. We do not trust this column for joins; we go through pincode → district → state instead |
| State missing | 63 | 0.62% | — |

**How it shaped the app.** Direct citations:
- The literal-`"null"` filter: [`coverage.py:62`](../../src/server/routes/coverage.py), [`agent.py:446`](../../src/server/agent.py).
- Avoiding `address_stateOrRegion` for joins (it has 254 distinct values for ~36 states): all aggregation in the app routes through the pincode directory, never the raw state column. The pincode directory + alias layers from Pass 1 are what give us ~95.5% PIN resolution and 100% NFHS coverage post-aliases.
- The 250-row malformed-pincode population is the most fixable thing here. Salvaging the 160 whitespace-only cases would lift PIN-bridge coverage from 95.5% → ~97.1% with a one-line `REPLACE`. Listed as v2 below.

The ~3% of facilities we lose to malformed PINs and bbox-outlier coordinates is a known floor — surfaced honestly in the app's "no facility records" category rather than papered over.

---

## 5. Open questions / explicit v2 candidates

1. **LLM-extracted capability evidence.** The keyword expansion in §1 is a useful coverage tool but it cannot distinguish "no ICU" from "modern 12-bed ICU." This is the `claude_batch.py` job we deliberately deferred (~$20, ~45 min) — it would replace the substring matching with per-(facility, capability) trust scores graded against `description` / `equipment` / `procedure` text. The 5-category classifier's `confidence` axis would be far stronger if it ran on extracted evidence rather than completeness counts.
2. **Pincode salvage pass.** Lifting whitespace + leading-zero-stripped pincodes from §4 is a one-line change worth ~166 facilities (~1.6 percentage points of national coverage).
3. **Sanitation as a third NFHS axis.** Of the five indicators we surface, sanitation has the widest spread (median 73.8, p10 52.6, p90 88.5) and would meaningfully sharpen the "poor outcomes" signal beyond the institutional-birth + stunting pair we use today.
4. **Dedupe pass.** The 16 (name + pincode) dupes and 53 coordinate dupes are visible to a planner clicking around the map. Not load-bearing, but a polish item.

---

## Reproducibility

- The 5-category distribution and correlation results are reproducible via `python3 eda/scripts/category_distribution.py` (writes the SQL it ran to `eda/scripts/category_distribution_query.sql` and the bucket counts to `eda/data/category_distribution_by_capability.csv`).
- The capability-expansion, NFHS-distribution, and data-quality numbers are produced by ad-hoc SQL via `databricks experimental aitools tools query`. The exact SQL is reproducible from the prose above; we did not commit one-off SQL files.
- Every aggregate referenced in this report lives in a CSV next to the markdown.
