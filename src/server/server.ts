import { analytics, createApp, lakebase, server } from '@databricks/appkit';
import { z } from 'zod';

const SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS app`;

const SCENARIOS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app.planning_scenarios (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    capability_filter TEXT NOT NULL,
    states_filter     TEXT[] NOT NULL DEFAULT '{}',
    min_confidence    REAL NOT NULL DEFAULT 0.5,
    notes             TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const SHORTLISTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app.facility_shortlists (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id   UUID NOT NULL REFERENCES app.planning_scenarios(id) ON DELETE CASCADE,
    facility_id   TEXT NOT NULL,
    facility_name TEXT NOT NULL,
    city          TEXT NOT NULL DEFAULT '',
    state         TEXT NOT NULL DEFAULT '',
    priority      INT  NOT NULL DEFAULT 1,
    user_note     TEXT NOT NULL DEFAULT '',
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scenario_id, facility_id)
  )
`;

const NOTES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app.facility_notes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id         TEXT NOT NULL,
    capability_tag      TEXT NOT NULL,
    note_text           TEXT NOT NULL,
    override_confidence REAL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const SEED_SCENARIOS_SQL = `
  INSERT INTO app.planning_scenarios (name, capability_filter, states_filter, min_confidence, notes)
  VALUES
    ($1, $2, $3, $4, $5),
    ($6, $7, $8, $9, $10),
    ($11, $12, $13, $14, $15)
`;

const SEED_PARAMS = [
  'Dialysis Gaps — Uttar Pradesh', 'dialysis',   ['Uttar Pradesh'], 0.5, 'High population, low coverage',
  'Cardiology Gaps — Bihar',       'cardiology', ['Bihar'],         0.5, 'Rural northeast focus',
  'Oncology Gaps — Rajasthan',     'oncology',   ['Rajasthan'],     0.6, 'Desert belt coverage check',
];

const CreateScenarioBody = z.object({
  name: z.string().min(1),
  capability_filter: z.string().min(1),
  states_filter: z.array(z.string()).default([]),
  min_confidence: z.number().min(0).max(1).default(0.5),
  notes: z.string().default(''),
});

const ShortlistItemBody = z.object({
  facility_id: z.string().min(1),
  facility_name: z.string().min(1),
  city: z.string().default(''),
  state: z.string().default(''),
  priority: z.number().int().min(1).max(10).default(1),
  user_note: z.string().default(''),
});

const NoteBody = z.object({
  facility_id: z.string().min(1),
  capability_tag: z.string().min(1),
  note_text: z.string().min(1),
  override_confidence: z.number().min(0).max(1).nullable().default(null),
});

