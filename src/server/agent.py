import asyncio
import json
import logging
import os
from typing import AsyncIterator, Optional

import httpx

from server.warehouse import (
    _get_client,
    wh_query,
    alias_ctes,
    normalize_state,
    normalize_district,
    TBL_FACILITIES,
    TBL_PINCODE,
    TBL_NFHS5,
)

LOGGER = logging.getLogger(__name__)

# Databricks Model Serving endpoint — use Claude if quota allows, else Llama 4 Maverick
LLM_ENDPOINT = os.getenv("DATABRICKS_LLM_ENDPOINT", "databricks-llama-4-maverick")

MAX_ITERATIONS = 10
_RETRY_DELAYS = [5, 10, 15]


# ─────────────────────────────────────────────
# LLM calls via direct HTTP to Databricks Model Serving
#
# Auth + host are taken from the SDK's WorkspaceClient — same pattern as
# warehouse.py. In a deployed Databricks App the platform injects
# DATABRICKS_CLIENT_ID/SECRET (M2M OAuth on the app's service principal);
# locally the SDK reads ~/.databrickscfg via the DATABRICKS_PROFILE env.
# ─────────────────────────────────────────────

def _auth_headers() -> dict:
    """Return Authorization headers honored by both deployed and local auth."""
    return _get_client().config.authenticate()


def _serving_url() -> str:
    return f"{_get_client().config.host}/serving-endpoints/{LLM_ENDPOINT}/invocations"


def _call_llm(
    messages: list[dict],
    tools: Optional[list[dict]] = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> dict:
    payload: dict = {"messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    if tools:
        payload["tools"] = tools
    url = _serving_url()
    headers = _auth_headers()
    headers["Content-Type"] = "application/json"
    resp = httpx.post(url, headers=headers, json=payload, timeout=60)
    # Token may be revoked server-side before the SDK's cached expiry — drop
    # the cached WorkspaceClient and retry once with a fresh one.
    if resp.status_code in (401, 403):
        LOGGER.warning(f"agent | LLM auth failed [{resp.status_code}], refreshing token and retrying")
        from server import warehouse as _wh
        _wh._client = None
        headers = _auth_headers()
        headers["Content-Type"] = "application/json"
        resp = httpx.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"LLM call failed [{resp.status_code}]: {resp.text[:300]}")
    return resp.json()


async def _call_llm_async(
    messages: list[dict],
    tools: Optional[list[dict]] = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: _call_llm(messages, tools, max_tokens, temperature)
    )


async def _call_with_retry(
    messages: list[dict],
    tools: Optional[list[dict]] = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> dict:
    for attempt, delay in enumerate(_RETRY_DELAYS + [None]):
        try:
            return await _call_llm_async(messages, tools, max_tokens, temperature)
        except Exception as e:
            if ("429" not in str(e) and "rate" not in str(e).lower()) or delay is None:
                raise
            LOGGER.warning(f"agent | rate limited, retrying in {delay}s (attempt {attempt + 1})")
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")


def _extract_content(response: dict) -> str:
    choices = response.get("choices", [])
    return choices[0].get("message", {}).get("content") or "" if choices else ""


def _extract_tool_calls(response: dict) -> list[dict]:
    choices = response.get("choices", [])
    return choices[0].get("message", {}).get("tool_calls") or [] if choices else []


def _stop_reason(response: dict) -> str:
    choices = response.get("choices", [])
    return choices[0].get("finish_reason", "stop") if choices else "stop"


# ─────────────────────────────────────────────
# Tool schemas (OpenAI function-calling format)
# ─────────────────────────────────────────────

QUERY_DATABASE_TOOL = {
    "type": "function",
    "function": {
        "name": "query_database",
        "description": (
            "Execute a read-only Spark SQL SELECT against the Databricks SQL warehouse. "
            "Available tables: "
            "databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities "
            "(unique_id, name, specialties, capability, description, organization_type, "
            "address_city, address_stateOrRegion, address_zipOrPostcode, latitude, longitude, "
            "numberDoctors, phone_numbers, source, yearEstablished, equipment, procedure), "
            "databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory "
            "(pincode, district, statename, officename), "
            "databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators "
            "(district_name, state_ut, institutional_birth_5y_pct, "
            "child_u5_who_are_stunted_height_for_age_18_pct, "
            "births_attended_by_skilled_hp_5y_10_pct, "
            "mothers_who_had_at_least_4_anc_visits_lb5y_pct, "
            "hh_electricity_pct, hh_improved_water_pct, "
            "hh_member_covered_health_insurance_pct, "
            "w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct, "
            "w15_plus_with_high_141_160_mg_dl_blood_sugar_pct, "
            "m15_plus_with_high_141_160_mg_dl_blood_sugar_pct, "
            "women_age_30_49_years_ever_undergone_a_cervical_screen_pct, "
            "women_age_30_49_years_ever_undergone_a_breast_exam_pct). "
            "Use Spark SQL syntax: LOWER(col) LIKE '%foo%' not ILIKE, CAST(x AS DOUBLE) not ::float. "
            "Only SELECT or WITH...SELECT allowed."
        ),
        "parameters": {
            "type": "object",
            "properties": {"sql": {"type": "string", "description": "A read-only Spark SQL SELECT statement."}},
            "required": ["sql"],
        },
    },
}

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for healthcare information about India. "
            "Use ONE broad state-level search covering the capability gap across all districts. "
            "Returns top results with title, url, and snippet."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Search query about healthcare in India."}},
            "required": ["query"],
        },
    },
}

