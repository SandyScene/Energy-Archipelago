// One-time cleanup: recode every project_stage value in the DB and master
// spreadsheet onto the 5 canonical stages (Early Stage, Mid-Stage, Operational,
// Stalled, Unknown). Run against the live DB and the master spreadsheet so
// Render's auto-import stays consistent.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';
import { normalizeProjectStage } from './projectStage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function recodeDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const rows = db.prepare('SELECT DISTINCT project_stage FROM projects').all();
  const updateNull = db.prepare('UPDATE projects SET project_stage = ? WHERE project_stage IS NULL');
  const updateNotNull = db.prepare('UPDATE projects SET project_stage = ? WHERE project_stage = ?');

  let updated = 0;
  db.exec('BEGIN');
  for (const row of rows) {
    const original = row.project_stage;
    const canonical = normalizeProjectStage(original);
    if (original === canonical) continue;
    if (original === null) {
      updateNull.run(canonical);
    } else {
      updateNotNull.run(canonical, original);
    }
    updated += 1;
  }
  db.exec('COMMIT');

  console.log(`DB: recoded ${updated} distinct project_stage values.`);
  const remaining = db.prepare('SELECT DISTINCT project_stage FROM projects').all();
  console.log('DB: distinct values now:', remaining.map((r) => r.project_stage));
  db.close();
}

function recodeMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const colIndex = headerRow.indexOf('Project Stage');
  if (colIndex === -1) throw new Error('Project Stage column not found');

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const original = row[colIndex] === undefined || row[colIndex] === '' ? null : String(row[colIndex]);
    const canonical = normalizeProjectStage(original);
    if (row[colIndex] !== canonical) {
      row[colIndex] = canonical;
      updated += 1;
    }
  }

  console.log(`Master spreadsheet: recoded ${updated} rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  newSheet['!ref'] = sheet['!ref'];
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

recodeDb();
recodeMaster();
