export type CapabilityTag =
  | 'icu' | 'emergency_care' | 'maternity' | 'nicu'
  | 'surgery_general' | 'surgery_cardiac' | 'oncology'
  | 'dialysis' | 'radiology' | 'pathology' | 'orthopedics'
  | 'neurology' | 'cardiology' | 'pediatrics' | 'psychiatry'
  | 'physiotherapy' | 'blood_bank' | 'pharmacy';

export const CAPABILITY_TAGS: CapabilityTag[] = [
  'icu', 'emergency_care', 'maternity', 'nicu',
  'surgery_general', 'surgery_cardiac', 'oncology',
  'dialysis', 'radiology', 'pathology', 'orthopedics',
  'neurology', 'cardiology', 'pediatrics', 'psychiatry',
  'physiotherapy', 'blood_bank', 'pharmacy',
];

export interface CoverageRegion {
  state: string;
  city: string;
  latitude: number;
  longitude: number;
  capability_tag: CapabilityTag;
  facility_count: number;
  avg_confidence: number;
  confidence_std: number;
  field_coverage_pct: number;
}

export interface FacilityRow {
  facility_id: string;
  facility_name: string;
  state: string;
  city: string;
  latitude: number;
  longitude: number;
  confidence: number;
  evidence_text: string;
  field_source: string;
}

export interface FacilityDetail {
  facility_id: string;
  facility_name: string;
  state: string;
  city: string;
  description: string;
  capability: string;
  equipment: string;
  numberDoctors: number | null;
  capacity: number | null;
  yearEstablished: number | null;
  capabilities: {
    tag: CapabilityTag;
    confidence: number;
    evidence_text: string;
    field_source: string;
  }[];
}

export interface Scenario {
  id: string;
  name: string;
  capability_filter: CapabilityTag;
  states_filter: string[];
  min_confidence: number;
  notes: string;
  created_at: string;
}

export interface ShortlistItem {
  id: string;
  scenario_id: string;
  facility_id: string;
  facility_name: string;
  city: string;
  state: string;
  priority: number;
  user_note: string;
  added_at: string;
}

export function confidenceLabel(score: number): string {
  if (score >= 0.75) return 'Strong evidence';
  if (score >= 0.60) return 'Partial evidence';
  if (score >= 0.40) return 'Weak evidence';
  return 'Suspicious / no claim';
}

export function confidenceColor(score: number): string {
  if (score >= 0.75) return '#2ecc71';
  if (score >= 0.60) return '#f39c12';
  if (score >= 0.40) return '#e67e22';
  return '#e74c3c';
}
