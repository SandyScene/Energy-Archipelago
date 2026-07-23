import { useEffect, useState } from 'react';
import { fetchFilterOptions } from '../api';

const FIELDS = [
  { key: 'country', label: 'Country', optionsKey: 'countries' },
  { key: 'region', label: 'Region', optionsKey: 'regions' },
  { key: 'technology', label: 'Technology', optionsKey: 'technologies' },
  { key: 'ventureType', label: 'Venture type', optionsKey: 'ventureTypes' },
];

export default function FilterPanel({ filters, onChange }) {
  const [options, setOptions] = useState({ countries: [], regions: [], technologies: [], ventureTypes: [] });

  useEffect(() => {
    fetchFilterOptions(filters.country).then(setOptions).catch(() => {});
  }, [filters.country]);

  const activeCount = Object.values(filters).filter(Boolean).length;

  function handleFieldChange(key, value) {
    // Changing country invalidates any region already selected from a different country.
    if (key === 'country') {
      onChange({ ...filters, country: value, region: '' });
    } else {
      onChange({ ...filters, [key]: value });
    }
  }

  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <span>Filters{activeCount > 0 ? ` (${activeCount})` : ''}</span>
        {activeCount > 0 && (
          <button
            className="filter-clear-btn"
            onClick={() => onChange({ country: '', region: '', technology: '', ventureType: '' })}
          >
            Clear
          </button>
        )}
      </div>
      {FIELDS.map(({ key, label, optionsKey }) => (
        <label className="filter-field" key={key}>
          <span>{label}</span>
          <select
            value={filters[key]}
            onChange={(e) => handleFieldChange(key, e.target.value)}
          >
            <option value="">All</option>
            {options[optionsKey].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
