# Aarogya Disha — API Contract

Backend: Python FastAPI  
Base URL (local): `http://localhost:8000`  
Base URL (deployed): served from the Databricks App root

---

## Authentication

All routes are internal to the Databricks App. No API keys required from the frontend.  
The backend authenticates to Lakebase using the Databricks SDK OAuth token refresh pattern.

---

## Routes

### 1. Coverage

#### `GET /api/coverage`

Returns all districts ranked worst-first by gap score for a given capability and state.  
This is the data source for both the choropleth map and the ranked table.

**Query params**

| Param | Type | Required | Example |
|-------|------|----------|---------|
| `capability` | string | yes | `maternity` |
| `state` | string | no | `Maharashtra` |

**Response** `200 OK` — array of district coverage objects

```json
[
  {
    "district": "Nandurbar",
    "state": "Maharashtra",
    "total_facilities": 3,
    "matching_facilities": 0,
    "gap_score": 0.0,
    "confidence": 0.82,
    "institutional_birth_5y_pct": 28.4,
    "child_stunting_pct": 47.2,
    "hh_electricity_pct": 71.2,
    "hh_improved_water_pct": 54.3,
    "hh_use_improved_sanitation_pct": 48.1
  },
  {
    "district": "Wardha",
    "state": "Maharashtra",
    "total_facilities": 4,
    "matching_facilities": 1,
    "gap_score": 2.5,
    "confidence": 0.31,
    "institutional_birth_5y_pct": 79.1,
    "child_stunting_pct": 21.0,
    "hh_electricity_pct": 96.4,
    "hh_improved_water_pct": 89.1,
    "hh_use_improved_sanitation_pct": 87.3
  }
]
```

**How gap_score is computed**
```
gap_score = (matching_facilities / total_facilities) * 10
→ 0.0 = no matching facilities (desert)
→ 10.0 = all facilities match (well served)
```

**How confidence is computed**
```
confidence = average field completeness across all facilities in the district
field completeness = filled fields / 6 tracked fields
  (latitude, longitude, description, numberDoctors, phone_numbers, source)
→ 0.0–1.0 scale
→ high confidence = data is rich enough to trust the gap score
→ low confidence = data is sparse, gap may just be a data hole
```

---

### 2. District Facilities

#### `GET /api/districts/{district}/facilities`

Returns all facility records in a district for a given capability.  
Used to populate the facility cards and the district mini-map dots.

**Path params**

| Param | Type | Example |
|-------|------|---------|
| `district` | string | `Nandurbar` |

**Query params**

| Param | Type | Required | Example |
|-------|------|----------|---------|
| `capability` | string | yes | `maternity` |
| `state` | string | no | `Maharashtra` |

**Response** `200 OK` — array of facility objects, sorted: matching first, then by completeness desc

```json
[
  {
    "unique_id": "IN-MH-FAC-00123",
    "name": "Govt District Hospital Nandurbar",
    "organization_type": "Government",
    "address_city": "Nandurbar",
    "address_state": "Maharashtra",
    "latitude": 21.3686,
    "longitude": 74.2418,
    "number_doctors": "12",
    "phone_numbers": "02564-222001",
    "email": null,
    "websites": null,
    "specialties": "General Medicine, Maternity, Surgery",
    "capability": "maternity, obstetric",
    "description": "District government hospital with maternity ward",
    "source": "NHA",
    "year_established": "1978",
    "has_capability": true,
    "completeness": 0.83,
    "verdict": "confirmed",
    "verified_capabilities": ["maternity"],
    "unverified_capabilities": [],
    "sources": [
      { "url": "https://nhp.gov.in/...", "description": "NHP listing" }
    ],
    "verified_at": "2026-06-15T10:23:00Z"
  },
  {
    "unique_id": "IN-MH-FAC-00456",
    "name": "PHC Prakasha",
    "organization_type": "Government",
    "address_city": "Prakasha",
    "address_state": "Maharashtra",
    "latitude": null,
    "longitude": null,
    "number_doctors": null,
    "phone_numbers": null,
    "email": null,
    "websites": null,
    "specialties": null,
    "capability": null,
    "description": null,
    "source": "HMIS",
    "year_established": null,
    "has_capability": false,
    "completeness": 0.17,
    "verdict": null,
    "verified_capabilities": null,
    "unverified_capabilities": null,
    "sources": null,
    "verified_at": null
  }
]
```

---

### 3. District NFHS-5

#### `GET /api/districts/{district}/nfhs5`

Returns the NFHS-5 health survey row for a district.  
Used to populate the health outcome stat cards in the drawer.

**Path params**

| Param | Type | Example |
|-------|------|---------|
| `district` | string | `Nandurbar` |

**Query params**

| Param | Type | Required | Example |
|-------|------|----------|---------|
| `state` | string | no | `Maharashtra` |

**Response** `200 OK` — single NFHS-5 object, or `{}` if not found

