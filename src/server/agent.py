import asyncio
import json
import logging
import os
from typing import Optional

from gen_ai_hub.proxy.core.proxy_clients import get_proxy_client
from gen_ai_hub.proxy.langchain.amazon import ChatBedrockConverse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from typing import Annotated

from server.db import query as db_query

LOGGER = logging.getLogger(__name__)

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "anthropic--claude-4.6-sonnet")
MAX_ITERATIONS = 10
_RETRY_DELAYS = [5, 10, 15]

# ─────────────────────────────────────────────
# LLM singleton
# ─────────────────────────────────────────────
_LLM: Optional[ChatBedrockConverse] = None
_LLM_LOCK: Optional[asyncio.Lock] = None


def _get_llm_lock() -> asyncio.Lock:
    global _LLM_LOCK
    if _LLM_LOCK is None:
        _LLM_LOCK = asyncio.Lock()
    return _LLM_LOCK


async def _get_llm(tools: list) -> ChatBedrockConverse:
    global _LLM
    if _LLM is not None:
        return _LLM
    async with _get_llm_lock():
        if _LLM is None:
            proxy_client = get_proxy_client("gen-ai-hub")
            _LLM = ChatBedrockConverse(
                proxy_client=proxy_client,
                model_name=CLAUDE_MODEL,
                temperature=0.1,
                max_tokens=4096,
            ).bind_tools(tools)
            LOGGER.info(f"agent | LLM ready — model={CLAUDE_MODEL}")
    return _LLM


async def _invoke_with_retry(llm: ChatBedrockConverse, messages: list) -> AIMessage:
    for attempt, delay in enumerate(_RETRY_DELAYS + [None]):
        try:
            return await llm.ainvoke(messages)
        except Exception as e:
            if "429" not in str(e) or delay is None:
                raise
            LOGGER.warning(f"agent | rate limited, retrying in {delay}s (attempt {attempt + 1})")
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")


# ─────────────────────────────────────────────
# Tool definitions
# ─────────────────────────────────────────────

@tool
def query_database(
    sql: Annotated[str, "A read-only SELECT statement against the Lakebase Postgres database."],
) -> str:
    """
    Execute a read-only SQL query against the Lakebase database.
    Available tables:
      - public.facilities          (unique_id, name, specialties, capability, description,
                                    address_city, address_stateorregion, address_zipOrPostcode,
                                    latitude, longitude, numberDoctors, phone_numbers, source)
      - public.pincode_directory   (pincode, district, statename)
      - public.nfhs5_health_indicators (district_name, state_ut, institutional_birth_5y_pct,
                                        child_u5_who_are_stunted_height_for_age_18_pct,
                                        births_attended_by_skilled_hp_5y_10_pct,
                                        mothers_who_had_at_least_4_anc_visits_lb5y_pct,
                                        hh_electricity_pct, hh_improved_water_pct,
                                        hh_member_covered_health_insurance_pct,
                                        w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct,
                                        w15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
                                        m15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
                                        women_age_30_49_years_ever_undergone_a_cervical_screen_pct,
                                        women_age_30_49_years_ever_undergone_a_breast_exam_pct)
    Only SELECT is allowed.
    """
    if not sql.strip().upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT statements are allowed."})
    try:
        rows = db_query(sql)
        return json.dumps(rows[:50])
    except Exception as e:
        LOGGER.error(f"agent | query_database failed: {e}")
        return json.dumps({"error": str(e)})


@tool
def web_search(
    query: Annotated[str, "Search query about healthcare facilities or health statistics in India."],
) -> str:
    """
    Search the web for information about healthcare in India.
    Use for ONE broad state-level search covering the capability gap across all districts.
    Returns top results with title, url, and snippet.
    """
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if not tavily_key:
        LOGGER.warning("agent | TAVILY_API_KEY not set — returning mock web_search result")
        return json.dumps([{
            "title": "Web search not configured",
            "url": "",
            "snippet": "Set TAVILY_API_KEY to enable real web search verification.",
        }])
    try:
        import httpx
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
        results = resp.json().get("results", [])
        return json.dumps([
            {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:300]}
            for r in results
        ])
    except Exception as e:
        LOGGER.error(f"agent | web_search failed: {e}")
        return json.dumps({"error": str(e)})


ASSESSMENT_TOOLS = [query_database, web_search]