ASSESSMENT_TOOLS = [QUERY_DATABASE_TOOL, WEB_SEARCH_TOOL]


# ─────────────────────────────────────────────
# Tool execution
# ─────────────────────────────────────────────

def _execute_tool(name: str, args: dict) -> str:
    if name == "query_database":
        sql = args.get("sql", "")
        s = sql.strip().upper()
        if not (s.startswith("SELECT") or s.startswith("WITH")):
            return json.dumps({"error": "Only SELECT or WITH … SELECT statements are allowed."})
        try:
            rows = wh_query(sql)
            return json.dumps(rows[:50])
        except Exception as e:
            LOGGER.error(f"agent | query_database failed: {e}")
            return json.dumps({"error": str(e)})

    if name == "web_search":
        query = args.get("query", "")

        # Tier 1 — Tavily (domain-filtered to gov health registries)
        tavily_key = os.getenv("TAVILY_API_KEY", "")
        if tavily_key:
            try:
                resp = httpx.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": tavily_key,
                        "query": query,
                        "search_depth": "basic",
                        "max_results": 5,
                        "include_domains": [
                            "nhp.gov.in", "nha.gov.in", "abdm.gov.in",
                            "mohfw.gov.in", "hmis.gov.in", "nabh.co",
                        ],
                    },
                    timeout=15,
                )
                resp.raise_for_status()
                results = resp.json().get("results", [])
                if results:
                    LOGGER.info(f"agent | Tavily returned {len(results)} results")
                    return json.dumps([
                        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:300]}
                        for r in results
                    ])
                LOGGER.warning("agent | Tavily returned 0 results, trying DuckDuckGo")
            except Exception as e:
                LOGGER.warning(f"agent | Tavily failed ({e}), trying DuckDuckGo")

        # Tier 2 — DuckDuckGo (free, no key required)
        try:
            from ddgs import DDGS
            results = list(DDGS().text(query, max_results=5))
            if results:
                LOGGER.info(f"agent | DuckDuckGo returned {len(results)} results")
                return json.dumps([
                    {"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")[:300]}
                    for r in results
                ])
            LOGGER.warning("agent | DuckDuckGo returned 0 results")
        except Exception as e:
            LOGGER.warning(f"agent | DuckDuckGo failed ({e}), using empty fallback")

        # Tier 3 — graceful empty result so the agent loop never crashes
        LOGGER.warning(f"agent | All web search providers failed for: {query!r}")
        return json.dumps([{
            "title": "No web search results available",
            "url": "",
            "snippet": (
                "Web search could not be completed. "
                "Assessment will rely on database evidence only. "
                f"Query attempted: {query}"
            ),
        }])

    return json.dumps({"error": f"Unknown tool: {name}"})


# ─────────────────────────────────────────────
# Option C: Hybrid Batch Assessment
# ─────────────────────────────────────────────

