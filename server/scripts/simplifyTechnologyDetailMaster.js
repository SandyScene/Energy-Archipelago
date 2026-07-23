// Mirrors simplifyTechnologyDetail.js against the checked-in master spreadsheet,
// so Render's auto-import (which loads this file into an empty DB) stays
// consistent with the live database.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, write, utils } from 'xlsx';
import { simplify, countWords } from './simplifyTechnologyDetail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');

const buf = readFileSync(filePath);
const wb = read(buf, { type: 'buffer' });
const sheetName = 'Master Dataset';
const sheet = wb.Sheets[sheetName];
const rows = utils.sheet_to_json(sheet, { header: 1 });

const headerRow = rows[0];
const colIndex = headerRow.indexOf('Technology Detail');
if (colIndex === -1) throw new Error('Technology Detail column not found');

let updated = 0;
const unmatched = [];
for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i];
  if (!row || row[colIndex] === undefined || row[colIndex] === null || row[colIndex] === '') continue;
  const original = String(row[colIndex]);
  const result = simplify(original);
  if (result.unmatched) {
    unmatched.push(original);
    continue;
  }
  if (result.changed) {
    row[colIndex] = result.value;
    updated += 1;
  }
}

console.log(`Updated ${updated} rows in master spreadsheet.`);
if (unmatched.length) {
  console.log(`UNMATCHED (${unmatched.length}):`);
  for (const u of unmatched) console.log(' -', u);
}

const remaining = rows.slice(1).filter((row) => row && row[colIndex] && countWords(String(row[colIndex])) > 5);
console.log(`Rows still over 5 words: ${remaining.length}`);

const newSheet = utils.aoa_to_sheet(rows);
newSheet['!ref'] = sheet['!ref'];
if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
wb.Sheets[sheetName] = newSheet;

const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(filePath, outBuf);
console.log('Wrote', filePath);
