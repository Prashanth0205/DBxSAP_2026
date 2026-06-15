from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api")

# In-memory store until DB is ready — swapped to real SQL in Phase 2
_scenarios: list[dict] = []
_next_id = 1


class ScenarioCreate(BaseModel):
    name: str
    capability: str
    district: Optional[str] = None
    state: Optional[str] = None
    gap_score: Optional[float] = None
    confidence: Optional[float] = None
    note: Optional[str] = None


@router.get("/scenarios")
def list_scenarios():
    return list(reversed(_scenarios))


@router.post("/scenarios", status_code=201)
def create_scenario(body: ScenarioCreate):
    global _next_id
    scenario = {
        "id": _next_id,
        **body.model_dump(),
        "created_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    _scenarios.append(scenario)
    _next_id += 1
    return scenario
