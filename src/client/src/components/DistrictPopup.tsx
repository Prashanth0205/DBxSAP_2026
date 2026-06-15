import { useState, useEffect } from 'react';
import { DistrictCoverage, gapColor } from '../lib/types';

interface Props {
  district: DistrictCoverage;
  capability: string;
  onClose: () => void;
}

interface Assessment {
  verdict: string;
  verdict_label: string;
  confidence: string;
  summary: string;
  sources: { type: string; ref: string; detail: string }[];
}

export function DistrictPopup({ district, capability, onClose }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);

  useEffect(() => {
    if (expanded && !assessment && !loadingAssessment) {
      loadAssessment();
    }
  }, [expanded]);

  async function loadAssessment() {
    setLoadingAssessment(true);
    try {
      const params = new URLSearchParams({
        capability,
        state: district.state,
      });
      const eventSource = new EventSource(`/api/districts/${encodeURIComponent(district.district)}/assessment?${params}`);

      eventSource.addEventListener('assessment', (e) => {
        const data = JSON.parse(e.data);
        setAssessment(data);
        eventSource.close();
      });

      eventSource.addEventListener('done', () => {
        eventSource.close();
        setLoadingAssessment(false);
      });

      eventSource.onerror = () => {
        eventSource.close();
        setLoadingAssessment(false);
      };
    } catch (e) {
      setLoadingAssessment(false);
    }
  }

  const statusBadge = district.gap_score <= 1
    ? { label: '🚨 Critical Gap', color: 'bg-red-500' }
    : district.gap_score <= 3
    ? { label: '⚠️ High Risk', color: 'bg-orange-500' }
    : district.gap_score <= 6
    ? { label: '📋 Moderate', color: 'bg-yellow-500' }
    : { label: '✅ Adequate', color: 'bg-green-500' };

  if (!expanded) {
    return (
      <div className="bg-white rounded-lg shadow-2xl p-4 min-w-[280px] max-w-sm border border-gray-200">
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{district.district}</h3>
            <p className="text-sm text-gray-500">{district.state}</p>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="px-2 py-0.5 rounded text-xs font-bold text-white"
              style={{ background: gapColor(district.gap_score) }}
            >
              {district.gap_score.toFixed(1)}
            </div>
            <span className="text-sm text-gray-600">
              {district.matching_facilities}/{district.total_facilities} facilities
            </span>
          </div>

          <div className={`px-2 py-1 rounded text-xs font-medium text-white ${statusBadge.color}`}>
            {statusBadge.label}
          </div>

          <button
            onClick={() => setExpanded(true)}
            className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
          >
            See Details ▼
          </button>
        </div>

        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-2xl p-5 w-[450px] max-h-[600px] overflow-y-auto border border-gray-200">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{district.district}</h3>
            <p className="text-sm text-gray-500">{district.state}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="px-2 py-1 rounded text-sm font-bold text-white"
              style={{ background: gapColor(district.gap_score) }}
            >
              Gap Score: {district.gap_score.toFixed(1)}/10
            </div>
            <div className={`px-2 py-1 rounded text-xs font-medium text-white ${statusBadge.color}`}>
              {statusBadge.label}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-gray-500 text-xs">Total Facilities</p>
              <p className="font-bold text-gray-900">{district.total_facilities}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-gray-500 text-xs">Matching</p>
              <p className="font-bold text-gray-900">{district.matching_facilities}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-gray-500 text-xs">Confidence</p>
              <p className="font-bold text-gray-900">{Math.round(district.confidence * 100)}%</p>
            </div>
            {district.institutional_birth_5y_pct != null && (
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-gray-500 text-xs">Inst. Births</p>
                <p className="font-bold text-gray-900">{district.institutional_birth_5y_pct}%</p>
              </div>
            )}
          </div>
        </div>

        {loadingAssessment && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Running AI assessment...
            </div>
          </div>
        )}

        {assessment && (
          <div className="border-t pt-4 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">💡 AI ANALYSIS</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{assessment.summary}</p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">📊 VERDICT</h4>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3">
                <p className="text-sm font-semibold text-blue-900">{assessment.verdict_label}</p>
                <p className="text-xs text-blue-700 mt-1">Confidence: {assessment.confidence}</p>
              </div>
            </div>

            {assessment.sources && assessment.sources.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2">🔗 SOURCES</h4>
                <div className="space-y-2">
                  {assessment.sources.map((source, i) => (
                    <div key={i} className="bg-gray-50 p-2 rounded text-xs">
                      <div className="flex items-start gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          source.type === 'database' ? 'bg-blue-200 text-blue-800' : 'bg-green-200 text-green-800'
                        }`}>
                          {source.type.toUpperCase()}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{source.ref}</p>
                          <p className="text-gray-600 mt-1">{source.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setExpanded(false)}
          className="w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors mt-4"
        >
          Collapse ▲
        </button>
      </div>
    </div>
  );
}
