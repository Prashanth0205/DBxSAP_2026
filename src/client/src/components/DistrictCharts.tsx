/**
 * Three visualizations shown at the top of the DistrictPage:
 *
 * 1. GapGauge        — semicircle gauge showing gap score 0–10
 * 2. FacilityBar     — stacked bar: matching vs non-matching facilities
 * 3. NhfsBenchmark   — horizontal bars comparing district vs state-avg NFHS-5 indicators
 */

import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LabelList,
} from 'recharts';
import { DistrictCoverage, Nfhs5 } from '../lib/types';

// ─── colour helpers ────────────────────────────────────────────────────────

function gapColor(score: number) {
  if (score <= 1)  return '#dc2626';
  if (score <= 3)  return '#f97316';
  if (score <= 6)  return '#eab308';
  return '#16a34a';
}

// ─── 1. Gap Score Gauge ────────────────────────────────────────────────────

export function GapGauge({ coverage }: { coverage: DistrictCoverage }) {
  const score = coverage.gap_score ?? 0;
  const color = gapColor(score);

  // RadialBarChart trick for a half-donut gauge:
  // startAngle=180 endAngle=0, value=score, max=10
  const data = [
    { name: 'track', value: 10, fill: 'rgba(255,255,255,0.06)' },
    { name: 'score', value: score, fill: color },
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-1 h-full">
      <span className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Gap Score</span>
      <div className="relative w-[120px] h-[64px]">
        <ResponsiveContainer width="100%" height={120}>
          <RadialBarChart
            cx="50%" cy="100%"
            innerRadius="60%" outerRadius="90%"
            startAngle={180} endAngle={0}
            data={data}
          >
            <RadialBar dataKey="value" isAnimationActive cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* centre label */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-2xl font-bold" style={{ color }}>{score.toFixed(1)}</span>
          <span className="text-white/30 text-xs">/10</span>
        </div>
      </div>
      <span className="text-[11px] mt-1" style={{ color }}>
        {score === 0 ? 'No matching facilities' : score < 3 ? 'Critical gap' : score < 6 ? 'Moderate gap' : 'Adequate'}
      </span>
    </div>
  );
}

// ─── 2. Facility Match Bar ────────────────────────────────────────────────