BATCH_SYSTEM_PROMPT = """You are a medical desert assessment orchestrator for India.

You will receive:
- A list of districts in a state with their facility counts and NFHS-5 health indicators
- Web search findings about the state's healthcare landscape for the capability

Your job is to assess EVERY district in one response and return a JSON array.

For each district, produce:
{
  "district": "district name",
  "verdict": "tier1_desert | tier2_suspect | data_hole | adequate",
  "verdict_label": "human-readable label",
  "confidence": "high | medium | low",
  "summary": "2 sentences max, cite specific numbers",
  "sources": [{"type": "database | web", "ref": "...", "detail": "..."}]
}

Verdict rules:
- tier1_desert:  0 matching facilities AND poor health outcomes AND high data confidence
- tier2_suspect: 0 or few facilities BUT low data confidence (may be a data gap not a real desert)
- data_hole:     insufficient data to determine — flag for investigation
- adequate:      sufficient facilities relative to apparent need

Output ONLY a valid JSON array — no markdown, no preamble, no trailing text."""


async def run_batch_assessment(
    state: str,
    capability: str,
    districts: list[dict],
) -> dict[str, dict]:
    if not districts:
        return {}

    LOGGER.info(f"batch | {len(districts)} districts in {state} [{capability}]")
    state_canon = normalize_state(state)

    # ── Step 1: DB — fetch NFHS-5 for all districts in one query ─────────────
    try:
        nfhs5_rows = wh_query(
            f"""
            WITH {alias_ctes()}
            SELECT
              district_canon,
              CAST(institutional_birth_5y_pct AS DOUBLE) AS institutional_birth_5y_pct,
              CAST(births_attended_by_skilled_hp_5y_10_pct AS DOUBLE) AS births_attended_by_skilled_hp_5y_10_pct,
              CAST(mothers_who_had_at_least_4_anc_visits_lb5y_pct AS DOUBLE) AS mothers_who_had_at_least_4_anc_visits_lb5y_pct,
              CAST(child_u5_who_are_stunted_height_for_age_18_pct AS DOUBLE) AS child_u5_who_are_stunted_height_for_age_18_pct,
              CAST(hh_electricity_pct AS DOUBLE) AS hh_electricity_pct,
              CAST(hh_improved_water_pct AS DOUBLE) AS hh_improved_water_pct,
              CAST(hh_member_covered_health_insurance_pct AS DOUBLE) AS hh_member_covered_health_insurance_pct,
              CAST(w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct AS DOUBLE) AS w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct,
              CAST(w15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct AS DOUBLE) AS w15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
              CAST(m15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct AS DOUBLE) AS m15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
              CAST(women_age_30_49_years_ever_undergone_a_cervical_screen_pct AS DOUBLE) AS women_age_30_49_years_ever_undergone_a_cervical_screen_pct,
              CAST(women_age_30_49_years_ever_undergone_a_breast_exam_pct AS DOUBLE) AS women_age_30_49_years_ever_undergone_a_breast_exam_pct
            FROM nfhs_canon
            WHERE state_canon = :p1
            """,
            [state_canon],
        )
        nfhs5_by_district = {r["district_canon"].upper(): r for r in nfhs5_rows}
        LOGGER.info(f"batch | DB returned {len(nfhs5_rows)} NFHS-5 rows for {state_canon}")
    except Exception as e:
        LOGGER.warning(f"batch | DB NFHS-5 query failed: {e}")
        nfhs5_by_district = {}

    # ── Step 2: Web — ONE search for the whole state ──────────────────────────
    web_query_str = f"{capability} hospital shortage desert {state} India NHA HMIS registry 2024"
    web_results_str = _execute_tool("web_search", {"query": web_query_str})
    try:
        web_results = json.loads(web_results_str)
    except Exception:
        web_results = []
    LOGGER.info(f"batch | web search returned {len(web_results)} results")

    # ── Step 3: Orchestrator LLM — all districts in one prompt ───────────────
    district_context = []
    for d in districts:
        name = d["district"]
        # Use the same normalization as the NFHS-5 dict keys (district_canon)
        nfhs5 = nfhs5_by_district.get(normalize_district(name), {})
        district_context.append({
            "district": name,
            "state": d.get("state", state),
            "total_facilities": d.get("total_facilities", 0),
            "matching_facilities": d.get("matching_facilities", 0),
            "gap_score": d.get("gap_score", 0.0),
            "data_confidence": d.get("confidence", 0.0),
            "nfhs5": {
                "institutional_birth_pct": nfhs5.get("institutional_birth_5y_pct"),
                "child_stunting_pct": nfhs5.get("child_u5_who_are_stunted_height_for_age_18_pct"),
                "skilled_birth_attendance_pct": nfhs5.get("births_attended_by_skilled_hp_5y_10_pct"),
                "anc_4plus_visits_pct": nfhs5.get("mothers_who_had_at_least_4_anc_visits_lb5y_pct"),
                "electricity_pct": nfhs5.get("hh_electricity_pct"),
                "health_insurance_pct": nfhs5.get("hh_member_covered_health_insurance_pct"),
                "blood_sugar_women_pct": nfhs5.get("w15_plus_with_high_141_160_mg_dl_blood_sugar_pct"),
            },
        })

    messages = [
        {"role": "system", "content": BATCH_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f"Capability: {capability}\nState: {state}\n\n"
            f"District data ({len(district_context)} districts):\n"
            f"{json.dumps(district_context, indent=2)}\n\n"
            f"Web search findings:\n{json.dumps(web_results, indent=2)}\n\n"
            f"Assess every district and return the JSON array."
        )},
    ]

    try:
        response = await _call_with_retry(messages, tools=None, max_tokens=4096)
        content = _extract_content(response)
        clean = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        results: list[dict] = json.loads(clean)
        LOGGER.info(f"batch | orchestrator returned {len(results)} assessments")
        return {r["district"]: r for r in results}
    except Exception as e:
        LOGGER.error(f"batch | orchestrator failed: {e}")
        return {
            d["district"]: {
                "district": d["district"],
                "verdict": "data_hole",
                "verdict_label": "Assessment Unavailable",
                "confidence": "low",
                "summary": f"AI assessment failed for {d['district']}. Review raw data manually.",
                "sources": [],
            }
            for d in districts
        }