```json
{
  "district_name": "Nandurbar",
  "state_ut": "Maharashtra",
  "institutional_birth_5y_pct": 28.4,
  "births_attended_by_skilled_hp_5y_10_pct": 38.2,
  "mothers_who_had_at_least_4_anc_visits_lb5y_pct": 31.0,
  "child_u5_who_are_stunted_height_for_age_18_pct": 47.2,
  "child_12_23m_fully_vaccinated_pct": 62.1,
  "hh_electricity_pct": 71.2,
  "hh_improved_water_pct": 54.3,
  "hh_use_improved_sanitation_pct": 48.1,
  "hh_member_covered_health_insurance_pct": 22.4,
  "non_pregnant_w15_49_who_are_anaemic": 61.3,
  "women_age_15_49_who_are_literate_pct": 54.7,
  "w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct": 11.2,
  "w15_plus_with_high_141_160_mg_dl_blood_sugar_pct": 6.8,
  "m15_plus_with_high_141_160_mg_dl_blood_sugar_pct": 8.1,
  "w15_plus_who_use_any_kind_of_tobacco_pct": 9.3,
  "m15_plus_who_use_any_kind_of_tobacco_pct": 38.6,
  "women_age_30_49_years_ever_undergone_a_cervical_screen_pct": 2.1,
  "women_age_30_49_years_ever_undergone_a_breast_exam_pct": 1.8
}
```

---

### 4. District Assessment (SSE stream)

#### `GET /api/districts/{district}/assessment`

Runs the agentic loop for a district and streams the verdict back.  
Auto-triggered when the detail drawer opens. The planner never types anything.

**Path params**

| Param | Type | Example |
|-------|------|---------|
| `district` | string | `Nandurbar` |

**Query params**

| Param | Type | Required | Example |
|-------|------|----------|---------|
| `capability` | string | yes | `maternity` |
| `state` | string | no | `Maharashtra` |

**Response** `200 OK` — `text/event-stream` (SSE)

The stream emits events as the agent loop progresses:

```
event: tool_call
data: {"tool": "query_database", "input": "SELECT * FROM nfhs5..."}

event: tool_result
data: {"tool": "query_database", "rows": 1, "preview": "institutional_birth_5y_pct: 28.4"}

event: tool_call
data: {"tool": "web_search", "input": "maternity hospital Nandurbar Maharashtra registry"}

event: tool_result
data: {"tool": "web_search", "results": 2, "preview": "nhp.gov.in — no match found"}

event: assessment
data: {
  "verdict": "tier1_desert",
  "verdict_label": "Tier-1 Maternity Desert",
  "confidence": "high",
  "summary": "Nandurbar has zero maternity-capable facilities for an estimated 1.7M residents. NFHS-5 confirms outcomes consistent with absent care: institutional birth rate of 28% against a state average of 76%, child stunting at 47%. Web search found no additional listings in NHA, NABH, or HMIS registries.",
  "sources": [
    { "type": "database", "ref": "nfhs5.district_name='Nandurbar'", "detail": "institutional_birth_5y_pct: 28.4" },
    { "type": "database", "ref": "facilities table", "detail": "0 matching facilities in district" },
    { "type": "web", "ref": "nhp.gov.in", "detail": "no results for Nandurbar maternity" }
  ]
}

event: done
data: {}
```

**Verdict values**

| Value | Label | Meaning |
|-------|-------|---------|
| `tier1_desert` | Tier-1 Maternity Desert | Confirmed gap + bad outcomes + no external evidence |
| `tier2_suspect` | Tier-2 Suspect Gap | Gap exists but data completeness is low |
| `data_hole` | Data Gap | Cannot conclude — insufficient data |
| `adequate` | Adequate Coverage | Sufficient matching facilities found |

**Agent tools used internally**

```
query_database(sql, params)
  → runs read-only SELECT against Lakebase
  → tables accessible: public.facilities, public.pincode_directory,
                        public.nfhs5_health_indicators
  → agent writes its own SQL

web_search(query)
  → calls Tavily Search API
  → returns top 3 web results
  → used to verify/deny gap against external health registries
```

---

### 5. Scenarios

#### `GET /api/scenarios`

Returns all saved planning scenarios, newest first.

**Response** `200 OK`

```json
[
  {
    "id": 1,
    "name": "Q3 Maternity Expansion — Nandurbar",
    "capability": "maternity",
    "district": "Nandurbar",
    "state": "Maharashtra",
    "gap_score": 0.0,
    "confidence": 0.82,
    "note": "Recommend for Phase 1 fund allocation",
    "created_at": "2026-06-15T10:30:00Z"
  }
]
```

#### `POST /api/scenarios`

Saves a new planning scenario.

**Request body**

```json
{
  "name": "Q3 Maternity Expansion — Nandurbar",
  "capability": "maternity",
  "district": "Nandurbar",
  "state": "Maharashtra",
  "gap_score": 0.0,
  "confidence": 0.82,
  "note": "Recommend for Phase 1 fund allocation"
}
```

| Field | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `capability` | string | yes |
| `district` | string | no |
| `state` | string | no |
| `gap_score` | float | no |
| `confidence` | float | no |
| `note` | string | no |

