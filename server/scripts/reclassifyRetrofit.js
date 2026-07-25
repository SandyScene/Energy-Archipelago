// One-time fix: the "Retrofit" (energy efficiency) category had emptied out
// to 0 rows entirely, which prompted a check for genuine retrofit/efficiency
// projects hiding under other categories. Found three, all confirmed by
// research or by the source data's own technology_detail text:
//
//   - Islay Energy Trust's "Renewables And Carbon/Energy Savings (RACES)" —
//     tagged "Other". The trust's own stated remit distinguishes generation
//     projects (tracked separately, e.g. their Solar/Marine rows) from a
//     dedicated "insulation, energy efficiency" programme — this row is that
//     programme.
//   - "Reading Draughtbusters" — tagged "Other". A volunteer-run home
//     draught-proofing/insulation charity (confirmed via web search) — a
//     textbook Retrofit project, not generation.
//   - Kelsale-cum-Carlton Community Energy — tagged "Solar", detail "Warmer
//     homes etc? School??". A prior reclassification pass (see
//     reclassifyOtherTechnology.js) already decided this exact detail text
//     should be "Retrofit", but its dict key had a double space
//     ("Warmer homes etc?  School??") that no longer matched the row's
//     single-spaced text after later whitespace normalization, so the
//     UPDATE silently missed it. Fixed here with a straight ID match.
//
// Master's own ID column doesn't reliably line up with the DB's for these
// legacy rows (same drift documented in fixOrkneyWindMislabels.js), so the
// RACES and Draughtbusters master rows are matched by exact coordinates +
// their current (wrong) technology/detail instead.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_FIXES = [2217, 2469, 2636];

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');
  const update = db.prepare(`UPDATE projects SET technology = 'Retrofit' WHERE id = ?`);
  let changed = 0;
  for (const id of DB_FIXES) changed += update.run(id).changes;
  db.exec('COMMIT');

  console.log(`DB: reclassified ${changed} rows to "Retrofit".`);
  console.log(db.prepare(`SELECT id, project_name, technology, technology_detail FROM projects WHERE id IN (${DB_FIXES.join(',')})`).all());
  db.close();
}

const MASTER_FIXES = [
  { lat: 55.75668, lon: -6.287563, fromTechnology: 'Other' }, // RACES (Islay Energy Trust)
  { lat: 51.452691, lon: -0.96807114, fromTechnology: 'Heat Generation' }, // Reading Draughtbusters
];
// Kelsale-cum-Carlton matched by its unique technology_detail text instead of
// coordinates, since two different rows share its coordinates.
const MASTER_DETAIL_FIX = { detail: 'Warmer homes etc? School??', fromTechnology: 'Solar PV' };

function fixMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const techIndex = headerRow.indexOf('Technology');
  const detailIndex = headerRow.indexOf('Technology Detail');
  const latIndex = headerRow.indexOf('Latitude');
  const lonIndex = headerRow.indexOf('Longitude');
  if (techIndex === -1 || detailIndex === -1 || latIndex === -1 || lonIndex === -1) throw new Error('Required column not found');

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const matchesCoordFix = MASTER_FIXES.some((f) => row[latIndex] === f.lat && row[lonIndex] === f.lon && row[techIndex] === f.fromTechnology);
    const matchesDetailFix = row[detailIndex] === MASTER_DETAIL_FIX.detail && row[techIndex] === MASTER_DETAIL_FIX.fromTechnology;
    if (matchesCoordFix || matchesDetailFix) {
      row[techIndex] = 'Retrofit';
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