export function FacilityMatchBar({ coverage }: { coverage: DistrictCoverage }) {
  const matching = coverage.matching_facilities ?? 0;
  const other    = (coverage.total_facilities ?? 0) - matching;
  const total    = coverage.total_facilities ?? 0;

  const data = [{ matching, other }];

  return (
    <div className="flex flex-col h-full justify-center gap-2">
      <span className="text-[11px] text-white/40 uppercase tracking-wider">Facility Match</span>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-8">
          <ResponsiveContainer width="100%" height={32}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis type="number" domain={[0, Math.max(total, 1)]} hide />
              <YAxis type="category" hide />
              <Bar dataKey="matching" stackId="a" fill="#16a34a" radius={[4, 0, 0, 4]}>
                {matching > 0 && (
                  <LabelList
                    dataKey="matching"
                    position="insideLeft"
                    style={{ fill: '#fff', fontSize: 11, fontWeight: 600 }}
                    formatter={(v: unknown) => {
                      const n = Number(v);
                      return n > 0 ? `${n} match` : '';
                    }}
                  />
                )}
              </Bar>
              <Bar dataKey="other" stackId="a" fill="rgba(255,255,255,0.08)" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="other"
                  position="insideRight"
                  style={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                  formatter={(v: unknown) => {
                      const n = Number(v);
                      return n > 0 ? `${n} other` : '';
                    }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex gap-4 text-[11px]">
        <span className="text-emerald-400 font-semibold">{matching} matching</span>
        <span className="text-white/30">{total} total</span>
        <span className="text-white/30">
          {coverage.confidence != null
            ? `${Math.round(coverage.confidence * 100)}% data quality`
            : ''}
        </span>
      </div>
    </div>
  );
}

// ─── 3. NFHS-5 Benchmark Bars ─────────────────────────────────────────────

/** State averages are estimated from all-India NFHS-5 district median values */
const INDIA_BENCHMARKS: Record<string, number> = {
  institutional_birth_5y_pct: 89,
  births_attended_by_skilled_hp_5y_10_pct: 89,
  mothers_who_had_at_least_4_anc_visits_lb5y_pct: 58,
  child_u5_who_are_stunted_height_for_age_18_pct: 36,   // lower is better
  child_12_23m_fully_vaccinated_pct: 77,
  hh_electricity_pct: 96,
  hh_improved_water_pct: 96,
  hh_use_improved_sanitation_pct: 70,
  hh_member_covered_health_insurance_pct: 41,
  non_pregnant_w15_49_who_are_anaemic: 57,              // lower is better
};

const NFHS_LABELS: Record<string, { label: string; lowerBetter?: boolean }> = {
  institutional_birth_5y_pct:              { label: 'Institutional Births' },
  births_attended_by_skilled_hp_5y_10_pct: { label: 'Skilled Attendance' },
  mothers_who_had_at_least_4_anc_visits_lb5y_pct: { label: '4+ ANC Visits' },
  child_u5_who_are_stunted_height_for_age_18_pct:  { label: 'Child Stunting', lowerBetter: true },
  child_12_23m_fully_vaccinated_pct:       { label: 'Full Vaccination' },
  hh_electricity_pct:                      { label: 'Electricity' },
  hh_improved_water_pct:                   { label: 'Improved Water' },
  hh_use_improved_sanitation_pct:          { label: 'Sanitation' },
  hh_member_covered_health_insurance_pct:  { label: 'Health Insurance' },
  non_pregnant_w15_49_who_are_anaemic:     { label: 'Women Anaemic', lowerBetter: true },
};

export function NhfsBenchmark({
  nfhs5,
  stateAvg,
}: {
  nfhs5: Nfhs5;
  stateAvg?: Partial<Record<keyof Nfhs5, number>>;
}) {
  // Build chart rows — only include indicators with a value
  const rows = Object.entries(NFHS_LABELS)
    .map(([key, meta]) => {
      const val = nfhs5[key as keyof Nfhs5] as number | null;
      if (val == null) return null;
      const benchmark = (stateAvg?.[key as keyof Nfhs5] as number | undefined)
        ?? INDIA_BENCHMARKS[key]
        ?? 50;
      const worse = meta.lowerBetter ? val > benchmark : val < benchmark;
      return {
        label: meta.label,
        district: Math.round(val),
        benchmark: Math.round(benchmark),
        worse,
        lowerBetter: meta.lowerBetter ?? false,
      };
    })
    .filter(Boolean) as {
      label: string;
      district: number;
      benchmark: number;
      worse: boolean;
      lowerBetter: boolean;
    }[];

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[11px] text-white/40 uppercase tracking-wider">NFHS-5 vs India Avg</span>
        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <span className="inline-block w-3 h-2 rounded-sm bg-[#e07340]" /> District
          <span className="inline-block w-3 h-2 rounded-sm bg-white/15 ml-1" /> India avg
        </div>
      </div>

      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-[11px] text-white/50 w-36 shrink-0 truncate">{row.label}</span>
            <div className="flex-1 relative h-5">
              {/* benchmark track */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-sm bg-white/10"
                style={{ width: `${row.benchmark}%` }}
              />
              {/* district bar */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-sm transition-all"
                style={{
                  width: `${row.district}%`,
                  background: row.worse ? '#dc2626cc' : '#16a34acc',
                }}
              />
              {/* value label */}
              <span
                className="absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold"
                style={{
                  left: `${Math.min(row.district + 1, 92)}%`,
                  color: row.worse ? '#fca5a5' : '#86efac',
                }}
              >
                {row.district}%
              </span>
            </div>
            {/* delta badge */}
            <span
              className="text-[10px] w-10 text-right shrink-0 font-medium"
              style={{ color: row.worse ? '#f87171' : '#4ade80' }}
            >
              {row.worse ? '▼' : '▲'}{Math.abs(row.district - row.benchmark)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/20 mt-1">India median benchmarks · NFHS-5 (2019–21)</p>
    </div>
  );
}

// ─── Combined strip ────────────────────────────────────────────────────────

export function DistrictChartsStrip({
  coverage,
  nfhs5,
  stateAvg,
}: {
  coverage: DistrictCoverage;
  nfhs5: Nfhs5 | null;
  stateAvg?: Partial<Record<keyof Nfhs5, number>>;
}) {
  return (
    <div className="flex-shrink-0 border-b border-white/8 bg-white/[0.02]">
      {/* Top row: gauge + match bar side by side */}
      <div className="grid grid-cols-[160px_1fr] divide-x divide-white/8 border-b border-white/8">
        <div className="px-4 py-3">
          <GapGauge coverage={coverage} />
        </div>
        <div className="px-5 py-4">
          <FacilityMatchBar coverage={coverage} />
        </div>
      </div>

      {/* Bottom row: NFHS benchmark bars — full width */}
      {nfhs5 && (
        <div className="px-5 py-4">
          <NhfsBenchmark nfhs5={nfhs5} stateAvg={stateAvg} />
        </div>
      )}
    </div>
  );
}
