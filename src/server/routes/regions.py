from fastapi import APIRouter, Path, Query
from typing import Optional

router = APIRouter(prefix="/api")

MOCK_FACILITIES = {
    "nandurbar": [
        {
            "unique_id": "IN-MH-FAC-00123",
            "name": "Govt District Hospital Nandurbar",
            "organization_type": "Government",
            "address_city": "Nandurbar",
            "address_state": "Maharashtra",
            "latitude": 21.3686, "longitude": 74.2418,
            "number_doctors": "12", "phone_numbers": "02564-222001",
            "specialties": "General Medicine, Maternity, Surgery",
            "capability": "maternity, obstetric",
            "description": "District government hospital with maternity ward",
            "source": "NHA", "year_established": "1978",
            "has_capability": True, "completeness": 0.83,
            "verdict": None, "verified_capabilities": None,
            "unverified_capabilities": None, "sources": None, "verified_at": None,
        },
        {
            "unique_id": "IN-MH-FAC-00456",
            "name": "PHC Prakasha",
            "organization_type": "Government",
            "address_city": "Prakasha",
            "address_state": "Maharashtra",
            "latitude": None, "longitude": None,
            "number_doctors": None, "phone_numbers": None,
            "specialties": None, "capability": None, "description": None,
            "source": "HMIS", "year_established": None,
            "has_capability": False, "completeness": 0.17,
            "verdict": None, "verified_capabilities": None,
            "unverified_capabilities": None, "sources": None, "verified_at": None,
        },
    ],
}

MOCK_NFHS5 = {
    "nandurbar": {
        "district_name": "Nandurbar", "state_ut": "Maharashtra",
        "institutional_birth_5y_pct": 28.4,
        "births_attended_by_skilled_hp_5y_10_pct": 38.2,
        "mothers_who_had_at_least_4_anc_visits_lb5y_pct": 31.0,
        "child_u5_who_are_stunted_height_for_age_18_pct": 47.2,
        "hh_electricity_pct": 71.2,
        "hh_improved_water_pct": 54.3,
        "hh_use_improved_sanitation_pct": 48.1,
        "hh_member_covered_health_insurance_pct": 22.4,
        "non_pregnant_w15_49_who_are_anaemic": 61.3,
        "women_age_15_49_who_are_literate_pct": 54.7,
        "w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct": 11.2,
        "w15_plus_with_high_141_160_mg_dl_blood_sugar_pct": 6.8,
        "m15_plus_with_high_141_160_mg_dl_blood_sugar_pct": 8.1,
        "w15_plus_who_use_any_kind_of_tobacco_pct": 9.3,
        "m15_plus_who_use_any_kind_of_tobacco_pct": 38.6,
        "women_age_30_49_years_ever_undergone_a_cervical_screen_pct": 2.1,
        "women_age_30_49_years_ever_undergone_a_breast_exam_pct": 1.8,
    },
}


@router.get("/districts/{district}/facilities")
def get_district_facilities(
    district: str = Path(...),
    capability: str = Query(...),
    state: Optional[str] = Query(None),
):
    key = district.lower()
    facilities = MOCK_FACILITIES.get(key, [])
    return sorted(facilities, key=lambda f: (-int(f["has_capability"]), -f["completeness"]))


@router.get("/districts/{district}/nfhs5")
def get_district_nfhs5(
    district: str = Path(...),
    state: Optional[str] = Query(None),
):
    return MOCK_NFHS5.get(district.lower(), {})
