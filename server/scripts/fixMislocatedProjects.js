// One-time location fixes for three projects reported as sitting in the
// wrong place (two of them out at sea):
//
//   - East Neuk Community Wind (Crail Community Trust) was ~50km from its
//     namesake village of Crail, Fife — moved to Crail's real coordinates.
//   - Frederiksværk Fjernvarme and Horbelev Fjernvarme both had a longitude
//     exactly 6.0 degrees too low, placing them in the North Sea west of
//     Denmark (confirmed against real-world coordinates for both towns —
//     Horbelev's corrected longitude matches to within 0.003°). Same
//     magnitude of error on two unrelated rows suggests a shared data-entry
//     mistake rather than two independent ones; searched the rest of the
//     Danish dataset for the same longitude<7.5 pattern and found no other
//     rows affected.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXES = [
  { id: 2088, name: 'East Neuk Community Wind', latitude: 56.25977, longitude: -2.62777 },
  { id: 323, name: 'Frederiksværk Fjernvarme', longitude: 6.01031697554548 + 6 },
  { id: 498, name: 'Horbelev Fjernvarme', longitude: 6.053280013485569 + 6 },
];

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');
  let changed = 0;
  for (const f of FIXES) {
    if (f.latitude !== undefined) {
      changed += db.prepare('UPDATE projects SET latitude = ?, longitude = ? WHERE id = ?').run(f.latitude, f.longitude, f.id).changes;
    } else {
      changed += db.prepare('UPDATE projects SET longitude = ? WHERE id = ?').run(f.longitude, f.id).changes;
    }
  }
  db.exec('COMMIT');

  console.log(`DB: updated ${changed} rows.`);
  console.log(db.prepare(`SELECT id, project_name, latitude, longitude FROM projects WHERE id IN (${FIXES.map((f) => f.id).join(',')})`).all());
  db.close();
}

// East Neuk's master ID (2156) doesn't line up with the DB's (2088) — same
// drift documented in prior reclassification scripts — so matched by its
// original (wrong) coordinates instead. Frederiksværk and Horbelev's master
// IDs do line up, matched directly.
const MASTER_COORD_FIXES = [
  { oldLat: 56.70213, oldLon: -3.729967, latitude: 56.25977, longitude: -2.62777 },
];
const MASTER_ID_FIXES = [
  { id: 323, longitude: 6.01031697554548 + 6 },
  { id: 498, longitude: 6.053280013485569 + 6 },
];

function fixMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const idIndex = headerRow.indexOf('ID');
  const latIndex = headerRow.indexOf('Latitude');
  const lonIndex = headerRow.indexOf('Longitude');

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;

    const coordFix = MASTER_COORD_FIXES.find((f) => row[latIndex] === f.oldLat && row[lonIndex] === f.oldLon);
    if (coordFix) {
      row[latIndex] = coordFix.latitude;
      row[lonIndex] = coordFix.longitude;
      updated += 1;
      continue;
    }

    const idFix = MASTER_ID_FIXES.find((f) => Number(row[idIndex]) === f.id);
    if (idFix) {
      row[lonIndex] = idFix.longitude;
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
