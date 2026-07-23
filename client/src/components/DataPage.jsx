import { useEffect, useState } from 'react';
import { fetchFilterOptions, fetchProjects, submitDataRequest } from '../api';
import './DataPage.css';

const ORGANISATION_TYPES = ['Community Organisation', '3rd Sector', 'University', 'Private Company'];
const DATA_USES = ['Research', 'Project Development', 'Personal Interest'];

const EMPTY_FORM = {
  name: '',
  email: '',
  organisationName: '',
  organisationType: '',
  dataUse: '',
  comments: '',
};

const CSV_COLUMNS = [
  'id', 'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
  'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
  'project_stage', 'latitude', 'longitude', 'country', 'region',
];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toCSV(rows) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map((col) => escapeCell(row[col])).join(','));
  return [header, ...lines].join('\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFilterOptions().then((opts) => setCountries(opts.countries)).catch(() => {});
  }, []);

  const formValid =
    form.name.trim() &&
    isValidEmail(form.email) &&
    form.organisationName.trim() &&
    form.organisationType &&
    form.dataUse &&
    country;

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleDownload() {
    if (!formValid) return;
    setDownloading(true);
    setError('');
    try {
      await submitDataRequest({
        name: form.name.trim(),
        email: form.email.trim(),
        organisation_name: form.organisationName.trim(),
        organisation_type: form.organisationType,
        data_use: form.dataUse,
        comments: form.comments.trim(),
        country,
      });
      const projects = await fetchProjects({ country });
      const csv = toCSV(projects);
      const filename = `energy-archipelago-${country.toLowerCase().replace(/\s+/g, '-')}.csv`;
      downloadCSV(csv, filename);
    } catch (err) {
      setError(err.message || 'Download failed — please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="data-page">
      <div className="data-content">
        <section className="data-section">
          <h1>Data</h1>
          <p>
            Download the underlying Energy Archipelago project data for a single country as a
            CSV file. To help us understand who's using the data and keep it a useful resource,
            please tell us a little about yourself first.
          </p>
        </section>

        <section className="data-section">
          <div className="data-field">
            <label htmlFor="data-country">Country</label>
            <select id="data-country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Select a country…</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="data-field">
            <label htmlFor="data-name">Name</label>
            <input id="data-name" type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          </div>

          <div className="data-field">
            <label htmlFor="data-email">Email address</label>
            <input id="data-email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </div>

          <div className="data-field">
            <label htmlFor="data-org-name">Organisation name</label>
            <input id="data-org-name" type="text" value={form.organisationName} onChange={(e) => updateField('organisationName', e.target.value)} />
          </div>

          <div className="data-field">
            <label htmlFor="data-org-type">Organisation type</label>
            <select id="data-org-type" value={form.organisationType} onChange={(e) => updateField('organisationType', e.target.value)}>
              <option value="">Select…</option>
              {ORGANISATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="data-field">
            <label htmlFor="data-use">Data use</label>
            <select id="data-use" value={form.dataUse} onChange={(e) => updateField('dataUse', e.target.value)}>
              <option value="">Select…</option>
              {DATA_USES.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div className="data-field">
            <label htmlFor="data-comments">Further comments (optional)</label>
            <textarea id="data-comments" rows="3" value={form.comments} onChange={(e) => updateField('comments', e.target.value)} />
          </div>

          {error && <div className="data-error">{error}</div>}

          <button className="data-download-btn" disabled={!formValid || downloading} onClick={handleDownload}>
            {downloading ? 'Preparing download…' : 'Download CSV'}
          </button>
        </section>

        <section className="data-section data-attribution">
          <h2>Attribution</h2>
          <p>
            Energy Archipelago data is free to use, but we ask that you credit the project and
            Scene in any research, publication, or other external output that uses it. Please
            include the following statement:
          </p>
          <blockquote>
            "Data sourced from Energy Archipelago, a project led by Scene Connect Ltd."
          </blockquote>
        </section>

        <section className="data-section data-licence">
          <h2>Licence</h2>
          <p>
            This data is made available under the{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              Creative Commons Attribution 4.0 International licence (CC BY 4.0)
            </a>. You are free to share and adapt it for any purpose, including commercially,
            as long as you give appropriate credit as described above.
          </p>
        </section>
      </div>
    </div>
  );
}
