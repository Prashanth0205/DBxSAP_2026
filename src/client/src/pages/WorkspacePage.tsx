import { useState, useEffect } from 'react';
import { Scenario, ScenarioDiffCity, CreateScenarioRequest, CAPABILITY_TAGS, gapColor, confidenceBadgeClass, DistrictCoverage } from '../lib/types';
import { ScenarioDiffMap } from '../components/ScenarioDiffMap';
import { useStarred, StarredDistrict } from '../lib/starred';
import { RecommendationsSidebar } from '../components/RecommendationsSidebar';

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
];

export function WorkspacePage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<CreateScenarioRequest>>({
    name: '', capability: 'maternity', district: '', state: '', note: '',
  });
  const { starred, remove, clear } = useStarred();

  // Scenario diff state
  const [diffA, setDiffA] = useState<number | ''>('');
  const [diffB, setDiffB] = useState<number | ''>('');
  const [diffCities, setDiffCities] = useState<ScenarioDiffCity[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [hasCompared, setHasCompared] = useState(false);

  // Recommendations state
  const [recScenario, setRecScenario] = useState<Scenario | null>(null);

  // Dynamic districts list for the form dropdown
  const [formDistricts, setFormDistricts] = useState<string[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  useEffect(() => {
    if (!form.state || !form.capability) { setFormDistricts([]); return; }
    setLoadingDistricts(true);
    setForm(f => ({ ...f, district: '' }));
    fetch(`/api/coverage?capability=${form.capability}&state=${encodeURIComponent(form.state)}`)
      .then(r => r.json())
      .then((rows: DistrictCoverage[]) => {
        const sorted = [...rows].sort((a, b) => a.gap_score - b.gap_score);
        setFormDistricts(sorted.map(r => r.district));
      })
      .catch(() => setFormDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, [form.state, form.capability]);

  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.json())
      .then(setScenarios)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveScenario() {
    if (!form.name || !form.capability) return;
    setSaving(true);
    try {
      const created: Scenario = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); });
      setScenarios(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ name: '', capability: 'maternity', district: '', state: '', note: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function compareScenarios() {
    if (!diffA || !diffB) return;
    setDiffLoading(true);
    try {
      const data: ScenarioDiffCity[] = await fetch(
        `/api/scenarios/diff?a=${diffA}&b=${diffB}`
      ).then(r => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); });
      setDiffCities(data);
      setHasCompared(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compare');
    } finally {
      setDiffLoading(false);
    }
  }

  const scenarioA = scenarios.find(s => s.id === diffA);
  const scenarioB = scenarios.find(s => s.id === diffB);

  return (
    <div className="h-full bg-[#0e1117] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-lg">Planning Workspace</h2>
            <p className="text-white/35 text-sm mt-0.5">Save priority districts for funding decisions.</p>
          </div>
          <button
            onClick={() => setShowForm(x => !x)}
            className="px-3.5 py-2 bg-[#e07340] hover:bg-[#c8612e] text-white rounded text-xs font-semibold transition-colors"
          >
            + New
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Starred districts */}
        {starred.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                  Starred Districts <span className="text-amber-400">★</span> {starred.length}
                </p>
                <p className="text-xs text-white/25 mt-0.5">Saved from the coverage map. Use these as candidates when creating a scenario.</p>
              </div>
              <button
                onClick={clear}
                className="text-[10px] text-white/30 hover:text-white/60 uppercase tracking-wide"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-2">
              {starred.map(s => <StarredRow key={s.key} entry={s} onRemove={() => remove(s.key)} />)}
            </div>
          </div>
        )}

        {/* New scenario form */}
        {showForm && (
          <div className="bg-white/4 border border-white/10 rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">New Scenario</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldLabel>Name</FieldLabel>
                <input className={input} placeholder="e.g. Q3 Maternity — Nandurbar" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Capability</FieldLabel>
                <select className={input} value={form.capability}
                  onChange={e => setForm(f => ({ ...f, capability: e.target.value }))}>
                  {CAPABILITY_TAGS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>State</FieldLabel>
                <select className={input} value={form.state ?? ''}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value, district: '' }))}>
                  <option value="">Select state…</option>
                  {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>District {loadingDistricts && <span className="text-white/25 normal-case tracking-normal font-normal ml-1">loading…</span>}</FieldLabel>
                <select className={input} value={form.district ?? ''}
                  onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                  disabled={!form.state || loadingDistricts}>
                  <option value="">{form.state ? (loadingDistricts ? 'Loading…' : 'Select district…') : 'Select state first'}</option>
                  {formDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Note</FieldLabel>
                <input className={input} placeholder="Rationale…" value={form.note ?? ''}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={saveScenario} disabled={saving || !form.name}
                className="px-4 py-1.5 bg-[#e07340] text-white rounded text-xs font-semibold disabled:opacity-40 transition-colors hover:bg-[#c8612e]">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="text-xs text-white/30 hover:text-white/60">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Scenario list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-20 text-white/20 text-sm">
            No scenarios saved yet.
          </div>
        ) : (
          <div className="space-y-2">
            {scenarios.map(s => (
              <ScenarioRow
                key={s.id}
                scenario={s}
                onViewRecommendations={s.district && s.state ? () => setRecScenario(s) : undefined}
              />
            ))}
          </div>
        )}

        {/* Scenario comparison */}
        {scenarios.length >= 2 && (
          <div className="space-y-4 pt-2 border-t border-white/8">
            <div>
              <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Compare Scenarios</p>
              <p className="text-xs text-white/25 mt-1">See which districts appear in both plans vs each alone.</p>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <FieldLabel>Scenario A</FieldLabel>
                <select
                  className={input}
                  value={diffA}
                  onChange={e => setDiffA(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Select…</option>
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <FieldLabel>Scenario B</FieldLabel>
                <select
                  className={input}
                  value={diffB}
                  onChange={e => setDiffB(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Select…</option>
                  {scenarios.filter(s => s.id !== diffA).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={compareScenarios}
                disabled={!diffA || !diffB || diffA === diffB || diffLoading}
                className="px-4 py-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {diffLoading && (
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                Compare
              </button>
            </div>

            <ScenarioDiffMap
              cities={diffCities}
              labelA={scenarioA?.name ?? 'Scenario A'}
              labelB={scenarioB?.name ?? 'Scenario B'}
              hasQueried={hasCompared}
            />
          </div>
        )}
      </div>

      {/* Recommendations sidebar — triggered from a scenario row */}
      {recScenario && recScenario.district && recScenario.state && (
        <RecommendationsSidebar
          district={{
            district: recScenario.district,
            state: recScenario.state,
            capability: recScenario.capability,
            gap_score: recScenario.gap_score ?? 0,
            confidence: recScenario.confidence ?? 0,
            total_facilities: 0,
            matching_facilities: 0,
            institutional_birth_5y_pct: null,
            child_stunting_pct: null,
            hh_electricity_pct: null,
            hh_improved_water_pct: null,
            hh_use_improved_sanitation_pct: null,
          } as DistrictCoverage}
          capability={recScenario.capability}
          onClose={() => setRecScenario(null)}
        />
      )}
    </div>
  );
}

function ScenarioRow({ scenario: s, onViewRecommendations }: { scenario: Scenario; onViewRecommendations?: () => void }) {
  const date = new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="bg-white/4 border border-white/8 rounded-lg px-4 py-3.5 hover:border-white/15 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white/80">{s.name}</p>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/8 text-white/40 capitalize">{s.capability}</span>
          </div>
          {(s.district || s.state) && (
            <p className="text-xs text-white/35 mt-0.5">{[s.district, s.state].filter(Boolean).join(', ')}</p>
          )}
          {s.note && <p className="text-xs text-white/30 mt-1 italic">{s.note}</p>}
          {onViewRecommendations && (
            <button
              onClick={onViewRecommendations}
              className="mt-2 text-[11px] font-medium text-[#e07340] hover:text-[#c9632f] transition-colors"
            >
              View Recommendations →
            </button>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          {s.gap_score != null && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
              style={{ background: gapColor(s.gap_score) }}>
              {s.gap_score.toFixed(1)}
            </span>
          )}
          {s.confidence != null && (
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${confidenceBadgeClass(s.confidence)}`}>
              {(s.confidence * 100).toFixed(0)}%
            </span>
          )}
          <p className="text-[10px] text-white/20">{date}</p>
        </div>
      </div>
    </div>
  );
}

function StarredRow({ entry, onRemove }: { entry: StarredDistrict; onRemove: () => void }) {
  const date = new Date(entry.starred_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 hover:border-amber-500/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-amber-400 text-sm">★</span>
            <p className="text-sm font-medium text-white/80">{entry.district}</p>
            <span className="text-[10px] text-white/35">{entry.state}</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/8 text-white/40 capitalize">{entry.capability}</span>
          </div>
          <p className="text-xs text-white/35 mt-1">
            {entry.matching_facilities}/{entry.total_facilities} matching facilities
            <span className="text-white/20"> · starred {date}</span>
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
            style={{ background: gapColor(entry.gap_score) }}>
            {entry.gap_score.toFixed(1)}
          </span>
          <button
            onClick={onRemove}
            className="text-white/30 hover:text-red-400 text-sm leading-none px-1"
            aria-label="Remove from shortlist"
            title="Remove from shortlist"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

const input = 'mt-1 w-full bg-white/6 border border-white/10 rounded px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-[#e07340]/50';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest">{children}</label>;
}
