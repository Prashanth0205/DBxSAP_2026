"""
Pre-compute Perplexity sonar-pro web findings for every (state, district,
capability) triple, persist to workspace.default.district_web_intel.

The serving agent (server.agent.run_batch_assessment) reads this table at
request time instead of running a live web search. Pre-computing is what makes
the map → click → verdict flow feel instant.

Usage:
    # smoke run — one capability × one state
    python -m src.preprocessing.perplexity_district_intel \\
        --state Bihar --capability maternity

    # full run — all 7 capabilities × all districts (~5k calls)
    python -m src.preprocessing.perplexity_district_intel --all

Env: source ~/credentials/apex-dev.env (AICORE_*) + ensure
DATABRICKS_WAREHOUSE_ID is set so warehouse writes resolve. Local runs use
the DATABRICKS_PROFILE in ~/.databrickscfg.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from typing import Iterable

# `server` lives at src/server. When run as `python -m src.preprocessing...`
# from repo root, prepend src/ so `from server...` resolves.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from server.lib.sonar_client import chat_sonar  # noqa: E402
from server.warehouse import wh_query, normalize_state  # noqa: E402

LOGGER = logging.getLogger("perplexity_intel")

INTEL_TABLE = "workspace.default.district_web_intel"

CAPABILITIES = [
    "icu", "maternity", "emergency", "dialysis",
    "oncology", "trauma", "nicu",
]

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


def _ensure_table() -> None:
    wh_query(f"""
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


def _existing_keys(state: str | None, capability: str | None) -> set[tuple[str, str, str]]:
    where = []
    params: list = []
    if state:
        where.append("state_canon = :p1")
        params.append(normalize_state(state))
    if capability:
        idx = len(params) + 1
        where.append(f"capability = :p{idx}")
        params.append(capability)
    sql = f"SELECT state_canon, district_canon, capability FROM {INTEL_TABLE}"
    if where:
        sql += " WHERE " + " AND ".join(where)
    rows = wh_query(sql, params or None)
    return {(r["state_canon"], r["district_canon"], r["capability"]) for r in rows}


def _districts_for_state(state: str | None) -> list[tuple[str, str]]:
    """Return distinct (state_canon, district_canon) tuples from pincode dir."""
    if state:
        sql = """
            SELECT DISTINCT
              REGEXP_REPLACE(UPPER(TRIM(statename)), '\\\\s+', ' ') AS state_canon,
              REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))), '\\\\s+', ' ') AS district_canon
            FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
            WHERE district IS NOT NULL
              AND REGEXP_REPLACE(UPPER(TRIM(statename)), '\\\\s+', ' ') = :p1
            ORDER BY district_canon
        """
        rows = wh_query(sql, [normalize_state(state)])
    else:
        sql = """
            SELECT DISTINCT
              REGEXP_REPLACE(UPPER(TRIM(statename)), '\\\\s+', ' ') AS state_canon,
              REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))), '\\\\s+', ' ') AS district_canon
            FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
            WHERE district IS NOT NULL AND statename IS NOT NULL
            ORDER BY state_canon, district_canon
        """
        rows = wh_query(sql)
    return [(r["state_canon"], r["district_canon"]) for r in rows if r["state_canon"] and r["district_canon"]]


def _build_user_prompt(state_canon: str, district_canon: str, capability: str) -> str:
    return (
        f"Capability: {capability}\n"
        f"District: {district_canon.title()}\n"
        f"State: {state_canon.title()}, India\n\n"
        f"What is the current availability of {capability} healthcare services in "
        f"{district_canon.title()} district of {state_canon.title()}? "
        f"Cite specific facilities, recent news, government schemes, or NGO efforts."
    )


def _insert(state_canon: str, district_canon: str, capability: str,
            text: str, citations: list[str]) -> None:
    citations_json = json.dumps(citations)
    wh_query(
        f"""
        INSERT INTO {INTEL_TABLE}
          (state_canon, district_canon, capability, search_text, citations_json, fetched_at)
        VALUES (:p1, :p2, :p3, :p4, :p5, CURRENT_TIMESTAMP())
        """,
        [state_canon, district_canon, capability, text, citations_json],
    )


def run(state: str | None, capabilities: Iterable[str], skip_existing: bool = True) -> None:
    _ensure_table()
    districts = _districts_for_state(state)
    LOGGER.info(f"resolved {len(districts)} districts (state filter: {state or 'ALL'})")

    caps = list(capabilities)
    LOGGER.info(f"capabilities: {caps}")

    existing = _existing_keys(state, caps[0] if len(caps) == 1 else None) if skip_existing else set()
    LOGGER.info(f"already-fetched rows: {len(existing)}")

    total = len(districts) * len(caps)
    done = 0
    skipped = 0
    failed = 0

    for capability in caps:
        for state_canon, district_canon in districts:
            done += 1
            key = (state_canon, district_canon, capability)
            if key in existing:
                skipped += 1
                continue

            user_prompt = _build_user_prompt(state_canon, district_canon, capability)
            try:
                t0 = time.time()
                text, citations, _ = chat_sonar(
                    SONAR_SYSTEM_PROMPT,
                    user_prompt,
                    temperature=0.2,
                    max_tokens=600,
                )
                dt = time.time() - t0
                _insert(state_canon, district_canon, capability, text, citations)
                LOGGER.info(
                    f"[{done}/{total}] {state_canon} | {district_canon} | "
                    f"{capability} → {len(text)}c, {len(citations)} cites, {dt:.1f}s"
                )
            except Exception as e:
                failed += 1
                LOGGER.error(
                    f"[{done}/{total}] FAIL {state_canon} | {district_canon} | "
                    f"{capability}: {e}"
                )

    LOGGER.info(f"done: {done} processed, {skipped} skipped (already cached), {failed} failed")


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--state", help="Single state name (e.g. Bihar). Omit with --all for full run.")
    p.add_argument("--capability", help=f"One of: {', '.join(CAPABILITIES)}")
    p.add_argument("--all", action="store_true", help="All states × all capabilities.")
    p.add_argument("--no-skip", action="store_true",
                   help="Re-fetch even rows that already exist.")
    args = p.parse_args()

    if args.all:
        state = None
        caps = CAPABILITIES
    else:
        if not args.state or not args.capability:
            p.error("Provide --state and --capability for a scoped run, or --all for everything.")
        if args.capability not in CAPABILITIES:
            p.error(f"--capability must be one of {CAPABILITIES}")
        state = args.state
        caps = [args.capability]

    run(state=state, capabilities=caps, skip_existing=not args.no_skip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
