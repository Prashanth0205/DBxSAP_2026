import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { DistrictCoverage, gapColor } from '../lib/types';

interface Props {
  districts: DistrictCoverage[];
  onDistrictClick: (district: string, state: string) => void;
}

// Normalise district names for fuzzy matching
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function ChoroplethLayer({ districts, onDistrictClick }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }
    if (districts.length === 0) return;

    // Build lookup: normalised district name → coverage row
    const byName = new Map<string, DistrictCoverage>();
    for (const d of districts) {
      byName.set(norm(d.district), d);
    }

    fetch('/india_districts.json')
      .then(r => r.json())
      .then(geo => {
        const layer = L.geoJSON(geo, {
          style: feature => {
            const name = feature?.properties?.district ?? '';
            const row = byName.get(norm(name));
            if (!row) {
              return {
                fillColor: '#1e2433',
                fillOpacity: 0.5,
                color: 'rgba(255,255,255,0.06)',
                weight: 0.5,
              };
            }
            const isSparse = row.confidence < 0.45;
            return {
              fillColor: gapColor(row.gap_score),
              fillOpacity: isSparse ? 0.3 : 0.75,
              color: 'rgba(255,255,255,0.12)',
              weight: 0.8,
              dashArray: isSparse ? '4 3' : undefined,
            };
          },
          onEachFeature: (feature, featureLayer) => {
            const name = feature?.properties?.district ?? '';
            const state = feature?.properties?.st_nm ?? '';
            const row = byName.get(norm(name));

            if (row) {
              const isSparse = row.confidence < 0.45;
              featureLayer.bindTooltip(
                `<div style="min-width:170px">
                  <p style="font-weight:600;margin:0 0 3px">${row.district}</p>
                  <p style="color:#64748b;margin:0 0 5px;font-size:11px">${row.state}</p>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                    <span style="background:${gapColor(row.gap_score)};color:white;font-size:11px;font-weight:700;padding:1px 7px;border-radius:4px">
                      ${row.gap_score.toFixed(1)}
                    </span>
                    <span style="font-size:11px;color:#475569">
                      ${row.matching_facilities}/${row.total_facilities} matching
                    </span>
                  </div>
                  ${isSparse ? '<p style="color:#d97706;font-size:11px;margin:0">~ Low data confidence</p>' : ''}
                  ${row.institutional_birth_5y_pct != null ? `<p style="color:#94a3b8;font-size:11px;margin:3px 0 0">Inst. births: ${row.institutional_birth_5y_pct}%</p>` : ''}
                </div>`,
                { sticky: true, opacity: 1 }
              );

              featureLayer.on({
                click: () => onDistrictClick(row.district, row.state),
                mouseover: e => {
                  (e.target as L.Path).setStyle({
                    fillOpacity: isSparse ? 0.5 : 0.95,
                    weight: 1.5,
                    color: 'rgba(255,255,255,0.35)',
                  });
                },
                mouseout: e => layer.resetStyle(e.target as L.Path),
              });
            } else {
              // Unmatched district — subtle tooltip
              featureLayer.bindTooltip(
                `<p style="margin:0;color:#94a3b8;font-size:11px">${name}<br><span style="color:#475569">${state}</span></p>`,
                { sticky: true, opacity: 0.85 }
              );
            }
          },
        });

        layer.addTo(map);
        layerRef.current = layer;

        // Fit bounds to matched districts only
        const matched = districts.filter(d => byName.has(norm(d.district)));
        if (matched.length > 0 && districts.length < 20) {
          // Zoom to filtered state — only when few results (state filter active)
          try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch {}
        }
      })
      .catch(() => {});

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [districts, map, onDistrictClick]);

  return null;
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
            color: 'rgba(255,255,255,0.22)',
            weight: 1.5,
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
        <ChoroplethLayer districts={districts} onDistrictClick={onDistrictClick} />
      </MapContainer>

      <MapLegend />
    </div>
  );
}

function MapLegend() {
  return (
    <div className="absolute bottom-5 right-4 z-[9999] bg-[#1a1d23]/90 backdrop-blur rounded-lg px-3 py-2.5 text-xs border border-white/10">
      <p className="font-semibold mb-2 text-white/50 uppercase tracking-widest text-[10px]">Gap Score</p>
      <div className="space-y-1.5">
        {[
          { color: '#dc2626', label: '0–1  Desert' },
          { color: '#f97316', label: '2–3  Severe' },
          { color: '#eab308', label: '4–6  Partial' },
          { color: '#16a34a', label: '7–10 Served' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
            <span className="text-white/50">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1 mt-0.5 border-t border-white/10">
          <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-dashed border-slate-500" />
          <span className="text-white/30">Dashed = sparse data</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#1e2433' }} />
          <span className="text-white/25">No data</span>
        </div>
      </div>
    </div>
  );
}
