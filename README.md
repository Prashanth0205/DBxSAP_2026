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

The NFHS↔pincode-directory join was the single biggest engineering risk for Track 2. It is now resolved end-to-end via three layers under `/eda`: a SQL normalization CTE, a 3-row state alias file, and a 141-row district alias set (75 auto-accepted via difflib + 66 hand-curated for government renames, abbreviations, and word reorderings). See [`eda/exploration.md`](eda/exploration.md) for the full pass-1 findings — coverage tables, the literal-`"null"`-string trap, and the alias resolution audit trail.

## Repo layout

```
.
├── README.md                  ← you are here
├── databricks.yml             ← Databricks Asset Bundle (app + Lakebase resource)
├── eda/                       ← exploration writeups + alias resolution artifacts
│   ├── exploration.md
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

## Team

- Evan Schweizer (`I758378`, evan.schweizer@sap.com)
- Elin Park (`I767593`, elin.park@sap.com)
- Prashanth Vidhya Ravi Kumar (`I765455`, prashanth.vidhya.ravi.kumar@sap.com)
- Talia Sriram (`I769312`, talia.sriram@sap.com)

## Status

EDA pass 1 complete. NFHS↔pincode-directory district resolution at 100% (706/706) via the alias layers under `/eda`. AppKit scaffold (React + Express + Lakebase) landed under `/src` and bundles via `databricks.yml`. Track 2 application logic — facility trust-weighting, the [low/high coverage] × [low/high outcome] desert classifier, and saved-scenario persistence — has not been built yet on top of the scaffold.
