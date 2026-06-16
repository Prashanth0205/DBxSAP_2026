// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export type CapabilityTag =
  | 'icu' | 'maternity' | 'emergency' | 'dialysis'
  | 'oncology' | 'trauma' | 'nicu';

export const CAPABILITY_TAGS: { value: CapabilityTag; label: string }[] = [
  { value: 'maternity',  label: 'Maternity' },
  { value: 'dialysis',   label: 'Dialysis' },
  { value: 'icu',        label: 'ICU' },
  { value: 'emergency',  label: 'Emergency' },
  { value: 'oncology',   label: 'Oncology' },
  { value: 'trauma',     label: 'Trauma' },
  { value: 'nicu',       label: 'NICU' },
];

// ---------------------------------------------------------------------------
// Coverage  (GET /api/coverage)
// ---------------------------------------------------------------------------

export interface DistrictCoverage {
  district: string;
  state: string;
  total_facilities: number;
  matching_facilities: number;
  gap_score: number;          // 0 (desert) → 10 (well served)
  confidence: number;         // 0–1
  // NFHS-5 fields embedded in coverage response
  institutional_birth_5y_pct: number | null;
  child_stunting_pct: number | null;
  hh_electricity_pct: number | null;
  hh_improved_water_pct: number | null;
  hh_use_improved_sanitation_pct: number | null;
  skilled_birth_attendance_pct: number | null;
  anc_4plus_visits_pct: number | null;
  child_vaccinated_pct: number | null;
  health_insurance_pct: number | null;
  women_anaemic_pct: number | null;
  hypertension_pct: number | null;
  high_blood_sugar_pct: number | null;
  cervical_screening_pct: number | null;
  women_tobacco_pct: number | null;
}

// ---------------------------------------------------------------------------
// Facility  (GET /api/districts/:d/facilities)
// ---------------------------------------------------------------------------

export interface Facility {
  unique_id: string;
  name: string;
  organization_type: string | null;
  address_city: string | null;
  address_state: string | null;
  latitude: number | null;
  longitude: number | null;
  number_doctors: string | null;
  phone_numbers: string | null;
  email: string | null;
  websites: string | null;
  specialties: string | null;
  capability: string | null;
  description: string | null;
  source: string | null;
  year_established: string | null;
  has_capability: boolean;
  completeness: number;
  verdict: 'confirmed' | 'partial' | 'unverified' | null;
  verified_capabilities: string[] | null;
  unverified_capabilities: string[] | null;
  sources: { url: string; description: string }[] | null;
  verified_at: string | null;
}

// ---------------------------------------------------------------------------
// NFHS-5  (GET /api/districts/:d/nfhs5)
// ---------------------------------------------------------------------------

export interface Nfhs5 {
  district_name: string;
  state_ut: string;
  institutional_birth_5y_pct: number | null;
  births_attended_by_skilled_hp_5y_10_pct: number | null;
  mothers_who_had_at_least_4_anc_visits_lb5y_pct: number | null;
  child_u5_who_are_stunted_height_for_age_18_pct: number | null;
  child_12_23m_fully_vaccinated_pct: number | null;
  hh_electricity_pct: number | null;
  hh_improved_water_pct: number | null;
  hh_use_improved_sanitation_pct: number | null;
  hh_member_covered_health_insurance_pct: number | null;
  non_pregnant_w15_49_who_are_anaemic: number | null;
  women_age_15_49_who_are_literate_pct: number | null;
  w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct: number | null;
  women_age_30_49_years_ever_undergone_a_cervical_screen_pct: number | null;
}

// ---------------------------------------------------------------------------
// Assessment SSE  (GET /api/districts/:d/assessment)
// ---------------------------------------------------------------------------

export type AssessmentVerdict =
  | 'tier1_desert'
  | 'tier2_suspect'
  | 'data_hole'
  | 'adequate';

export const VERDICT_META: Record<AssessmentVerdict, { label: string; color: string }> = {
  tier1_desert:  { label: 'Tier-1 Desert',     color: '#dc2626' },
  tier2_suspect: { label: 'Tier-2 Suspect Gap', color: '#f59e0b' },
  data_hole:     { label: 'Data Gap',           color: '#6b7280' },
  adequate:      { label: 'Adequate Coverage',  color: '#16a34a' },
};

export interface AssessmentEvent {
  type: 'tool_call' | 'tool_result' | 'assessment' | 'done';
  // tool_call / tool_result
  tool?: string;
  input?: string;
  rows?: number;
  results?: number;
  preview?: string;
  // assessment
  verdict?: AssessmentVerdict;
  verdict_label?: string;
  confidence?: string;
  summary?: string;
  sources?: { type: string; ref: string; detail: string }[];
}

// ---------------------------------------------------------------------------
// Scenarios  (GET/POST /api/scenarios)
// ---------------------------------------------------------------------------

