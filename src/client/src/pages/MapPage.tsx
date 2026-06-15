import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CoverageMap } from '../components/CoverageMap';
import { CAPABILITY_TAGS, CoverageRegion, CapabilityTag } from '../lib/types';

export function MapPage() {
  const [capability, setCapability] = useState<CapabilityTag>('dialysis');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [allStates, setAllStates] = useState<string[]>([]);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [regions, setRegions] = useState<CoverageRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Load state list on mount
  useEffect(() => {
    fetch('/api/states')
      .then(r => r.json())
      .then(setAllStates)
      .catch(() => {
        // States API not yet available — that's fine during dev
      });
  }, []);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        capability,
        states: selectedStates.join(','),
        minConfidence: String(minConfidence),
      });
      const data: CoverageRegion[] = await fetch(`/api/coverage?${params}`).then(r => {
        if (!r.ok) throw new Error(`API error: ${r.statusText}`);
        return r.json();
      });
      setRegions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load coverage data');
    } finally {
      setLoading(false);
    }
  }

  function handleCityClick(city: string, state: string) {
    navigate(
      `/facility/list?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&capability=${capability}&minConfidence=${minConfidence}`
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Coverage Map</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select a capability and region to see where care exists — and where it doesn't.
          Faded markers mean sparse data; the gap may not be real.
        </p>
      </div>

      {/* Query Builder */}
      <div className="flex flex-wrap gap-4 items-end p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Capability</label>
          <select
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3621]"
            value={capability}
            onChange={e => setCapability(e.target.value as CapabilityTag)}
          >
            {CAPABILITY_TAGS.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            States (hold Ctrl/Cmd to multi-select)
          </label>
          <select
            multiple
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full h-20 focus:outline-none focus:ring-2 focus:ring-[#FF3621]"
            value={selectedStates}
            onChange={e =>
              setSelectedStates(Array.from(e.target.selectedOptions, o => o.value))
            }
          >
            {allStates.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Confidence: <span className="text-[#FF3621] font-semibold">{minConfidence.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={minConfidence}
            onChange={e => setMinConfidence(parseFloat(e.target.value))}
            className="w-36 accent-[#FF3621]"
          />
        </div>

        <button
          onClick={analyze}
          disabled={loading}
          className="px-5 py-2 bg-[#FF3621] text-white rounded-lg font-medium text-sm hover:bg-[#cc2b1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing…' : 'Analyze Coverage'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Map */}
      {regions.length > 0 ? (
        <>
          <CoverageMap regions={regions} onCityClick={handleCityClick} />
          <p className="text-xs text-gray-400">
            {regions.length} regions shown. Click any circle to drill into its facilities.
          </p>
        </>
      ) : (
        !loading && (
          <div className="h-64 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-400">
            Select a capability and click <span className="font-semibold mx-1">Analyze Coverage</span> to see the map.
          </div>
        )
      )}

      {loading && (
        <div className="h-64 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-[#FF3621]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading coverage data…
          </div>
        </div>
      )}
    </div>
  );
}
