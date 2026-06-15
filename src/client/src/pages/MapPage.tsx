import { useState } from 'react';
import { CoverageMap } from '../components/CoverageMap';
import { DistrictPopup } from '../components/DistrictPopup';
import { CAPABILITY_TAGS, DistrictCoverage, CapabilityTag, gapColor } from '../lib/types';

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

  const deserts = districts.filter(d => d.gap_score <= 1);
  const sorted = [...districts].sort((a, b) => a.gap_score - b.gap_score);

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
              <option value="">Select a state…</option>
              {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <button
            onClick={analyze}
            disabled={loading || !state}
            className="w-full py-2 bg-[#e07340] hover:bg-[#c8612e] text-white rounded text-xs font-semibold tracking-wide transition-colors disabled:opacity-40"
          >
            {loading ? 'Analyzing…' : 'Analyze Coverage'}
          </button>

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* Summary stats */}
        {districts.length > 0 && (
          <div className="flex-shrink-0 grid grid-cols-2 gap-px bg-white/8 border-b border-white/8">
            <StatCell label="Districts" value={districts.length} />
            <StatCell label="Deserts" value={deserts.length} accent />
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
                Worst gaps
              </p>
              {sorted.slice(0, 30).map((d, i) => (
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
                      {d.confidence < 0.45 && (
                        <span className="text-amber-500/70 text-[10px]">~</span>
                      )}
                      <GapBar score={d.gap_score} />
                    </div>
                  </div>
                </button>
              ))}
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

function StatCell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-[#0e1117] px-4 py-3">
      <p className="text-[10px] text-white/35 uppercase tracking-widest">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${accent ? 'text-[#e07340]' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function GapBar({ score }: { score: number }) {
  const w = Math.max(3, Math.round((score / 10) * 28));
  return (
    <div className="w-7 h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${(score / 10) * 100}%`, background: gapColor(score) }}
      />
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
