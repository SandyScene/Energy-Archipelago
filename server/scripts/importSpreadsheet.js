// Backend-only bulk importer. Not exposed via any HTTP route — run manually:
//   node scripts/importSpreadsheet.js path/to/master-spreadsheet.xlsx
//
// Rows with an ID matching an existing project update that row in place.
// Rows with a blank or unmatched ID are inserted as new projects — their
// newly assigned IDs are printed at the end so they can be copied back into
// the master spreadsheet for future re-imports.
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { db } from '../src/db.js';

const COLUMN_ALIASES = {
  id: 'id',
  dateofdatasource: 'date_of_data_source',
  datedatasource: 'date_of_data_source',
  projectname: 'project_name',
  leadorganisation: 'lead_organisation',
  leadorganization: 'lead_organisation',
  organisationwebsite: 'organisation_website',
  organizationwebsite: 'organisation_website',
  organisationtype: 'organisation_type',
  organizationtype: 'organisation_type',
  venturetype: 'venture_type',
  technology: 'technology',
  technologydetail: 'technology_detail',
  capacity: 'capacity_mw',
  capacitymw: 'capacity_mw',
  capacitykw: 'capacity_kw',
  projectstage: 'project_stage',
  latitude: 'latitude',
  longitude: 'longitude',
  country: 'country',
  region: 'region',
};

const NUMERIC_COLUMNS = new Set(['capacity_mw', 'capacity_kw', 'latitude', 'longitude']);

// Sanity ceiling for a single project's capacity. Source spreadsheets occasionally use
// a run of 9s (e.g. 9999999999) as a "no data" placeholder rather than leaving the cell
// blank; treat anything above this as missing rather than a real value. Well above the
// largest legitimate entries in the dataset (city-scale district heating, ~1-2k MW).
const MAX_PLAUSIBLE_CAPACITY_MW = 50000;

// Every project gets exactly one of these technologies — matches client/src/technologyConfig.js.
const CANONICAL_TECHNOLOGIES = new Set(['Solar', 'Wind', 'Hydro', 'Bioenergy', 'Heat Pumps', 'Marine', 'Other']);

// Keyed by the value with non-alphanumeric characters stripped, so spacing/case/plural
// variants ("Heat Pump" vs "Heat Pumps") and compound entries ("Bioenergy Solar") all
// resolve to one canonical technology.
const TECHNOLOGY_ALIASES = {
  heatpump: 'Heat Pumps',
  biogas: 'Bioenergy',
  woodfuel: 'Bioenergy',
  bioenergysolar: 'Bioenergy',
  geothermal: 'Other',
  unknown: 'Other',
  project: 'Other',
};

function normalizeTechnology(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (CANONICAL_TECHNOLOGIES.has(trimmed)) return trimmed;
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TECHNOLOGY_ALIASES[key] || 'Other';
}

// Venture type collapses to these three ownership structures, or "Unknown" when the
// source data genuinely doesn't say — never guessed, since that would fabricate
// ownership information we don't have.
const CANONICAL_VENTURE_TYPES = new Set([
  '100% Community Owned', 'Community-Commercial Partnership', 'Community-Public Partnership', 'Unknown',
]);

// A handful of source rows have prose descriptions instead of a category (mostly German
// municipal energy co-ops); mapped by hand from the ownership structure each describes.
const VENTURE_TYPE_ALIASES = {
  'Association; Ctizens of the local communities have the possibility to buy equal participation rights': '100% Community Owned',
  'Association; Ctizens of the local communities have the possibility to buy equal participation rights; The project represents windparks in four different communities: Holt Nord, Holt Süd, Jardelund and Medelby': '100% Community Owned',
  'Association; Ctizens of the local communities have the possibility to buy equal participation rights for 500€ with a minimum investment off 2000²': '100% Community Owned',
  'The local municipalities of Ettenheim, Schuttertal und Seelbach form the cooperative;  Green City Energy AG is in charge of planning, development and the overall financial management': 'Community-Public Partnership',
  'Owned by local municipal utilities, technical execution including operation & maintenance by Solarcomplex AG': 'Community-Public Partnership',
  'Developed by Solarcomplex AG, then sold to and operated by the local municipality of Meßkirch': 'Community-Public Partnership',
  'Solarcomplex founded an association (GmbH & Co KG) with the local municipality of Rickelshausen; through a split ownership arrangement the GLS Energie AG owns a distinct part of the solar panels': 'Community-Commercial Partnership',
  'Solar Complex AG emitted shares to citizens of local communities first and expanded then to communities of itnerest in a second round': 'Community-Commercial Partnership',
  'Green City Energy emitted share to citizens of local communities first, to expand then to communities of interest in a seond round': 'Community-Commercial Partnership',
  'Green City Energy developed the project together with the municipality of Manning, both own the project; respective stakes onknown': 'Community-Commercial Partnership',
  'Green City Energy developed the project and secured the financing; local retailers and municipality as a partner who pay less for thermal heat, generated by the plant; local farmers have attractive long-term contracts in delivering substrate to the plant': 'Community-Commercial Partnership',
  'Cooperation between municipal utilities, Solarcomplex AG and private investors': 'Community-Commercial Partnership',
};

