import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import {
  Facility, Nfhs5, AssessmentEvent, AssessmentVerdict,
  DistrictCoverage, VERDICT_META, confidenceBadgeClass,
} from '../lib/types';
import { DistrictChartsStrip } from '../components/DistrictCharts';

export function DistrictPage() {
  const { district } = useParams<{ district: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = params.get('state') ?? '';
  const capability = params.get('capability') ?? 'maternity';

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [nfhs5, setNfhs5] = useState<Nfhs5 | null>(null);
  const [coverage, setCoverage] = useState<DistrictCoverage | null>(null);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const [assessment, setAssessment] = useState<AssessmentEvent | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    if (!district) return;
    const qp = new URLSearchParams({ capability });
    if (state) qp.set('state', state);

    Promise.all([
      fetch(`/api/districts/${encodeURIComponent(district)}/facilities?${qp}`).then(r => r.json()),
      fetch(`/api/districts/${encodeURIComponent(district)}/nfhs5?${state ? `state=${encodeURIComponent(state)}` : ''}`).then(r => r.json()),
      fetch(`/api/coverage?capability=${capability}${state ? `&state=${encodeURIComponent(state)}` : ''}`).then(r => r.json()),
    ])
      .then(([facs, nfhs, coverageRows]) => {
        setFacilities(facs);
        setNfhs5(Object.keys(nfhs).length > 0 ? nfhs : null);
        // find this district's row
        const row = (coverageRows as DistrictCoverage[]).find(
          r => r.district.toLowerCase() === district.toLowerCase()
        ) ?? null;
        setCoverage(row);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingFacilities(false));
  }, [district, state, capability]);

  useEffect(() => {
    if (!district) return;
    const qp = new URLSearchParams({ capability });
    if (state) qp.set('state', state);

    setAssessing(true);
    const es = new EventSource(`/api/districts/${encodeURIComponent(district)}/assessment?${qp}`);

    es.addEventListener('tool_call', e => {
      setEvents(prev => [...prev, { type: 'tool_call', ...JSON.parse(e.data) }]);
    });
    es.addEventListener('tool_result', e => {
      setEvents(prev => [...prev, { type: 'tool_result', ...JSON.parse(e.data) }]);
    });
    es.addEventListener('assessment', e => {
      setAssessment({ type: 'assessment', ...JSON.parse(e.data) });
    });
    es.addEventListener('done', () => { setAssessing(false); es.close(); });
    es.onerror = () => { setAssessing(false); es.close(); };

    return () => { es.close(); };
  }, [district, state, capability]);

  if (!district) return null;

  const verdict = assessment?.verdict as AssessmentVerdict | undefined;
  const verdictMeta = verdict ? VERDICT_META[verdict] : null;

  return (
    <div className="h-full flex flex-col bg-[#0e1117] overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-white/8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div>
            <span className="text-white font-semibold">{district}</span>
            <span className="text-white/40 text-sm ml-2">{state}</span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-white/8 text-white/50 capitalize">{capability}</span>
          </div>
        </div>
        {verdictMeta && (
          <span
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: verdictMeta.color + '22', color: verdictMeta.color }}
          >
            {verdictMeta.label}
          </span>
        )}
        {assessing && !verdictMeta && (
          <span className="flex items-center gap-1.5 text-xs text-[#e07340]/80">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Assessing…
          </span>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">{error}</div>
      )}

      {/* Visualizations strip */}
      {coverage && (
        <DistrictChartsStrip coverage={coverage} nfhs5={nfhs5} />
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px] divide-x divide-white/8">
        {/* Facilities */}
        <div className="overflow-y-auto">
          <div className="p-5 space-y-2">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-white/80 text-sm font-medium">Facilities</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/40">{facilities.length}</span>
            </div>
            {loadingFacilities ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : facilities.length === 0 ? (
              <p className="text-white/25 text-sm text-center py-10">No facilities found.</p>
            ) : (
              facilities.map(f => <FacilityCard key={f.unique_id} facility={f} />)
            )}
          </div>
        </div>

        {/* Right panel: assessment + NFHS-5 */}
        <div className="overflow-y-auto">
          <AssessmentPanel events={events} assessment={assessment} assessing={assessing} />
          {nfhs5 && <Nfhs5Panel nfhs5={nfhs5} />}
        </div>
      </div>
    </div>
  );
}