createApp({
  plugins: [analytics({}), lakebase(), server()],
  async onPluginsReady(appkit) {
    try {
      await appkit.lakebase.query(SCHEMA_SQL);
      await appkit.lakebase.query(SCENARIOS_TABLE_SQL);
      await appkit.lakebase.query(SHORTLISTS_TABLE_SQL);
      await appkit.lakebase.query(NOTES_TABLE_SQL);

      const { rows } = await appkit.lakebase.query(
        'SELECT COUNT(*)::int AS n FROM app.planning_scenarios',
      );
      const count = Number((rows[0] as { n: number | string })?.n ?? 0);
      if (count === 0) {
        await appkit.lakebase.query(SEED_SCENARIOS_SQL, SEED_PARAMS);
        console.log('[lakebase] Seeded 3 demo scenarios');
      }
    } catch (err) {
      console.warn('[lakebase] Schema init failed:', (err as Error).message);
      console.warn('[lakebase] Routes will be registered but may return errors');
    }

    appkit.server.extend((app) => {
      app.get('/api/scenarios', async (_req, res) => {
        try {
          const result = await appkit.lakebase.query(
            `SELECT id, name, capability_filter, states_filter, min_confidence, notes, created_at
             FROM app.planning_scenarios
             ORDER BY created_at DESC`,
          );
          res.json(result.rows);
        } catch (err) {
          console.error('list scenarios failed:', err);
          res.status(500).json({ error: 'Failed to list scenarios' });
        }
      });

      app.post('/api/scenarios', async (req, res) => {
        const parsed = CreateScenarioBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.message });
          return;
        }
        try {
          const result = await appkit.lakebase.query(
            `INSERT INTO app.planning_scenarios
               (name, capability_filter, states_filter, min_confidence, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, capability_filter, states_filter, min_confidence, notes, created_at`,
            [
              parsed.data.name,
              parsed.data.capability_filter,
              parsed.data.states_filter,
              parsed.data.min_confidence,
              parsed.data.notes,
            ],
          );
          res.status(201).json(result.rows[0]);
        } catch (err) {
          console.error('create scenario failed:', err);
          res.status(500).json({ error: 'Failed to create scenario' });
        }
      });

      app.delete('/api/scenarios/:id', async (req, res) => {
        try {
          await appkit.lakebase.query(
            `DELETE FROM app.planning_scenarios WHERE id = $1`,
            [req.params.id],
          );
          res.status(204).end();
        } catch (err) {
          console.error('delete scenario failed:', err);
          res.status(500).json({ error: 'Failed to delete scenario' });
        }
      });

      app.get('/api/scenarios/:id/shortlist', async (req, res) => {
        try {
          const result = await appkit.lakebase.query(
            `SELECT id, scenario_id, facility_id, facility_name, city, state, priority, user_note, added_at
             FROM app.facility_shortlists
             WHERE scenario_id = $1
             ORDER BY priority ASC, added_at DESC`,
            [req.params.id],
          );
          res.json(result.rows);
        } catch (err) {
          console.error('list shortlist failed:', err);
          res.status(500).json({ error: 'Failed to list shortlist' });
        }
      });

      app.post('/api/scenarios/:id/shortlist', async (req, res) => {
        const parsed = ShortlistItemBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.message });
          return;
        }
        try {
          const result = await appkit.lakebase.query(
            `INSERT INTO app.facility_shortlists
               (scenario_id, facility_id, facility_name, city, state, priority, user_note)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (scenario_id, facility_id) DO UPDATE
               SET priority = EXCLUDED.priority,
                   user_note = EXCLUDED.user_note
             RETURNING id, scenario_id, facility_id, facility_name, city, state, priority, user_note, added_at`,
            [
              req.params.id,
              parsed.data.facility_id,
              parsed.data.facility_name,
              parsed.data.city,
              parsed.data.state,
              parsed.data.priority,
              parsed.data.user_note,
            ],
          );
          res.status(201).json(result.rows[0]);
        } catch (err) {
          console.error('create shortlist failed:', err);
          res.status(500).json({ error: 'Failed to create shortlist item' });
        }
      });

      app.delete('/api/scenarios/:id/shortlist/:itemId', async (req, res) => {
        try {
          await appkit.lakebase.query(
            `DELETE FROM app.facility_shortlists WHERE id = $1 AND scenario_id = $2`,
            [req.params.itemId, req.params.id],
          );
          res.status(204).end();
        } catch (err) {
          console.error('delete shortlist failed:', err);
          res.status(500).json({ error: 'Failed to delete shortlist item' });
        }
      });

      app.post('/api/notes', async (req, res) => {
        const parsed = NoteBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.message });
          return;
        }
        try {
          const result = await appkit.lakebase.query(
            `INSERT INTO app.facility_notes (facility_id, capability_tag, note_text, override_confidence)
             VALUES ($1, $2, $3, $4)
             RETURNING id, facility_id, capability_tag, note_text, override_confidence, created_at`,
            [
              parsed.data.facility_id,
              parsed.data.capability_tag,
              parsed.data.note_text,
              parsed.data.override_confidence,
            ],
          );
          res.status(201).json(result.rows[0]);
        } catch (err) {
          console.error('create note failed:', err);
          res.status(500).json({ error: 'Failed to create note' });
        }
      });

      app.get('/api/facilities/:id/notes', async (req, res) => {
        try {
          const result = await appkit.lakebase.query(
            `SELECT id, facility_id, capability_tag, note_text, override_confidence, created_at
             FROM app.facility_notes
             WHERE facility_id = $1
             ORDER BY created_at DESC`,
            [req.params.id],
          );
          res.json(result.rows);
        } catch (err) {
          console.error('list notes failed:', err);
          res.status(500).json({ error: 'Failed to list notes' });
        }
      });
    });
  },
}).catch((err) => {
  console.error('AppKit failed to start:', err);
  process.exit(1);
});
