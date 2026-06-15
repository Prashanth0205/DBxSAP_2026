import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ScenarioDiffCity } from '../lib/types';

interface Props {
  cities: ScenarioDiffCity[];
  labelA: string;
  labelB: string;
}

const DIFF_COLORS = {
  both: '#7c3aed',  // purple — overlap
  onlyA: '#dc2626', // red — scenario A only
  onlyB: '#2563eb', // blue — scenario B only
} as const;

function stateStyle(): L.PathOptions {
  return { color: '#6b7280', weight: 1, fillColor: 'transparent', fillOpacity: 0 };
}

function GeoJSONLayer() {
  const map = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (addedRef.current) return;
    fetch('/india_states.geojson')
      .then(r => r.json())
      .then(data => {
        if (addedRef.current) return;
        L.geoJSON(data, { style: stateStyle }).addTo(map);
        addedRef.current = true;
      })
      .catch(() => {});
  }, [map]);

  return null;
}

export function ScenarioDiffMap({ cities, labelA, labelB }: Props) {
  if (cities.length === 0) {
    return (
      <div className="h-64 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
        Select two scenarios and click <span className="font-semibold mx-1">Compare</span> to see the diff map.
      </div>
    );
  }

  return (
    <div className="relative">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '460px', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
        />
        <GeoJSONLayer />

        {cities.map((c, i) => {
          const hasOverlap = c.overlap_count > 0;
          const hasOnlyA = c.only_a > 0;
          const hasOnlyB = c.only_b > 0;

          // Determine dominant category for color
          const color = hasOverlap
            ? DIFF_COLORS.both
            : hasOnlyA
            ? DIFF_COLORS.onlyA
            : DIFF_COLORS.onlyB;

          const totalFacilities = c.overlap_count + c.only_a + c.only_b;
          const radius = Math.min(22, Math.max(6, totalFacilities * 1.5));

          return (
            <CircleMarker
              key={i}
              center={[c.latitude, c.longitude]}
              radius={radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.75,
                color: 'white',
                weight: 1.5,
              }}
            >
              <Tooltip>
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold">{c.city}, {c.state}</p>
                  {c.overlap_count > 0 && (
                    <p style={{ color: DIFF_COLORS.both }}>
                      Both scenarios: {c.overlap_count} facilities
                    </p>
                  )}
                  {c.only_a > 0 && (
                    <p style={{ color: DIFF_COLORS.onlyA }}>
                      Only in {labelA}: {c.only_a}
                    </p>
                  )}
                  {c.only_b > 0 && (
                    <p style={{ color: DIFF_COLORS.onlyB }}>
                      Only in {labelB}: {c.only_b}
                    </p>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <DiffLegend labelA={labelA} labelB={labelB} />
    </div>
  );
}

function DiffLegend({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <div className="absolute bottom-6 left-4 z-[9999] bg-white rounded-lg px-3 py-2.5 shadow-md text-xs border border-gray-200">
      <p className="font-semibold mb-1.5 text-gray-700">Scenario Comparison</p>
      <div className="space-y-1 text-gray-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: DIFF_COLORS.both }} />
          In both scenarios
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: DIFF_COLORS.onlyA }} />
          Only in <span className="font-medium ml-0.5">{labelA}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: DIFF_COLORS.onlyB }} />
          Only in <span className="font-medium ml-0.5">{labelB}</span>
        </div>
      </div>
    </div>
  );
}
