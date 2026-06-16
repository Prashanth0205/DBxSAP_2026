import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  DistrictCoverage, categorizeDistrict, categoryColor, CATEGORY_META, DistrictCategory,
} from '../lib/types';

interface Props {
  districts: DistrictCoverage[];
  onDistrictClick: (district: string, state: string) => void;
}

// Module-level cache so the GeoJSON is only fetched once per page load
let _districtGeoCache: Promise<GeoJSON.GeoJsonObject> | null = null;
let _stateGeoCache: Promise<GeoJSON.GeoJsonObject> | null = null;

function fetchDistricts() {
  if (!_districtGeoCache) _districtGeoCache = fetch('/india_districts.json').then(r => r.json());
  return _districtGeoCache;
}

function fetchStates() {
  if (!_stateGeoCache) _stateGeoCache = fetch('/india_states.geojson').then(r => r.json());
  return _stateGeoCache;
}

// Normalise district names for fuzzy matching
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

// Inject diagonal stripe patterns into Leaflet's SVG overlay defs.
// Must be called after the map SVG exists (inside a useEffect post-mount).
function injectStripePatterns(map: L.Map) {
  const svg = map.getPanes().overlayPane?.querySelector('svg');
  if (!svg) return;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  // One stripe pattern per category — used when data confidence is low
  const PATTERNS: Array<{ id: string; color: string }> = [
    { id: 'stripe-no_facilities', color: CATEGORY_META.no_facilities.color },
    { id: 'stripe-real_desert',   color: CATEGORY_META.real_desert.color },
    { id: 'stripe-hidden_risk',   color: CATEGORY_META.hidden_risk.color },
    { id: 'stripe-data_poor',     color: CATEGORY_META.data_poor.color },
    { id: 'stripe-adequate',      color: CATEGORY_META.adequate.color },
  ];

  for (const { id, color } of PATTERNS) {
    if (defs.querySelector(`#${id}`)) continue;

    const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pat.setAttribute('id', id);
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width', '8');
    pat.setAttribute('height', '8');
    pat.setAttribute('patternTransform', 'rotate(45)');

    // Faded background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '8'); bg.setAttribute('height', '8');
    bg.setAttribute('fill', color); bg.setAttribute('fill-opacity', '0.18');

    // Diagonal stripe
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
    line.setAttribute('x2', '0'); line.setAttribute('y2', '8');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-opacity', '0.75');

    pat.appendChild(bg);
    pat.appendChild(line);
    defs.appendChild(pat);
  }
}

function categoryStripeUrl(category: DistrictCategory): string {
  return `url(#stripe-${category})`;
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

    // Build lookup: normalised district name → coverage row + category
    const byName = new Map<string, DistrictCoverage & { category: DistrictCategory }>();
    for (const d of districts) {
      byName.set(norm(d.district), { ...d, category: categorizeDistrict(d) });
    }

    fetchDistricts()
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
              fillColor: isSparse ? categoryStripeUrl(row.category) : categoryColor(row.category),
              fillOpacity: isSparse ? 1 : 0.75,
              color: 'rgba(255,255,255,0.12)',
              weight: 0.8,
            };
          },
          onEachFeature: (feature, featureLayer) => {
            const name = feature?.properties?.district ?? '';
            const state = feature?.properties?.st_nm ?? '';
            const row = byName.get(norm(name));

            if (row) {
              const isSparse = row.confidence < 0.45;
              const meta = CATEGORY_META[row.category];
              featureLayer.bindTooltip(
                `<div style="min-width:180px">
                  <p style="font-weight:600;margin:0 0 3px">${row.district}</p>
                  <p style="color:#64748b;margin:0 0 5px;font-size:11px">${row.state}</p>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                    <span style="background:${meta.color};color:white;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px">
                      ${meta.shortLabel}
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
                    fillOpacity: isSparse ? 1 : 0.95,
                    weight: 2,
                    color: 'rgba(255,255,255,0.5)',
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
        injectStripePatterns(map);
        layerRef.current = layer;

        // Fit bounds to matched districts whenever a state filter is plausibly
        // active. Anything <100 districts is a single-state slice — zoom in so
        // the choropleth fills are actually visible. Nation-wide views (~500
        // rows) keep the default India view.
        const matched = districts.filter(d => byName.has(norm(d.district)));
        if (matched.length > 0 && districts.length < 100) {
          try {
            const fl = L.geoJSON({
              type: 'FeatureCollection',
              features: (geo as GeoJSON.FeatureCollection).features.filter(f =>
                byName.has(norm((f.properties as { district?: string })?.district ?? ''))
              ),
            } as GeoJSON.FeatureCollection);
            map.fitBounds(fl.getBounds(), { padding: [20, 20] });
          } catch (err) {
            console.warn('[CoverageMap] fitBounds failed', err);
          }
        }
      })
      .catch(err => {
        console.error('[CoverageMap] district choropleth render failed', err);
      });

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
    fetchStates()
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
      .catch(err => {
        console.error('[CoverageMap] state boundaries render failed', err);
      });
  }, [map]);
  return null;
}

export function CoverageMap({ districts, onDistrictClick }: Props) {
  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[22, 80]}
        zoom={5}
        minZoom={4}
        maxZoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        zoomControl={false}
        worldCopyJump={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          noWrap
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution=""
          pane="shadowPane"
          noWrap
        />
        <StateBoundaries />
        <ChoroplethLayer districts={districts} onDistrictClick={onDistrictClick} />
      </MapContainer>

      <MapLegend />
    </div>
  );
}

function MapLegend() {
  const categories: DistrictCategory[] = [
    'real_desert', 'hidden_risk', 'data_poor', 'no_facilities', 'adequate',
  ];
  return (
    <div className="absolute bottom-5 right-4 z-[9999] bg-[#1a1d23]/90 backdrop-blur rounded-lg px-3 py-2.5 text-xs border border-white/10 max-w-[260px]">
      <p className="font-semibold mb-2 text-white/50 uppercase tracking-widest text-[10px]">Categories</p>
      <div className="space-y-1.5">
        {categories.map(cat => {
          const meta = CATEGORY_META[cat];
          return (
            <div key={cat} className="flex items-start gap-2">
              <span className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5" style={{ background: meta.color }} />
              <div className="text-white/60 leading-tight">
                <p className="font-medium">{meta.label}</p>
                <p className="text-[10px] text-white/35 mt-0.5">{meta.description}</p>
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-white/10">
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#1e2433' }} />
          <span className="text-white/25 text-[10px]">No data</span>
        </div>
      </div>
    </div>
  );
}
