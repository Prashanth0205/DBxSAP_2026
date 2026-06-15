from fastapi import APIRouter, Path, Query
from fastapi.responses import StreamingResponse
from typing import Optional

from server.agent import run_assessment

router = APIRouter(prefix="/api")


@router.get("/districts/{district}/assessment")
async def get_district_assessment(
    district: str = Path(...),
    capability: str = Query(...),
    state: Optional[str] = Query(None),
):
    return StreamingResponse(
        run_assessment(
            district=district,
            state=state or "",
            capability=capability,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
