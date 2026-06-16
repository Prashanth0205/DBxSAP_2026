# Disha — A Compass Towards Health

> *दिशा* — direction, compass

A Databricks App built for the **Databricks Developer Hackathon 2026**. We help non-technical healthcare planners distinguish real care gaps from data-poor regions across India.

---

## The challenge

We are given **10,000 messy records of healthcare facilities across India**. Each record includes structured fields (location, specialties) plus uneven free-text descriptions of claimed capabilities, procedures, equipment, and services.

The hackathon prompt asks us to build a Databricks App that helps a non-technical planner, NGO coordinator, or analyst turn this messy data into trustworthy decisions. The app must:

- Run as a Databricks App on Free Edition
- Use the provided facility dataset
- Support a clear non-technical workflow
- Cite the underlying facility text for any important claim, recommendation, score, or ranking
- Communicate uncertainty instead of presenting weak evidence as fact
- Persist user actions (notes, overrides, shortlists, scenarios, review decisions)

Source prompt: <https://developers.databricks.com/hackathon/challenge>

## Our track — Medical Desert Planner (Track 2)

> **Question:** Where are the highest-risk gaps in care, and how confident are we that those gaps are real?

We aggregate trust-weighted facility evidence across geography (state, district, PIN code) and cross-reference it against **NFHS-5 district health indicators** — government-surveyed health outcomes that act as ground truth. The app helps planners distinguish:

- **Real medical deserts** — sparse facility coverage *and* poor health outcomes
- **Data-poor regions** — sparse facility coverage but adequate health outcomes (under-sampled, not under-served)
- **Hidden risks** — adequate facility count but poor health outcomes (capability mismatch, low-trust evidence)

**Minimum workflow.** A planner selects a capability (e.g. maternity, ICU, NICU) and a geography, sees regional coverage with confidence levels, drills into the facility records behind any aggregate, and saves a planning scenario with notes.

## Headline findings

Five things our exploration of the dataset proved, that directly shaped the app. Full writeup: [`eda/exploration_pass2.md`](eda/exploration_pass2.md).

### 1. Facility count is a weak predictor of health outcomes (r ≈ 0.18) — so a one-axis "facility density" map would mislead planners

Across all 757 Indian districts, the Pearson correlation between *number of facilities* and *institutional birth rate* is **0.186** — explaining ~3.5% of the variance. Adding capability-specific filtering doesn't help (r moves from 0.186 → 0.192 for maternity-matching facilities). **This is the empirical reason our app uses a 5-category classifier, not a single coverage heatmap.** Source: [`facility_outcome_correlations.csv`](eda/facility_outcome_correlations.csv).

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

**NICU is the worst capability we can show:** 70% of districts have a NICU problem of some kind, only 19 districts qualify as adequate. **Maternity is the best:** 285 adequate districts. These are real, defensible differences a planner can act on. Source: [`category_distribution_by_capability.csv`](eda/category_distribution_by_capability.csv).

### 3. 174 of 757 districts (23%) have *zero* facility records — we surface this as a data hole, not as deserts

The same 174 districts show zero matching facility rows for every capability. The honest framing in the app: *we cannot judge supply* in those districts. They render in a distinct neutral color so a planner does not confuse a data hole for a desert. This is the difference between "we don't know" and "we know it's bad."

### 4. Capability keyword expansion does real work — without it, the maternity map would be nearly empty

The literal capability word alone matches a small fraction of the relevant facilities. Maternity expands **6.06×** when we add `obstetric`/`delivery`/`prenatal`/`antenatal`/`midwifery`. Dialysis expands 4.10× via `renal`/`nephrology`/`kidney`. Source: [`capability_keyword_expansion.csv`](eda/capability_keyword_expansion.csv).

| Capability | Literal-word match | Full keyword match | Multiplier |
| --- | ---: | ---: | --- |
| Maternity | 781 | 4,730 | **6.06×** |
| Dialysis | 620 | 2,540 | 4.10× |
| Trauma | 1,517 | 4,415 | 2.91× |

### 5. Data quality is honest: we lose ~3% of facilities to malformed pincodes / bad coordinates and we surface it

Of 10,088 facility rows: 250 have malformed pincodes (160 of which are one-line-fix-able by stripping whitespace), 118 are missing coordinates, 6 have coordinates outside the India bounding box, and `address_stateOrRegion` has 254 distinct values for 36 actual states/UTs (which is why every join in the app routes through `pincode → district → state`, never the raw state column). The ~3% loss is the floor we surface as "no facility records" — papered-over data quality is what would make the app untrustworthy. Source: [`data_quality_outliers.csv`](eda/data_quality_outliers.csv).

