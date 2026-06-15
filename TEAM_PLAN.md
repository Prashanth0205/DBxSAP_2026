# Sanjeevni — DBxSAP Hackathon 2026 Team Plan
## Track: Medical Desert Planner
**"Where are the highest-risk gaps in care, and how confident are we that those gaps are real?"**

> **Sanjeevni** (Sanskrit: "life-giving") — finding where healthcare is missing across India.

---

## Actual Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| Backend | Node.js + Express (Databricks AppKit) |
| Database | **Lakebase (Postgres)** — user persistence (notes, scenarios, shortlists) |
| Data queries | Databricks SQL via AppKit `sql()` helper |
| Maps | `react-leaflet` + Leaflet.js |
| AI | Claude API (`@anthropic-ai/sdk`) — batch preprocessing |
| Deployment | Databricks Apps (Free Edition) |

---

## Team Roles

| Person | Role | Owns |
|--------|------|------|
| **Dev A** | Data & Backend | Databricks SQL queries, Claude batch preprocessing notebook, backend API routes |
| **Dev B** | Maps & Visualization | Leaflet map, choropleth, stripe uncertainty layer, geospatial logic |
| **Dev C** | Frontend App | React pages, query builder UI, facility table, routing |
| **Dev D** | AI & Persistence | Claude prompt engineering, Lakebase Postgres schemas, persistence API routes, demo prep |

---

## Final Project Structure

```
db-hackathon-2026/
├── client/src/
│   ├── pages/
│   │   ├── home/         HomePage.tsx          ← Dev C
│   │   ├── map/          MapPage.tsx            ← Dev B + Dev C
│   │   ├── facility/     FacilityPage.tsx       ← Dev C
│   │   ├── evidence/     EvidencePage.tsx       ← Dev C + Dev D
│   │   └── workspace/    WorkspacePage.tsx      ← Dev C + Dev D
│   ├── components/
│   │   ├── CoverageMap.tsx                      ← Dev B
│   │   ├── FacilityTable.tsx                    ← Dev C
│   │   ├── EvidenceModal.tsx                    ← Dev D
│   │   ├── ConfidenceBadge.tsx                  ← Dev C
│   │   └── ScenarioDiff.tsx                     ← Dev B (if time)
│   └── lib/
│       ├── api.ts          (fetch helpers)      ← Dev C
│       └── types.ts        (shared types)       ← Dev D
├── server/
│   ├── routes/
│   │   ├── coverage.ts     (map data API)       ← Dev A
│   │   ├── facilities.ts   (drill-down API)     ← Dev A
│   │   ├── scenarios.ts    (CRUD persistence)   ← Dev D
│   │   └── shortlists.ts   (CRUD persistence)   ← Dev D
│   └── server.ts                                ← Dev D (update)
├── preprocessing/
│   └── claude_batch.py     (run once in Databricks) ← Dev A + Dev D
├── sql/
│   ├── create_tables.sql                        ← Dev A
│   └── aggregation_views.sql                    ← Dev A
└── TEAM_PLAN.md
```

---

## Phase 1 — Setup (Hours 0–2)

### Dev A — Databricks & SQL
- [ ] Log in to Databricks workspace (Free Edition)
- [ ] Upload `facilities.csv` (10k rows) to Databricks volume or DBFS
- [ ] Create a SQL Warehouse (Serverless if available, else smallest node)
- [ ] Run `create_tables.sql` to create `raw_facilities` and `facility_capabilities` tables
- [ ] Verify: `SELECT COUNT(*) FROM raw_facilities` returns 10000
- [ ] Note down your SQL Warehouse HTTP path (needed for backend connection)

### Dev B — Map Bootstrap
- [ ] In the repo: `npm install react-leaflet leaflet @types/leaflet`
- [ ] Create `client/src/components/CoverageMap.tsx` — renders a blank Leaflet map centered on India
- [ ] Confirm it appears in the browser at `/map` route (add a temporary route in App.tsx)
- [ ] Download India states GeoJSON and put it in `client/public/india_states.geojson`
  - Use: https://github.com/Subhash9325/GeoJson-Data-of-Indian-States

