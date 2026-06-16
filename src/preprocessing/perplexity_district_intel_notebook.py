# Databricks notebook source
# MAGIC %md
# MAGIC # Disha — Perplexity District Intel (full batch, in-cluster)
# MAGIC
# MAGIC Pre-computes per-district web findings via SAP AI Core sonar-pro for every
# MAGIC `(state, district, capability)` triple. Persists to
# MAGIC `workspace.default.district_web_intel`. Idempotent — re-running picks up
# MAGIC where it left off.
# MAGIC
# MAGIC Runtime: ~2-3h with 6 workers across ~755 districts × 7 capabilities.
# MAGIC
# MAGIC ## One-time setup
# MAGIC ```bash
# MAGIC databricks secrets create-scope disha
# MAGIC databricks secrets put-secret disha aicore_auth_url
# MAGIC databricks secrets put-secret disha aicore_client_id
# MAGIC databricks secrets put-secret disha aicore_client_secret
# MAGIC databricks secrets put-secret disha aicore_base_url
# MAGIC databricks secrets put-secret disha aicore_resource_group
# MAGIC databricks secrets put-secret disha aicore_sonar_pro_deployment_url
# MAGIC ```
# MAGIC
# MAGIC Then upload this notebook via the UI or:
# MAGIC ```bash
# MAGIC databricks workspace import \
# MAGIC   --file src/preprocessing/perplexity_district_intel_notebook.py \
# MAGIC   --language PYTHON \
# MAGIC   /Workspace/Users/<your-email>/perplexity_district_intel
# MAGIC ```
# MAGIC
# MAGIC Run it interactively or schedule as a Job — it doesn't need a GPU, just
# MAGIC outbound HTTPS to AI Core + write access to `workspace.default`.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Config + secrets

# COMMAND ----------

import json
import logging
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("perplexity_intel_nb")

INTEL_TABLE = "workspace.default.district_web_intel"
PINCODE_TABLE = "databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory"

CAPABILITIES = ["icu", "maternity", "emergency", "dialysis", "oncology", "trauma", "nicu"]

API_VERSION = "2025-03-01-preview"
RETRY_MAX_ATTEMPTS = 5
RETRY_BASE_DELAY = 2.0
WORKERS = 6

AICORE_AUTH_URL = dbutils.secrets.get(scope="disha", key="aicore_auth_url")  # noqa: F821
AICORE_CLIENT_ID = dbutils.secrets.get(scope="disha", key="aicore_client_id")  # noqa: F821
AICORE_CLIENT_SECRET = dbutils.secrets.get(scope="disha", key="aicore_client_secret")  # noqa: F821
AICORE_BASE_URL = dbutils.secrets.get(scope="disha", key="aicore_base_url")  # noqa: F821
AICORE_RESOURCE_GROUP = dbutils.secrets.get(scope="disha", key="aicore_resource_group")  # noqa: F821
AICORE_SONAR_PRO_DEPLOYMENT_URL = dbutils.secrets.get(scope="disha", key="aicore_sonar_pro_deployment_url")  # noqa: F821
SONAR_DEPLOYMENT_ID = AICORE_SONAR_PRO_DEPLOYMENT_URL.rstrip("/").rsplit("/", 1)[-1]

# COMMAND ----------

# MAGIC %md
# MAGIC ## AI Core auth + sonar-pro client (inlined from src/server/lib/sonar_client.py)

# COMMAND ----------

@dataclass
class _TokenCache:
    token: str | None = None
    expires_at: float = 0.0


_TOKEN_CACHE = _TokenCache()
_TOKEN_LOCK = threading.Lock()


def _aicore_token() -> str:
    with _TOKEN_LOCK:
        if _TOKEN_CACHE.token and _TOKEN_CACHE.expires_at - 10 > time.time():
            return _TOKEN_CACHE.token
        resp = requests.post(
            f"{AICORE_AUTH_URL.rstrip('/')}/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "client_credentials",
                "client_id": AICORE_CLIENT_ID,
                "client_secret": AICORE_CLIENT_SECRET,
            },
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        _TOKEN_CACHE.token = body["access_token"]
        _TOKEN_CACHE.expires_at = time.time() + float(body["expires_in"])
        return _TOKEN_CACHE.token


def _is_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, requests.HTTPError):
        resp = exc.response
        if resp is not None and resp.status_code == 429:
            return True
    return False


def chat_sonar(system: str, user: str, *, temperature: float = 0.2,
               max_tokens: int = 600) -> tuple[str, list[str]]:
    url = (
        f"{AICORE_BASE_URL.rstrip('/')}/inference/deployments/{SONAR_DEPLOYMENT_ID}"
        f"/chat/completions?api-version={API_VERSION}"
    )
    body = {
        "model": "sonar-pro",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    last_exc: BaseException | None = None
    for attempt in range(RETRY_MAX_ATTEMPTS):
        try:
            resp = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {_aicore_token()}",
                    "AI-Resource-Group": AICORE_RESOURCE_GROUP,
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=120,
            )
            resp.raise_for_status()
            payload = resp.json()
            choice = (payload.get("choices") or [{}])[0]
            text = (choice.get("message") or {}).get("content") or ""
            citations = payload.get("citations") or []
            return text, list(citations)
        except Exception as exc:
            if not _is_rate_limit(exc) or attempt == RETRY_MAX_ATTEMPTS - 1:
                raise
            last_exc = exc
            time.sleep(RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 1))
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("unreachable")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Prompts + table DDL

# COMMAND ----------

