"""
Read-only access to the Delta Sharing source tables via the SQL warehouse.

Runtime:
  - Deployed: WorkspaceClient() picks up DATABRICKS_CLIENT_ID/SECRET injected by
    the Databricks Apps platform. DATABRICKS_WAREHOUSE_ID is injected via the
    sql-warehouse resource in app.yaml.
  - Local:    WorkspaceClient(profile=DATABRICKS_PROFILE) reads ~/.databrickscfg.
              Set DATABRICKS_WAREHOUSE_ID via .env for local runs.

Tables this module is meant to read (qualified names):
  databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
  databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
  databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
"""
import os
import csv
import logging
from typing import Optional
from pathlib import Path

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementParameterListItem, StatementState

LOGGER = logging.getLogger(__name__)

_WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID")
_PROFILE = (
    os.environ.get("DATABRICKS_PROFILE")
    or os.environ.get("DATABRICKS_CONFIG_PROFILE")
    or "DEFAULT"
)

# Source catalog/schema for the hackathon dataset
SOURCE_CATALOG = "databricks_virtue_foundation_dataset_dais_2026"
SOURCE_SCHEMA = "virtue_foundation_dataset"
TBL_FACILITIES = f"{SOURCE_CATALOG}.{SOURCE_SCHEMA}.facilities"
TBL_PINCODE = f"{SOURCE_CATALOG}.{SOURCE_SCHEMA}.india_post_pincode_directory"
TBL_NFHS5 = f"{SOURCE_CATALOG}.{SOURCE_SCHEMA}.nfhs_5_district_health_indicators"

# ─────────────────────────────────────────────
# Alias resolution helpers
#
# NFHS-5 has spelling/format divergences from the pincode directory. The CSVs
# under /eda translate (NFHS state, NFHS district) → canonical (state_norm,
# district_norm) keys. We embed them as inline SQL VALUES so coverage/region
# queries can left-join them onto a normalized NFHS CTE.
# ─────────────────────────────────────────────

# Alias CSVs are co-located with the server module so they ship inside the
# Databricks Apps bundle (which only includes /src). The /eda copies under the
# repo root remain the source-of-truth for offline analysis; they are mirrored
# here on commit.
_DATA_DIR = Path(__file__).resolve().parent / "data"


def _sql_str(s: str) -> str:
    return "'" + (s or "").replace("'", "''") + "'"


def _load_state_aliases() -> list[tuple[str, str]]:
    """Returns (nfhs_state_norm_uppercase, canonical_state_norm) tuples."""
    p = _DATA_DIR / "state_aliases.csv"
    if not p.exists():
        return []
    out = []
    with p.open() as f:
        for row in csv.DictReader(f):
            out.append((row["nfhs_state_norm"], row["canonical_state_norm"]))
    return out


def _normalize_alias_key(s: str) -> str:
    """Replicate the SQL normalization in Python for the alias key column."""
    s = (s or "").replace("&", "AND").replace("-", " ").upper().strip()
    return " ".join(s.split())


def normalize_state(s: str) -> str:
    """Normalize a user-entered state to the canonical form (matches pincode dir)."""
    return _normalize_alias_key(s).replace("-", " ")


def normalize_district(s: str) -> str:
    """Normalize a user-entered district to the canonical form."""
    return _normalize_alias_key(s)


def _load_district_aliases() -> list[tuple[str, str, str, str]]:
    """Returns (nfhs_state_norm, nfhs_district_norm, canonical_state_norm, canonical_district_norm)."""
    out: list[tuple[str, str, str, str]] = []
    for fname in ("district_aliases_auto.csv", "district_aliases_manual.csv"):
        p = _DATA_DIR / fname
        if not p.exists():
            continue
        with p.open() as f:
            for row in csv.DictReader(f):
                state_norm = _normalize_alias_key(row["nfhs_state_raw"])
                district_norm = _normalize_alias_key(row["nfhs_district_raw"])
                out.append((
                    state_norm,
                    district_norm,
                    row["canonical_state_norm"],
                    row["canonical_district_norm"],
                ))
    return out


