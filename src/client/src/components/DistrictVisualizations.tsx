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