SONAR_SYSTEM_PROMPT = (
    "You are a healthcare research assistant for India. "
    "Given a district + capability, return concrete, citable evidence about "
    "that capability's availability: existing facilities (with names + dates "
    "where possible), known gaps, recent government schemes, news of new "
    "construction or closures, NGO/private initiatives. "
    "Prefer government registries (NHA, NABH, HMIS, Ayushman Bharat), state "
    "health department releases, and reputable Indian news outlets. "
    "Respond in 4-6 sentences. Be specific about numbers, names, and years. "
    "If no signal, say so explicitly."
)


def build_user_prompt(state_canon: str, district_canon: str, capability: str) -> str:
    return (
        f"Capability: {capability}\n"
        f"District: {district_canon.title()}\n"
        f"State: {state_canon.title()}, India\n\n"
        f"What is the current availability of {capability} healthcare services in "
        f"{district_canon.title()} district of {state_canon.title()}? "
        f"Cite specific facilities, recent news, government schemes, or NGO efforts."
    )


spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {INTEL_TABLE} (
      state_canon     STRING NOT NULL,
      district_canon  STRING NOT NULL,
      capability      STRING NOT NULL,
      search_text     STRING,
      citations_json  STRING,
      fetched_at      TIMESTAMP
    )
    USING DELTA
""")
LOGGER.info(f"intel table ready: {INTEL_TABLE}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build worklist (already-cached rows are skipped)

# COMMAND ----------

districts_df = spark.sql(f"""
    SELECT DISTINCT
      REGEXP_REPLACE(UPPER(TRIM(statename)), '\\\\s+', ' ') AS state_canon,
      REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))), '\\\\s+', ' ') AS district_canon
    FROM {PINCODE_TABLE}
    WHERE district IS NOT NULL AND statename IS NOT NULL
    ORDER BY state_canon, district_canon
""")
districts = [(r["state_canon"], r["district_canon"]) for r in districts_df.collect()]
LOGGER.info(f"resolved {len(districts)} unique (state, district) tuples")

existing_df = spark.sql(f"SELECT state_canon, district_canon, capability FROM {INTEL_TABLE}")
existing = {(r["state_canon"], r["district_canon"], r["capability"]) for r in existing_df.collect()}
LOGGER.info(f"already cached: {len(existing)} rows")

work: list[tuple[str, str, str]] = []
for capability in CAPABILITIES:
    for state_canon, district_canon in districts:
        if (state_canon, district_canon, capability) in existing:
            continue
        work.append((state_canon, district_canon, capability))

LOGGER.info(f"queued {len(work)} tasks ({len(CAPABILITIES)} caps × {len(districts)} districts - cached)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Worker + parallel run
# MAGIC
# MAGIC Each worker calls Perplexity, then INSERTs a single row. Delta supports
# MAGIC concurrent appenders; a write lock would only matter if we batched.
# MAGIC `dbutils` is not thread-safe, so all secret reads happen at module scope.

# COMMAND ----------

INSERT_LOCK = threading.Lock()


def insert_row(state_canon: str, district_canon: str, capability: str,
               text: str, citations: list[str]) -> None:
    citations_json = json.dumps(citations).replace("'", "''")
    text_escaped = (text or "").replace("'", "''")
    sc = state_canon.replace("'", "''")
    dc = district_canon.replace("'", "''")
    cp = capability.replace("'", "''")
    with INSERT_LOCK:
        spark.sql(f"""
            INSERT INTO {INTEL_TABLE}
              (state_canon, district_canon, capability, search_text, citations_json, fetched_at)
            VALUES ('{sc}', '{dc}', '{cp}', '{text_escaped}', '{citations_json}', CURRENT_TIMESTAMP())
        """)


def fetch_one(state_canon: str, district_canon: str, capability: str) -> tuple[str, str, str, str | None, int, float]:
    user_prompt = build_user_prompt(state_canon, district_canon, capability)
    t0 = time.time()
    try:
        text, citations = chat_sonar(SONAR_SYSTEM_PROMPT, user_prompt)
        insert_row(state_canon, district_canon, capability, text, citations)
        return state_canon, district_canon, capability, None, len(text), time.time() - t0
    except Exception as e:
        return state_canon, district_canon, capability, str(e), 0, time.time() - t0


# COMMAND ----------

total = len(work)
done = 0
failed = 0
counter_lock = threading.Lock()
t_start = time.time()

with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futures = [ex.submit(fetch_one, s, d, c) for s, d, c in work]
    for fut in as_completed(futures):
        state_canon, district_canon, capability, err, n_chars, dt = fut.result()
        with counter_lock:
            done += 1
            idx = done
        if err is None:
            print(f"[{idx}/{total}] {state_canon} | {district_canon} | {capability} -> {n_chars}c, {dt:.1f}s")
        else:
            with counter_lock:
                failed += 1
            print(f"[{idx}/{total}] FAIL {state_canon} | {district_canon} | {capability}: {err}")

elapsed = time.time() - t_start
print(f"DONE: {total} processed, {failed} failed, {elapsed/60:.1f} min wall time")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sanity check

# COMMAND ----------

display(spark.sql(f"""
    SELECT capability,
           COUNT(*) AS rows,
           COUNT(DISTINCT state_canon) AS states,
           COUNT(DISTINCT district_canon) AS districts,
           AVG(LENGTH(search_text)) AS avg_text_len
    FROM {INTEL_TABLE}
    GROUP BY capability
    ORDER BY capability
"""))
