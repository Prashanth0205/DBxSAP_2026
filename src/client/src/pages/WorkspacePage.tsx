import { useState, useEffect } from 'react';
import { Scenario, CreateScenarioRequest, CAPABILITY_TAGS, gapColor, confidenceBadgeClass } from '../lib/types';

export function WorkspacePage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<CreateScenarioRequest>>({
    name: '', capability: 'maternity', district: '', state: '', note: '',
  });

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

  return (
    <div className="h-full bg-[#0e1117] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
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
                <FieldLabel>District</FieldLabel>
                <input className={input} placeholder="e.g. Nandurbar" value={form.district ?? ''}
                  onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>State</FieldLabel>
                <input className={input} placeholder="e.g. Maharashtra" value={form.state ?? ''}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
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
            {scenarios.map(s => <ScenarioRow key={s.id} scenario={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioRow({ scenario: s }: { scenario: Scenario }) {
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

const input = 'mt-1 w-full bg-white/6 border border-white/10 rounded px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-[#e07340]/50';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest">{children}</label>;
}