export interface Scenario {
  id: number;
  name: string;
  capability: string;
  district: string | null;
  state: string | null;
  gap_score: number | null;
  confidence: number | null;
  note: string | null;
  created_at: string;
}

export type CreateScenarioRequest = Omit<Scenario, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// Scenario Diff
// ---------------------------------------------------------------------------

export interface ScenarioDiffCity {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  overlap_count: number;
  only_a: number;
  only_b: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function gapColor(gap_score: number): string {
  if (gap_score <= 1)  return '#dc2626'; // deep red — desert
  if (gap_score <= 3)  return '#f97316'; // orange
  if (gap_score <= 6)  return '#eab308'; // yellow
  return '#16a34a';                      // green — good
}

export function confidenceLabel(c: number): string {
  if (c >= 0.75) return 'High';
  if (c >= 0.45) return 'Medium';
  return 'Low';
}

export function confidenceBadgeClass(c: number): string {
  if (c >= 0.75) return 'bg-emerald-100 text-emerald-800';
  if (c >= 0.45) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}

// ---------------------------------------------------------------------------
// District Categorization (based on Track 2 spec)
//
// Cross-references facility coverage with NFHS-5 health outcomes to
// distinguish meaningful categories:
//
//   no_facilities — zero facility records in the dataset (cannot judge supply)
//   real_desert   — sparse facilities AND poor health outcomes
//   data_poor     — sparse facilities BUT adequate health outcomes
//                   (under-sampled, not under-served)
//   data_gap      — sparse facilities AND no NFHS-5 health data to confirm/deny
//   hidden_risk   — adequate facility count BUT poor health outcomes
//                   (capability mismatch, low-trust evidence)
//   adequate      — adequate facilities AND adequate health outcomes
// ---------------------------------------------------------------------------

export type DistrictCategory =
  | 'no_facilities' | 'real_desert' | 'data_poor' | 'data_gap' | 'hidden_risk' | 'adequate';

export const CATEGORY_META: Record<DistrictCategory, {
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}> = {
  no_facilities: {
    label: 'No Facility Records',
    shortLabel: 'No Records',
    color: '#475569',
    description: 'Dataset has zero facility records here — could be a true desert, could be a data-collection gap',
  },
  real_desert: {
    label: 'Real Medical Desert',
    shortLabel: 'Desert',
    color: '#dc2626',
    description: 'Sparse facility coverage AND poor health outcomes',
  },
  data_poor: {
    label: 'Data-Poor Region',
    shortLabel: 'Data Poor',
    color: '#6b7280',
    description: 'Sparse facility coverage but adequate health outcomes (under-sampled, not under-served)',
  },
  data_gap: {
    label: 'Insufficient Data',
    shortLabel: 'Data Gap',
    color: '#94a3b8',
    description: 'Sparse facility coverage with no NFHS-5 health data — cannot confirm or rule out a desert',
  },
  hidden_risk: {
    label: 'Hidden Risk',
    shortLabel: 'Hidden Risk',
    color: '#f59e0b',
    description: 'Adequate facility count but poor health outcomes (capability mismatch, low-trust evidence)',
  },
  adequate: {
    label: 'Adequate Coverage',
    shortLabel: 'Adequate',
    color: '#16a34a',
    description: 'Adequate facilities and adequate health outcomes',
  },
};

/**
 * Categorize a district based on facility coverage AND health outcomes.
 *
 * No facilities:          total_facilities === 0 — distinct signal from
 *                         "we have data and it shows zero matches"
 * Sparse coverage:        gap_score <= 3 (less than ~30% matching facilities)
 * Poor health outcomes:   institutional birth < 70% OR child stunting > 35%
 *                         (or low data confidence falls back to gap_score signal)
 */
export function categorizeDistrict(d: DistrictCoverage): DistrictCategory {
  if (d.total_facilities === 0) return 'no_facilities';

  const sparseCoverage = d.gap_score <= 3;

  // Health outcome heuristics from NFHS-5 (lower = worse)
  const instBirth = d.institutional_birth_5y_pct;
  const stunting = d.child_stunting_pct;

  const hasHealthData = instBirth != null || stunting != null;

  // If we have NFHS-5 data, use it; otherwise we can't classify health outcomes
  if (!hasHealthData) {
    return sparseCoverage ? 'data_gap' : 'adequate';
  }

  let poorHealth: boolean;
  const lowInstBirth = instBirth != null && instBirth < 70;
  const highStunting = stunting != null && stunting > 35;
  poorHealth = lowInstBirth || highStunting;

  if (sparseCoverage && poorHealth) return 'real_desert';
  if (sparseCoverage && !poorHealth) return 'data_poor';
  if (!sparseCoverage && poorHealth) return 'hidden_risk';
  return 'adequate';
}

export function categoryColor(category: DistrictCategory): string {
  return CATEGORY_META[category].color;
}

// ---------------------------------------------------------------------------
// Capability-relevant NFHS-5 indicators
//
// Different capabilities care about different NFHS-5 health outcomes. This
// returns the list of indicators most relevant to the planner's chosen
// capability, instead of always defaulting to institutional births.
// ---------------------------------------------------------------------------

export interface CapabilityStat {
  label: string;
  value: number | null;
  unit: string;
  description: string;
  /** true if higher value = worse outcome (e.g. stunting, hypertension) */
  invertedScale?: boolean;
}

export function capabilityRelevantStats(
  capability: CapabilityTag,
  d: DistrictCoverage,
): CapabilityStat[] {
  switch (capability) {
    case 'maternity':
      return [
        {
          label: 'Institutional Births',
          value: d.institutional_birth_5y_pct,
          unit: '%',
          description: 'Births in a health facility (last 5 years)',
        },
        {
          label: 'Skilled Birth Attendance',
          value: d.skilled_birth_attendance_pct,
          unit: '%',
          description: 'Births attended by a skilled health professional',
        },
        {
          label: '4+ Antenatal Visits',
          value: d.anc_4plus_visits_pct,
          unit: '%',
          description: 'Mothers who had at least 4 ANC visits',
        },
      ];
    case 'nicu':
      return [
        {
          label: 'Institutional Births',
          value: d.institutional_birth_5y_pct,
          unit: '%',
          description: 'Births in a health facility (last 5 years)',
        },
        {
          label: 'Child Stunting',
          value: d.child_stunting_pct,
          unit: '%',
          description: 'Children under 5 who are stunted (lower is better)',
          invertedScale: true,
        },
        {
          label: 'Child Vaccination',
          value: d.child_vaccinated_pct,
          unit: '%',
          description: 'Children 12–23m fully vaccinated',
        },
      ];
    case 'icu':
      return [
        {
          label: 'Hypertension (Women)',
          value: d.hypertension_pct,
          unit: '%',
          description: 'Women 15+ with high blood pressure (lower is better)',
          invertedScale: true,
        },
        {
          label: 'High Blood Sugar (Women)',
          value: d.high_blood_sugar_pct,
          unit: '%',
          description: 'Women 15+ with elevated blood sugar (lower is better)',
          invertedScale: true,
        },
        {
          label: 'Anaemia in Women',
          value: d.women_anaemic_pct,
          unit: '%',
          description: 'Non-pregnant women 15–49 who are anaemic (lower is better)',
          invertedScale: true,
        },
      ];
    case 'emergency':
    case 'trauma':
      return [
        {
          label: 'Health Insurance',
          value: d.health_insurance_pct,
          unit: '%',
          description: 'Households with at least one member covered by health insurance',
        },
        {
          label: 'Hypertension (Women)',
          value: d.hypertension_pct,
          unit: '%',
          description: 'Women 15+ with high blood pressure (lower is better)',
          invertedScale: true,
        },
        {
          label: 'Electricity Access',
          value: d.hh_electricity_pct,
          unit: '%',
          description: 'Households with electricity (proxy for facility operability)',
        },
      ];
    case 'dialysis':
      return [
        {
          label: 'High Blood Sugar (Women)',
          value: d.high_blood_sugar_pct,
          unit: '%',
          description: 'Women 15+ with elevated blood sugar — diabetes drives kidney disease (lower is better)',
          invertedScale: true,
        },
        {
          label: 'Hypertension (Women)',
          value: d.hypertension_pct,
          unit: '%',
          description: 'Women 15+ with high BP — second leading cause of kidney disease (lower is better)',
          invertedScale: true,
        },
        {
          label: 'Improved Water Access',
          value: d.hh_improved_water_pct,
          unit: '%',
          description: 'Households with improved water — dialysis requires reliable water supply',
        },
      ];
    case 'oncology':
      return [
        {
          label: 'Cervical Screening (Women 30–49)',
          value: d.cervical_screening_pct,
          unit: '%',
          description: 'Women 30–49 who have had a cervical screening',
        },
        {
          label: 'Tobacco Use (Women)',
          value: d.women_tobacco_pct,
          unit: '%',
          description: 'Women 15+ who use tobacco — major cancer risk factor (lower is better)',
          invertedScale: true,
        },
        {
          label: 'Health Insurance',
          value: d.health_insurance_pct,
          unit: '%',
          description: 'Households with health insurance — cancer treatment affordability',
        },
      ];
    default:
      return [];
  }
}

/** Pick a sentiment color for a stat based on its value and direction. */
export function statColor(stat: CapabilityStat): string {
  if (stat.value == null) return '#6b7280'; // gray
  const v = stat.value;
  // For inverted scales (stunting, hypertension, etc.), HIGH = bad
  if (stat.invertedScale) {
    if (v >= 35) return '#dc2626'; // red - bad
    if (v >= 20) return '#f59e0b'; // amber - moderate
    return '#16a34a';              // green - good
  }
  // Normal scale: HIGH = good
  if (v >= 80) return '#16a34a'; // green
  if (v >= 60) return '#f59e0b'; // amber
  return '#dc2626';              // red
}