# ─────────────────────────────────────────────
# Per-district SSE stream (detail drawer)
# ─────────────────────────────────────────────

async def run_assessment(district: str, state: str, capability: str):
    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    yield sse("tool_call", {"tool": "query_database", "input": f"NFHS-5 data for {district}, {state}"})

    state_canon = normalize_state(state)
    district_canon = normalize_state(district)
    cap_pattern = f"%{capability.lower()}%"

    try:
        coverage_rows = wh_query(
            f"""
            WITH {alias_ctes()},
            fac AS (
              SELECT
                CAST(f.address_zipOrPostcode AS STRING) AS pincode,
                LOWER(
                  COALESCE(f.specialties, '') || ' ' ||
                  COALESCE(f.capability,  '') || ' ' ||
                  COALESCE(f.description, '')
                ) AS hay,
                f.latitude, f.longitude, f.description,
                f.numberDoctors, f.phone_numbers, f.source
              FROM {TBL_FACILITIES} f
              WHERE f.address_zipOrPostcode IS NOT NULL
                AND f.address_zipOrPostcode NOT IN ('', 'null')
            )
            SELECT
              :p3 AS district, :p4 AS state,
              CAST(COUNT(*) AS BIGINT) AS total_facilities,
              CAST(SUM(CASE WHEN fac.hay LIKE :p1 THEN 1 ELSE 0 END) AS BIGINT) AS matching_facilities,
              CAST(ROUND(AVG(
                (CASE WHEN fac.latitude IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN fac.longitude IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN fac.description IS NOT NULL AND LENGTH(fac.description) > 20 THEN 1 ELSE 0 END +
                 CASE WHEN fac.numberDoctors IS NOT NULL AND fac.numberDoctors NOT IN ('', 'null') THEN 1 ELSE 0 END +
                 CASE WHEN fac.phone_numbers IS NOT NULL AND fac.phone_numbers NOT IN ('', 'null', '[]') THEN 1 ELSE 0 END +
                 CASE WHEN fac.source IS NOT NULL AND fac.source NOT IN ('', 'null') THEN 1 ELSE 0 END
                ) / 6.0
              ), 2) AS DOUBLE) AS confidence
            FROM fac
            JOIN pin_norm p ON fac.pincode = CAST(p.pincode AS STRING)
            WHERE p.state_canon = :p2
              AND p.district_canon = :p5
            """,
            [cap_pattern, state_canon, district, state, district_canon],
        )
        row = coverage_rows[0] if coverage_rows else None
        if row and row.get("total_facilities"):
            tot = int(row["total_facilities"])
            mat = int(row["matching_facilities"]) if row.get("matching_facilities") else 0
            district_row = {
                "district": district, "state": state,
                "total_facilities": tot, "matching_facilities": mat,
                "gap_score": (10.0 * mat / tot) if tot else 0.0,
                "confidence": float(row.get("confidence") or 0.0),
            }
        else:
            district_row = {
                "district": district, "state": state,
                "total_facilities": 0, "matching_facilities": 0,
                "gap_score": 0.0, "confidence": 0.0,
            }
    except Exception as e:
        LOGGER.warning(f"SSE | warehouse query failed: {e}")
        district_row = {
            "district": district, "state": state,
            "total_facilities": 0, "matching_facilities": 0,
            "gap_score": 0.0, "confidence": 0.0,
        }

    yield sse("tool_result", {
        "tool": "query_database",
        "rows": district_row.get("total_facilities", 0),
        "preview": f"matching: {district_row.get('matching_facilities', 0)} / {district_row.get('total_facilities', 0)}",
    })
    yield sse("tool_call", {"tool": "web_search", "input": f"{capability} hospital {district} {state} registry"})

    results = await run_batch_assessment(state=state, capability=capability, districts=[district_row])
    district_result = results.get(district, {
        "verdict": "data_hole", "verdict_label": "No Assessment",
        "confidence": "low", "summary": "Assessment could not be completed.", "sources": [],
    })

    yield sse("tool_result", {"tool": "web_search", "rows": 1, "preview": "web search complete"})
    yield sse("assessment", district_result)
    yield sse("done", {})


