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
  projectstage: 'project_stage',
  latitude: 'latitude',
  longitude: 'longitude',
  country: 'country',
  region: 'region',
};

const NUMERIC_COLUMNS = new Set(['capacity_mw', 'latitude', 'longitude']);

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
