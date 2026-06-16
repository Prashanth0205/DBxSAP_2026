import { useState } from 'react';
import { CoverageMap } from '../components/CoverageMap';
import { DistrictPopup } from '../components/DistrictPopup';
import {
  CAPABILITY_TAGS, DistrictCoverage, CapabilityTag,
  categorizeDistrict, CATEGORY_META, DistrictCategory,
} from '../lib/types';

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
];

export function MapPage() {
  const [capability, setCapability] = useState<CapabilityTag>('maternity');
  const [state, setState] = useState('');
  const [districts, setDistricts] = useState<DistrictCoverage[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictCoverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ capability });
      if (state) params.set('state', state);
      const data: DistrictCoverage[] = await fetch(`/api/coverage?${params}`).then(r => {
        if (!r.ok) throw new Error(`API ${r.status}: ${r.statusText}`);
        return r.json();
      });
      setDistricts(data);
      setHasQueried(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function handleDistrictClick(districtName: string, districtState: string) {
    const district = districts.find(d => d.district === districtName && d.state === districtState);
    if (district) {
      setSelectedDistrict(district);
    }
  }

  const categorized = districts.map(d => ({ ...d, category: categorizeDistrict(d) }));
  const counts: Record<DistrictCategory, number> = {
    no_facilities: 0, real_desert: 0, data_poor: 0, hidden_risk: 0, adequate: 0,
  };
  categorized.forEach(d => { counts[d.category]++; });

  // Sort: real_desert > hidden_risk > no_facilities > data_poor > adequate,
  // then by gap_score asc. no_facilities sits above data_poor so the planner
  // sees outright-zero districts before under-sampled ones.
  const categoryOrder: Record<DistrictCategory, number> = {
    real_desert: 0, hidden_risk: 1, no_facilities: 2, data_poor: 3, adequate: 4,
  };
  const sorted = [...categorized].sort((a, b) => {
    const co = categoryOrder[a.category] - categoryOrder[b.category];
    if (co !== 0) return co;
    return a.gap_score - b.gap_score;
  });

  const totalFacilities = districts.reduce((s, d) => s + d.total_facilities, 0);
  const districtsWithFacilities = districts.filter(d => d.total_facilities > 0).length;

  return (
    <div className="h-full flex">
      {/* ── Left sidebar ── */}
      <aside className="w-72 flex-shrink-0 flex flex-col bg-[#0e1117] border-r border-white/8 overflow-hidden">

        {/* Controls */}
        <div className="flex-shrink-0 p-4 border-b border-white/8 space-y-4">
          {/* Capability */}
          <div>
            <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
              Capability
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CAPABILITY_TAGS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setCapability(t.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    capability === t.value
                      ? 'bg-[#e07340] text-white'
                      : 'bg-white/6 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* State filter */}
          <div>
            <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
              State
            </label>
            <select
              className="w-full bg-white/6 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/70 focus:outline-none focus:border-[#e07340]/60 appearance-none"
              value={state}
              onChange={e => setState(e.target.value)}
            >
              <option value="">All states</option>
              {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <button
            onClick={analyze}
            disabled={loading}
            className="w-full py-2 bg-[#e07340] hover:bg-[#c8612e] text-white rounded text-xs font-semibold tracking-wide transition-colors disabled:opacity-40"
          >
            {loading ? 'Analyzing…' : 'Analyze Coverage'}
          </button>

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* Category breakdown */}
        {districts.length > 0 && (
          <div className="flex-shrink-0 border-b border-white/8 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">
              Categories
            </p>
            <CategoryRow category="adequate"      count={counts.adequate} />
            <CategoryRow category="hidden_risk"   count={counts.hidden_risk} />
            <CategoryRow category="real_desert"   count={counts.real_desert} />

            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5 pt-2 mt-1 border-t border-white/8">
              Other
            </p>
            <CategoryRow category="no_facilities" count={counts.no_facilities} />
            <CategoryRow category="data_poor"     count={counts.data_poor} />

            <p className="text-[10px] text-white/35 leading-snug pt-2 mt-1 border-t border-white/8">
              Coverage based on <span className="text-white/55 font-semibold">{totalFacilities.toLocaleString()}</span> facility records
              across <span className="text-white/55 font-semibold">{districtsWithFacilities}</span>/<span className="text-white/55 font-semibold">{districts.length}</span> districts.
              {counts.no_facilities > 0 && (
                <> <span className="text-white/55 font-semibold">{counts.no_facilities}</span> districts have no records — these may indicate true care deserts OR data-collection gaps.</>
              )}
            </p>
          </div>
        )}

        {/* Ranked district list */}
        <div className="flex-1 overflow-y-auto">
          {districts.length === 0 && !loading ? (
            <div className="p-5 text-center text-white/25 text-xs leading-relaxed mt-6">
              Select a capability<br />and run analysis
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-24">
              <Spinner />
            </div>
          ) : (
            <div>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                Districts by priority
              </p>
              {sorted.slice(0, 30).map((d, i) => {
                const meta = CATEGORY_META[d.category];
                return (
                  <button
                    key={i}
                    onClick={() => handleDistrictClick(d.district, d.state)}
                    className="w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white/80 group-hover:text-white truncate">
                          {d.district}
                        </p>
                        <p className="text-[10px] text-white/35 truncate">{d.state}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: meta.color + '33', color: meta.color }}
                        >
                          {meta.shortLabel}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ── Map panel ── */}
      <div className="flex-1 relative min-w-0">
        {!hasQueried ? (
          <MapPlaceholder />
        ) : (
          <CoverageMap districts={districts} onDistrictClick={handleDistrictClick} />
        )}

        {/* District Popup Overlay */}
        {selectedDistrict && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-[10000] pointer-events-none">
            <div className="pointer-events-auto">
              <DistrictPopup
                district={selectedDistrict}
                capability={capability}
                onClose={() => setSelectedDistrict(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Micro components ──────────────────────────────────────────────────────

function CategoryRow({ category, count }: { category: DistrictCategory; count: number }) {
  const meta = CATEGORY_META[category];
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: meta.color }}
        />
        <span className="text-white/70 truncate">{meta.label}</span>
      </div>
      <span className="text-white font-semibold tabular-nums">{count}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function MapPlaceholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3 bg-[#111318]">
      <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </div>
      <p className="text-white/25 text-sm">Select a capability and run analysis</p>
    </div>
  );
}
