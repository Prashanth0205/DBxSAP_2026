import json
import logging
from fastapi import APIRouter, Path, BackgroundTasks

from server.db import query as db_query, execute

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


async def _run_and_store(facility_id: str):
    """Background task: run agent verification and persist result to DB."""
    from server.agent import run_verification

    rows = db_query(
        "SELECT * FROM public.facilities WHERE unique_id = %s LIMIT 1",
        [facility_id],
    )
    if not rows:
        LOGGER.warning(f"verify | facility not found: {facility_id}")
        return

    facility = rows[0]
    try:
        result = await run_verification(facility)
    except Exception as e:
        LOGGER.error(f"verify | agent failed for {facility_id}: {e}")
        result = {
            "verdict": "unverified",
            "verified_capabilities": [],
            "unverified_capabilities": [],
            "sources": [],
            "confidence_delta": 0.0,
        }

    try:
        execute("""
            INSERT INTO app.facility_verifications
              (facility_id, verdict, verified_capabilities, unverified_capabilities,
               sources, confidence_delta, raw_response)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (facility_id) DO UPDATE SET
              verdict                 = EXCLUDED.verdict,
              verified_capabilities   = EXCLUDED.verified_capabilities,
              unverified_capabilities = EXCLUDED.unverified_capabilities,
              sources                 = EXCLUDED.sources,
              confidence_delta        = EXCLUDED.confidence_delta,
              raw_response            = EXCLUDED.raw_response,
              verified_at             = NOW()
        """, [
            facility_id,
            result.get("verdict", "unverified"),
            result.get("verified_capabilities", []),
            result.get("unverified_capabilities", []),
            json.dumps(result.get("sources", [])),
            result.get("confidence_delta", 0.0),
            json.dumps(result),
        ])
        LOGGER.info(f"verify | stored result for {facility_id}: verdict={result.get('verdict')}")
    except Exception as e:
        LOGGER.error(f"verify | DB write failed for {facility_id}: {e}")


@router.post("/facilities/{facility_id}/verify", status_code=202)
def verify_facility(
    facility_id: str = Path(...),
    background_tasks: BackgroundTasks = None,
):
    import asyncio
    background_tasks.add_task(
        lambda: asyncio.run(_run_and_store(facility_id))
    )
    return {"status": "verification_started"}


@router.get("/facilities/{facility_id}/verification")
def get_verification(facility_id: str = Path(...)):
    rows = db_query(
        "SELECT * FROM app.facility_verifications WHERE facility_id = %s LIMIT 1",
        [facility_id],
    )
    if not rows:
        return {"status": "not_verified"}
    row = rows[0]
    # Parse sources from JSONB string if needed
    if isinstance(row.get("sources"), str):
        try:
            row["sources"] = json.loads(row["sources"])
        except Exception:
            pass
    return row