## Data

Three Delta-Sharing tables in catalog `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`:

| Table | Rows | Role |
| --- | --- | --- |
| `facilities` | 10,088 | The messy facility records (51 columns, JSON-array-as-string evidence fields) |
| `india_post_pincode_directory` | 165,627 | Pincode → district → state lookup |
| `nfhs_5_district_health_indicators` | 706 | District-level health survey ground truth |

**Join graph for Track 2:**

```
facilities.address_zipOrPostcode
        │
        ▼  (PIN match — 95.5% resolve)
india_post_pincode_directory.pincode → district, statename
        │
        ▼  (normalized district + state + alias layers — 706/706 = 100%)
nfhs_5_district_health_indicators → outcomes
```

The NFHS↔pincode-directory join was the single biggest engineering risk for Track 2. It is now resolved end-to-end via three layers under `/eda`: a SQL normalization CTE, a 3-row state alias file, and a 141-row district alias set (75 auto-accepted via difflib + 66 hand-curated for government renames, abbreviations, and word reorderings). See [`eda/exploration.md`](eda/exploration.md) for the full pass-1 findings — coverage tables, the literal-`"null"`-string trap, and the alias resolution audit trail. [`eda/exploration_pass2.md`](eda/exploration_pass2.md) follows up with the design-validation pass: capability-keyword multipliers, 5-category classifier distribution across all 7 capabilities, facility↔outcome correlations (r ≈ 0.18 — empirically justifies the 2-axis split), and the data-quality outliers we filter at runtime.

## Repo layout

```
.
├── README.md                  ← you are here
├── databricks.yml             ← Databricks Asset Bundle (app + Lakebase resource)
├── eda/                       ← exploration writeups + alias resolution artifacts
│   ├── exploration.md             (pass 1 — coverage + alias resolution)
│   ├── exploration_pass2.md       (pass 2 — keyword/classifier/correlation validation)
│   ├── capability_keyword_expansion.csv
│   ├── category_distribution_by_capability.csv
│   ├── nfhs_indicator_stats.csv
│   ├── facility_outcome_correlations.csv
│   ├── data_quality_outliers.csv
│   ├── facilities_by_state.csv
│   ├── state_aliases.csv          (NFHS → pincode-dir, 3 rows)
│   ├── district_aliases_auto.csv  (fuzzy ≥ 0.90, 75 rows)
│   ├── district_aliases_manual.csv (hand-curated, 66 rows)
│   ├── sql/district_normalize.sql (reusable join CTE)
│   └── notes/                     (review notes, audit trail)
└── src/                       ← AppKit scaffold (React + Express + Lakebase)
    ├── client/                    Vite + React 19 frontend
    ├── server/                    Express API
    ├── app.yaml                   Databricks App config
    └── appkit.plugins.json        AppKit plugin manifest
```

We consume the three Delta-Sharing tables at runtime — full tables are not exported to CSV. Only summaries and small derived aggregates live in the repo.

## Workflow

- **Default branch:** `master` (protected — no force-push, no direct push, all changes via PR)
- **Feature branches:** `<initials>/<type>-<short-description>` (e.g. `dev-es/docs-readme`)
- **PRs:** feature branch → `master`, no intermediate `develop` branch

## Deploy

Live app: <https://hackathon-2026-7474659729690555.aws.databricksapps.com/>

```bash
databricks bundle validate --profile DEFAULT
databricks bundle deploy   --profile DEFAULT
databricks apps logs hackathon-2026 --follow --profile DEFAULT
```

Full instructions, troubleshooting, and local-dev setup: [DEPLOY.md](DEPLOY.md).

## Team

- Evan Schweizer (`I758378`, evan.schweizer@sap.com)
- Elin Park (`I767593`, elin.park@sap.com)
- Prashanth Vidhya Ravi Kumar (`I765455`, prashanth.vidhya.ravi.kumar@sap.com)
- Talia Sriram (`I769312`, talia.sriram@sap.com)

## Status

EDA passes 1 + 2 complete. NFHS↔pincode-directory district resolution at 100% (706/706) via the alias layers under `/eda`. AppKit scaffold (React + Express + Lakebase) landed under `/src` and bundles via `databricks.yml`. Track 2 application logic shipped: capability picker (7 capabilities) + keyword-expanded ILIKE match, 5-category district classifier ([`types.ts:243`](src/client/src/lib/types.ts)), choropleth coverage map with stripe patterns for low-confidence buckets, drill-down popups citing the source field for every claim, web-search-augmented LLM agent with explicit inconsistency detection, and Lakebase-backed scenario / shortlist / notes persistence.
