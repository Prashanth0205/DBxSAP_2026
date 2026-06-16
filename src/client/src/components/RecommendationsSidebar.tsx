import { useState, useEffect } from 'react';
import { DistrictCoverage } from '../lib/types';

interface Recommendation {
  type: 'upgrade' | 'equip' | 'new_facility' | 'data_action' | 'policy';
  title: string;
  detail: string;
  target: string | null;
  effort: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
  priority: number;
}

interface Props {
  district: DistrictCoverage;
  capability: string;
  onClose: () => void;
}

const TYPE_META: Record<Recommendation['type'], { icon: string; label: string; color: string }> = {
  upgrade:      { icon: '', label: 'Upgrade',       color: 'bg-blue-50 border-blue-200 text-blue-800' },
  equip:        { icon: '', label: 'Equip',          color: 'bg-purple-50 border-purple-200 text-purple-800' },
  new_facility: { icon: '', label: 'New Facility',   color: 'bg-red-50 border-red-200 text-red-800' },
  data_action:  { icon: '', label: 'Data Action',    color: 'bg-gray-50 border-gray-200 text-gray-700' },
  policy:       { icon: '', label: 'Policy',         color: 'bg-green-50 border-green-200 text-green-800' },
};

const EFFORT_COLOR: Record<string, string> = {
  Low: 'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
};

const IMPACT_COLOR: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Medium: 'bg-blue-100 text-blue-700',
  High: 'bg-emerald-100 text-emerald-700',
};

export function RecommendationsSidebar({ district, capability, onClose }: Props) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qp = new URLSearchParams({ capability, state: district.state });
    fetch(`/api/districts/${encodeURIComponent(district.district)}/recommendations?${qp}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecommendations(data.recommendations ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [district.district, district.state, capability]);

  return (
    <>
      {/* Backdrop — visual only; close via the X button. */}
      <div
        data-recommendations-sidebar
        className="fixed inset-0 bg-black/30 z-[9998] pointer-events-none"
      />

      {/* Slide-in sidebar from the right */}
      <div
        data-recommendations-sidebar
        className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-[9999] flex flex-col"
      >

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Planning Recommendations</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {district.district} · {district.state} · <span className="capitalize">{capability}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <svg className="animate-spin h-6 w-6 text-[#e07340]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-sm text-gray-400">Generating recommendations…</p>
              <p className="text-xs text-gray-300">Analysing facilities + health outcomes</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 rounded-lg text-sm text-red-600 border border-red-100">
              {error}
            </div>
          )}

          {!loading && !error && recommendations.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No recommendations generated.</p>
          )}

          {!loading && recommendations.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                {recommendations.length} recommendations · sorted by priority
              </p>

              {recommendations.map((rec, i) => {
                const meta = TYPE_META[rec.type] ?? TYPE_META.data_action;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 ${meta.color}`}
                  >
                    {/* Priority + type header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-gray-400">#{rec.priority}</span>
                      <span className="text-sm">{meta.icon && meta.icon}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                        {meta.label}
                      </span>
                      {rec.target && (
                        <span className="text-[11px] text-gray-500 truncate ml-auto max-w-[140px]">
                          {rec.target}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{rec.title}</h3>

                    {/* Detail */}
                    <p className="text-xs text-gray-600 leading-relaxed mb-3">{rec.detail}</p>

                    {/* Effort / Impact badges */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">Effort:</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${EFFORT_COLOR[rec.effort]}`}>
                        {rec.effort}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-2">Impact:</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${IMPACT_COLOR[rec.impact]}`}>
                        {rec.impact}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            Generated by AI using real facility data + NFHS-5 outcomes.
            Verify recommendations with local health officials before acting.
          </p>
        </div>
      </div>
    </>
  );
}
