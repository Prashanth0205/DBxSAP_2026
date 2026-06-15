import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { DistrictCoverage, gapColor } from '../lib/types';

interface Props {
  districts: DistrictCoverage[];
  onDistrictClick: (district: string, state: string) => void;
}

const STRIPE_ID = 'sparse-stripe';

function StripePatternDef() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
      <defs>
        <pattern id={STRIPE_ID} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#64748b" strokeWidth="2" strokeOpacity="0.5" />
        </pattern>
      </defs>
    </svg>
  );
}

function StateBoundaries() {
  const map = useMap();
  const added = useRef(false);
  useEffect(() => {
    if (added.current) return;
    fetch('/india_states.geojson')
      .then(r => r.json())
      .then(data => {
        if (added.current) return;
        L.geoJSON(data, {
          style: () => ({
            color: 'rgba(255,255,255,0.12)',
            weight: 1,
            fillColor: 'transparent',
            fillOpacity: 0,
          }),
        }).addTo(map);
        added.current = true;
      })
      .catch(() => {});
  }, [map]);
  return null;
}

export function CoverageMap({ districts, onDistrictClick }: Props) {
  return (
    <div className="relative h-full w-full">
      <StripePatternDef />
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        zoomControl={false}
      >
        {/* Dark basemap */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
        />
        {/* City/label layer on top */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution=""
          pane="shadowPane"
        />

        <StateBoundaries />

        {districts.map((d, i) => {
          const isSparse = d.confidence < 0.45;
          const color = gapColor(d.gap_score);
          const radius = Math.min(24, Math.max(6, d.total_facilities * 1.2 + 5));

          return (
            <CircleMarker
              key={i}
              center={[
                // Placeholder coords until backend includes lat/lng in /api/coverage
                20 + Math.sin(i * 1.3) * 8,
                78 + Math.cos(i * 1.1) * 10,
              ]}
              radius={radius}
              pathOptions={
                isSparse
                  ? {
                      fillColor: `url(#${STRIPE_ID})`,
                      fillOpacity: 1,
                      color: 'rgba(100,116,139,0.4)',
                      weight: 1,
                      dashArray: '4 3',
                    }
                  : {
                      fillColor: color,
                      fillOpacity: d.gap_score <= 1 ? 0.9 : 0.7,
                      color: 'rgba(0,0,0,0.3)',
                      weight: 1,
                    }
              }
              eventHandlers={{ click: () => onDistrictClick(d.district, d.state) }}
            >
              <Tooltip direction="top" offset={[0, -radius]}>
                <DistrictTooltip d={d} isSparse={isSparse} />
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <MapLegend />
    </div>
  );
}

function DistrictTooltip({ d, isSparse }: { d: DistrictCoverage; isSparse: boolean }) {
  return (
    <div className="space-y-1 min-w-[190px]">
      <p className="font-semibold text-slate-800 text-sm">{d.district}</p>
      <p className="text-xs text-slate-500">{d.state}</p>
      <div className="flex items-center gap-2 pt-0.5">
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: gapColor(d.gap_score), color: 'white' }}
        >
          {d.gap_score.toFixed(1)}
        </span>
        <span className="text-xs text-slate-500">
          {d.matching_facilities}/{d.total_facilities} matching
        </span>
      </div>
      {isSparse && (
        <p className="text-xs text-amber-600">~ Low data confidence</p>
      )}
      {d.institutional_birth_5y_pct != null && (
        <p className="text-xs text-slate-400">Inst. births: {d.institutional_birth_5y_pct}%</p>
      )}
    </div>
  );
}

function MapLegend() {
  return (
    <div className="absolute bottom-5 right-4 z-[9999] bg-[#1a1d23]/90 backdrop-blur rounded-lg px-3 py-2.5 text-xs border border-white/10">
      <p className="font-semibold mb-2 text-white/60 uppercase tracking-widest text-[10px]">Gap Score</p>
      <div className="space-y-1.5">
        {[
          { color: '#dc2626', label: '0–1  Desert' },
          { color: '#f97316', label: '2–3  Severe' },
          { color: '#eab308', label: '4–6  Partial' },
          { color: '#16a34a', label: '7–10 Served' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-white/50">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1 mt-0.5 border-t border-white/10">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-slate-400"
            style={{ background: 'repeating-linear-gradient(45deg,#64748b 0,#64748b 1.5px,transparent 1.5px,transparent 5px)' }}
          />
          <span className="text-white/30">Striped = sparse data</span>
        </div>
      </div>
    </div>
  );
}