### Dev C — App Shell & Routing
- [ ] Update `client/src/App.tsx` — replace the todo app with Sanjeevni:
  - Routes: `/` (home), `/map` (Coverage Map), `/facility/:id` (Facility), `/workspace` (Planning)
  - Update the header: "Sanjeevni" branding, Databricks red `#FF3621`
  - Update nav links to match new routes
- [ ] Create stub page components (just `<div>Coming soon</div>`) for each route
- [ ] Confirm `npm run dev` shows new nav and routes work

### Dev D — Claude Prompt + Lakebase Schemas
- [ ] Install Anthropic SDK: `npm install @anthropic-ai/sdk`
- [ ] Write `lib/types.ts` with all shared TypeScript interfaces (see Types section below)
- [ ] Write Lakebase Postgres migration SQL (see Schemas section below)
- [ ] Manually test Claude extraction prompt on 10 facilities from the CSV — tune until JSON output is correct
- [ ] Create `.env.example` additions for `ANTHROPIC_API_KEY`

### Sync Checkpoint (end of Hour 2)
- [ ] `npm run dev` shows Sanjeevni branding with 4 routes ✓
- [ ] Dev B's map renders in the browser at `/map` ✓
- [ ] Dev A's SQL Warehouse is running and `raw_facilities` has data ✓
- [ ] Dev D's Claude prompt produces correct JSON ✓

---

## Shared Types (lib/types.ts) — Dev D writes this first

```typescript
export type CapabilityTag =
  | 'icu' | 'emergency_care' | 'maternity' | 'nicu'
  | 'surgery_general' | 'surgery_cardiac' | 'oncology'
  | 'dialysis' | 'radiology' | 'pathology' | 'orthopedics'
  | 'neurology' | 'cardiology' | 'pediatrics' | 'psychiatry'
  | 'physiotherapy' | 'blood_bank' | 'pharmacy';

export const CAPABILITY_TAGS: CapabilityTag[] = [
  'icu', 'emergency_care', 'maternity', 'nicu',
  'surgery_general', 'surgery_cardiac', 'oncology',
  'dialysis', 'radiology', 'pathology', 'orthopedics',
  'neurology', 'cardiology', 'pediatrics', 'psychiatry',
  'physiotherapy', 'blood_bank', 'pharmacy',
];

export interface CoverageRegion {
  state: string;
  city: string;
  latitude: number;
  longitude: number;
  capability_tag: CapabilityTag;
  facility_count: number;
  avg_confidence: number;
  confidence_std: number;
  field_coverage_pct: number; // 0–1: % of facilities with equipment populated
}

export interface FacilityRow {
  facility_id: string;
  facility_name: string;
  state: string;
  city: string;
  latitude: number;
  longitude: number;
  confidence: number;
  evidence_text: string;
  field_source: string;
}

export interface FacilityDetail {
  facility_id: string;
  facility_name: string;
  state: string;
  city: string;
  description: string;
  capability: string;
  equipment: string;
  numberDoctors: number | null;
  capacity: number | null;
  yearEstablished: number | null;
  capabilities: {
    tag: CapabilityTag;
    confidence: number;
    evidence_text: string;
    field_source: string;
  }[];
}

export interface Scenario {
  id: string;
  name: string;
  capability_filter: CapabilityTag;
  states_filter: string[];
  min_confidence: number;
  notes: string;
  created_at: string;
}

export interface ShortlistItem {
  id: string;
  scenario_id: string;
  facility_id: string;
  facility_name: string;
  city: string;
  state: string;
  priority: number;
  user_note: string;
  added_at: string;
}

// Confidence display helpers
export function confidenceLabel(score: number): string {
  if (score >= 0.75) return 'Strong evidence';
  if (score >= 0.60) return 'Partial evidence';
  if (score >= 0.40) return 'Weak evidence';
  return 'Suspicious / no claim';
}

export function confidenceColor(score: number): string {
  if (score >= 0.75) return '#2ecc71'; // green
  if (score >= 0.60) return '#f39c12'; // yellow
  if (score >= 0.40) return '#e67e22'; // orange
  return '#e74c3c';                    // red
}
```

---

## Lakebase Postgres Schemas — Dev D

