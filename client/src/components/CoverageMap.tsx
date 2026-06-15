import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { CoverageRegion, confidenceColor } from '../lib/types';

interface Props {
  regions: CoverageRegion[];
  onCityClick: (city: string, state: string) => void;
}

export function CoverageMap({ regions, onCityClick }: Props) {
  return (
    <div className="relative">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '520px', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
        />

        {regions.map((r, i) => {
          const isSparse = r.field_coverage_pct < 0.5;
          const color = confidenceColor(r.avg_confidence);
          // Scale radius by facility count, min 6px
          const radius = Math.min(24, Math.max(6, r.facility_count * 1.5));

          return (
            <CircleMarker
              key={i}
              center={[r.latitude, r.longitude]}
              radius={radius}
              pathOptions={{
                color: isSparse ? '#999' : 'black',
                weight: isSparse ? 0.5 : 1,
                fillColor: color,
                // Faded = data sparse, we're not sure the gap is real
                fillOpacity: isSparse ? 0.25 : 0.75,
                dashArray: isSparse ? '4 4' : undefined,
              }}
              eventHandlers={{
                click: () => onCityClick(r.city, r.state),
              }}
            >
              <Tooltip>
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold">{r.city}, {r.state}</p>
                  <p>Facilities: {r.facility_count}</p>
                  <p>
                    Avg confidence:{' '}
                    <span style={{ color: confidenceColor(r.avg_confidence) }}>
                      {r.avg_confidence.toFixed(2)}
                    </span>
                  </p>
                  {isSparse ? (
                    <p className="text-yellow-600 font-medium">
                      ⚠️ Sparse data — only {Math.round(r.field_coverage_pct * 100)}% of
                      facilities report equipment. Gap may not be real.
                    </p>
                  ) : (
                    <p className="text-green-600">
                      ✓ Good data coverage ({Math.round(r.field_coverage_pct * 100)}%)
                    </p>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <MapLegend />
    </div>
  );
}

function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-[9999] bg-white rounded-lg px-3 py-2.5 shadow-md text-xs border border-gray-200">
      <p className="font-semibold mb-1.5 text-gray-700">Coverage Confidence</p>
      <div className="space-y-1 text-gray-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-[#2ecc71]" />
          High — strong facility evidence
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-[#f39c12]" />
          Medium — partial evidence
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-[#e74c3c]" />
          Gap — low or no coverage
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-[#e74c3c] opacity-30 border border-dashed border-gray-400" />
          <span className="text-gray-400">Faded/dashed = sparse data (uncertain)</span>
        </div>
      </div>
    </div>
  );
}