# ─────────────────────────────────────────────
# Option C: Hybrid Batch Assessment
#
# Flow:
#   Step 1 — DB Agent: one SQL call, fetch all facilities + nfhs5 for the state
#   Step 2 — Web Agent: ONE search for the state + capability
#   Step 3 — Orchestrator LLM: single batch prompt → verdicts for all districts at once
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
    """
    Option C hybrid batch flow.

    Args:
        state:      e.g. "Maharashtra"
        capability: e.g. "maternity"
        districts:  list of coverage rows from /api/coverage (already has gap_score, confidence, nfhs5 cols)

    Returns:
        dict mapping district name → assessment result
    """
    if not districts:
        return {}

    LOGGER.info(f"batch | starting assessment for {len(districts)} districts in {state} [{capability}]")

    # ── Step 1: DB Agent ──────────────────────────────────────────────────────
    # Fetch NFHS-5 rows for all districts in the state in one query
    district_names = [d["district"] for d in districts]
    placeholders = ", ".join(["%s"] * len(district_names))

    try:
        nfhs5_rows = db_query(
            f"""
            SELECT district_name, state_ut,
                   institutional_birth_5y_pct,
                   births_attended_by_skilled_hp_5y_10_pct,
                   mothers_who_had_at_least_4_anc_visits_lb5y_pct,
                   child_u5_who_are_stunted_height_for_age_18_pct,
                   hh_electricity_pct, hh_improved_water_pct,
                   hh_member_covered_health_insurance_pct,
                   w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct,
                   w15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
                   m15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
                   women_age_30_49_years_ever_undergone_a_cervical_screen_pct,
                   women_age_30_49_years_ever_undergone_a_breast_exam_pct
            FROM public.nfhs5_health_indicators
            WHERE LOWER(state_ut) = LOWER(%s)
              AND LOWER(district_name) IN ({placeholders})
            """,
            [state] + [d.lower() for d in district_names],
        )
        nfhs5_by_district = {r["district_name"].lower(): r for r in nfhs5_rows}
        LOGGER.info(f"batch | DB Agent returned {len(nfhs5_rows)} NFHS-5 rows")
    except Exception as e:
        LOGGER.warning(f"batch | DB Agent NFHS-5 query failed (tables may not be synced yet): {e}")
        nfhs5_by_district = {}

    # ── Step 2: Web Agent ─────────────────────────────────────────────────────
    # ONE web search for the entire state
    web_query = f"{capability} hospital shortage desert {state} India NHA HMIS registry 2024"
    web_results_str = web_search.invoke({"query": web_query})
    try:
        web_results = json.loads(web_results_str)
    except Exception:
        web_results = []
    LOGGER.info(f"batch | Web Agent returned {len(web_results)} results for query: {web_query}")

    # ── Step 3: Orchestrator LLM ──────────────────────────────────────────────
    # Build a single rich context block for all districts
    district_context = []
    for d in districts:
        name = d["district"]
        nfhs5 = nfhs5_by_district.get(name.lower(), {})
        district_context.append({
            "district": name,
            "state": d["state"],
            "total_facilities": d["total_facilities"],
            "matching_facilities": d["matching_facilities"],
            "gap_score": d["gap_score"],
            "data_confidence": d["confidence"],
            "nfhs5": {
                "institutional_birth_pct": nfhs5.get("institutional_birth_5y_pct"),
                "child_stunting_pct": nfhs5.get("child_u5_who_are_stunted_height_for_age_18_pct"),
                "skilled_birth_attendance_pct": nfhs5.get("births_attended_by_skilled_hp_5y_10_pct"),
                "anc_4plus_visits_pct": nfhs5.get("mothers_who_had_at_least_4_anc_visits_lb5y_pct"),
                "electricity_pct": nfhs5.get("hh_electricity_pct"),
                "health_insurance_pct": nfhs5.get("hh_member_covered_health_insurance_pct"),
                "hypertension_pct": nfhs5.get("w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct"),
                "blood_sugar_women_pct": nfhs5.get("w15_plus_with_high_141_160_mg_dl_blood_sugar_pct"),
                "cervical_screening_pct": nfhs5.get("women_age_30_49_years_ever_undergone_a_cervical_screen_pct"),
            },
        })

    user_message = (
        f"Capability: {capability}\n"
        f"State: {state}\n\n"
        f"District data ({len(district_context)} districts):\n"
        f"{json.dumps(district_context, indent=2)}\n\n"
        f"Web search findings for {state} {capability} healthcare:\n"
        f"{json.dumps(web_results, indent=2)}\n\n"
        f"Assess every district and return the JSON array."
    )

    messages = [
        SystemMessage(content=BATCH_SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    try:
        proxy_client = get_proxy_client("gen-ai-hub")
        # Orchestrator LLM — no tools, just synthesis
        orchestrator = ChatBedrockConverse(
            proxy_client=proxy_client,
            model_name=CLAUDE_MODEL,
            temperature=0.1,
            max_tokens=4096,
        )
        response: AIMessage = await _invoke_with_retry(orchestrator, messages)
        content = response.content if isinstance(response.content, str) else ""
        clean = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        results: list[dict] = json.loads(clean)
        LOGGER.info(f"batch | Orchestrator returned {len(results)} district assessments")
        return {r["district"]: r for r in results}
    except Exception as e:
        LOGGER.error(f"batch | Orchestrator LLM failed: {e}")
        # Graceful fallback — return data_hole for all districts
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
# Per-district SSE stream (used by detail drawer)
# Thin wrapper — runs a single-district batch and streams it
# ─────────────────────────────────────────────

async def run_assessment(district: str, state: str, capability: str):
    """
    Streams SSE events for a single district assessment.
    Reuses the batch engine with a single-district input.
    """
    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    # Yield progress so the drawer shows activity immediately
    yield sse("tool_call", {"tool": "query_database", "input": f"SELECT nfhs5 data for {district}, {state}"})

    # Fetch the single district's coverage row from DB
    try:
        coverage_rows = db_query(
            """
            SELECT
                p.district,
                p.statename AS state,
                COUNT(*) AS total_facilities,
                SUM(CASE WHEN (f.specialties || ' ' || COALESCE(f.capability,'') || ' ' || COALESCE(f.description,''))
                    ILIKE %s THEN 1 ELSE 0 END) AS matching_facilities,
                ROUND(AVG((
                    CASE WHEN f.latitude IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN f.longitude IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN f.description IS NOT NULL AND LENGTH(f.description) > 20 THEN 1 ELSE 0 END +
                    CASE WHEN f.numberDoctors IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN f.phone_numbers IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN f.source IS NOT NULL THEN 1 ELSE 0 END
                )::float / 6)::numeric, 2) AS confidence
            FROM public.facilities f
            JOIN public.pincode_directory p ON f.address_zipOrPostcode = p.pincode::text
            WHERE LOWER(p.district) = LOWER(%s)
              AND LOWER(p.statename) = LOWER(%s)
            GROUP BY p.district, p.statename
            """,
            [f"%{capability}%", district, state],
        )
        district_row = coverage_rows[0] if coverage_rows else {
            "district": district, "state": state,
            "total_facilities": 0, "matching_facilities": 0,
            "gap_score": 0.0, "confidence": 0.0,
        }
    except Exception as e:
        LOGGER.warning(f"assessment SSE | DB query failed: {e}")
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

    results = await run_batch_assessment(
        state=state,
        capability=capability,
        districts=[district_row],
    )
    district_result = results.get(district, {
        "verdict": "data_hole",
        "verdict_label": "No Assessment",
        "confidence": "low",
        "summary": "Assessment could not be completed.",
        "sources": [],
    })

    yield sse("tool_result", {
        "tool": "web_search",
        "rows": 1,
        "preview": "web search complete",
    })

    yield sse("assessment", district_result)
    yield sse("done", {})


# ─────────────────────────────────────────────
# Per-facility web verification
# ─────────────────────────────────────────────

VERIFY_SYSTEM_PROMPT = """You are a healthcare facility verification agent for India.

Given a facility's name, location, and claimed capabilities, search the web to verify:
1. Does the facility exist and appear operational?
2. Which claimed capabilities are confirmed by external sources?
3. Is it listed on any government registry (NHA, NABH, HMIS, Ayushman Bharat)?

Output ONLY a JSON object:
{
  "verdict": "confirmed | partial | unverified",
  "verified_capabilities": ["list"],
  "unverified_capabilities": ["list"],
  "sources": [{"url": "...", "description": "..."}],
  "confidence_delta": 0.0
}

confidence_delta: confirmed → +0.3 to +0.5, partial → +0.1 to +0.2, unverified → -0.1 to 0.0"""


async def run_verification(facility: dict) -> dict:
    """Run a web-search verification for a single facility."""
    capabilities = " | ".join(filter(None, [
        facility.get("specialties", ""),
        facility.get("capability", ""),
    ]))
    user_message = (
        f"Facility: {facility.get('name', 'Unknown')}\n"
        f"Location: {facility.get('address_city', '')}, {facility.get('address_state', '')}, India\n"
        f"Claimed capabilities: {capabilities}\n"
        f"Description: {str(facility.get('description', ''))[:300]}\n\n"
        f"Search the web and return your verification JSON."
    )

    messages = [
        SystemMessage(content=VERIFY_SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    try:
        proxy_client = get_proxy_client("gen-ai-hub")
        llm = ChatBedrockConverse(
            proxy_client=proxy_client,
            model_name=CLAUDE_MODEL,
            temperature=0.1,
            max_tokens=512,
        ).bind_tools([web_search])
    except Exception as e:
        LOGGER.error(f"agent | verification LLM init failed: {e}")
        return {"verdict": "unverified", "verified_capabilities": [],
                "unverified_capabilities": [], "sources": [], "confidence_delta": 0.0}

    for _ in range(5):
        response: AIMessage = await _invoke_with_retry(llm, messages)
        if not response.tool_calls:
            content = response.content if isinstance(response.content, str) else ""
            try:
                clean = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                return json.loads(clean)
            except json.JSONDecodeError:
                return {"verdict": "unverified", "verified_capabilities": [],
                        "unverified_capabilities": [], "sources": [], "confidence_delta": 0.0}

        tool_messages = []
        for tc in response.tool_calls:
            result_str = web_search.invoke(tc["args"]) if tc["name"] == "web_search" else json.dumps({"error": "unknown tool"})
            tool_messages.append(ToolMessage(content=result_str, tool_call_id=tc["id"]))

        messages.append(response)
        messages.extend(tool_messages)

    return {"verdict": "unverified", "verified_capabilities": [],
            "unverified_capabilities": [], "sources": [], "confidence_delta": 0.0}
