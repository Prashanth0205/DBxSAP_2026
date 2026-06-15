from fastapi import APIRouter, Path, Query
from fastapi.responses import StreamingResponse
from typing import Optional
import asyncio
import json

router = APIRouter(prefix="/api")


async def _mock_assessment_stream(district: str, capability: str):
    """Mock SSE stream — replaced by real agent loop in Phase 3."""
    events = [
        ("tool_call",   {"tool": "query_database", "input": f"SELECT * FROM nfhs5 WHERE district_name = '{district}'"}),
        ("tool_result", {"tool": "query_database", "rows": 1, "preview": "institutional_birth_5y_pct: 28.4"}),
        ("tool_call",   {"tool": "web_search",     "input": f"{capability} hospital {district} Maharashtra registry"}),
        ("tool_result", {"tool": "web_search",     "results": 0, "preview": "no results found on nhp.gov.in"}),
        ("assessment",  {
            "verdict": "tier1_desert",
            "verdict_label": f"Tier-1 {capability.title()} Desert",
            "confidence": "high",
            "summary": (
                f"{district} has zero {capability}-capable facilities for an estimated 1.7M residents. "
                f"NFHS-5 confirms outcomes consistent with absent care: institutional birth rate of 28% "
                f"against a state average of 76%, child stunting at 47%. "
                f"Web search found no additional listings in NHA, NABH, or HMIS registries. "
                f"The gap is real, not a data hole."
            ),
            "sources": [
                {"type": "database", "ref": f"nfhs5.district_name='{district}'", "detail": "institutional_birth_5y_pct: 28.4"},
                {"type": "database", "ref": "facilities table", "detail": "0 matching facilities in district"},
                {"type": "web",      "ref": "nhp.gov.in",       "detail": "no results"},
            ],
        }),
        ("done", {}),
    ]

    for event_type, data in events:
        yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        await asyncio.sleep(0.6)


@router.get("/districts/{district}/assessment")
async def get_district_assessment(
    district: str = Path(...),
    capability: str = Query(...),
    state: Optional[str] = Query(None),
):
    return StreamingResponse(
        _mock_assessment_stream(district, capability),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
