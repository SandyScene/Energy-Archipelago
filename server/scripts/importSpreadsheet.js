// Backend-only bulk importer. Not exposed via any HTTP route — run manually:
//   node scripts/importSpreadsheet.js path/to/master-spreadsheet.xlsx
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { db } from '../src/db.js';

const COLUMN_ALIASES = {
  dateofdatasource: 'date_of_data_source',
  projectname: 'project_name',
  primaryorganisation: 'primary_organisation',
  primaryorganization: 'primary_organisation',
  primaryorganisationtype: 'primary_organisation_type',
  primaryorganizationtype: 'primary_organisation_type',
  technology: 'technology',
  venturetype: 'venture_type',
  totalprojectcapacity: 'total_project_capacity_mw',
  totalprojectcapacitymw: 'total_project_capacity_mw',
  estimatedannualgeneration: 'generation_capacity_mwh',
  estimatedannualgenerationmwh: 'generation_capacity_mwh',
  generationcapacity: 'generation_capacity_mwh',
  generationcapacitymwh: 'generation_capacity_mwh',
  projectstage: 'project_stage',
  latitude: 'latitude',
  longitude: 'longitude',
  country: 'country',
  regionlevel1: 'region_level_1',
};

const NUMERIC_COLUMNS = new Set(['total_project_capacity_mw', 'generation_capacity_mwh', 'latitude', 'longitude']);

const COLUMNS = [
  'date_of_data_source', 'project_name', 'primary_organisation', 'primary_organisation_type',
  'technology', 'venture_type', 'total_project_capacity_mw', 'generation_capacity_mwh',
  'project_stage', 'latitude', 'longitude', 'country', 'region_level_1',
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
    } else if (NUMERIC_COLUMNS.has(column)) {
      row[column] = Number(value);
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

  const placeholders = COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${placeholders})`);

  let inserted = 0;
  let skipped = 0;

  for (const rawRow of rawRows) {
    const row = mapRow(rawRow, headerMap);
    if (!row.project_name || row.latitude == null || row.longitude == null || Number.isNaN(row.latitude) || Number.isNaN(row.longitude)) {
      skipped += 1;
      continue;
    }
    insert.run(...COLUMNS.map((col) => row[col] ?? null));
    inserted += 1;
  }

  console.log(`Imported ${inserted} project(s) from "${sheetName}" (${skipped} row(s) skipped — missing name/latitude/longitude).`);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/importSpreadsheet.js <path-to-spreadsheet.xlsx>');
  process.exit(1);
}

importFile(filePath);
