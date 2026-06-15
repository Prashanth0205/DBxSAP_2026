from fastapi import APIRouter, Path, BackgroundTasks

router = APIRouter(prefix="/api")

# In-memory store until DB is ready
_verifications: dict[str, dict] = {}


def _mock_verify(facility_id: str):
    import time
    time.sleep(2)  # simulate web search latency
    _verifications[facility_id] = {
        "facility_id": facility_id,
        "verdict": "partial",
        "verified_capabilities": ["maternity"],
        "unverified_capabilities": ["icu"],
        "sources": [
            {"url": "https://nhp.gov.in/hospital/123", "description": "NHP hospital listing"},
        ],
        "confidence_delta": 0.2,
        "verified_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }


@router.post("/facilities/{facility_id}/verify", status_code=202)
def verify_facility(
    facility_id: str = Path(...),
    background_tasks: BackgroundTasks = None,
):
    background_tasks.add_task(_mock_verify, facility_id)
    return {"status": "verification_started"}


@router.get("/facilities/{facility_id}/verification")
def get_verification(facility_id: str = Path(...)):
    return _verifications.get(facility_id, {"status": "not_verified"})
