import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';

const ROW_LIMIT = 100;

export function FacilityListPage() {
  const [searchParams] = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const city = searchParams.get('city') ?? '';
  const capability = searchParams.get('capability') ?? '';

  const params = useMemo(
    () => ({
      state: sql.string(state),
      city: sql.string(city),
      capability_substring: sql.string(capability),
      row_limit: sql.int(ROW_LIMIT),
    }),
    [state, city, capability]
  );

  const { data, loading, error } = useAnalyticsQuery('facilities_by_filter', params);
  const rows = data ?? [];

  const filterSummary = [
    capability && `capability matches “${capability}”`,
    state && `state = ${state}`,
    city && `city = ${city}`,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Facilities</h2>
        <p className="text-sm text-gray-500 mt-1">
          {filterSummary || 'No filters applied — showing first results.'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Substring matching across capability, specialties, equipment, procedure, and
          description fields. Showing up to {ROW_LIMIT} rows.
        </p>
      </div>

      {loading && (
        <div className="p-6 bg-white border border-gray-200 rounded-lg flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-5 w-5 text-[#FF3621]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading facilities…
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Failed to load facilities: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="p-6 bg-white border border-gray-200 rounded-lg text-gray-500">
          No facilities matched these filters.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Facility</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Location</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Match field</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.facility_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link
                      to={`/facility/${encodeURIComponent(r.facility_id)}`}
                      className="text-[#FF3621] hover:underline font-medium"
                    >
                      {r.facility_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {r.city}{r.city && r.state ? ', ' : ''}{r.state}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {r.evidence_field ? (
                      <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs">
                        {r.evidence_field}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
