# Deploy

Disha runs as a Databricks App. The live URL is bound permanently to the app resource named `hackathon-2026` in `databricks.yml` — every deploy updates that same app in place.

**Live URL**: <https://hackathon-2026-7474659729690555.aws.databricksapps.com/>

## Prerequisites

- Databricks CLI ≥ 0.294.0 (`databricks --version`)
- Authenticated profile with permission on the workspace (`databricks auth profiles`)
- Workspace: `dbc-ab2a31f3-2714.cloud.databricks.com`
- The Lakebase project `hackathon-2026` and SQL warehouse `e47ed76813f7ffa0` already exist (one-time setup)

The default profile target is configured in `databricks.yml`. Substitute `--profile <YOURS>` if you use a different profile name.

## Standard deploy (after a PR merges)

```bash
git checkout master && git pull

databricks bundle validate --profile DEFAULT
databricks bundle deploy   --profile DEFAULT

# bundle deploy uploads source but does NOT trigger an app rebuild —
# explicitly redeploy the app from the uploaded source path:
databricks apps deploy hackathon-2026 \
  --source-code-path /Workspace/Users/$(whoami)@sap.com/.bundle/hackathon-2026/default/files/src \
  --profile DEFAULT

databricks apps logs hackathon-2026 --follow --profile DEFAULT
```

The two-step is intentional: `bundle deploy` is "upload artifacts + register resource definitions"; `apps deploy` is "rebuild and restart the app from those artifacts." If you skip the second step, the app keeps serving the previous deployment's source.

What `bundle deploy` does:

1. Uploads `./src/` (the `source_code_path` from `databricks.yml`) to `/Workspace/Users/<you>/.bundle/hackathon-2026/default/files/src`.
2. Reconciles the `hackathon-2026` app resource — including the `postgres` and `sql-warehouse` resource grants on the app's service principal.

What `apps deploy` does:

1. Tells the app platform to rebuild from the uploaded source path.
2. Build runs `npm install` → `npm run postinstall` (which runs `appkit generate-types` and calls `DESCRIBE QUERY` against the warehouse) → `npm run build` (tsdown server + Vite client bundle).
3. Once the build succeeds, app starts via `npm run start` from `src/app.yaml`.
4. AppKit auto-injects runtime env vars from the resource refs:
   - `LAKEBASE_ENDPOINT` (from `valueFrom: postgres`)
   - `DATABRICKS_WAREHOUSE_ID` (from `valueFrom: sql-warehouse`)
   - `PGHOST`, `PGDATABASE`, `PGPORT`, `PGSSLMODE` (auto-injected by the platform)

## One-time service-principal grants (catalog access)

The app's service principal needs read access to the Delta Sharing catalog *outside* of what `databricks.yml` can express — `databricks.yml` resource permissions cover the warehouse and Lakebase, but not external catalogs the SQL queries reference.

Find the SP client ID:

```bash
databricks apps get hackathon-2026 --profile DEFAULT -o json \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['service_principal_client_id'])"
```

Then grant against the source catalog (substitute the SP UUID from above):

```sql
GRANT USE CATALOG  ON CATALOG databricks_virtue_foundation_dataset_dais_2026                                      TO `<SP_CLIENT_ID>`;
GRANT USE SCHEMA   ON SCHEMA  databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset            TO `<SP_CLIENT_ID>`;
GRANT SELECT       ON TABLE   databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities TO `<SP_CLIENT_ID>`;
```

Run via `databricks experimental aitools tools query "<SQL>" --profile DEFAULT`.

Symptom if missing: `databricks apps deploy` fails with `INSUFFICIENT_PERMISSIONS … User does not have USE CATALOG on Catalog 'databricks_virtue_foundation_dataset_dais_2026'` during `npm run typegen` in the build phase.

## Verify after deploy

```bash
# state should be RUNNING
databricks apps get hackathon-2026 --profile DEFAULT -o json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['app_status']['state'])"

# hit a Lakebase route to confirm DB connectivity inside the deployed env
curl -s https://hackathon-2026-7474659729690555.aws.databricksapps.com/api/scenarios | head -c 400
```

If `/api/scenarios` returns `[]` instead of the seeded scenarios, that means a fresh schema was provisioned for the app's service principal — see `src/server/server.ts` `initSchema()`. Curl from your browser if it requires auth.

## Local development

```bash
cd src
cp .env.example .env   # fill in DATABRICKS_HOST, PGHOST etc. from the workspace
npm install
npm run dev            # Vite HMR + Express on http://localhost:8000
```

`npm run dev` runs `appkit plugin sync` and `appkit generate-types` first; the SQL queries in `config/queries/` produce typed result rows under `shared/appkit-types/analytics.d.ts`.

## Common deploy failures

| Symptom | Cause / fix |
|---|---|
| `permission denied for schema app` | The app SP must own the `app` schema in Lakebase. If you ran the server locally first against the same Lakebase branch, your user owns the schema instead. Drop it (`databricks psql --project hackathon-2026 -- -c "DROP SCHEMA IF EXISTS app CASCADE;"`) and redeploy — the SP recreates and owns it on next start. **Warning: drops all scenario/shortlist data.** |
| `Statement failed: The operation was aborted` from `/api/analytics/query/...` | First request after warehouse cold-start can time out. Retry once. The serverless warehouse wakes in ~15s. |
| `INVALID_LIMIT_LIKE_EXPRESSION.DATA_TYPE` on a query | A `LIMIT` parameter was bound as `BIGINT`. Use `sql.int()` on the client and `-- @param row_limit INT` annotation in the `.sql` file. |
| `app_status.state: CRASHED` | Stream logs (`databricks apps logs hackathon-2026 --follow`) and look for the actual stack trace. Most often a missing env var the app expected (check `src/app.yaml` matches `databricks.yml` resource names). |

## What is *not* automated

GitHub Actions deploys are blocked on user-namespace repos in the SAP Enterprise GHE instance, so deploys are run manually from your local CLI. The `.github/workflows/` workflow file is left in place for reference if/when org policy changes.
