import asyncio
import json
import logging
import os
from typing import AsyncIterator, Optional

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
# LLM singleton (same lazy-init pattern as gRPC repo)
# ─────────────────────────────────────────────
_LLM: Optional[ChatBedrockConverse] = None
_LLM_LOCK: Optional[asyncio.Lock] = None


def _get_llm_lock() -> asyncio.Lock:
    global _LLM_LOCK
    if _LLM_LOCK is None:
        _LLM_LOCK = asyncio.Lock()
    return _LLM_LOCK


async def _get_llm() -> ChatBedrockConverse:
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
                max_tokens=1024,
            ).bind_tools(ASSESSMENT_TOOLS)
            LOGGER.info(f"agent | LLM ready — model={CLAUDE_MODEL}")
    return _LLM


async def _invoke_with_retry(llm: ChatBedrockConverse, messages: list) -> AIMessage:
    for attempt, delay in enumerate(_RETRY_DELAYS + [None]):
        try:
            return await llm.ainvoke(messages)
        except Exception as e:
            if "429" not in str(e) or delay is None:
                raise
            LOGGER.warning(f"agent | rate limited (429), retrying in {delay}s (attempt {attempt + 1})")
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
      - public.facilities          (unique_id, name, specialties, capability, description, address_city,
                                    address_stateorregion, address_zipOrPostcode, latitude, longitude,
                                    numberDoctors, phone_numbers, source)
      - public.pincode_directory   (pincode, district, statename, officename)
      - public.nfhs5_health_indicators (district_name, state_ut, institutional_birth_5y_pct,
                                        child_u5_who_are_stunted_height_for_age_18_pct,
                                        births_attended_by_skilled_hp_5y_10_pct,
                                        mothers_who_had_at_least_4_anc_visits_lb5y_pct,
                                        hh_electricity_pct, hh_improved_water_pct,
                                        hh_use_improved_sanitation_pct,
                                        hh_member_covered_health_insurance_pct,
                                        w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct,
                                        w15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
                                        m15_plus_with_high_141_160_mg_dl_blood_sugar_pct,
                                        women_age_30_49_years_ever_undergone_a_cervical_screen_pct,
                                        women_age_30_49_years_ever_undergone_a_breast_exam_pct)
    Only SELECT is allowed — no INSERT, UPDATE, DELETE, or DDL.
    """
    # Guard against non-SELECT statements
    normalized = sql.strip().upper()
    if not normalized.startswith("SELECT"):
        return json.dumps({"error": "Only SELECT statements are allowed."})
    try:
        rows = db_query(sql)
        return json.dumps(rows[:20])  # cap at 20 rows to stay within token budget
    except Exception as e:
        LOGGER.error(f"agent | query_database failed: {e}")
        return json.dumps({"error": str(e)})


@tool
def web_search(
    query: Annotated[str, "Search query to look up information about a facility or region."],
) -> str:
    """
    Search the web for information about healthcare facilities or health statistics in India.
    Use this to verify facility existence on NHA, NABH, HMIS, or Ayushman Bharat registries,
    or to find recent news about healthcare gaps in a region.
    Returns top results with title, url, and snippet.
    """
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if not tavily_key:
        # Graceful mock when no key is configured
        LOGGER.warning("agent | TAVILY_API_KEY not set — returning mock web_search result")
        return json.dumps([{
            "title": "No web search results (TAVILY_API_KEY not configured)",
            "url": "",
            "snippet": "Configure TAVILY_API_KEY to enable real web search verification.",
        }])
    try:
        import httpx
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": tavily_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 3,
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
# System prompt
# ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are a medical desert assessment agent for India.

Your job is to assess whether a given district genuinely lacks a specific healthcare capability,
or whether the apparent gap is just a data quality problem.

You have two tools:
- query_database: run SELECT queries against Lakebase to get facility counts and NFHS-5 health outcomes
- web_search: verify facilities against NHA, NABH, HMIS, Ayushman Bharat registries

Assessment process:
1. Query the NFHS-5 indicators for the district — look at outcomes relevant to the capability
2. Query the facilities table to count matching facilities in the district
3. Web search to check if external registries confirm or deny the gap
4. Synthesize a verdict

Verdicts:
- tier1_desert: confirmed gap + poor health outcomes + no external evidence of facilities
- tier2_suspect: gap exists but data completeness is low — gap may be real or a data hole
- data_hole: cannot conclude — insufficient data to make a determination
- adequate: sufficient matching facilities found for the population

Rules:
- Be concise. Summary must be exactly 3 sentences.
- Cite specific numbers from the data (e.g. "institutional birth rate of 28%").
- Sources must reference exactly where each fact came from.
- If DB query fails, rely on what you have and note the limitation.
- When done, output ONLY a JSON object — no markdown, no extra text.

Output format (JSON only):
{
  "verdict": "tier1_desert | tier2_suspect | data_hole | adequate",
  "verdict_label": "human readable label",
  "confidence": "high | medium | low",
  "summary": "exactly 3 sentences citing specific numbers",
  "sources": [
    {"type": "database | web", "ref": "table/url reference", "detail": "specific value cited"}
  ]
}"""