```sql
-- Run in Databricks Lakebase (Postgres)

CREATE TABLE IF NOT EXISTS planning_scenarios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  capability_filter TEXT NOT NULL,
  states_filter    TEXT[],          -- array of state names
  min_confidence   FLOAT DEFAULT 0.5,
  notes            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facility_shortlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id  UUID REFERENCES planning_scenarios(id) ON DELETE CASCADE,
  facility_id  TEXT NOT NULL,
  priority     INT DEFAULT 1,
  user_note    TEXT DEFAULT '',
  added_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facility_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id         TEXT NOT NULL,
  capability_tag      TEXT NOT NULL,
  note_text           TEXT NOT NULL,
  override_confidence FLOAT,        -- NULL = no override
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Databricks SQL Tables — Dev A

```sql
-- Run in Databricks SQL Warehouse

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

-- Load from the CSV (run in a notebook):
-- COPY INTO raw_facilities FROM '/Volumes/...path.../facilities.csv'
-- FILEFORMAT = CSV OPTIONS ('header' = 'true', 'inferSchema' = 'true');

CREATE TABLE IF NOT EXISTS facility_capabilities (
  facility_id    STRING NOT NULL,
  capability_tag STRING NOT NULL,
  confidence     DOUBLE,
  evidence_text  STRING,
  field_source   STRING
) USING DELTA;

-- Aggregation view (run after Claude batch job finishes)
CREATE OR REPLACE VIEW capability_coverage AS
SELECT
  rf.state,
  rf.city,
  AVG(rf.latitude)  AS latitude,
  AVG(rf.longitude) AS longitude,
  fc.capability_tag,
  COUNT(DISTINCT fc.facility_id) AS facility_count,
  ROUND(AVG(fc.confidence), 3)   AS avg_confidence,
  ROUND(STDDEV(fc.confidence), 3) AS confidence_std,
  ROUND(AVG(CASE WHEN rf.equipment IS NOT NULL AND rf.equipment != '' THEN 1.0 ELSE 0.0 END), 3) AS field_coverage_pct
FROM facility_capabilities fc
JOIN raw_facilities rf ON fc.facility_id = rf.facility_id
GROUP BY rf.state, rf.city, fc.capability_tag;
```

---

## Phase 2 — Claude Batch Preprocessing (Hours 2–8) — CRITICAL PATH

### preprocessing/claude_batch.py (Dev A runs this in a Databricks Notebook)

```python
# Databricks Notebook — run as a Job
# This processes 10k facilities and writes to facility_capabilities
# Runtime: ~45 minutes. Start ASAP in Hour 2.

import anthropic
import json
import time
from pyspark.sql import SparkSession
import pandas as pd

spark = SparkSession.builder.getOrCreate()
client = anthropic.Anthropic(api_key="<ANTHROPIC_API_KEY>")

CAPABILITY_TAGS = [
    "icu", "emergency_care", "maternity", "nicu",
    "surgery_general", "surgery_cardiac", "oncology",
    "dialysis", "radiology", "pathology", "orthopedics",
    "neurology", "cardiology", "pediatrics", "psychiatry",
    "physiotherapy", "blood_bank", "pharmacy"
]

SYSTEM_PROMPT = """You extract structured healthcare capabilities from Indian facility records.
Return ONLY valid JSON. No explanation. No markdown.

Confidence rules:
- "has ICU" alone = 0.40
- "10-bed ICU" = 0.65  
- "10-bed ICU with ventilators" = 0.85
- Brand names (Siemens, GE, Philips) or certifications (NABH, JCI) = +0.10 boost
- Claim in description only, nothing in equipment = max 0.55
- Each missing field reduces max confidence by 0.10
- 2-doctor clinic claiming cardiac surgery = max 0.25 (implausible)
"""

def extract_one(row: dict) -> list:
    prompt = f"""
ALLOWED TAGS: {', '.join(CAPABILITY_TAGS)}

FACILITY:
Name: {row.get('facility_name','N/A')} | State: {row.get('state','N/A')} | City: {row.get('city','N/A')}
description: {row.get('description','N/A')}
capability: {row.get('capability','N/A')}
procedure: {row.get('procedure_text','N/A')}
equipment: {row.get('equipment','N/A')}
specialties: {row.get('specialties','N/A')}
numberDoctors: {row.get('numberDoctors','N/A')}

Return: {{"capabilities": [{{"tag":"...", "confidence":0.0, "evidence":"exact quoted phrase max 20 words", "field_source":"description|capability|equipment|procedure|specialties"}}]}}
"""
    try:
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        return json.loads(resp.content[0].text)["capabilities"]
    except Exception as e:
        print(f"Error on {row.get('facility_id')}: {e}")
        return []