function FacilityCard({ facility: f }: { facility: Facility }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(f.description || f.specialties || f.number_doctors || f.phone_numbers);

  return (
    <div className={`rounded-lg border p-3.5 transition-colors ${
      f.has_capability ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-white/8 bg-white/3'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white/85 truncate">{f.name}</p>
            {f.has_capability && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium flex-shrink-0">
                matches
              </span>
            )}
            {f.verdict && f.verdict !== 'unverified' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                f.verdict === 'confirmed' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
              }`}>
                {f.verdict}
              </span>
            )}
          </div>
          <p className="text-xs text-white/35 mt-0.5">
            {f.organization_type ?? 'Unknown'}{f.address_city ? ` · ${f.address_city}` : ''}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0 ${confidenceBadgeClass(f.completeness)}`}>
          {(f.completeness * 100).toFixed(0)}%
        </span>
      </div>

      {hasDetail && (
        <button
          onClick={() => setExpanded(x => !x)}
          className="mt-2 text-[11px] text-white/30 hover:text-white/55 transition-colors"
        >
          {expanded ? '↑ less' : '↓ more'}
        </button>
      )}

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-white/8 space-y-1.5 text-xs text-white/50">
          {f.specialties    && <p><span className="text-white/30">Specialties:</span> {f.specialties}</p>}
          {f.description    && <p><span className="text-white/30">Description:</span> {f.description}</p>}
          {f.number_doctors && <p><span className="text-white/30">Doctors:</span> {f.number_doctors}</p>}
          {f.phone_numbers  && <p><span className="text-white/30">Phone:</span> {f.phone_numbers}</p>}
          {f.sources?.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener"
              className="block text-[#e07340]/70 hover:text-[#e07340] hover:underline">
              {s.description}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentPanel({
  events, assessment, assessing,
}: {
  events: AssessmentEvent[];
  assessment: AssessmentEvent | null;
  assessing: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const verdict = assessment?.verdict as AssessmentVerdict | undefined;

  return (
    <div className="border-b border-white/8">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/6">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">AI Assessment</span>
        {assessing && (
          <svg className="animate-spin h-3 w-3 text-[#e07340]/70 ml-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        )}
      </div>

      {verdict && (
        <div className="px-4 py-3 border-b border-white/6">
          <p className="text-sm font-semibold" style={{ color: VERDICT_META[verdict].color }}>
            {assessment!.verdict_label}
          </p>
          {assessment!.summary && (
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed">{assessment!.summary}</p>
          )}
          {assessment!.sources?.map((s, i) => (
            <p key={i} className="text-[10px] text-white/25 mt-1">
              <span className="text-white/35">[{s.type}]</span> {s.ref}
            </p>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="max-h-40 overflow-y-auto px-4 py-2 space-y-1">
          {events.map((e, i) => (
            <div key={i} className="text-[11px]">
              {e.type === 'tool_call' && (
                <p className="text-white/35">
                  <span className="font-mono text-[#e07340]/60">{e.tool}</span>
                  <span className="text-white/20 ml-1.5 truncate">{e.input}</span>
                </p>
              )}
              {e.type === 'tool_result' && (
                <p className="text-white/20 pl-3">↳ {e.preview}</p>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {!assessing && events.length === 0 && !assessment && (
        <p className="px-4 py-5 text-center text-xs text-white/20">Starting assessment…</p>
      )}
    </div>
  );
}

function Nfhs5Panel({ nfhs5 }: { nfhs5: Nfhs5 }) {
  const stats = [
    { label: 'Institutional births', value: nfhs5.institutional_birth_5y_pct, warn: (nfhs5.institutional_birth_5y_pct ?? 100) < 50 },
    { label: 'Skilled birth attendant', value: nfhs5.births_attended_by_skilled_hp_5y_10_pct },
    { label: '4+ ANC visits', value: nfhs5.mothers_who_had_at_least_4_anc_visits_lb5y_pct },
    { label: 'Child stunting', value: nfhs5.child_u5_who_are_stunted_height_for_age_18_pct, warn: (nfhs5.child_u5_who_are_stunted_height_for_age_18_pct ?? 0) > 35 },
    { label: 'Fully vaccinated', value: nfhs5.child_12_23m_fully_vaccinated_pct },
    { label: 'Electricity', value: nfhs5.hh_electricity_pct },
    { label: 'Improved water', value: nfhs5.hh_improved_water_pct },
    { label: 'Sanitation', value: nfhs5.hh_use_improved_sanitation_pct },
    { label: 'Health insurance', value: nfhs5.hh_member_covered_health_insurance_pct },
    { label: 'Women anaemic', value: nfhs5.non_pregnant_w15_49_who_are_anaemic, warn: (nfhs5.non_pregnant_w15_49_who_are_anaemic ?? 0) > 40 },
  ].filter(s => s.value != null);

  return (
    <div>
      <div className="px-4 py-3 border-b border-white/6">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">NFHS-5</span>
        <span className="text-[10px] text-white/25 ml-2">{nfhs5.district_name}</span>
      </div>
      <div className="divide-y divide-white/5">
        {stats.map(s => (
          <div key={s.label} className="px-4 py-2 flex justify-between items-center">
            <span className="text-xs text-white/40">{s.label}</span>
            <span className={`text-xs font-semibold ${s.warn ? 'text-red-400' : 'text-white/70'}`}>
              {s.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white/20" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}
