import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CAPABILITY_TAGS, CapabilityTag, Scenario, ShortlistItem } from '../lib/types';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface NewScenarioForm {
  name: string;
  capability_filter: CapabilityTag;
  states_filter: string;
  min_confidence: number;
  notes: string;
}

const EMPTY_FORM: NewScenarioForm = {
  name: '',
  capability_filter: 'dialysis',
  states_filter: '',
  min_confidence: 0.5,
  notes: '',
};

export function WorkspacePage() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<NewScenarioForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  async function loadScenarios() {
    try {
      const data = await jsonFetch<Scenario[]>('/api/scenarios');
      setScenarios(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scenarios');
      setScenarios([]);
    }
  }

  useEffect(() => {
    void loadScenarios();
  }, []);

  async function createScenario() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await jsonFetch<Scenario>('/api/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          capability_filter: form.capability_filter,
          states_filter: form.states_filter
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          min_confidence: form.min_confidence,
          notes: form.notes.trim(),
        }),
      });
      setForm(EMPTY_FORM);
      await loadScenarios();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create scenario');
    } finally {
      setCreating(false);
    }
  }

  async function deleteScenario(id: string) {
    if (!confirm('Delete this scenario and all its shortlist items?')) return;
    try {
      await jsonFetch(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (expandedId === id) setExpandedId(null);
      await loadScenarios();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete scenario');
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Planning Workspace</h2>
        <p className="text-sm text-gray-500 mt-1">
          Save coverage queries as scenarios, then build a shortlist of facilities to act on.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* New scenario form */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">New scenario</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Maternity Gaps — Madhya Pradesh"
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3621]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Capability</label>
            <select
              value={form.capability_filter}
              onChange={e => setForm({ ...form, capability_filter: e.target.value as CapabilityTag })}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              {CAPABILITY_TAGS.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              States (comma-separated)
            </label>
            <input
              type="text"
              value={form.states_filter}
              onChange={e => setForm({ ...form, states_filter: e.target.value })}
              placeholder="Uttar Pradesh, Bihar"
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Min confidence: <span className="text-[#FF3621] font-semibold">{form.min_confidence.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={form.min_confidence}
              onChange={e => setForm({ ...form, min_confidence: parseFloat(e.target.value) })}
              className="w-full accent-[#FF3621]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={createScenario}
            disabled={creating || !form.name.trim()}
            className="px-5 py-2 bg-[#FF3621] text-white rounded-lg font-medium text-sm hover:bg-[#cc2b1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating…' : 'Create scenario'}
          </button>
        </div>
      </section>

      {/* Scenario list */}
      <section>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Saved scenarios</h3>
        {scenarios === null ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : scenarios.length === 0 ? (
          <div className="p-6 bg-white border border-gray-200 rounded-lg text-gray-500 text-sm">
            No scenarios yet. Create one above to get started.
          </div>
        ) : (
          <ul className="space-y-3">
            {scenarios.map(s => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                expanded={expandedId === s.id}
                onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                onDelete={() => deleteScenario(s.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScenarioCard({
  scenario,
  expanded,
  onToggle,
  onDelete,
}: {
  scenario: Scenario;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [shortlist, setShortlist] = useState<ShortlistItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadShortlist() {
    try {
      const data = await jsonFetch<ShortlistItem[]>(
        `/api/scenarios/${encodeURIComponent(scenario.id)}/shortlist`
      );
      setShortlist(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load shortlist');
      setShortlist([]);
    }
  }

  useEffect(() => {
    if (expanded && shortlist === null) {
      void loadShortlist();
    }
  }, [expanded]);

  async function removeItem(itemId: string) {
    try {
      await jsonFetch(
        `/api/scenarios/${encodeURIComponent(scenario.id)}/shortlist/${encodeURIComponent(itemId)}`,
        { method: 'DELETE' }
      );
      await loadShortlist();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to remove');
    }
  }

  const states = Array.isArray(scenario.states_filter)
    ? scenario.states_filter
    : [];

  return (
    <li className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="p-4 flex items-start justify-between">
        <div className="flex-1">
          <button
            onClick={onToggle}
            className="text-left w-full"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{expanded ? '▾' : '▸'}</span>
              <h4 className="font-semibold text-gray-900">{scenario.name}</h4>
            </div>
            <div className="ml-7 mt-1 flex flex-wrap gap-2 text-xs">
              <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded">
                {scenario.capability_filter.replace(/_/g, ' ')}
              </span>
              {states.map(st => (
                <span
                  key={st}
                  className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 border border-gray-200 rounded"
                >
                  {st}
                </span>
              ))}
              <span className="text-gray-500">
                min confidence ≥ {scenario.min_confidence.toFixed(2)}
              </span>
            </div>
            {scenario.notes && (
              <p className="ml-7 mt-1 text-sm text-gray-600">{scenario.notes}</p>
            )}
          </button>
        </div>
        <button
          onClick={onDelete}
          className="ml-3 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200"
        >
          Delete
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-semibold text-gray-700">Shortlist</h5>
            <Link
              to={`/facility/list?capability=${encodeURIComponent(scenario.capability_filter)}&state=${encodeURIComponent(states[0] ?? '')}`}
              className="text-xs text-[#FF3621] hover:underline"
            >
              Browse facilities matching this scenario →
            </Link>
          </div>

          {loadError && (
            <p className="text-xs text-red-600 mb-2">{loadError}</p>
          )}

          {shortlist === null ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : shortlist.length === 0 ? (
            <p className="text-sm text-gray-500">
              No facilities shortlisted yet. Open a facility from the list and add it.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {shortlist.map(item => (
                <li
                  key={item.id}
                  className="flex items-start justify-between bg-white border border-gray-200 rounded px-3 py-2"
                >
                  <div className="flex-1">
                    <Link
                      to={`/facility/${encodeURIComponent(item.facility_id)}`}
                      className="text-sm font-medium text-[#FF3621] hover:underline"
                    >
                      {item.facility_name}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {item.city}{item.city && item.state ? ', ' : ''}{item.state}
                      {' • priority '}{item.priority}
                    </p>
                    {item.user_note && (
                      <p className="text-xs text-gray-600 mt-0.5">{item.user_note}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="ml-3 text-xs text-gray-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
