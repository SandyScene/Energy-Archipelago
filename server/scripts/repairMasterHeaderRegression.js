// Repairs a bug in splitMultiTechOther.js's fixMaster(): it rebuilt the
// sheet from a new array starting at index 1 (skipping the header row)
// without ever pushing the header back in, silently dropping row 1 (the
// column names) from the master spreadsheet. Confirmed via git history —
// present in commit 640529b, gone by e20a743. This restores it, since a
// headerless first data row would be read as the header by
// importSpreadsheet.js's `utils.sheet_to_json(sheet, { defval: '' })` on
// Render's next redeploy, corrupting every subsequent import.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');

const HEADER = [
  'ID', 'Date Data Source', 'Project Name', 'Lead Organisation', 'Organisation Website',
  'Organisation Type', 'Venture Type', 'Technology', 'Technology Detail', 'Capacity (kW)',
  'Project Stage', 'Latitude', 'Longitude', 'Country', 'Region', 'Location Precision', 'Source File',
];

const buf = readFileSync(filePath);
const wb = read(buf, { type: 'buffer' });
const sheetName = 'Master Dataset';
const sheet = wb.Sheets[sheetName];
const rows = utils.sheet_to_json(sheet, { header: 1 });

if (rows[0][2] === 'Project Name') {
  console.log('Header already present — nothing to do.');
  process.exit(0);
}

const repaired = [HEADER, ...rows];
const newSheet = utils.aoa_to_sheet(repaired);
if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
wb.Sheets[sheetName] = newSheet;

const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(filePath, outBuf);
console.log(`Repaired: prepended header row. Total rows now ${repaired.length} (was ${rows.length}).`);
