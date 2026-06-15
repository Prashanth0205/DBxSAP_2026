import os
import time
import logging
import psycopg2
import subprocess
import json
from datetime import datetime

LOGGER = logging.getLogger(__name__)

_conn = None
_token_expiry = 0.0

# Deployed Databricks App platform injects:
#   LAKEBASE_ENDPOINT       — resource path (from databricks.yml `valueFrom: postgres`)
#   PGHOST / PGDATABASE / PGPORT / PGSSLMODE
#   DATABRICKS_CLIENT_ID    — service principal (used as Postgres user when deployed)
# Local dev falls back to the Databricks CLI + a user profile.
_LAKEBASE_ENDPOINT = os.getenv(
    "LAKEBASE_ENDPOINT",
    "projects/hackathon-2026/branches/production/endpoints/primary",
)
_LOCAL_PROFILE = os.getenv("DATABRICKS_PROFILE", "DEFAULT")


def _is_deployed() -> bool:
    return bool(os.getenv("DATABRICKS_CLIENT_ID"))


def _fetch_token_via_cli() -> tuple[str, float]:
    """Local-dev path: shell out to Databricks CLI."""
    result = subprocess.run(
        [
            "databricks", "postgres", "generate-database-credential",
            _LAKEBASE_ENDPOINT,
            "--profile", _LOCAL_PROFILE,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    cred = json.loads(result.stdout)
    expiry = datetime.fromisoformat(cred["expire_time"].replace("Z", "+00:00")).timestamp()
    LOGGER.info(f"db | new Lakebase token via CLI, expires at {cred['expire_time']}")
    return cred["token"], expiry


def _fetch_token_via_sdk() -> tuple[str, float]:
    """Deployed-app path: use Databricks SDK with the SP credentials the platform injects.
    Lakebase Autoscaling API: postgres.generate_database_credential(endpoint=<path>)."""
    from databricks.sdk import WorkspaceClient
    w = WorkspaceClient()
    cred = w.postgres.generate_database_credential(endpoint=_LAKEBASE_ENDPOINT)
    expiry_dt = getattr(cred, "expire_time", None) or getattr(cred, "expiration_time", None)
    if isinstance(expiry_dt, str):
        expiry = datetime.fromisoformat(expiry_dt.replace("Z", "+00:00")).timestamp()
    elif expiry_dt is not None:
        expiry = expiry_dt.timestamp()
    else:
        expiry = time.time() + 3300
    LOGGER.info(f"db | new Lakebase token via SDK, expires at {expiry_dt}")
    return cred.token, expiry


def _fetch_token() -> tuple[str, float]:
    return _fetch_token_via_sdk() if _is_deployed() else _fetch_token_via_cli()


def _pg_user() -> str:
    return os.getenv("DATABRICKS_CLIENT_ID") or os.getenv("PGUSER") or _LOCAL_PROFILE


def get_conn():
    """Return a live psycopg2 connection, refreshing the token when < 60s from expiry."""
    global _conn, _token_expiry

    now = time.time()
    if _conn is None or now >= _token_expiry - 60:
        token, expiry = _fetch_token()
        _token_expiry = expiry

        if _conn is not None:
            try:
                _conn.close()
            except Exception:
                pass

        _conn = psycopg2.connect(
            host=os.environ["PGHOST"],
            port=int(os.environ.get("PGPORT", 5432)),
            dbname=os.environ.get("PGDATABASE", "databricks_postgres"),
            user=_pg_user(),
            password=token,
            sslmode=os.environ.get("PGSSLMODE", "require"),
            connect_timeout=15,
        )
        _conn.autocommit = True
        LOGGER.info("db | Lakebase connection established")

    return _conn


def query(sql: str, params=None) -> list[dict]:
    """Run a SELECT and return rows as a list of dicts."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def execute(sql: str, params=None) -> list[dict]:
    """Run an INSERT/UPDATE/DELETE with RETURNING and return rows as dicts."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        if cur.description:
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        return []


def setup_app_schema():
    """Create app schema and tables on startup if they don't exist."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("CREATE SCHEMA IF NOT EXISTS app")
        cur.execute("""
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
            )
        """)
        cur.execute("""
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
            )
        """)
    LOGGER.info("db | app schema and tables ready")