# ─────────────────────────────────────────────
# Per-facility web verification
# ─────────────────────────────────────────────

VERIFY_SYSTEM_PROMPT = """You are a healthcare facility verification agent for India.

Given a facility's name, location, and claimed capabilities, use the web_search tool to verify:
1. Does the facility exist and appear operational?
2. Which claimed capabilities are confirmed by external sources?
3. Is it listed on any government registry (NHA, NABH, HMIS, Ayushman Bharat)?

After searching, output ONLY a JSON object (no markdown):
{
  "verdict": "confirmed | partial | unverified",
  "verified_capabilities": ["list"],
  "unverified_capabilities": ["list"],
  "sources": [{"url": "...", "description": "..."}],
  "confidence_delta": 0.0
}

confidence_delta: confirmed → +0.3 to +0.5, partial → +0.1 to +0.2, unverified → -0.1 to 0.0"""


async def run_verification(facility: dict) -> dict:
    capabilities = " | ".join(filter(None, [
        facility.get("specialties", ""),
        facility.get("capability", ""),
    ]))
    messages = [
        {"role": "system", "content": VERIFY_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f"Facility: {facility.get('name', 'Unknown')}\n"
            f"Location: {facility.get('address_city', '')}, {facility.get('address_state', '')}, India\n"
            f"Claimed capabilities: {capabilities}\n"
            f"Description: {str(facility.get('description', ''))[:300]}\n\n"
            f"Search the web and return your verification JSON."
        )},
    ]

    for iteration in range(5):
        try:
            response = await _call_with_retry(messages, tools=[WEB_SEARCH_TOOL], max_tokens=1024)
        except Exception as e:
            LOGGER.error(f"verify | LLM call failed: {e}")
            break

        tool_calls = _extract_tool_calls(response)
        finish = _stop_reason(response)

        if not tool_calls or finish == "stop":
            content = _extract_content(response)
            try:
                clean = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                return json.loads(clean)
            except json.JSONDecodeError:
                break

        messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls})
        for tc in tool_calls:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            result_str = _execute_tool(name, args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", f"call_{iteration}"),
                "content": result_str,
            })

    return {"verdict": "unverified", "verified_capabilities": [],
            "unverified_capabilities": [], "sources": [], "confidence_delta": 0.0}

