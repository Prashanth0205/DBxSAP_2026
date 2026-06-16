import { useState, useEffect, useRef, ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DistrictCoverage, categorizeDistrict, CATEGORY_META,
  CapabilityTag, capabilityRelevantStats, statColor, CapabilityStat,
} from '../lib/types';
import { useStarred, starKey } from '../lib/starred';

function HoverTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);

  function handleMouseEnter() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const TOOLTIP_WIDTH = 224; // w-56 = 224px
    const PADDING = 8;
    const triggerCenterX = rect.left + rect.width / 2;

    // Clamp horizontal position so tooltip stays in viewport
    let left = triggerCenterX - TOOLTIP_WIDTH / 2;
    left = Math.max(PADDING, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - PADDING));

    setTooltipStyle({
      left: `${left}px`,
      top: `${rect.top - PADDING}px`,
      transform: 'translateY(-100%)',
    });
  }

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex group"
      onMouseEnter={handleMouseEnter}
    >
      {children}
      <span
        role="tooltip"
        style={tooltipStyle}
        className="pointer-events-none fixed w-56 px-2 py-1 bg-gray-900 text-white text-[10px] font-normal leading-snug rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-[10001] whitespace-normal text-left"
      >
        {label}
      </span>
    </span>
  );
}

interface Props {
  district: DistrictCoverage;
  capability: CapabilityTag;
  onClose: () => void;
  onViewRecommendations: () => void;
}

interface Assessment {
  verdict: string;
  verdict_label: string;
  confidence: string;
  summary: string;
  inconsistencies?: string[];
  sources: { type: string; ref: string; detail: string; trust?: string }[];
  evidence?: {
    district?: string;
    state?: string;
    total_facilities?: number;
    matching_facilities?: number;
    gap_score?: number;
    data_confidence?: number;
    nfhs5?: Record<string, number | null>;
  };
}

const TRUST_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-gray-100 text-gray-700 border-gray-300',
};

const TRUST_TOOLTIP: Record<string, string> = {
  high: 'High trust: official government registry (gov.in, NABH, NHP, MoHFW, ABDM, HMIS).',
  medium: 'Medium trust: established directory or hospital chain (Bajaj Finserv Health, Sehat, IndiaOnline).',
  low: 'Low trust: blog, ad-heavy listing, or unverified source. Treat as a lead, not evidence.',
};

const TYPE_TOOLTIP: Record<string, string> = {
  database: 'Pulled directly from our facility + NFHS-5 tables in Databricks. Click "View data" to see the exact rows.',
  web: 'Returned by DuckDuckGo web search at assessment time. Gov-domain results are preferred; commercial directories fall back to medium/low trust.',
};

const NFHS5_LABELS: Record<string, string> = {
  institutional_birth_pct: 'Institutional births (%)',
  child_stunting_pct: 'Child stunting under-5 (%)',
  skilled_birth_attendance_pct: 'Skilled birth attendance (%)',
  anc_4plus_visits_pct: 'Mothers with 4+ ANC visits (%)',
  electricity_pct: 'Households with electricity (%)',
  health_insurance_pct: 'Health-insurance coverage (%)',
  blood_sugar_women_pct: 'Women w/ high blood sugar (%)',
};

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number.isFinite(v) ? v.toFixed(2).replace(/\.?0+$/, '') : '—';
}

export function DistrictPopup({ district, capability, onClose, onViewRecommendations }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const { isStarred, toggle } = useStarred();

  const category = categorizeDistrict(district);
  const categoryMeta = CATEGORY_META[category];
  const capabilityStats = capabilityRelevantStats(capability, district);

  const sk = starKey(district.state, district.district, capability);
  const starred = isStarred(sk);
  const evidenceHref = `/district/${encodeURIComponent(district.district)}?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(district.state)}`;
  function toggleStar(e: React.MouseEvent) {
    e.stopPropagation();
    toggle({
      key: sk,
      district: district.district,
      state: district.state,
      capability,
      gap_score: district.gap_score,
      total_facilities: district.total_facilities,
      matching_facilities: district.matching_facilities,
      confidence: district.confidence,
    });
  }

  useEffect(() => {
    if (expanded && !assessment && !loadingAssessment) {
      loadAssessment();
    }
  }, [expanded]);

  // Click anywhere outside the popup closes it. Mousedown so it fires before
  // any click handlers inside the popup re-trigger the open state.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Esc also closes — keyboard-friendly.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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
      <div ref={popupRef} className="relative bg-white rounded-lg shadow-2xl p-4 min-w-[280px] max-w-sm border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none w-6 h-6 flex items-center justify-center"
        >
          ✕
        </button>

        <div className="space-y-3">
          <div className="pr-6 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{district.district}</h3>
              <p className="text-sm text-gray-500">{district.state}</p>
            </div>
            <HoverTooltip label={starred ? 'Remove from your workspace shortlist.' : 'Save to your workspace shortlist for funding decisions.'}>
              <button
                onClick={toggleStar}
                className={`text-xl leading-none cursor-pointer transition-colors ${starred ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'}`}
                aria-label={starred ? 'Unstar district' : 'Star district'}
              >
                {starred ? '★' : '☆'}
              </button>
            </HoverTooltip>
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

          <Link
            to={evidenceHref}
            className="block w-full py-2 text-sm font-medium text-center text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors border border-amber-200"
          >
            View facility evidence →
          </Link>
          <button
            onClick={onViewRecommendations}
            className="w-full py-2 text-sm font-semibold text-white bg-[#e07340] hover:bg-[#c9632f] rounded transition-colors"
          >
            View Recommendations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={popupRef} className="bg-white rounded-lg shadow-2xl p-5 w-[450px] max-h-[600px] overflow-y-auto border border-gray-200">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{district.district}</h3>
            <p className="text-sm text-gray-500">{district.state}</p>
          </div>
          <div className="flex items-center gap-2">
            <HoverTooltip label={starred ? 'Remove from your workspace shortlist.' : 'Save to your workspace shortlist for funding decisions.'}>
              <button
                onClick={toggleStar}
                className={`text-2xl leading-none cursor-pointer transition-colors ${starred ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'}`}
                aria-label={starred ? 'Unstar district' : 'Star district'}
              >
                {starred ? '★' : '☆'}
              </button>
            </HoverTooltip>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
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
                <HoverTooltip label="How sure the AI is in this verdict given the inputs. HIGH = strong DB signal + corroborating web evidence. MEDIUM = one strong source or partial corroboration. LOW = sparse data, weak sources, or conflicting signals.">
                  <p className="text-xs text-blue-700 mt-1 cursor-help">
                    Confidence: {assessment.confidence} <span className="text-blue-400">(?)</span>
                  </p>
                </HoverTooltip>
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

            <SourcesSection sources={assessment.sources || []} evidence={assessment.evidence} />
          </div>
        )}

        <Link
          to={evidenceHref}
          className="block w-full py-2 text-sm font-medium text-center text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors mt-4 border border-amber-200"
        >
          View facility evidence →
        </Link>

        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setExpanded(false)}
            className="flex-1 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors border border-gray-200"
          >
            Collapse ▲
          </button>
          <button
            onClick={onViewRecommendations}
            className="flex-1 py-2 text-sm font-semibold text-white bg-[#e07340] hover:bg-[#c9632f] rounded transition-colors"
          >
            Recommendations
          </button>
        </div>
      </div>
    </div>
  );
}

