import { useState, useEffect } from 'react';
import {
  DistrictCoverage, categorizeDistrict, CATEGORY_META,
  CapabilityTag, capabilityRelevantStats, statColor, CapabilityStat,
} from '../lib/types';

interface Props {
  district: DistrictCoverage;
  capability: CapabilityTag;
  onClose: () => void;
}

interface Assessment {
  verdict: string;
  verdict_label: string;
  confidence: string;
  summary: string;
  inconsistencies?: string[];
  sources: { type: string; ref: string; detail: string }[];
}

export function DistrictPopup({ district, capability, onClose }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);

  const category = categorizeDistrict(district);
  const categoryMeta = CATEGORY_META[category];
  const capabilityStats = capabilityRelevantStats(capability, district);

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
        setLoadingAssessment(false);
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

  if (!expanded) {
    return (
      <div className="relative bg-white rounded-lg shadow-2xl p-4 min-w-[280px] max-w-sm border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none w-6 h-6 flex items-center justify-center"
        >
          ✕
        </button>

        <div className="space-y-3">
          <div className="pr-6">
            <h3 className="text-lg font-bold text-gray-900">{district.district}</h3>
            <p className="text-sm text-gray-500">{district.state}</p>
          </div>

          <div
            className="px-2.5 py-1 rounded text-xs font-semibold text-white inline-block"
            style={{ background: categoryMeta.color }}
          >
            {categoryMeta.label}
          </div>

          <div className="text-sm text-gray-600">
            {district.matching_facilities}/{district.total_facilities} matching facilities
          </div>

          <button
            onClick={() => setExpanded(true)}
            className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors border border-blue-200"
          >
            See Details ▼
          </button>
        </div>
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
            className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div>
            <div
              className="px-3 py-1.5 rounded text-sm font-semibold text-white inline-block"
              style={{ background: categoryMeta.color }}
            >
              {categoryMeta.label}
            </div>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              {categoryMeta.description}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-gray-500 text-xs">Total Facilities</p>
              <p className="font-bold text-gray-900">{district.total_facilities}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-gray-500 text-xs">Matching</p>
              <p className="font-bold text-gray-900">{district.matching_facilities}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-gray-500 text-xs">Data Confidence</p>
              <p className="font-bold text-gray-900">{Math.round(district.confidence * 100)}%</p>
            </div>
          </div>

          <CapabilityIndicatorsBox capability={capability} stats={capabilityStats} />
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
              <h4 className="text-sm font-bold text-gray-700 mb-2">AI ANALYSIS</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{assessment.summary}</p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">VERDICT</h4>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3">
                <p className="text-sm font-semibold text-blue-900">{assessment.verdict_label}</p>
                <p className="text-xs text-blue-700 mt-1">Confidence: {assessment.confidence}</p>
              </div>
            </div>

            {assessment.inconsistencies && assessment.inconsistencies.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2">DATA INCONSISTENCIES</h4>
                <div className="bg-amber-50 border-l-4 border-amber-500 p-3">
                  <ul className="space-y-1.5">
                    {assessment.inconsistencies.map((item, i) => (
                      <li key={i} className="text-xs text-amber-900 flex items-start gap-2">
                        <span className="text-amber-600 mt-0.5">⚠</span>
                        <span className="flex-1 leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <SourcesSection sources={assessment.sources || []} />
          </div>
        )}

        <button
          onClick={() => setExpanded(false)}
          className="w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors mt-4 border border-gray-200"
        >
          Collapse ▲
        </button>
      </div>
    </div>
  );
}

function SourcesSection({ sources }: { sources: { type: string; ref: string; detail: string }[] }) {
  const dbSources = sources.filter(s => s.type === 'database');
  const webSources = sources.filter(s => s.type === 'web');

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">DATABASE SOURCES</h4>
        {dbSources.length > 0 ? (
          <div className="space-y-2">
            {dbSources.map((source, i) => (
              <div key={i} className="bg-gray-50 p-2 rounded text-xs">
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-200 text-blue-800">
                    DATABASE
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{source.ref}</p>
                    <p className="text-gray-600 mt-1">{source.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">
            No database evidence available for this district.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">WEB SOURCES</h4>
        {webSources.length > 0 ? (
          <div className="space-y-2">
            {webSources.map((source, i) => {
              // Try to find a URL in either ref or detail
              const urlMatch =
                source.ref.match(/https?:\/\/\S+/i)?.[0] ||
                source.detail.match(/https?:\/\/\S+/i)?.[0] ||
                null;
              // Use whatever ISN'T the URL as the title
              const title = urlMatch && source.ref === urlMatch ? source.detail : source.ref;
              const subtitle = urlMatch && source.detail !== urlMatch ? source.detail : '';

              return (
                <div key={i} className="bg-gray-50 p-2 rounded text-xs">
                  <div className="flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-200 text-green-800">
                      WEB
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{title}</p>
                      {subtitle && subtitle !== title && (
                        <p className="text-gray-600 mt-1">{subtitle}</p>
                      )}
                      {urlMatch && (
                        <a
                          href={urlMatch}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline break-all mt-1 inline-block"
                        >
                          {urlMatch}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">
            No relevant web articles found for this district.
          </p>
        )}
      </div>
    </div>
  );
}

const CAPABILITY_BOX_LABEL: Record<CapabilityTag, string> = {
  maternity:  'Maternity Health Indicators',
  nicu:       'Newborn Care Indicators',
  icu:        'Critical Care Risk Indicators',
  emergency:  'Emergency Care Indicators',
  trauma:     'Trauma Care Indicators',
  dialysis:   'Renal Care Risk Indicators',
  oncology:   'Cancer Care Indicators',
};

function CapabilityIndicatorsBox({
  capability,
  stats,
}: {
  capability: CapabilityTag;
  stats: CapabilityStat[];
}) {
  const available = stats.filter(s => s.value != null);
  if (available.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        <h4 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
          {CAPABILITY_BOX_LABEL[capability]}
        </h4>
        <p className="text-xs text-gray-500 italic">
          No NFHS-5 health indicators available for this district.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/40">
      <h4 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
        {CAPABILITY_BOX_LABEL[capability]}
      </h4>
      <p className="text-[10px] text-gray-500 mb-2.5 italic">
        Source: NFHS-5 (National Family Health Survey)
      </p>
      <ul className="space-y-2">
        {available.map((stat, i) => {
          const color = statColor(stat);
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-800">{stat.label}</span>
                  <span
                    className="font-bold tabular-nums"
                    style={{ color }}
                  >
                    {stat.value}{stat.unit}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                  {stat.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
