from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

from server.agent import run_batch_assessment

router = APIRouter(prefix="/api")


class BatchAssessmentRequest(BaseModel):
    capability: str
    state: str
    districts: list[dict]  # coverage rows from /api/coverage


@router.post("/assessment/batch")
async def batch_assessment(body: BatchAssessmentRequest):
    """
    Option C hybrid batch flow:
      1. DB Agent  — one SQL call fetches all NFHS-5 rows for the state
      2. Web Agent — ONE web search for the entire state + capability
      3. Orchestrator LLM — single prompt with all districts → all verdicts at once

    Frontend calls this AFTER /api/coverage renders the map.
    Response is { district_name: assessment_result } — map updates once.
    """
    results = await run_batch_assessment(
        state=body.state,
        capability=body.capability,
        districts=body.districts,
    )
    return results
