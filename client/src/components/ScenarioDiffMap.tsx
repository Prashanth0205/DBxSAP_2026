import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ScenarioDiffCity } from '../lib/types';

interface Props {
  cities: ScenarioDiffCity[];
  labelA: string;
  labelB: string;
  hasQueried: boolean;
}

const DIFF_COLORS = {
  both:  '#7c3aed', // purple — overlap
  onlyA: '#dc2626', // red — scenario A only
  onlyB: '#2563eb', // blue — scenario B only
} as const;

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
          style: () => ({ color: 'rgba(255,255,255,0.15)', weight: 1, fillColor: 'transparent', fillOpacity: 0 }),
        }).addTo(map);
        added.current = true;
      })
      .catch(() => {});
  }, [map]);
  return null;
}

export function ScenarioDiffMap({ cities, labelA, labelB, hasQueried }: Props) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-white/8" style={{ height: '380px' }}>
      <MapContainer
        center={[22, 80]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution=""
          pane="shadowPane"
        />
        <StateBoundaries />

        {cities.map((c, i) => {
          const color = c.overlap_count > 0
            ? DIFF_COLORS.both
            : c.only_a > 0
            ? DIFF_COLORS.onlyA
            : DIFF_COLORS.onlyB;

          const total = c.overlap_count + c.only_a + c.only_b;
          const radius = Math.min(22, Math.max(6, total * 1.5));

          return (
            <CircleMarker
              key={i}
              center={[c.latitude, c.longitude]}
              radius={radius}
              pathOptions={{ fillColor: color, fillOpacity: 0.8, color: 'rgba(0,0,0,0.3)', weight: 1 }}
            >
              <Tooltip>
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold">{c.city}, {c.state}</p>
                  {c.overlap_count > 0 && <p style={{ color: DIFF_COLORS.both }}>Both: {c.overlap_count}</p>}
                  {c.only_a > 0 && <p style={{ color: DIFF_COLORS.onlyA }}>Only {labelA}: {c.only_a}</p>}
                  {c.only_b > 0 && <p style={{ color: DIFF_COLORS.onlyB }}>Only {labelB}: {c.only_b}</p>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Overlay before first compare */}
      {!hasQueried && (
        <div className="absolute inset-0 bg-[#0e1117]/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <p className="text-white/30 text-sm">Select two scenarios and click Compare</p>
        </div>
      )}

      {hasQueried && cities.length === 0 && (
        <div className="absolute inset-0 bg-[#0e1117]/70 flex items-center justify-center z-[9999]">
          <p className="text-white/30 text-sm">No overlapping districts found</p>
        </div>
      )}

      <DiffLegend labelA={labelA} labelB={labelB} />
    </div>
  );
}

function DiffLegend({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <div className="absolute bottom-4 right-4 z-[9999] bg-[#1a1d23]/90 backdrop-blur rounded-lg px-3 py-2.5 text-xs border border-white/10">
      <p className="font-semibold mb-1.5 text-white/40 uppercase tracking-widest text-[10px]">Comparison</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: DIFF_COLORS.both }} />
          <span className="text-white/50">In both</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: DIFF_COLORS.onlyA }} />
          <span className="text-white/40 truncate max-w-[120px]">Only {labelA}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: DIFF_COLORS.onlyB }} />
          <span className="text-white/40 truncate max-w-[120px]">Only {labelB}</span>
        </div>
      </div>
    </div>
  );
}
