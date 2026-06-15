from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/api")

# MOCK — replace with real SQL once M1 delivers synced tables
MOCK_COVERAGE = [
    {
        "district": "Nandurbar", "state": "Maharashtra",
        "total_facilities": 3, "matching_facilities": 0,
        "gap_score": 0.0, "confidence": 0.82,
        "institutional_birth_5y_pct": 28.4, "child_stunting_pct": 47.2,
        "hh_electricity_pct": 71.2, "hh_improved_water_pct": 54.3,
        "hh_use_improved_sanitation_pct": 48.1,
    },
    {
        "district": "Gadchiroli", "state": "Maharashtra",
        "total_facilities": 2, "matching_facilities": 0,
        "gap_score": 0.0, "confidence": 0.91,
        "institutional_birth_5y_pct": 41.2, "child_stunting_pct": 51.3,
        "hh_electricity_pct": 63.1, "hh_improved_water_pct": 48.7,
        "hh_use_improved_sanitation_pct": 39.4,
    },
    {
        "district": "Wardha", "state": "Maharashtra",
        "total_facilities": 4, "matching_facilities": 1,
        "gap_score": 2.5, "confidence": 0.31,
        "institutional_birth_5y_pct": 79.1, "child_stunting_pct": 21.0,
        "hh_electricity_pct": 96.4, "hh_improved_water_pct": 89.1,
        "hh_use_improved_sanitation_pct": 87.3,
    },
    {
        "district": "Pune", "state": "Maharashtra",
        "total_facilities": 18, "matching_facilities": 12,
        "gap_score": 6.7, "confidence": 0.88,
        "institutional_birth_5y_pct": 94.2, "child_stunting_pct": 14.1,
        "hh_electricity_pct": 99.1, "hh_improved_water_pct": 97.3,
        "hh_use_improved_sanitation_pct": 95.8,
    },
]


@router.get("/coverage")
def get_coverage(
    capability: str = Query(..., description="e.g. maternity, icu, dialysis"),
    state: Optional[str] = Query(None),
):
    rows = MOCK_COVERAGE
    if state:
        rows = [r for r in rows if r["state"].lower() == state.lower()]
    return sorted(rows, key=lambda r: (r["gap_score"], -r["confidence"]))
