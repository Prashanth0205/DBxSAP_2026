import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.DATABRICKS_APP_PORT || 8000;

app.use(express.json());

// ---------------------------------------------------------------------------
// API Routes — stubs until Dev A wires Databricks SQL
// ---------------------------------------------------------------------------

// GET /api/states
app.get('/api/states', (_req, res) => {
  // TODO (Dev A): replace with Databricks SQL query
  // SELECT DISTINCT state FROM raw_facilities ORDER BY state
  res.json([
    'Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Rajasthan',
    'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal',
  ]);
});

// GET /api/coverage?capability=dialysis&states=UP,Bihar&minConfidence=0.5
app.get('/api/coverage', (_req, res) => {
  // TODO (Dev A): replace with capability_coverage view query
  res.json([]);
});

// GET /api/facilities?city=Lucknow&capability=dialysis&minConfidence=0.5
app.get('/api/facilities', (_req, res) => {
  // TODO (Dev A): replace with facility_capabilities JOIN query
  res.json([]);
});

// GET /api/facilities/:id
app.get('/api/facilities/:id', (req, res) => {
  // TODO (Dev A): replace with full facility detail + capabilities query
  res.json({ facility_id: req.params.id, capabilities: [] });
});

// GET /api/scenarios
app.get('/api/scenarios', (_req, res) => {
  // TODO (Dev D): replace with Lakebase SELECT
  res.json([]);
});

// POST /api/scenarios
app.post('/api/scenarios', (req, res) => {
  // TODO (Dev D): replace with Lakebase INSERT
  res.status(201).json({ id: 'stub', ...req.body });
});

// POST /api/scenarios/:id/shortlist
app.post('/api/scenarios/:id/shortlist', (req, res) => {
  // TODO (Dev D): replace with Lakebase INSERT
  res.status(201).json({ id: 'stub', scenario_id: req.params.id, ...req.body });
});

// POST /api/notes
app.post('/api/notes', (req, res) => {
  // TODO (Dev D): replace with Lakebase INSERT
  res.status(201).json({ id: 'stub', ...req.body });
});

// GET /api/scenarios/diff?a=<id>&b=<id>
app.get('/api/scenarios/diff', (_req, res) => {
  // TODO (Dev A): replace with set-intersection SQL query
  // SELECT city, state, latitude, longitude,
  //   COUNT(CASE WHEN scenario_id = :a AND scenario_id = :b THEN 1 END) AS overlap_count,
  //   COUNT(CASE WHEN scenario_id = :a THEN 1 END) - overlap_count AS only_a,
  //   COUNT(CASE WHEN scenario_id = :b THEN 1 END) - overlap_count AS only_b
  // FROM shortlist_items GROUP BY city, state, latitude, longitude
  res.json([]);
});

// ---------------------------------------------------------------------------
// Static files (production)
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Disha server running on http://localhost:${PORT}`);
});
