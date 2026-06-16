/**
 * Two new visualizations for the DistrictPage analysis view:
 *
 * 1. FacilityDotMap   — Leaflet map with facility dots (green=matches, grey=doesn't)
 * 2. CapabilityRadar  — Spider chart showing all 7 capabilities for this district
 */

import { useEffect, useRef } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { Facility, DistrictCoverage } from '../lib/types';

// ─── 1. Facility Dot Map ───────────────────────────────────────────────────

interface FacilityDotMapProps {
  facilities: Facility[];
  district: string;
  state: string;
}

export function FacilityDotMap({ facilities, district, state }: FacilityDotMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);

  const located = facilities.filter(f => f.latitude != null && f.longitude != null);

  useEffect(() => {
    if (!mapRef.current || located.length === 0) return;
    // Avoid double-init on hot-reload
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then(L => {
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      });

      leafletMapRef.current = map;

      // Dark tile layer matching the app's dark theme
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 14 }
      ).addTo(map);

      // Plot facility dots
      const bounds: [number, number][] = [];
      located.forEach(f => {
        const lat = f.latitude!;
        const lng = f.longitude!;
        bounds.push([lat, lng]);

        const color = f.has_capability ? '#16a34a' : '#6b7280';
        const radius = 6 + Math.round(f.completeness * 6);

        const marker = L.circleMarker([lat, lng], {
          radius,
          fillColor: color,
          color: f.has_capability ? '#4ade80' : '#9ca3af',
          weight: 1.5,
          opacity: 0.9,
          fillOpacity: 0.75,
        }).addTo(map);

        marker.bindTooltip(
          `<div style="font-size:12px;line-height:1.4">
            <strong>${f.name ?? 'Unknown'}</strong><br/>
            ${f.organization_type ?? ''} · ${f.address_city ?? ''}<br/>
            <span style="color:${color}">${f.has_capability ? '✓ Matches capability' : '✗ No match'}</span><br/>
            Data quality: ${Math.round(f.completeness * 100)}%
          </div>`,
          { permanent: false, direction: 'top', className: 'disha-tooltip' }
        );
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds as any, { padding: [24, 24], maxZoom: 10 });
      }
    });

    return () => {
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
    };
  }, [located.length]);

  if (located.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/25 text-xs gap-1">
        <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>No coordinates available</span>
        <span className="text-white/15">({facilities.length} facilities found, 0 with location)</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40 uppercase tracking-wider">Facility Locations</span>
        <div className="flex items-center gap-3 text-[10px] text-white/30">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Matches ({located.filter(f => f.has_capability).length})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
            No match ({located.filter(f => !f.has_capability).length})
          </span>
          <span className="text-white/20">{facilities.length - located.length} without coords</span>
        </div>
      </div>
      <div ref={mapRef} className="flex-1 rounded-lg overflow-hidden min-h-0" style={{ minHeight: 220 }} />
    </div>
  );
}

// ─── 2. Capability Radar ───────────────────────────────────────────────────

const CAPABILITIES = [
  { key: 'maternity',  label: 'Maternity',  keywords: ['maternity', 'obstetric', 'delivery', 'labour', 'antenatal'] },
  { key: 'icu',        label: 'ICU',        keywords: ['icu', 'intensive care', 'critical care', 'ventilator'] },
  { key: 'emergency',  label: 'Emergency',  keywords: ['emergency', 'casualty', 'accident', 'a&e'] },
  { key: 'dialysis',   label: 'Dialysis',   keywords: ['dialysis', 'renal', 'nephrology', 'kidney'] },
  { key: 'oncology',   label: 'Oncology',   keywords: ['oncology', 'cancer', 'chemotherapy', 'radiation'] },
  { key: 'trauma',     label: 'Trauma',     keywords: ['trauma', 'orthopedic', 'fracture', 'spine'] },
  { key: 'nicu',       label: 'NICU',       keywords: ['nicu', 'neonatal', 'newborn intensive', 'premature'] },
];

function facilityMatchesKeywords(f: Facility, keywords: string[]): boolean {
  const hay = [f.specialties, f.capability, f.description]
    .filter(Boolean).join(' ').toLowerCase();
  return keywords.some(kw => hay.includes(kw));
}

