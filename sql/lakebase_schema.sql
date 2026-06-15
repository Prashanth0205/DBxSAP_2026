-- Lakebase (Postgres) — run once on first server startup
-- Dev D wires these into the Lakebase plugin

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.planning_scenarios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  capability_filter TEXT NOT NULL,
  states_filter    TEXT[],
  min_confidence   FLOAT DEFAULT 0.5,
  notes            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.facility_shortlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id  UUID REFERENCES app.planning_scenarios(id) ON DELETE CASCADE,
  facility_id  TEXT NOT NULL,
  priority     INT DEFAULT 1,
  user_note    TEXT DEFAULT '',
  added_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.facility_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id         TEXT NOT NULL,
  capability_tag      TEXT NOT NULL,
  note_text           TEXT NOT NULL,
  override_confidence FLOAT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed demo scenarios for the judge presentation
INSERT INTO app.planning_scenarios (name, capability_filter, states_filter, min_confidence, notes)
VALUES
  ('Dialysis Gaps — Uttar Pradesh',  'dialysis',   ARRAY['Uttar Pradesh'],  0.5, 'High population, low coverage'),
  ('Cardiology Gaps — Bihar',        'cardiology', ARRAY['Bihar'],           0.5, 'Rural northeast focus'),
  ('Oncology Gaps — Rajasthan',      'oncology',   ARRAY['Rajasthan'],       0.6, 'Desert belt coverage check')
ON CONFLICT DO NOTHING;
