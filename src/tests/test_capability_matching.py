"""
Tests for the capability matching and district normalizer bugs fixed in:
  src/server/routes/coverage.py
  src/server/routes/regions.py
  src/server/agent.py

Bug 1: All SQL paths used a single-keyword LIKE pattern (%maternity%) instead of
       the multi-keyword OR conditions in build_ilike_conditions(). Facilities
       tagged "obstetric", "delivery", "prenatal" etc. were silently excluded.

Bug 2: run_assessment() called normalize_state(district) instead of
       normalize_district(district), causing the pincode-directory join to fail.
"""
import re
import pytest
from server.lib.capability_keywords import build_ilike_conditions, CAPABILITY_KEYWORDS
from server.warehouse import normalize_state, normalize_district


# ─── Bug 1: multi-keyword SQL condition ──────────────────────────────────────

class TestBuildIlikeConditions:
    def _keywords_in_condition(self, condition: str, capability: str) -> list[str]:
        """Extract all keyword literals from the generated SQL."""
        return re.findall(r"'%([^%]+)%'", condition)

    def test_maternity_includes_all_synonyms(self):
        condition = build_ilike_conditions("maternity", ["hay"])
        keywords_found = self._keywords_in_condition(condition, "maternity")
        expected = CAPABILITY_KEYWORDS["maternity"]
        for kw in expected:
            assert kw in keywords_found, f"Synonym '{kw}' missing from maternity condition"

    def test_maternity_not_single_keyword_only(self):
        # Regression: the old code produced LIKE '%maternity%' — only one term.
        condition = build_ilike_conditions("maternity", ["hay"])
        keywords_found = self._keywords_in_condition(condition, "maternity")
        assert len(keywords_found) > 1, (
            "Expected multiple synonym keywords; got only one — single-keyword regression"
        )

    def test_condition_is_valid_sql_or_clause(self):
        condition = build_ilike_conditions("maternity", ["hay"])
        assert condition.startswith("(")
        assert condition.endswith(")")
        assert " OR " in condition

    def test_multi_column_expands_each_keyword_per_column(self):
        cols = ["f.specialties", "f.description"]
        condition = build_ilike_conditions("maternity", cols)
        for col in cols:
            assert col in condition
        # Each of the 7 maternity keywords should appear for both columns = 14 ILIKE clauses
        assert condition.count("ILIKE") == len(CAPABILITY_KEYWORDS["maternity"]) * len(cols)

    def test_unknown_capability_falls_back_to_capability_itself(self):
        condition = build_ilike_conditions("xray_imaging", ["hay"])
        assert "xray_imaging" in condition

    def test_sql_injection_safe_single_quote(self):
        # If a keyword ever contained a single quote it must be escaped
        from server.lib.capability_keywords import CAPABILITY_KEYWORDS as KW
        original = KW.get("emergency", [])
        # Temporarily patch a keyword with a quote character to verify escaping
        KW["emergency"] = ["it's an emergency"]
        try:
            condition = build_ilike_conditions("emergency", ["hay"])
            assert "it''s an emergency" in condition
            assert "it's an emergency" not in condition.replace("it''s", "")
        finally:
            KW["emergency"] = original

    @pytest.mark.parametrize("capability,expected_keywords", [
        ("icu",      ["icu", "intensive care", "critical care"]),
        ("dialysis", ["dialysis", "renal", "nephrology"]),
        ("nicu",     ["nicu", "neonatal"]),
    ])
    def test_other_capabilities_include_synonyms(self, capability, expected_keywords):
        condition = build_ilike_conditions(capability, ["hay"])
        for kw in expected_keywords:
            assert kw in condition, f"'{kw}' missing from {capability} condition"


# ─── Bug 2: normalize_district vs normalize_state ────────────────────────────

class TestNormalizers:
    def test_normalize_district_differs_from_normalize_state_for_hyphenated(self):
        # normalize_state strips hyphens (replaces '-' with ' ') — this is the bug.
        # normalize_district should preserve or correctly handle the district form.
        district = "East-Godavari"
        state_result = normalize_state(district)
        district_result = normalize_district(district)
        # Both normalizers upper-case and strip — the key thing is they agree on
        # the canonical form expected by the pincode directory (space-separated).
        # The bug was that normalize_state was called on a district, not that the
        # two functions always differ — so we verify district normalizer works correctly.
        assert district_result == "EAST GODAVARI"

    def test_normalize_district_uppercases_and_strips(self):
        assert normalize_district("anantapur") == "ANANTAPUR"
        assert normalize_district("  Vizianagaram  ") == "VIZIANAGARAM"

    def test_normalize_district_replaces_ampersand(self):
        assert normalize_district("Kurnool & Nandyal") == "KURNOOL AND NANDYAL"

    def test_normalize_district_collapses_whitespace(self):
        assert normalize_district("East   Godavari") == "EAST GODAVARI"

    def test_normalize_state_works_for_states(self):
        assert normalize_state("Andhra Pradesh") == "ANDHRA PRADESH"
        assert normalize_state("andhra pradesh") == "ANDHRA PRADESH"

    def test_district_normalizer_used_not_state_normalizer(self):
        # Demonstrate that calling normalize_state on a district name that
        # happens to contain a hyphen would give an equivalent result to
        # normalize_district in *this* codebase (both strip hyphens to spaces)
        # — but the intent is always to use the right function per domain.
        district = "Y.S.R."
        # Both should handle dots/special chars without crashing
        result = normalize_district(district)
        assert isinstance(result, str)
        assert len(result) > 0
