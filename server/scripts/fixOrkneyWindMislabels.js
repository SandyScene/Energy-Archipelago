// One-time fix: two Orkney community wind turbine projects were mistagged
// with the wrong technology, which is how a "Retrofit" project ended up with
// a generation capacity attached (retrofit/energy-advice projects shouldn't
// have one at all — capacity_mw means generation/heat output).
//
// Both organisations turned out to operate their own 900kW community wind
// turbine via a dedicated trading subsidiary:
//   - Westray Development Trust -> Westray Renewable Energy Ltd (Vestas V39,
//     900kW) — was tagged "Retrofit".
//   - Stronsay Development Trust -> Stronsay Renewable Energy Ltd (900kW) —
//     was tagged "Energy Advice".
// In both cases capacity_mw (0.9) was already correct for the turbine; only
// the technology category was wrong. Reclassified to "Wind" rather than
// stripping the capacity.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXES = [
  { id: 2283, name: 'Westray Development Trust / Westray Renewable Energy Ltd' },
  { id: 2248, name: 'Stronsay Development Trust' },
];

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');
  const update = db.prepare(`UPDATE projects SET technology = 'Wind' WHERE id = ?`);
  let changed = 0;
  for (const { id } of FIXES) changed += update.run(id).changes;
  db.exec('COMMIT');

  console.log(`DB: reclassified ${changed} rows to "Wind".`);
  console.log(db.prepare('SELECT id, project_name, technology, capacity_mw FROM projects WHERE id IN (2283, 2248)').all());
  db.close();
}

// Master's own ID column doesn't line up with the DB's for these older
// Orkney-derived rows (a pre-existing drift documented in
// syncTechnologyToMaster.js — matching master row 2248 to DB row 2248 by ID
// alone actually points at an unrelated project, "Horshader Community
// Development Ltd"). Matched instead by exact coordinates plus the row's
// prior (wrong) technology value, since Westray has three same-named,
// same-coordinate master rows (Other/Retrofit/Bioenergy) for what the DB
// collapsed into a single entry — only the one whose Technology already
// read "Retrofit" is the match for DB id 2283.
const MASTER_FIXES = [
  { lat: 59.14071, lon: -2.600655, fromTechnology: 'Energy Advice' }, // Stronsay
  { lat: 59.30516, lon: -2.955488, fromTechnology: 'Retrofit' }, // Westray
];

function fixMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const techIndex = headerRow.indexOf('Technology');
  const latIndex = headerRow.indexOf('Latitude');
  const lonIndex = headerRow.indexOf('Longitude');
  if (techIndex === -1 || latIndex === -1 || lonIndex === -1) throw new Error('Technology/Latitude/Longitude column not found');

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (MASTER_FIXES.some((f) => row[latIndex] === f.lat && row[lonIndex] === f.lon && row[techIndex] === f.fromTechnology)) {
      row[techIndex] = 'Wind';
      updated += 1;
    }
  }

  console.log(`Master spreadsheet: updated ${updated} rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  newSheet['!ref'] = sheet['!ref'];
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

fixDb();
fixMaster();
