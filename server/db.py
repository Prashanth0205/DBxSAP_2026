import os
import time
import logging
import psycopg2
import subprocess
import json

LOGGER = logging.getLogger(__name__)

_conn = None
_token_expiry = 0.0
_LAKEBASE_ENDPOINT = "projects/dais2026-health/branches/production/endpoints/primary"
_PROFILE = os.getenv("DATABRICKS_PROFILE", "prashanth.vidhya.ravi.kumar@sap.com")


def _fetch_token() -> tuple[str, float]:
    """Fetch a fresh Lakebase database credential via the Databricks CLI."""
    result = subprocess.run(
        [
            "databricks", "postgres", "generate-database-credential",
            _LAKEBASE_ENDPOINT,
            "--profile", _PROFILE,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    cred = json.loads(result.stdout)
    token = cred["token"]
    # expire_time is ISO8601 — convert to epoch for comparison
    from datetime import datetime, timezone
    expiry = datetime.fromisoformat(cred["expire_time"].replace("Z", "+00:00")).timestamp()
    LOGGER.info(f"db | new Lakebase token fetched, expires at {cred['expire_time']}")
    return token, expiry


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
            user=_PROFILE,
            password=token,
            sslmode="require",
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