function SourcesSection({
  sources,
  evidence,
}: {
  sources: { type: string; ref: string; detail: string; trust?: string }[];
  evidence?: Assessment['evidence'];
}) {
  const dbSources = sources.filter(s => s.type === 'database');
  const webSources = sources.filter(s => s.type === 'web');

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">DATABASE SOURCES</h4>
        {dbSources.length > 0 ? (
          <div className="space-y-2">
            {dbSources.map((source, i) => {
              const trust = (source.trust || '').toLowerCase();
              return (
                <div key={i} className="bg-gray-50 p-2 rounded text-xs">
                  <div className="flex items-start gap-2 flex-wrap">
                    <HoverTooltip label={TYPE_TOOLTIP['database']}>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-200 text-blue-800 cursor-help">
                        DATABASE
                      </span>
                    </HoverTooltip>
                    {trust && (
                      <HoverTooltip label={TRUST_TOOLTIP[trust] || ''}>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-help ${
                            TRUST_STYLE[trust] || TRUST_STYLE.low
                          }`}
                        >
                          {trust.toUpperCase()}
                        </span>
                      </HoverTooltip>
                    )}
                    <div className="flex-1 min-w-0 basis-full">
                      <p className="font-medium text-gray-900">{source.ref}</p>
                      <p className="text-gray-600 mt-1">{source.detail}</p>
                      {evidence && (
                        <details className="mt-1.5 group">
                          <summary className="cursor-pointer text-blue-700 hover:text-blue-900 select-none font-medium">
                            View data ▾
                          </summary>
                          <div className="mt-1.5 bg-white border border-gray-200 rounded p-2 space-y-1.5">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Facility coverage</p>
                              <table className="w-full mt-1">
                                <tbody>
                                  <tr><td className="text-gray-600 py-0.5">Total facilities</td><td className="text-right font-mono text-gray-900">{evidence.total_facilities ?? '—'}</td></tr>
                                  <tr><td className="text-gray-600 py-0.5">Matching capability</td><td className="text-right font-mono text-gray-900">{evidence.matching_facilities ?? '—'}</td></tr>
                                  <tr><td className="text-gray-600 py-0.5">Gap score (0–10)</td><td className="text-right font-mono text-gray-900">{fmtNum(evidence.gap_score)}</td></tr>
                                  <tr><td className="text-gray-600 py-0.5">Data confidence</td><td className="text-right font-mono text-gray-900">{fmtNum(evidence.data_confidence)}</td></tr>
                                </tbody>
                              </table>
                            </div>
                            {evidence.nfhs5 && Object.values(evidence.nfhs5).some((v) => v !== null && v !== undefined) && (
                              <div className="pt-1.5 border-t border-gray-100">
                                <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">NFHS-5 indicators</p>
                                <table className="w-full mt-1">
                                  <tbody>
                                    {Object.entries(NFHS5_LABELS).map(([key, label]) => (
                                      <tr key={key}>
                                        <td className="text-gray-600 py-0.5">{label}</td>
                                        <td className="text-right font-mono text-gray-900">
                                          {fmtNum(evidence.nfhs5?.[key] as number | null | undefined)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100 break-all">
                              Source: <code>virtue_foundation_dataset.facilities</code> + <code>nfhs_5_district_health_indicators</code> via Databricks SQL warehouse.
                            </p>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
              const trust = (source.trust || '').toLowerCase();
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
                  <div className="flex items-start gap-2 flex-wrap">
                    <HoverTooltip label={TYPE_TOOLTIP['web']}>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-200 text-green-800 cursor-help">
                        WEB
                      </span>
                    </HoverTooltip>
                    {trust && (
                      <HoverTooltip label={TRUST_TOOLTIP[trust] || ''}>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-help ${
                            TRUST_STYLE[trust] || TRUST_STYLE.low
                          }`}
                        >
                          {trust.toUpperCase()}
                        </span>
                      </HoverTooltip>
                    )}
                    <div className="flex-1 min-w-0 basis-full">
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