interface CapabilityRadarProps {
  facilities: Facility[];
  currentCapability: string;
}

export function CapabilityRadar({ facilities, currentCapability }: CapabilityRadarProps) {
  const data = CAPABILITIES.map(cap => {
    const matching = facilities.filter(f => facilityMatchesKeywords(f, cap.keywords)).length;
    // Normalise to 0–10 scale (same as gap_score) so the radar is comparable
    const score = facilities.length > 0
      ? Math.round((matching / facilities.length) * 10 * 10) / 10
      : 0;
    return {
      capability: cap.label,
      score,
      matching,
      isCurrent: cap.key === currentCapability,
    };
  });

  const hasAnyData = data.some(d => d.score > 0);

  // Custom dot to highlight the currently selected capability
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload?.isCurrent) return null;
    return <circle cx={cx} cy={cy} r={5} fill="#e07340" stroke="#fff" strokeWidth={1.5} />;
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40 uppercase tracking-wider">Capability Profile</span>
        <span className="text-[10px] text-white/25">across all {facilities.length} facilities</span>
      </div>

      {!hasAnyData ? (
        <div className="flex-1 flex items-center justify-center text-white/25 text-xs">
          No capability data available
        </div>
      ) : (
        <div className="flex-1 min-h-0" style={{ minHeight: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="capability"
                tick={({ x, y, payload }: any) => {
                  const isCurrent = payload.value === CAPABILITIES.find(c => c.key === currentCapability)?.label;
                  return (
                    <text
                      x={x} y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10}
                      fill={isCurrent ? '#e07340' : 'rgba(255,255,255,0.4)'}
                      fontWeight={isCurrent ? 700 : 400}
                    >
                      {payload.value}
                    </text>
                  );
                }}
              />
              <Radar
                dataKey="score"
                stroke="#e07340"
                fill="#e07340"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={<CustomDot />}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1f2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#fff',
                }}
                formatter={(value: unknown, _: any, entry: any) => [
                  `${entry?.payload?.matching ?? 0} matching (score: ${Number(value).toFixed(1)})`,
                  entry?.payload?.capability ?? '',
                ]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {data.map(d => (
          <span
            key={d.capability}
            className="text-[10px] flex items-center gap-1"
            style={{ color: d.isCurrent ? '#e07340' : 'rgba(255,255,255,0.3)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: d.score > 0 ? '#e07340' : 'rgba(255,255,255,0.15)' }}
            />
            {d.capability}: {d.matching}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── 3. Data Quality Breakdown ─────────────────────────────────────────────

interface DataQualityProps {
  facilities: Facility[];
}

export function DataQualityBreakdown({ facilities }: DataQualityProps) {
  if (facilities.length === 0) return null;

  const total = facilities.length;
  const fields = [
    { label: 'Coordinates',   count: facilities.filter(f => f.latitude != null && f.longitude != null).length },
    { label: 'Description',   count: facilities.filter(f => f.description && f.description.length > 20).length },
    { label: 'Doctors',       count: facilities.filter(f => f.number_doctors && !['', 'null'].includes(f.number_doctors)).length },
    { label: 'Phone',         count: facilities.filter(f => f.phone_numbers && !['', 'null', '[]'].includes(f.phone_numbers)).length },
    { label: 'Source',        count: facilities.filter(f => f.source && !['', 'null'].includes(f.source)).length },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-white/40 uppercase tracking-wider">Data Quality · {total} facilities</span>
      <div className="space-y-1.5">
        {fields.map(f => {
          const pct = Math.round((f.count / total) * 100);
          const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#e07340' : '#dc2626';
          return (
            <div key={f.label} className="flex items-center gap-2">
              <span className="text-[11px] text-white/40 w-24 shrink-0">{f.label}</span>
              <div className="flex-1 h-3 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span className="text-[10px] w-8 text-right shrink-0" style={{ color }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-white/20">Missing fields = gaps in planner confidence</p>
    </div>
  );
}

// ─── Types for context API ─────────────────────────────────────────────────

export interface DistrictContext {
  district: string;
  state: string;
  capability: string;
  rank_in_state: number | null;
  total_districts_in_state: number;
  pincode_count: number;
  gap_score: number;
  nearby_districts: {
    district: string;
    gap_score: number;
    confidence: number;
    matching_facilities: number;
    total_facilities: number;
    rank_in_state: number;
  }[];
  confidence_breakdown: {
    total_facilities: number;
    fields: { label: string; count: number; total: number }[];
  };
}

// ─── 4. District Rank Badge ────────────────────────────────────────────────

export function DistrictRankBadge({ ctx }: { ctx: DistrictContext }) {
  const { rank_in_state, total_districts_in_state, gap_score, capability, state } = ctx;
  if (!rank_in_state) return null;

  const isTop3 = rank_in_state <= 3;
  const isTop10 = rank_in_state <= 10;
  const color = isTop3 ? '#dc2626' : isTop10 ? '#f97316' : '#e07340';

  const ordinal = (n: number) => {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold"
      style={{ borderColor: color + '50', background: color + '15', color }}
    >
      <span>{ordinal(rank_in_state)} worst</span>
      <span className="text-white/30 font-normal">of {total_districts_in_state} districts</span>
      <span className="text-white/30 font-normal">·</span>
      <span className="text-white/50 font-normal capitalize">{state} · {capability}</span>
    </div>
  );
}

// ─── 5. Population Proxy Card ──────────────────────────────────────────────

export function PopulationProxy({ ctx }: { ctx: DistrictContext }) {
  const { pincode_count, gap_score, rank_in_state, total_districts_in_state } = ctx;

  // Rough population estimate: median Indian post office serves ~8,000–12,000 people
  const estimatedMin = Math.round(pincode_count * 8000 / 1000) * 1000;
  const estimatedMax = Math.round(pincode_count * 12000 / 1000) * 1000;

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : `${(n / 1_000).toFixed(0)}K`;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] text-white/40 uppercase tracking-wider">Estimated Population Impact</span>

      <div className="grid grid-cols-3 gap-3">
        {/* Population estimate */}
        <div className="bg-white/5 rounded-lg p-3 col-span-1">
          <p className="text-[10px] text-white/35 mb-1">Est. Population</p>
          <p className="text-xl font-bold text-white">{fmt(estimatedMin)}–{fmt(estimatedMax)}</p>
          <p className="text-[10px] text-white/25 mt-1">based on {pincode_count} post offices</p>
        </div>

        {/* Matching facilities per population */}
        <div className="bg-white/5 rounded-lg p-3 col-span-1">
          <p className="text-[10px] text-white/35 mb-1">Gap Score</p>
          <p
            className="text-xl font-bold"
            style={{ color: gap_score <= 1 ? '#dc2626' : gap_score <= 3 ? '#f97316' : '#16a34a' }}
          >
            {gap_score.toFixed(1)}<span className="text-sm text-white/30">/10</span>
          </p>
          <p className="text-[10px] text-white/25 mt-1">
            {gap_score === 0 ? 'No matching facilities' : gap_score < 3 ? 'Critical shortage' : 'Moderate coverage'}
          </p>
        </div>

        {/* State rank */}
        <div className="bg-white/5 rounded-lg p-3 col-span-1">
          <p className="text-[10px] text-white/35 mb-1">State Rank</p>
          <p className="text-xl font-bold text-white">
            #{rank_in_state ?? '—'}
            <span className="text-sm text-white/30">/{total_districts_in_state}</span>
          </p>
          <p className="text-[10px] text-white/25 mt-1">worst-first ranking</p>
        </div>
      </div>

      <p className="text-[10px] text-white/20">
        Population estimate: avg. post office serves 8K–12K residents (India Post data)
      </p>
    </div>
  );
}

// ─── 6. Nearby District Comparison ────────────────────────────────────────

export function NearbyComparison({ ctx }: { ctx: DistrictContext }) {
  const { nearby_districts, district, gap_score } = ctx;

  if (nearby_districts.length === 0) {
    return (
      <div className="text-white/25 text-xs text-center py-6">
        No nearby district data available
      </div>
    );
  }

  const allDistricts = [
    { district, gap_score, isCurrent: true },
    ...nearby_districts.map(d => ({ ...d, isCurrent: false })),
  ].sort((a, b) => a.gap_score - b.gap_score);

  const maxGap = Math.max(...allDistricts.map(d => d.gap_score), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40 uppercase tracking-wider">Compare Nearby Districts</span>
        <span className="text-[10px] text-white/25">by gap score · lower = worse</span>
      </div>

      <div className="space-y-2">
        {allDistricts.map(d => {
          const barPct = maxGap > 0 ? (d.gap_score / maxGap) * 100 : 0;
          const barColor = d.gap_score <= 1 ? '#dc2626' : d.gap_score <= 3 ? '#f97316' : d.gap_score <= 6 ? '#eab308' : '#16a34a';

          return (
            <div key={d.district} className={`flex items-center gap-3 ${d.isCurrent ? 'opacity-100' : 'opacity-70'}`}>
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                {d.isCurrent && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#e07340] shrink-0" />
                )}
                <span
                  className={`text-[11px] truncate ${d.isCurrent ? 'text-white font-semibold' : 'text-white/50'}`}
                >
                  {d.district}
                </span>
              </div>
              <div className="flex-1 h-4 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(barPct, 4)}%`,
                    background: d.isCurrent ? barColor : barColor + '99',
                    outline: d.isCurrent ? `1.5px solid ${barColor}` : 'none',
                  }}
                />
              </div>
              <span
                className="text-[11px] font-semibold w-10 text-right shrink-0"
                style={{ color: barColor }}
              >
                {d.gap_score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-white/20">
        Showing {district} vs {nearby_districts.length} closest-scoring districts
      </p>
    </div>
  );
}

// ─── 7. Confidence Breakdown ───────────────────────────────────────────────

export function ConfidenceBreakdown({ ctx }: { ctx: DistrictContext }) {
  const { confidence_breakdown } = ctx;
  const total = confidence_breakdown.total_facilities;

  if (total === 0) {
    return (
      <div className="text-white/25 text-xs text-center py-6">No facility data</div>
    );
  }

  // Overall confidence = average of field fill rates
  const avgFillRate = confidence_breakdown.fields.length > 0
    ? confidence_breakdown.fields.reduce((sum, f) => sum + (f.count / Math.max(f.total, 1)), 0) / confidence_breakdown.fields.length
    : 0;

  const confColor = avgFillRate >= 0.7 ? '#16a34a' : avgFillRate >= 0.4 ? '#e07340' : '#dc2626';
  const confLabel = avgFillRate >= 0.7 ? 'High confidence' : avgFillRate >= 0.4 ? 'Moderate confidence' : 'Low confidence';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40 uppercase tracking-wider">Why this confidence score?</span>
        <span className="text-[11px] font-semibold" style={{ color: confColor }}>
          {confLabel} · {Math.round(avgFillRate * 100)}%
        </span>
      </div>

      {/* Overall confidence gauge */}
      <div className="h-2 bg-white/8 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.round(avgFillRate * 100)}%`, background: confColor }}
        />
      </div>

      {/* Field-by-field breakdown */}
      <div className="space-y-2 mt-1">
        {confidence_breakdown.fields.map(f => {
          const pct = Math.round((f.count / Math.max(f.total, 1)) * 100);
          const missing = f.total - f.count;
          const fieldColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#e07340' : '#dc2626';

          return (
            <div key={f.label} className="flex items-center gap-2">
              <span className="text-[11px] text-white/45 w-24 shrink-0">{f.label}</span>
              <div className="flex-1 h-3 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: fieldColor }}
                />
              </div>
              <span className="text-[10px] w-20 text-right shrink-0" style={{ color: fieldColor }}>
                {f.count}/{f.total}
                {missing > 0 && (
                  <span className="text-white/25 ml-1">({missing} missing)</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-white/20">
        Confidence = average data completeness across {total} facilities.
        Low confidence means gaps may be data holes, not real deserts.
      </p>
    </div>
  );
}
