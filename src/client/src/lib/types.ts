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