def alias_ctes() -> str:
    """
    Returns SQL CTE definitions: nfhs_norm, state_alias, district_alias, nfhs_canon.

    Use as: ``WITH {alias_ctes()} ... SELECT ...``  (no leading WITH).
    Final CTE `nfhs_canon` exposes (state_canon, district_canon) plus all original NFHS columns.
    """
    state_rows = _load_state_aliases()
    district_rows = _load_district_aliases()

    state_values = ",\n      ".join(
        f"({_sql_str(s)}, {_sql_str(c)})" for s, c in state_rows
    ) or "(NULL, NULL)"
    district_values = ",\n      ".join(
        f"({_sql_str(s)}, {_sql_str(d)}, {_sql_str(cs)}, {_sql_str(cd)})"
        for s, d, cs, cd in district_rows
    ) or "(NULL, NULL, NULL, NULL)"

    return f"""
nfhs_norm AS (
  SELECT
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(state_ut, '&', 'AND'))), '\\\\s+', ' ') AS state_norm_raw,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(REPLACE(district_name, '&', 'AND'), '-', ' '))), '\\\\s+', ' ') AS district_norm_raw,
    *
  FROM {TBL_NFHS5}
),
state_alias(nfhs_state_norm, canonical_state_norm) AS (
  VALUES
      {state_values}
),
district_alias(nfhs_state_norm, nfhs_district_norm, canonical_state_norm, canonical_district_norm) AS (
  VALUES
      {district_values}
),
nfhs_canon AS (
  SELECT
    COALESCE(da.canonical_state_norm, sa.canonical_state_norm, n.state_norm_raw) AS state_canon,
    COALESCE(da.canonical_district_norm, n.district_norm_raw) AS district_canon,
    n.*
  FROM nfhs_norm n
  LEFT JOIN state_alias sa
    ON n.state_norm_raw = sa.nfhs_state_norm
  LEFT JOIN district_alias da
    ON n.state_norm_raw = da.nfhs_state_norm
   AND n.district_norm_raw = da.nfhs_district_norm
),
pin_norm AS (
  SELECT DISTINCT
    REGEXP_REPLACE(UPPER(TRIM(statename)), '\\\\s+', ' ') AS state_canon,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))), '\\\\s+', ' ') AS district_canon,
    pincode
  FROM {TBL_PINCODE}
)
""".strip()

_client: Optional[WorkspaceClient] = None


def _is_deployed() -> bool:
    return bool(os.getenv("DATABRICKS_CLIENT_ID"))


def _get_client() -> WorkspaceClient:
    global _client
    if _client is None:
        _client = WorkspaceClient() if _is_deployed() else WorkspaceClient(profile=_PROFILE)
        LOGGER.info(f"warehouse | client ready (deployed={_is_deployed()})")
    return _client


_INT_TYPES = {"INT", "BIGINT", "LONG", "SMALLINT", "SHORT", "TINYINT", "BYTE"}
_FLOAT_TYPES = {"FLOAT", "DOUBLE", "DECIMAL"}
_BOOL_TYPES = {"BOOLEAN"}


def _coerce(val, type_name):
    if val is None:
        return None
    if hasattr(type_name, "value"):
        t = str(type_name.value).upper()
    else:
        t = str(type_name or "").upper()
    if t in _INT_TYPES:
        try:
            return int(val)
        except (TypeError, ValueError):
            return None
    if t in _FLOAT_TYPES:
        try:
            return float(val)
        except (TypeError, ValueError):
            return None
    if t in _BOOL_TYPES:
        if isinstance(val, bool):
            return val
        return str(val).lower() == "true"
    return val


def wh_query(sql: str, params: Optional[list] = None) -> list[dict]:
    """
    Execute a Spark SQL SELECT against the configured warehouse and return rows as dicts.

    Numeric (INT/BIGINT/FLOAT/DOUBLE/DECIMAL) and BOOLEAN columns are coerced from
    the SDK's string serialization to native Python types. Strings stay as-is.

    Param style is positional: pass `params` as a list, reference them in `sql` as `:p1, :p2, ...`.
    """
    if not _WAREHOUSE_ID:
        raise RuntimeError("DATABRICKS_WAREHOUSE_ID is not set")

    w = _get_client()
    parameters: Optional[list[StatementParameterListItem]] = None
    if params:
        parameters = [
            StatementParameterListItem(name=f"p{i + 1}", value=("" if v is None else str(v)))
            for i, v in enumerate(params)
        ]

    resp = w.statement_execution.execute_statement(
        warehouse_id=_WAREHOUSE_ID,
        statement=sql,
        parameters=parameters,
        wait_timeout="30s",
    )

    state = resp.status.state if resp.status else None
    if state != StatementState.SUCCEEDED:
        msg = resp.status.error.message if (resp.status and resp.status.error) else str(state)
        raise RuntimeError(f"warehouse query failed: {msg}")

    schema_cols = resp.manifest.schema.columns if resp.manifest and resp.manifest.schema else []
    col_specs = [(c.name, getattr(c, "type_name", None) or getattr(c, "type_text", "")) for c in schema_cols]

    if not resp.result or not resp.result.data_array:
        return []
    return [
        {name: _coerce(val, type_name) for (name, type_name), val in zip(col_specs, row)}
        for row in resp.result.data_array
    ]
