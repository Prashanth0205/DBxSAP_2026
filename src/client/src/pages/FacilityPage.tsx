import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function SourceTag({ field }: { field: string }) {
  return (
    <span className="ml-2 inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded text-xs font-mono">
      source: {field}
    </span>
  );
}

export function FacilityPage() {
  const { id } = useParams<{ id: string }>();
  const params = useMemo(
    () => ({ facility_id: sql.string(id ?? '') }),
    [id]
  );
  const { data, loading, error } = useAnalyticsQuery('facility_detail', params);
  const facility = data?.[0];

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white border border-gray-200 rounded-lg flex items-center gap-2 text-gray-500">
        <svg className="animate-spin h-5 w-5 text-[#FF3621]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading facility…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
        Failed to load facility: {error}
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white border border-gray-200 rounded-lg text-gray-500">
        No facility found with id <code className="bg-gray-100 px-1 rounded text-xs">{id}</code>.
      </div>
    );
  }

  const address = [facility.address_line1, facility.address_line2, facility.address_line3]
    .filter(s => s && s !== 'null')
    .join(', ');
  const cityState = [facility.city, facility.state].filter(Boolean).join(', ');
  const fullAddress = [address, cityState, facility.postcode].filter(Boolean).join(' • ');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/map" className="text-sm text-[#FF3621] hover:underline">← Back to Coverage Map</Link>
        <h2 className="text-2xl font-bold text-gray-900 mt-2">{facility.facility_name}</h2>
        <p className="text-sm text-gray-500 mt-1">{fullAddress || '—'}</p>
      </div>

      {/* Capability evidence — show raw text fields w/ source citation */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Capability evidence
          <span className="ml-2 text-xs font-normal text-gray-500">
            (raw extracted text — capability tagging not yet run)
          </span>
        </h3>
        <dl className="space-y-3">
          <Field
            label={<>Capability<SourceTag field="capability" /></>}
            value={facility.capability}
          />
          <Field
            label={<>Specialties<SourceTag field="specialties" /></>}
            value={facility.specialties}
          />
          <Field
            label={<>Equipment<SourceTag field="equipment" /></>}
            value={facility.equipment}
          />
          <Field
            label={<>Procedures<SourceTag field="procedure" /></>}
            value={facility.procedure}
          />
          <Field
            label={<>Description<SourceTag field="description" /></>}
            value={facility.description}
          />
        </dl>
      </section>

      {/* Operational details */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Operational</h3>
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Facility type" value={facility.facility_type} />
          <Field label="Operator type" value={facility.operator_type} />
          <Field label="Doctors" value={facility.number_doctors} />
          <Field label="Capacity" value={facility.capacity} />
          <Field label="Year established" value={facility.year_established} />
          <Field
            label="Coordinates"
            value={
              facility.latitude && facility.longitude
                ? `${facility.latitude}, ${facility.longitude}`
                : null
            }
          />
        </dl>
      </section>

      {/* Contact */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Contact</h3>
        <dl className="space-y-3">
          <Field label="Phone" value={facility.phone} />
          <Field
            label="Website"
            value={
              facility.website && facility.website !== 'null' ? (
                <a
                  href={facility.website.startsWith('http') ? facility.website : `https://${facility.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#FF3621] hover:underline"
                >
                  {facility.website}
                </a>
              ) : null
            }
          />
          <Field label="Email" value={facility.email} />
          <Field
            label="Source URLs"
            value={
              facility.source_urls && facility.source_urls !== 'null' ? (
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 break-all">
                  {facility.source_urls}
                </code>
              ) : null
            }
          />
        </dl>
      </section>
    </div>
  );
}
