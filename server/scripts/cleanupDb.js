// One-time data hygiene pass, found while reviewing the dataset for the
// technology reclassification work:
//  - 2 rows had technology = NULL even though their own technology_detail
//    (or, for one, the project name) named a specific technology.
//  - 259 rows had venture_type = NULL and 2 rows had technology = NULL purely
//    because normalizeTechnology()/normalizeVentureType() returned null for
//    blank input instead of falling through to their documented Other/Unknown
//    default (fixed in importSpreadsheet.js; this backfills existing rows).
//  - 3 rows ("Wood pellet thermal heating systems") had bogus coordinates
//    (looks like unconverted projected-CRS Easting/Northing values landed in
//    the lat/lng columns) — corrected to the same Heidelberg coordinates used
//    by sibling rows from the same source batch.
//  - organisation_type had two case/hyphenation duplicates of the same value
//    ("Co-operative" vs "Cooperative", "Non-profit organisation" vs
//    "Non-profit Organisation") — collapsed onto one spelling each.
//  - 6 groups of rows (13 rows total) were exact duplicates of each other
//    across every field except id — kept the lowest id in each group, deleted
//    the rest (7 rows).
//  - Runs of 2+ spaces in project_name/lead_organisation/technology_detail
//    collapsed to a single space.
//
// Mirrors every fix into the master spreadsheet by ID where the affected rows
// have one (all of them here — none of these are among the ~430 legacy rows
// with a blank ID), so Render's auto-import stays consistent.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DUPLICATE_GROUPS_KEEP_DELETE = [
  { keep: 1361, delete: [1362] },
  { keep: 2606, delete: [2607] },
  { keep: 2611, delete: [2612] },
  { keep: 2430, delete: [2431] },
  { keep: 2674, delete: [2675] },
  { keep: 1432, delete: [1433, 1434] },
];

const HEIDELBERG_LAT = 49.4077;
const HEIDELBERG_LNG = 8.6908;

function collapseSpaces(value) {
  return value === null || value === undefined ? value : String(value).trim().replace(/ {2,}/g, ' ');
}

function cleanupDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');

  db.prepare(`UPDATE projects SET technology = 'Bioenergy' WHERE id = 1422`).run();
  db.prepare(`UPDATE projects SET technology = 'Solar' WHERE id = 1435`).run();

  const ventureFix = db.prepare(`UPDATE projects SET venture_type = 'Unknown' WHERE venture_type IS NULL`).run();

  const orgTypeFix1 = db.prepare(`UPDATE projects SET organisation_type = 'Cooperative' WHERE organisation_type = 'Co-operative'`).run();
  const orgTypeFix2 = db.prepare(`UPDATE projects SET organisation_type = 'Non-profit Organisation' WHERE organisation_type = 'Non-profit organisation'`).run();

  db.prepare(`UPDATE projects SET latitude = ?, longitude = ? WHERE id IN (1432, 1433, 1434)`).run(HEIDELBERG_LAT, HEIDELBERG_LNG);

  let deleted = 0;
  const del = db.prepare(`DELETE FROM projects WHERE id = ?`);
  for (const group of DUPLICATE_GROUPS_KEEP_DELETE) {
    for (const id of group.delete) {
      deleted += del.run(id).changes;
    }
  }

  let spaceFixed = 0;
  for (const col of ['project_name', 'lead_organisation', 'technology_detail']) {
    const rows = db.prepare(`SELECT id, ${col} AS v FROM projects WHERE ${col} LIKE '%  %'`).all();
    const update = db.prepare(`UPDATE projects SET ${col} = ? WHERE id = ?`);
    for (const row of rows) {
      update.run(collapseSpaces(row.v), row.id);
      spaceFixed += 1;
    }
  }

  db.exec('COMMIT');

  console.log(`DB: fixed 2 null technology rows.`);
  console.log(`DB: fixed ${ventureFix.changes} null venture_type rows -> "Unknown".`);
  console.log(`DB: normalized organisation_type: ${orgTypeFix1.changes} "Co-operative" -> "Cooperative", ${orgTypeFix2.changes} "Non-profit organisation" -> "Non-profit Organisation".`);
  console.log(`DB: fixed coordinates for 3 "Wood pellet thermal heating systems" rows.`);
  console.log(`DB: deleted ${deleted} exact-duplicate rows.`);
  console.log(`DB: collapsed double-spaces in ${spaceFixed} cells.`);

  const total = db.prepare('SELECT COUNT(*) c FROM projects').get();
  console.log('DB: total rows now:', total.c);
  db.close();
}

function cleanupMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  let rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const idIndex = headerRow.indexOf('ID');
  const techIndex = headerRow.indexOf('Technology');
  const orgTypeIndex = headerRow.indexOf('Organisation Type');
  const latIndex = headerRow.indexOf('Latitude');
  const lngIndex = headerRow.indexOf('Longitude');
  const nameIndex = headerRow.indexOf('Project Name');
  const leadOrgIndex = headerRow.indexOf('Lead Organisation');
  const detailIndex = headerRow.indexOf('Technology Detail');

  const byId = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const id = row[idIndex];
    if (id !== undefined && id !== '') byId.set(Number(id), i);
  }

  const techFixes = { 1422: 'Bioenergy', 1435: 'Solar' };
  for (const [id, tech] of Object.entries(techFixes)) {
    const rowIndex = byId.get(Number(id));
    if (rowIndex !== undefined) rows[rowIndex][techIndex] = tech;
  }

  for (const id of [1432, 1433, 1434]) {
    const rowIndex = byId.get(id);
    if (rowIndex !== undefined) {
      rows[rowIndex][latIndex] = HEIDELBERG_LAT;
      rows[rowIndex][lngIndex] = HEIDELBERG_LNG;
    }
  }

  let orgTypeUpdated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (row[orgTypeIndex] === 'Co-operative') {
      row[orgTypeIndex] = 'Cooperative';
      orgTypeUpdated += 1;
    } else if (row[orgTypeIndex] === 'Non-profit organisation') {
      row[orgTypeIndex] = 'Non-profit Organisation';
      orgTypeUpdated += 1;
    }
  }

  let spaceFixed = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    for (const idx of [nameIndex, leadOrgIndex, detailIndex]) {
      const value = row[idx];
      if (typeof value === 'string' && / {2,}/.test(value)) {
        row[idx] = collapseSpaces(value);
        spaceFixed += 1;
      }
    }
  }

  const deleteIds = DUPLICATE_GROUPS_KEEP_DELETE.flatMap((g) => g.delete);
  const deleteRowIndexes = new Set(deleteIds.map((id) => byId.get(id)).filter((i) => i !== undefined));
  rows = rows.filter((_, i) => !deleteRowIndexes.has(i));

  console.log(`Master: fixed 2 technology cells, 3 coordinate cells, ${orgTypeUpdated} organisation_type cells, ${spaceFixed} double-space cells, deleted ${deleteRowIndexes.size} duplicate rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

cleanupDb();
cleanupMaster();
