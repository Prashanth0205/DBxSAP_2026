# Disha — Medical Desert Planner
**DBxSAP Hackathon 2026**

Find India's real healthcare gaps — with AI-powered evidence and honest uncertainty.

## Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS + Leaflet maps
- **Backend**: Node.js + Express
- **Database**: Databricks Lakebase (Postgres) for user persistence
- **Data**: Databricks SQL + Delta Lake (10k facility records)
- **AI**: Claude claude-sonnet-4-6 for free-text capability extraction

## Setup

```bash
cp .env.example .env
# Fill in DATABRICKS_HOST, DATABRICKS_TOKEN, ANTHROPIC_API_KEY

npm install
npm run dev
```

## First-time data setup

1. Upload `facilities.csv` to your Databricks volume
2. Run `sql/create_tables.sql` in a SQL Warehouse
3. Run `preprocessing/claude_batch.py` as a Databricks Notebook Job (~45 min)
4. After job completes, re-run `CREATE OR REPLACE VIEW capability_coverage` from `sql/create_tables.sql`

## Team

| Role | Owner |
|------|-------|
| Data & Backend | Dev A |
| Maps & Visualization | Dev B |
| Frontend App | Dev C |
| AI & Persistence | Dev D |

See `TEAM_PLAN.md` for full build plan.