function normalizeVentureType(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (CANONICAL_VENTURE_TYPES.has(trimmed)) return trimmed;
  return VENTURE_TYPE_ALIASES[trimmed] || 'Unknown';
}

const COLUMNS = [
  'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
  'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
  'project_stage', 'latitude', 'longitude', 'country', 'region',
];

function normalizeHeader(header) {
  return String(header).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapRow(rawRow, headerMap) {
  const row = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const column = headerMap[normalizeHeader(rawKey)];
    if (!column) continue;
    if (value === undefined || value === '') {
      row[column] = null;
    } else if (column === 'id' || NUMERIC_COLUMNS.has(column)) {
      row[column] = Number(value);
    } else if (value instanceof Date) {
      row[column] = value.toISOString().slice(0, 10);
    } else {
      row[column] = String(value).trim();
    }
  }
  if (row.capacity_mw == null && row.capacity_kw != null) {
    row.capacity_mw = row.capacity_kw / 1000;
  }
  delete row.capacity_kw;
  if (row.capacity_mw != null && (Number.isNaN(row.capacity_mw) || row.capacity_mw > MAX_PLAUSIBLE_CAPACITY_MW)) {
    row.capacity_mw = null;
  }
  if (row.technology !== undefined) row.technology = normalizeTechnology(row.technology);
  if (row.venture_type !== undefined) row.venture_type = normalizeVentureType(row.venture_type);
  return row;
}

function importFile(filePath) {
  const buffer = readFileSync(filePath);
  const workbook = read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) {
    console.log('No rows found in sheet "%s".', sheetName);
    return;
  }

  const headerMap = {};
  for (const rawKey of Object.keys(rawRows[0])) {
    const normalized = normalizeHeader(rawKey);
    if (COLUMN_ALIASES[normalized]) headerMap[normalized] = COLUMN_ALIASES[normalized];
  }

  const insertPlaceholders = COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${insertPlaceholders})`);
  const update = db.prepare(`UPDATE projects SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`);
  const existsStmt = db.prepare(`SELECT id FROM projects WHERE id = ?`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const newIds = [];

  for (const rawRow of rawRows) {
    const row = mapRow(rawRow, headerMap);
    if (!row.project_name || row.latitude == null || row.longitude == null || Number.isNaN(row.latitude) || Number.isNaN(row.longitude)) {
      skipped += 1;
      continue;
    }

    const values = COLUMNS.map((col) => row[col] ?? null);
    const existing = row.id != null && !Number.isNaN(row.id) ? existsStmt.get(row.id) : null;

    if (existing) {
      update.run(...values, row.id);
      updated += 1;
    } else {
      const result = insert.run(...values);
      inserted += 1;
      newIds.push({ id: result.lastInsertRowid, name: row.project_name });
    }
  }

  console.log(`"${sheetName}": ${inserted} inserted, ${updated} updated, ${skipped} skipped (missing name/latitude/longitude).`);
  if (newIds.length) {
    console.log('\nNew IDs (copy these back into the master spreadsheet\'s ID column):');
    newIds.forEach(({ id, name }) => console.log(`  ${id}\t${name}`));
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/importSpreadsheet.js <path-to-spreadsheet.xlsx>');
  process.exit(1);
}

importFile(filePath);
