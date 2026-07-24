// Appends the same rows that importGlobalProjects.js inserted into the live
// DB onto the checked-in master spreadsheet, so Render's auto-import (which
// loads this file into an empty DB) stays consistent with the live data.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, write, utils } from 'xlsx';
import { buildRow, COLUMNS } from './importGlobalProjects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MASTER_COLUMN_BY_FIELD = {
  date_of_data_source: 'Date Data Source',
  project_name: 'Project Name',
  lead_organisation: 'Lead Organisation',
  organisation_website: 'Organisation Website',
  organisation_type: 'Organisation Type',
  venture_type: 'Venture Type',
  technology: 'Technology',
  technology_detail: 'Technology Detail',
  capacity_mw: 'Capacity (kW)', // master sheet stores capacity in kW
  project_stage: 'Project Stage',
  latitude: 'Latitude',
  longitude: 'Longitude',
  country: 'Country',
  region: 'Region',
};

const sourceFilePath = process.argv[2];
if (!sourceFilePath) {
  console.error('Usage: node scripts/appendGlobalProjectsToMaster.js <path-to-Global-Community-Energy-Projects.xlsx>');
  process.exit(1);
}

const sourceBuf = readFileSync(sourceFilePath);
const sourceWb = read(sourceBuf, { type: 'buffer' });
const sourceSheet = sourceWb.Sheets['Global Projects'];
const sourceRows = utils.sheet_to_json(sourceSheet, { defval: '' });

const masterPath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
const masterBuf = readFileSync(masterPath);
const masterWb = read(masterBuf, { type: 'buffer' });
const sheetName = 'Master Dataset';
const masterSheet = masterWb.Sheets[sheetName];
const masterRows = utils.sheet_to_json(masterSheet, { header: 1 });
const headerRow = masterRows[0];

let appended = 0;
for (const raw of sourceRows) {
  const row = buildRow(raw);
  if (!row) continue;

  const newRow = headerRow.map((header) => {
    const field = Object.keys(MASTER_COLUMN_BY_FIELD).find((f) => MASTER_COLUMN_BY_FIELD[f] === header);
    if (!field) return '';
    let value = row[field];
    if (field === 'capacity_mw') value = value == null ? '' : value * 1000; // MW -> kW
    return value ?? '';
  });
  masterRows.push(newRow);
  appended += 1;
}

console.log(`Appending ${appended} rows to the master spreadsheet.`);

const newSheet = utils.aoa_to_sheet(masterRows);
masterWb.Sheets[sheetName] = newSheet;

const outBuf = write(masterWb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(masterPath, outBuf);
console.log('Wrote', masterPath);