facilities_pd = spark.table("raw_facilities").toPandas()
results = []

for i, (_, row) in enumerate(facilities_pd.iterrows()):
    caps = extract_one(row.to_dict())
    for cap in caps:
        results.append({
            "facility_id": row["facility_id"],
            "capability_tag": cap["tag"],
            "confidence": cap["confidence"],
            "evidence_text": cap["evidence"],
            "field_source": cap["field_source"]
        })
    
    # Save every 500 facilities so progress isn't lost
    if i > 0 and i % 500 == 0:
        print(f"Progress: {i}/{len(facilities_pd)}")
        spark.createDataFrame(pd.DataFrame(results)) \
            .write.format("delta").mode("append").saveAsTable("facility_capabilities")
        results = []
    
    # Rate limit buffer
    if i % 50 == 0:
        time.sleep(1)

# Final batch
if results:
    spark.createDataFrame(pd.DataFrame(results)) \
        .write.format("delta").mode("append").saveAsTable("facility_capabilities")

print("Done!")
```

---

## Phase 3 — Backend API Routes (Hours 2–11) — Dev A

### server/routes/coverage.ts

```typescript
import { AppKit } from '@databricks/appkit';
import { Router } from 'express';
import { CoverageRegion } from '../../client/src/lib/types';

export function setupCoverageRoutes(app: Router, appkit: AppKit) {
  // GET /api/coverage?capability=dialysis&states=Uttar Pradesh,Bihar&minConfidence=0.5
  app.get('/api/coverage', async (req, res) => {
    const { capability, states, minConfidence = '0.5' } = req.query as Record<string, string>;
    
    const stateList = states
      ? states.split(',').map(s => `'${s.trim().replace(/'/g, "''")}'`).join(', ')
      : null;
    
    const stateFilter = stateList ? `AND state IN (${stateList})` : '';

    const rows = await appkit.sql(`
      SELECT state, city, latitude, longitude, capability_tag,
             facility_count, avg_confidence, confidence_std, field_coverage_pct
      FROM capability_coverage
      WHERE capability_tag = '${capability}'
      ${stateFilter}
      AND avg_confidence >= ${parseFloat(minConfidence)}
      ORDER BY avg_confidence DESC
      LIMIT 500
    `);

    res.json(rows as CoverageRegion[]);
  });

  // GET /api/states — for populating the state filter dropdown
  app.get('/api/states', async (_req, res) => {
    const rows = await appkit.sql(`
      SELECT DISTINCT state FROM raw_facilities ORDER BY state
    `);
    res.json(rows.map((r: any) => r.state));
  });
}
```

### server/routes/facilities.ts

```typescript
import { AppKit } from '@databricks/appkit';
import { Router } from 'express';

export function setupFacilityRoutes(app: Router, appkit: AppKit) {
  // GET /api/facilities?city=Lucknow&capability=dialysis&minConfidence=0.5
  app.get('/api/facilities', async (req, res) => {
    const { city, capability, minConfidence = '0.5' } = req.query as Record<string, string>;

    const rows = await appkit.sql(`
      SELECT rf.facility_id, rf.facility_name, rf.city, rf.state,
             rf.latitude, rf.longitude,
             fc.confidence, fc.evidence_text, fc.field_source
      FROM facility_capabilities fc
      JOIN raw_facilities rf ON fc.facility_id = rf.facility_id
      WHERE rf.city = '${city.replace(/'/g, "''")}'
      AND fc.capability_tag = '${capability}'
      AND fc.confidence >= ${parseFloat(minConfidence)}
      ORDER BY fc.confidence DESC
      LIMIT 100
    `);

    res.json(rows);
  });

  // GET /api/facilities/:id — full detail with all capabilities
  app.get('/api/facilities/:id', async (req, res) => {
    const { id } = req.params;

    const [facility] = await appkit.sql(`
      SELECT facility_id, facility_name, state, city, latitude, longitude,
             description, capability, equipment,
             numberDoctors, capacity, yearEstablished
      FROM raw_facilities
      WHERE facility_id = '${id}'
    `);

    const caps = await appkit.sql(`
      SELECT capability_tag, confidence, evidence_text, field_source
      FROM facility_capabilities
      WHERE facility_id = '${id}'
      ORDER BY confidence DESC
    `);

    res.json({ ...facility, capabilities: caps });
  });
}
```

---

## Phase 4 — Persistence Routes (Hours 5–15) — Dev D

### server/routes/scenarios.ts

```typescript
import { AppKit } from '@databricks/appkit';
import { Router } from 'express';
import { Scenario } from '../../client/src/lib/types';