# ─────────────────────────────────────────────
# Main assessment loop — yields SSE events
# ─────────────────────────────────────────────

async def run_assessment(
    district: str,
    state: str,
    capability: str,
) -> AsyncIterator[str]:
    """
    Agentic loop that assesses a district for a capability gap.
    Yields Server-Sent Event strings for streaming to the frontend.
    """

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    user_message = (
        f"Assess the {capability} care gap in {district}, {state}, India.\n"
        f"Capability to check: {capability}\n"
        f"District: {district}\n"
        f"State: {state}\n\n"
        f"Use your tools to gather evidence, then return your verdict as a JSON object."
    )

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    try:
        llm = await _get_llm()
    except Exception as e:
        LOGGER.error(f"agent | failed to initialise LLM: {e}")
        yield sse("assessment", {
            "verdict": "data_hole",
            "verdict_label": "Assessment Unavailable",
            "confidence": "low",
            "summary": (
                f"The AI assessment agent could not be initialised. "
                f"Review facility records and NFHS-5 data manually for {district}. "
                f"Error: {str(e)[:100]}"
            ),
            "sources": [],
        })
        yield sse("done", {})
        return

    iteration = 0
    while True:
        iteration += 1
        if iteration > MAX_ITERATIONS:
            LOGGER.warning(f"agent | MAX_ITERATIONS reached for {district}/{capability}")
            break

        try:
            response: AIMessage = await _invoke_with_retry(llm, messages)
        except Exception as e:
            LOGGER.error(f"agent | LLM invocation failed: {e}")
            yield sse("error", {"message": str(e)})
            yield sse("done", {})
            return

        # No tool calls → agent is done, response contains the final JSON
        if not response.tool_calls:
            content = response.content if isinstance(response.content, str) else ""
            try:
                # Strip any accidental markdown fences
                clean = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                result = json.loads(clean)
                yield sse("assessment", result)
            except json.JSONDecodeError:
                LOGGER.warning(f"agent | could not parse final JSON: {content[:200]}")
                yield sse("assessment", {
                    "verdict": "data_hole",
                    "verdict_label": "Parse Error",
                    "confidence": "low",
                    "summary": content[:500] if content else "Assessment could not be parsed.",
                    "sources": [],
                })
            break

        # Process each tool call and stream progress to frontend
        tool_messages = []
        for tc in response.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            tool_input = tool_args.get("sql") or tool_args.get("query") or str(tool_args)

            yield sse("tool_call", {"tool": tool_name, "input": tool_input[:200]})

            # Execute the tool
            if tool_name == "query_database":
                result_str = query_database.invoke(tool_args)
            elif tool_name == "web_search":
                result_str = web_search.invoke(tool_args)
            else:
                result_str = json.dumps({"error": f"unknown tool: {tool_name}"})

            # Parse result for a readable preview
            try:
                parsed = json.loads(result_str)
                if isinstance(parsed, list) and len(parsed) > 0:
                    preview = f"{len(parsed)} rows returned"
                    first = parsed[0]
                    for field in ["institutional_birth_5y_pct", "name", "district", "title", "tablename"]:
                        if field in first:
                            preview = f"{field}: {first[field]}"
                            break
                    row_count = len(parsed)
                elif isinstance(parsed, list):
                    preview = "0 rows returned"
                    row_count = 0
                else:
                    preview = str(parsed.get("error", parsed))[:100]
                    row_count = 0
            except Exception:
                parsed = {}
                preview = result_str[:100]
                row_count = 0

            yield sse("tool_result", {
                "tool": tool_name,
                "rows": row_count,
                "preview": preview,
            })

            tool_messages.append(ToolMessage(
                content=result_str,
                tool_call_id=tc["id"],
            ))

        messages.append(response)
        messages.extend(tool_messages)

    yield sse("done", {})


# ─────────────────────────────────────────────
# Facility verification (used by verify route)
# ─────────────────────────────────────────────

VERIFY_SYSTEM_PROMPT = """You are a healthcare facility verification agent for India.

Given a facility's name, location, and claimed capabilities, search the web to verify:
1. Does the facility exist and appear operational?
2. Which claimed capabilities are confirmed by external sources?
3. Is it listed on any government registry (NHA, NABH, HMIS, Ayushman Bharat)?

Output ONLY a JSON object — no markdown, no extra text:
{
  "verdict": "confirmed | partial | unverified",
  "verified_capabilities": ["list of confirmed capabilities"],
  "unverified_capabilities": ["list of unconfirmed capabilities"],
  "sources": [{"url": "...", "description": "..."}],
  "confidence_delta": 0.0
}

confidence_delta rules:
  confirmed   → +0.3 to +0.5
  partial     → +0.1 to +0.2
  unverified  → -0.1 to 0.0"""


async def run_verification(facility: dict) -> dict:
    """Run a web-search verification for a single facility. Returns a dict."""
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

    # Verification only uses web_search
    verify_llm_tools = [web_search]
    try:
        proxy_client = get_proxy_client("gen-ai-hub")
        llm = ChatBedrockConverse(
            proxy_client=proxy_client,
            model_name=CLAUDE_MODEL,
            temperature=0.1,
            max_tokens=512,
        ).bind_tools(verify_llm_tools)
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
