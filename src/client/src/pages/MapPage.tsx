import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { CAPABILITY_TAGS, CapabilityTag } from '../lib/types';

export function MapPage() {
  const [capability, setCapability] = useState<CapabilityTag>('dialysis');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const navigate = useNavigate();

  const statesParams = useMemo(() => ({}), []);
  const { data: statesData, loading: statesLoading, error: statesError } =
    useAnalyticsQuery('states', statesParams);

  const allStates = useMemo(
    () => (statesData ?? []).map(r => r.state),
    [statesData]
  );

  function browseFacilities() {
    const params = new URLSearchParams({
      capability,
      state: selectedStates[0] ?? '',
      minConfidence: String(minConfidence),
    });
    navigate(`/facility/list?${params}`);
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
            disabled={statesLoading}
          >
            {allStates.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {statesError && (
            <p className="text-xs text-red-600 mt-1">Failed to load states: {statesError}</p>
          )}
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
          onClick={browseFacilities}
          className="px-5 py-2 bg-[#FF3621] text-white rounded-lg font-medium text-sm hover:bg-[#cc2b1a] transition-colors"
        >
          Browse Facilities
        </button>
      </div>

      {/* Coverage extraction pending banner */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm">
            <p className="font-semibold text-amber-900">Coverage extraction pending</p>
            <p className="text-amber-800 mt-1">
              The capability-tag heatmap requires running <code className="bg-amber-100 px-1 rounded text-xs">preprocessing/claude_batch.py</code> to
              extract structured capability tags from facility descriptions. This is a separate batch
              job (~$20, ~45 min). Until then, the <strong>facility browser</strong> and{' '}
              <strong>planning workspace</strong> remain fully functional — use them to filter and
              shortlist facilities by raw capability text.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