export function setupScenarioRoutes(app: Router, appkit: AppKit) {
  // GET /api/scenarios
  app.get('/api/scenarios', async (_req, res) => {
    const db = appkit.lakebase();
    const result = await db.query(
      'SELECT * FROM planning_scenarios ORDER BY created_at DESC'
    );
    res.json(result.rows);
  });

  // POST /api/scenarios
  app.post('/api/scenarios', async (req, res) => {
    const { name, capability_filter, states_filter, min_confidence, notes } = req.body;
    const db = appkit.lakebase();
    const result = await db.query(
      `INSERT INTO planning_scenarios (name, capability_filter, states_filter, min_confidence, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, capability_filter, states_filter, min_confidence ?? 0.5, notes ?? '']
    );
    res.json(result.rows[0]);
  });

  // GET /api/scenarios/:id/shortlist
  app.get('/api/scenarios/:id/shortlist', async (req, res) => {
    const db = appkit.lakebase();
    const result = await db.query(
      `SELECT fs.*, rf.facility_name, rf.city, rf.state
       FROM facility_shortlists fs
       JOIN raw_facilities rf ON fs.facility_id = rf.facility_id
       WHERE fs.scenario_id = $1
       ORDER BY fs.priority ASC, fs.added_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  });

  // POST /api/scenarios/:id/shortlist
  app.post('/api/scenarios/:id/shortlist', async (req, res) => {
    const { facility_id, priority, user_note } = req.body;
    const db = appkit.lakebase();
    const result = await db.query(
      `INSERT INTO facility_shortlists (scenario_id, facility_id, priority, user_note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, facility_id, priority ?? 1, user_note ?? '']
    );
    res.json(result.rows[0]);
  });

  // POST /api/notes
  app.post('/api/notes', async (req, res) => {
    const { facility_id, capability_tag, note_text, override_confidence } = req.body;
    const db = appkit.lakebase();
    const result = await db.query(
      `INSERT INTO facility_notes (facility_id, capability_tag, note_text, override_confidence)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [facility_id, capability_tag, note_text, override_confidence ?? null]
    );
    res.json(result.rows[0]);
  });
}
```

---

## Phase 5 — Coverage Map (Hours 2–11) — Dev B

### client/src/components/CoverageMap.tsx

```tsx
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CoverageRegion, confidenceColor } from '../lib/types';

interface Props {
  regions: CoverageRegion[];
  onCityClick: (city: string, state: string) => void;
}

