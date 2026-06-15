CAPABILITY_KEYWORDS: dict[str, list[str]] = {
    "icu":        ["icu", "intensive care", "critical care", "ventilator", "ccm"],
    "maternity":  ["maternity", "obstetric", "delivery", "labour", "prenatal", "antenatal", "midwifery"],
    "emergency":  ["emergency", "casualty", "trauma", "accident", "a&e", "24 hour"],
    "dialysis":   ["dialysis", "renal", "nephrology", "kidney"],
    "oncology":   ["oncology", "cancer", "chemotherapy", "radiation", "tumour"],
    "trauma":     ["trauma", "orthopedic", "fracture", "spine", "neurosurgery"],
    "nicu":       ["nicu", "neonatal", "newborn intensive", "premature"],
}


def build_ilike_conditions(capability: str, columns: list[str]) -> str:
    """
    Build an SQL OR clause that checks whether any of the given columns
    contains any keyword for the capability.

    Example:
        build_ilike_conditions("maternity", ["f.specialties", "f.capability"])
        → "(f.specialties ILIKE '%maternity%' OR f.specialties ILIKE '%obstetric%'
            OR f.capability ILIKE '%maternity%' OR ...)"
    """
    keywords = CAPABILITY_KEYWORDS.get(capability.lower(), [capability])
    parts = []
    for col in columns:
        for kw in keywords:
            safe_kw = kw.replace("'", "''")
            parts.append(f"{col} ILIKE '%{safe_kw}%'")
    return "(" + " OR ".join(parts) + ")"
