import { useEffect, useState } from 'react';
import { fetchAnalysisByCountry, fetchAnalysisSummary, fetchFilterOptions } from '../api';
import { TECHNOLOGY_COLORS } from '../technologyConfig';
import './AnalysisPage.css';

const STAGE_COLORS = {
  'Early Stage': '#eda100',
  'Mid-Stage': '#eb6834',
  Operational: '#1baf7a',
  Stalled: '#e34948',
  Unknown: '#7d8590',
};

function formatMw(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} MW`;
}

function formatCount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString();
}

// Horizontal bar list — one series (total operational generation), so no
// legend box; hover reveals the electricity/heat split behind each total.
function CountryBarChart({ rows }) {
  const [tooltip, setTooltip] = useState(null);
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="analysis-card">
      <h2 className="analysis-card-title">Total operational generation by country</h2>
      <div className="bar-rows">
        {rows.map((row) => (
          <div
            key={row.country}
            className="bar-row"
            onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, ...row })}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="bar-row-label" title={row.country}>{row.country}</span>
            <div className="bar-row-track">
              <div className="bar-row-fill" style={{ width: `${Math.max((row.total / maxTotal) * 100, row.total > 0 ? 1 : 0)}%` }} />
            </div>
            <span className="bar-row-value">{formatMw(row.total)}</span>
          </div>
        ))}
      </div>
      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}>
          <strong>{tooltip.country}</strong>
          <div className="chart-tooltip-grid">
            <span>Electricity</span><span>{formatMw(tooltip.totalElectricityCapacityMw)}</span>
            <span>Heat</span><span>{formatMw(tooltip.totalHeatCapacityMw)}</span>
            <span>Total</span><span>{formatMw(tooltip.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Ring built from stacked <circle> dash segments (start at 12 o'clock, run
// clockwise), each shortened by a small surface gap so touching segments
// stay visually distinct without a border.
function Doughnut({ title, segments, formatValue }) {
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const size = 176;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapPx = 3;

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  let cumulative = 0;
  const arcs = visible.map((seg) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const rawLength = fraction * circumference;
    const arc = {
      ...seg,
      fraction,
      length: Math.max(rawLength - gapPx, 0),
      offset: -cumulative,
    };
    cumulative += rawLength;
    return arc;
  });

  return (
    <div className="analysis-card doughnut-card">
      <h3 className="analysis-card-title">{title}</h3>
      {visible.length === 0 ? (
        <p className="doughnut-empty">No data for this selection.</p>
      ) : (
        <div className="doughnut-body">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="doughnut-svg">
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {arcs.map((arc) => (
                <circle
                  key={arc.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={hovered === arc.label ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                  strokeDashoffset={arc.offset}
                  className="doughnut-arc"
                  style={{ opacity: hovered && hovered !== arc.label ? 0.35 : 1 }}
                  onMouseEnter={() => setHovered(arc.label)}
                  onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, label: arc.label, value: arc.value, fraction: arc.fraction })}
                  onMouseLeave={() => { setHovered(null); setTooltip(null); }}
                />
              ))}
            </g>
            <text x="50%" y="46%" textAnchor="middle" className="doughnut-center-value">{formatValue(total)}</text>
            <text x="50%" y="60%" textAnchor="middle" className="doughnut-center-label">Total</text>
          </svg>
          <ul className="doughnut-legend">
            {visible.map((seg) => (
              <li
                key={seg.label}
                className={`doughnut-legend-row${hovered === seg.label ? ' hovered' : ''}`}
                onMouseEnter={() => setHovered(seg.label)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="doughnut-legend-swatch" style={{ background: seg.color }} />
                <span className="doughnut-legend-label">{seg.label}</span>
                <span className="doughnut-legend-value">{formatValue(seg.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}>
          <strong>{tooltip.label}</strong>
          <div>{formatValue(tooltip.value)} ({(tooltip.fraction * 100).toFixed(1)}%)</div>
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const [byCountry, setByCountry] = useState([]);
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('');
  const [summary, setSummary] = useState({ byTechnology: [], byStage: [] });
  const [showLoadingBar, setShowLoadingBar] = useState(false);

  // Initial load covers both the overarching chart and the default (global)
  // interactive section; only this pass gets the delayed loading bar, since
  // the free-tier API cold start (30-60s) only bites on the first request.
  useEffect(() => {
    let cancelled = false;
    const showBarTimer = setTimeout(() => {
      if (!cancelled) setShowLoadingBar(true);
    }, 300);

    async function load(attempt = 0) {
      try {
        const [countryTotals, filterOptions, summaryData] = await Promise.all([
          fetchAnalysisByCountry(),
          fetchFilterOptions(),
          fetchAnalysisSummary(''),
        ]);
        if (cancelled) return;
        setByCountry(countryTotals);
        setCountries(filterOptions.countries);
        setSummary(summaryData);
        setShowLoadingBar(false);
      } catch (err) {
        if (cancelled) return;
        const delay = Math.min(5000 * 2 ** attempt, 60000);
        console.error(`Failed to load analysis data, retrying in ${delay / 1000}s:`, err);
        setTimeout(() => load(attempt + 1), delay);
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(showBarTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAnalysisSummary(country)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((err) => console.error('Failed to load filtered analysis data:', err));
    return () => { cancelled = true; };
  }, [country]);

  const countryRows = byCountry.map((row) => ({
    ...row,
    total: row.totalElectricityCapacityMw + row.totalHeatCapacityMw,
  }));

  const technologyCountSegments = summary.byTechnology.map((t) => ({
    label: t.technology,
    value: t.projectCount,
    color: TECHNOLOGY_COLORS[t.technology] || TECHNOLOGY_COLORS.Other,
  }));
  const technologyCapacitySegments = summary.byTechnology.map((t) => ({
    label: t.technology,
    value: t.operationalCapacityMw,
    color: TECHNOLOGY_COLORS[t.technology] || TECHNOLOGY_COLORS.Other,
  }));
  const stageSegments = summary.byStage.map((s) => ({
    label: s.projectStage,
    value: s.totalCapacityMw,
    color: STAGE_COLORS[s.projectStage] || STAGE_COLORS.Unknown,
  }));

  return (
    <div className="analysis-page">
      {showLoadingBar && (
        <div className="loading-bar" role="progressbar" aria-label="Loading analysis data">
          <div className="loading-bar-fill" />
        </div>
      )}
      <div className="analysis-content">
        <section className="analysis-section">
          <CountryBarChart rows={countryRows} />
        </section>

        <section className="analysis-filter-row">
          <label htmlFor="analysis-country">Nation</label>
          <select id="analysis-country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Global</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </section>

        <section className="analysis-doughnuts">
          <Doughnut title="Projects by technology" segments={technologyCountSegments} formatValue={formatCount} />
          <Doughnut title="Operational capacity by technology" segments={technologyCapacitySegments} formatValue={formatMw} />
          <Doughnut title="Capacity by project stage" segments={stageSegments} formatValue={formatMw} />
        </section>
      </div>
    </div>
  );
}
