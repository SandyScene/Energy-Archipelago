// The master spreadsheet's "Technology" column had never been rewritten
// after import — it still held raw source values (e.g. "Electric Transport",
// "Electrical Storage", "Solar PV") that importSpreadsheet.js's
// normalizeTechnology() re-derives from on every import. That means the DB's
// canonical technology values (including the "Other" reclassification just
// done) would silently be lost on the next Render redeploy, which re-imports
// this file into an empty DB.
//
// Fix: for every master row with a numeric ID, overwrite its Technology cell
// with the current DB value for that ID — the DB is the source of truth here.
//
// ~430 legacy rows have a blank ID (an older gap: they were inserted into the
// DB in earlier work without their new ID ever being copied back into the
// master spreadsheet) and can't be reliably matched back to a DB row — an
// earlier version of this script tried a name+coordinates+technology_detail
// fallback, but comparing aggregate category totals before/after showed it
// was occasionally matching the wrong row where multiple projects share
// identical name/coordinates/detail (e.g. generic or blank detail text),
// silently writing incorrect technology values. Getting an occasional row
// wrong is worse than leaving it stale, so those rows are left untouched
// here; they'll keep re-importing as "Other" until they're properly
// reconciled (backfilling real IDs into the master spreadsheet).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
const db = new DatabaseSync(dbPath);
const techById = new Map(
  db.prepare('SELECT id, technology FROM projects').all().map((r) => [r.id, r.technology]),
);
db.close();

const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
const buf = readFileSync(filePath);
const wb = read(buf, { type: 'buffer' });
const sheetName = 'Master Dataset';
const sheet = wb.Sheets[sheetName];
const rows = utils.sheet_to_json(sheet, { header: 1 });

const headerRow = rows[0];
const idIndex = headerRow.indexOf('ID');
const techIndex = headerRow.indexOf('Technology');
if (idIndex === -1 || techIndex === -1) throw new Error('ID or Technology column not found');

let updated = 0;
let blankId = 0;
let noDbMatch = 0;
for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i];
  if (!row) continue;
  const rawId = row[idIndex];
  if (rawId === undefined || rawId === '') {
    blankId += 1;
    continue;
  }
  const technology = techById.get(Number(rawId));
  if (technology === undefined) {
    noDbMatch += 1;
    continue;
  }
  if (row[techIndex] !== technology) {
    row[techIndex] = technology;
    updated += 1;
  }
}

console.log(`Master spreadsheet: synced ${updated} Technology cells by ID.`);
console.log(`Blank-ID rows left untouched (see comment above): ${blankId}`);
if (noDbMatch) console.log(`WARNING: ${noDbMatch} rows had an ID not found in the DB.`);

const newSheet = utils.aoa_to_sheet(rows);
newSheet['!ref'] = sheet['!ref'];
if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
wb.Sheets[sheetName] = newSheet;

const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(filePath, outBuf);
console.log('Wrote', filePath);