**Response** `201 Created` — the created scenario object (same shape as GET item above)

---

### 6. Facility Verification

#### `POST /api/facilities/{facility_id}/verify`

Fires an async web search to verify a facility's claimed capabilities.  
Returns immediately — poll the GET endpoint for results.

**Path params**

| Param | Type | Example |
|-------|------|---------|
| `facility_id` | string | `IN-MH-FAC-00123` |

**Response** `202 Accepted`

```json
{ "status": "verification_started" }
```

#### `GET /api/facilities/{facility_id}/verification`

Returns the stored verification result for a facility.

**Response** `200 OK` — verification result, or not-yet status

```json
{
  "facility_id": "IN-MH-FAC-00123",
  "verdict": "confirmed",
  "verified_capabilities": ["maternity"],
  "unverified_capabilities": ["icu"],
  "sources": [
    { "url": "https://nhp.gov.in/...", "description": "NHP hospital listing" },
    { "url": "https://nha.gov.in/...", "description": "Ayushman Bharat empanelled" }
  ],
  "confidence_delta": 0.2,
  "verified_at": "2026-06-15T10:23:00Z"
}
```

Or if not yet verified:

```json
{ "status": "not_verified" }
```

**Verdict values**

| Value | Meaning |
|-------|---------|
| `confirmed` | Facility and claimed capabilities verified by external source |
| `partial` | Facility exists but only some capabilities confirmed |
| `unverified` | No external evidence found |

---

## Error responses

All errors return a consistent shape:

```json
{ "error": "human-readable message" }
```

| Status | When |
|--------|------|
| `400` | Missing required query param |
| `404` | District or facility not found |
| `500` | Database or agent error |

---

## Database schema

### Synced from Unity Catalog (read-only)

```
public.facilities
public.pincode_directory
public.nfhs5_health_indicators
```

### App-owned (read/write)

```sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.scenarios (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  capability  TEXT NOT NULL,
  district    TEXT,
  state       TEXT,
  gap_score   NUMERIC,
  confidence  NUMERIC,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.facility_verifications (
  id                       SERIAL PRIMARY KEY,
  facility_id              TEXT NOT NULL UNIQUE,
  verdict                  TEXT,
  verified_capabilities    TEXT[],
  unverified_capabilities  TEXT[],
  sources                  JSONB,
  confidence_delta         NUMERIC,
  raw_response             TEXT,
  verified_at              TIMESTAMPTZ DEFAULT NOW()
);
```

---

## How the three source tables join

```
facilities.address_zipOrPostcode
    ↓ join on pincode
pincode_directory.district + statename
    ↓ join on district name (case-insensitive)
nfhs5_health_indicators.district_name + state_ut
```

---

## Capability keyword map

Used by all coverage and facility queries to detect capability matches via ILIKE:

```python
CAPABILITY_KEYWORDS = {
    "icu":        ["icu", "intensive care", "critical care", "ventilator", "ccm"],
    "maternity":  ["maternity", "obstetric", "delivery", "labour", "prenatal", "antenatal", "midwifery"],
    "emergency":  ["emergency", "casualty", "trauma", "accident", "a&e", "24 hour"],
    "dialysis":   ["dialysis", "renal", "nephrology", "kidney"],
    "oncology":   ["oncology", "cancer", "chemotherapy", "radiation", "tumour"],
    "trauma":     ["trauma", "orthopedic", "fracture", "spine", "neurosurgery"],
    "nicu":       ["nicu", "neonatal", "newborn intensive", "premature"],
}
```

A facility matches a capability if **any** of its `specialties`, `capability`, or `description` columns contain **any** of the keywords (case-insensitive).

---

## File structure

```
server/
├── main.py                        FastAPI app, CORS, static files, entry point
├── db.py                          Lakebase connection + OAuth token refresh
├── agent.py                       Agentic assessment loop (Claude + tools + SSE)
├── lib/
│   └── capability_keywords.py     Shared keyword map + ILIKE builder
└── routes/
    ├── coverage.py                GET /api/coverage
    ├── regions.py                 GET /api/districts/:d/facilities + nfhs5
    ├── assessment.py              GET /api/districts/:d/assessment (SSE)
    ├── scenarios.py               GET + POST /api/scenarios
    └── verify.py                  POST + GET /api/facilities/:id/verify
```

---

## Environment variables

```bash
# Lakebase
PGHOST=ep-fancy-sound-d843jm56.database.us-east-2.cloud.databricks.com
PGPORT=5432
PGDATABASE=databricks_postgres

# Databricks (for OAuth token refresh)
DATABRICKS_HOST=https://dbc-744ddd5a-5ae9.cloud.databricks.com
DATABRICKS_TOKEN=<personal access token or OAuth>

# Agent
DATABRICKS_SERVING_ENDPOINT_NAME=databricks-claude-sonnet-4-6
TAVILY_API_KEY=<tavily key — optional, mocked if absent>

# Runtime
DATABRICKS_APP_PORT=8000
```