export function CoverageMap({ regions, onCityClick }: Props) {
  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      style={{ height: '500px', width: '100%', borderRadius: '8px' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; CartoDB'
      />

      {regions.map((r, i) => {
        const isSparse = r.field_coverage_pct < 0.5;
        const color = confidenceColor(r.avg_confidence);
        const radius = Math.max(6, r.facility_count * 1.5);

        return (
          <CircleMarker
            key={i}
            center={[r.latitude, r.longitude]}
            radius={radius}
            pathOptions={{
              color: 'black',
              weight: 0.5,
              fillColor: color,
              fillOpacity: isSparse ? 0.3 : 0.75,    // faded = uncertain
              dashArray: isSparse ? '5,5' : undefined, // dashed border = sparse data
            }}
            eventHandlers={{ click: () => onCityClick(r.city, r.state) }}
          >
            <Tooltip>
              <div>
                <strong>{r.city}, {r.state}</strong><br />
                Facilities: {r.facility_count}<br />
                Avg Confidence: {r.avg_confidence.toFixed(2)}<br />
                {isSparse
                  ? `⚠️ Sparse data — only ${Math.round(r.field_coverage_pct * 100)}% of facilities report equipment`
                  : `✓ Good data coverage: ${Math.round(r.field_coverage_pct * 100)}%`
                }
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
```

### Map Legend component (add to bottom of CoverageMap.tsx)

```tsx
export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-[9999] bg-white rounded-lg p-3 shadow-md text-xs border">
      <p className="font-semibold mb-2">Coverage Confidence</p>
      <div className="space-y-1">
        <div><span style={{ color: '#2ecc71' }}>●</span> High — strong facility evidence</div>
        <div><span style={{ color: '#f39c12' }}>●</span> Medium — partial evidence</div>
        <div><span style={{ color: '#e74c3c' }}>●</span> Gap — low or no coverage</div>
        <div className="text-muted-foreground">Faded / dashed = sparse data (uncertain)</div>
      </div>
    </div>
  );
}
```

---

## Phase 6 — React Pages (Hours 2–16) — Dev C

### client/src/pages/map/MapPage.tsx

```tsx
import { useState, useEffect } from 'react';
import { CoverageMap, MapLegend } from '../../components/CoverageMap';
import { CAPABILITY_TAGS, CoverageRegion, CapabilityTag } from '../../lib/types';
import { useNavigate } from 'react-router';

export function MapPage() {
  const [capability, setCapability] = useState<CapabilityTag>('dialysis');
  const [states, setStates] = useState<string[]>([]);
  const [allStates, setAllStates] = useState<string[]>([]);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [regions, setRegions] = useState<CoverageRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/states').then(r => r.json()).then(setAllStates);
  }, []);

  async function analyze() {
    setLoading(true);
    const params = new URLSearchParams({
      capability,
      states: states.join(','),
      minConfidence: String(minConfidence),
    });
    const data = await fetch(`/api/coverage?${params}`).then(r => r.json());
    setRegions(data);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Coverage Map</h2>

      {/* Query Builder */}
      <div className="flex flex-wrap gap-3 p-4 bg-muted rounded-lg">
        <div>
          <label className="text-sm font-medium">Capability</label>
          <select
            className="block mt-1 border rounded px-2 py-1 text-sm"
            value={capability}
            onChange={e => setCapability(e.target.value as CapabilityTag)}
          >
            {CAPABILITY_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Min Confidence</label>
          <input
            type="range" min="0" max="1" step="0.05"
            value={minConfidence}
            onChange={e => setMinConfidence(parseFloat(e.target.value))}
            className="block mt-1"
          />
          <span className="text-xs">{minConfidence.toFixed(2)}</span>
        </div>

        <button
          onClick={analyze}
          disabled={loading}
          className="self-end px-4 py-2 bg-[#FF3621] text-white rounded font-medium text-sm disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : 'Analyze Coverage'}
        </button>
      </div>

      {/* Map */}
      <div className="relative">
        {regions.length > 0
          ? <CoverageMap regions={regions} onCityClick={(city, state) =>
              navigate(`/facility?city=${city}&state=${state}&capability=${capability}&minConfidence=${minConfidence}`)
            } />
          : <div className="h-64 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
              Select a capability and click Analyze to see coverage
            </div>
        }
        <MapLegend />
      </div>

      {/* Summary table */}
      {regions.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {regions.length} regions found. Click a circle on the map to drill into facilities.
        </p>
      )}
    </div>
  );
}
```

---

## Phase 7 — Evidence Inspector (Hours 11–16) — Dev C + Dev D

### client/src/components/EvidenceModal.tsx

```tsx
import { FacilityDetail, confidenceColor, confidenceLabel } from '../lib/types';

function highlightEvidence(text: string, evidenceSnippets: string[]): string {
  let result = text;
  for (const snippet of evidenceSnippets) {
    if (!snippet) continue;
    const escaped = snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(escaped, 'gi'),
      `<mark style="background:#fff176;padding:0 2px">${snippet}</mark>`
    );
  }
  return result;
}

interface Props {
  facility: FacilityDetail;
  onAddNote: (facilityId: string, tag: string, note: string, overrideConf?: number) => void;
  onAddToShortlist: (facilityId: string) => void;
}

export function EvidenceModal({ facility, onAddNote, onAddToShortlist }: Props) {
  const evidenceSnippets = facility.capabilities.map(c => c.evidence_text);
  const rawText = [facility.description, facility.capability, facility.equipment]
    .filter(Boolean).join(' ');
  const highlightedText = highlightEvidence(rawText, evidenceSnippets);

  const fieldsPopulated = [facility.description, facility.capability, facility.equipment]
    .filter(Boolean).length;

  return (
    <div className="space-y-4 p-4 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold">{facility.facility_name}</h3>
          <p className="text-sm text-muted-foreground">{facility.city}, {facility.state}</p>
        </div>
        <button
          onClick={() => onAddToShortlist(facility.facility_id)}
          className="px-3 py-1 bg-[#FF3621] text-white text-sm rounded"
        >
          + Add to Shortlist
        </button>
      </div>

      {/* Field completeness */}
      <div className="bg-muted rounded p-3 text-sm">
        <p className="font-medium mb-1">Data Completeness: {fieldsPopulated}/3 key fields</p>
        <div className="flex gap-3 text-xs">
          <span>{facility.description ? '✓' : '✗'} Description</span>
          <span>{facility.capability ? '✓' : '✗'} Capability</span>
          <span>{facility.equipment ? '✓' : '✗'} Equipment</span>
          <span>{facility.numberDoctors ? '✓' : '✗'} Doctors ({facility.numberDoctors ?? 'unknown'})</span>
        </div>
      </div>

      {/* Extracted capabilities */}
      <div>
        <h4 className="font-semibold mb-2">Extracted Capabilities</h4>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {facility.capabilities.map((cap, i) => (
              <tr key={i} className="border-b">
                <td className="py-2 pr-3 font-medium">{cap.tag}</td>
                <td className="py-2 pr-3" style={{ color: confidenceColor(cap.confidence) }}>
                  {cap.confidence.toFixed(2)} — {confidenceLabel(cap.confidence)}
                </td>
                <td className="py-2 text-muted-foreground italic">"{cap.evidence_text}"</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Highlighted raw text */}
      <div>
        <h4 className="font-semibold mb-2">Raw Text (evidence highlighted)</h4>
        <p
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlightedText }}
        />
      </div>
    </div>
  );
}
```

---

## Confidence Framework (show this in the UI)

| Score | Badge | Plain-English reason |
|-------|-------|---------------------|
| 0.85–1.0 | ✅ Strong evidence | Equipment named with brand, corroborated in 3 fields |
| 0.60–0.84 | 🟡 Partial evidence | Claimed in description, no equipment detail |
| 0.40–0.59 | 🟠 Weak evidence | Vague claim, only 2/5 data fields populated |
| 0.00–0.39 | 🔴 Suspicious | Contradicted by doctor count or missing fields |

**Faded/dashed map markers** = `field_coverage_pct < 0.50` — data too sparse to trust the gap.

---

## 24-Hour Timeline

| Hours | Dev A | Dev B | Dev C | Dev D |
|-------|-------|-------|-------|-------|
| 0–2 | Upload CSV, SQL Warehouse, create tables | Leaflet hello-world map in browser | App shell with 4 routes, stub pages | Claude prompt testing, types.ts, Postgres schemas |
| 2–5 | Load `raw_facilities`, **start Claude batch job** | Choropleth function with dummy data | Query Builder + Map page wired to stub API | Persistence routes (scenarios, shortlists, notes) |
| 5–8 | Monitor batch job, fix errors, build coverage.ts + facilities.ts routes | Add sparse-data fading + dashed borders + legend | Facility Drill-Down page + table | Wire persistence routes into server.ts, test Lakebase writes |
| 8–11 | Write aggregation view (runs after batch job ≥50% done) | Wire real data from `/api/coverage` into map, debug missing coords | Wire map click → facility table drill-down | Build EvidenceModal with yellow highlights |
| 11–15 | Performance: indexes, slow query optimization | Confidence tooltips on hover, mobile-responsive map | Wire facility row click → EvidenceModal | Wire Add to Shortlist + Save Note to Lakebase |
| 15–18 | Seed 3 demo scenarios in Lakebase | Scenario diff map (if time) | Planning Workspace tab: saved scenarios, shortlist view | Full integration test of all routes end-to-end |
| 18–21 | Deploy to Databricks Apps, load test | UI polish, consistent colours, map polish | Branding pass: Sanjeevni logo, header, copy | Record backup demo video, write README |
| 21–24 | Full rehearsal × 3, fix last-minute bugs, Q&A prep | Full rehearsal × 3 | Full rehearsal × 3 | Full rehearsal × 3 |

---

## Scope Cut List (if behind at Hour 18)

Cut in this order — never cut the first item:

1. **Never cut**: Query Builder → Faded Map → Facility Table → Evidence Modal with highlights
2. Cut first: Scenario Diffing comparison map
3. Cut second: Confidence std band overlay
4. Cut third: Planning Workspace notes (keep shortlist save only)

---

## Sync Checkpoints

| Time | Must be true |
|------|-------------|
| Hour 2 | App shows Sanjeevni branding, 4 routes work, map renders in browser |
| Hour 5 | `raw_facilities` has 10k rows, Claude batch job submitted and running |
| Hour 8 | `facility_capabilities` table > 3,000 rows, coverage API returns data |
| Hour 11 | Map shows real India coverage data from API |
| Hour 15 | Full flow works: query → map click → facility table → evidence modal |
| Hour 18 | Shortlist saves to Lakebase, scenario saves and reloads |
| Hour 21 | App deployed at public URL, backup video recorded |
| Hour 24 | Full rehearsal done, everyone can demo solo |

---

## 60-Second Demo Script

> **[0:00–0:10]** "India has 10,000 healthcare facilities. Where are the REAL care gaps — not data gaps, but places we should actually invest? Meet Sanjeevni — the only planner that knows the difference."

> **[0:10–0:25]** *[Select Dialysis + Uttar Pradesh + 0.5 confidence → Analyze Coverage]*
> "Sanjeevni used Claude AI to parse all 10,000 messy facility records — free-text descriptions, equipment lists, capability claims — and extract structured, evidence-backed capability scores."

> **[0:25–0:40]** *[Map renders. Hover a faded/dashed marker]*
> "See this faded marker? This LOOKS like a gap. The tooltip says: 36% data coverage — we genuinely don't know. Now click this solid red city." *[Click → facility table → click row → Evidence Modal]*
> "Here's the exact text Claude read, highlighted in yellow. Full transparency. No hallucinations. The planner can override any score with a note."

> **[0:40–0:55]** *[Click Add to Shortlist → Save Scenario]*
> "Save it. Persisted in Lakebase — the whole team shares it instantly. Compare it with cardiology gaps —" *[Flash diff map if built, otherwise cut]* "Purple cities need BOTH. That's where we invest first."

> **[0:55–1:00]** "Healthcare planners finally know WHERE to expand care, HOW confident to be, and WHY the data says so. That's Sanjeevni."

---

## Judge Q&A Cheat Sheet

| Question | Answer |
|----------|--------|
| API cost? | ~$15–20 for 10k facilities at claude-sonnet-4-6 pricing. Run once, cache to Delta. |
| Scale to 100k? | Batch job is chunked, writes incrementally. Linear cost scaling — same architecture. |
| What if Claude is wrong? | Planners override any confidence score with a note. All overrides persist with a timestamp. |
| Why Databricks? | Delta Lake for 10k facility queries in milliseconds. Lakebase Postgres for ACID user actions. AppKit handles auth + deployment. |
| Why not just filter by specialty? | Specialties are self-reported. We score HOW WELL the facility supports the claimed specialty based on evidence in 5 independent fields. |
| What's "sparse data"? | Regions where <50% of facilities filled in equipment. We could be missing care that exists — so we flag it instead of calling it a gap. |

---

## Pre-Seeded Demo Data (Dev A loads in Lakebase at Hour 21)

```sql
INSERT INTO planning_scenarios (name, capability_filter, states_filter, min_confidence, notes) VALUES
  ('Dialysis Gaps — Uttar Pradesh',  'dialysis',   ARRAY['Uttar Pradesh'],  0.5, 'High population, low coverage'),
  ('Cardiology Gaps — Bihar',        'cardiology', ARRAY['Bihar'],           0.5, 'Rural northeast focus'),
  ('Oncology Gaps — Rajasthan',      'oncology',   ARRAY['Rajasthan'],       0.6, 'Desert belt coverage check');
```

---

*Go win this. — Team Sanjeevni 🏥*
