// Three follow-up fixes from the ownership-research pass:
//
// 1. Remove community projects confirmed to have been sold outright to a
//    commercial developer (found during ownership research, not just
//    "shared" but fully divested — no longer a community energy project at
//    all): Killala Community Wind and Lisdowney Community Wind (both sold to
//    Greencoat Renewables), De Zuidlob farmer wind cooperative (Vattenfall
//    took 100% ownership, confirmed via Vattenfall/Nuon's own 2011 press
//    release).
//
// 2. Merge "Point Wind Farm" and "Beinn Ghrideag Community Wind Farm" —
//    confirmed duplicate entries for the same physical Lewis project (Point
//    and Sandwick Trust, 3 turbines, 9MW). Keeps the Beinn Ghrideag row
//    (richer technology_detail, correct "Operational" stage) but adopts
//    Point Wind Farm's more precise coordinates; deletes the Point Wind Farm
//    row.
//
// 3. Newburgh Community Trust was already project_stage = 'Stalled' in both
//    DB and master (matches the research finding that its wind farm was
//    rejected on appeal and never built) — no change needed, just confirmed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REMOVE_NAMES = [
  'Killala Community Wind',
  'Lisdowney Community Wind',
  'De Zuidlob farmer wind cooperative (Zeewolde)',
];

const MERGE_KEEP_NAME = 'Beinn Ghrideag Community Wind Farm';
const MERGE_REMOVE_NAME = 'Point Wind Farm';

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const pointRow = db.prepare('SELECT latitude, longitude FROM projects WHERE project_name = ?').get(MERGE_REMOVE_NAME);
  if (!pointRow) throw new Error(`${MERGE_REMOVE_NAME} not found in DB`);

  db.exec('BEGIN');
  db.prepare('UPDATE projects SET latitude = ?, longitude = ? WHERE project_name = ?')
    .run(pointRow.latitude, pointRow.longitude, MERGE_KEEP_NAME);
  const mergeDeleted = db.prepare('DELETE FROM projects WHERE project_name = ?').run(MERGE_REMOVE_NAME).changes;

  let removed = 0;
  const del = db.prepare('DELETE FROM projects WHERE project_name = ?');
  for (const name of REMOVE_NAMES) {
    removed += del.run(name).changes;
  }
  db.exec('COMMIT');

  console.log(`DB: merged ${MERGE_REMOVE_NAME} into ${MERGE_KEEP_NAME} (adopted its coordinates), deleted ${mergeDeleted} duplicate row.`);
  console.log(`DB: removed ${removed} projects sold to commercial developers.`);
  console.log('DB: total rows now:', db.prepare('SELECT COUNT(*) c FROM projects').get().c);
  db.close();

  return { lat: pointRow.latitude, lng: pointRow.longitude };
}

function fixMaster(pointCoords) {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  let rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const nameIndex = headerRow.indexOf('Project Name');
  const latIndex = headerRow.indexOf('Latitude');
  const lngIndex = headerRow.indexOf('Longitude');

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row && row[nameIndex] === MERGE_KEEP_NAME) {
      row[latIndex] = pointCoords.lat;
      row[lngIndex] = pointCoords.lng;
    }
  }

  const namesToDelete = new Set([MERGE_REMOVE_NAME, ...REMOVE_NAMES]);
  const before = rows.length;
  rows = rows.filter((row, i) => i === 0 || !row || !namesToDelete.has(row[nameIndex]));
  const deleted = before - rows.length;

  console.log(`Master: updated coordinates for ${MERGE_KEEP_NAME}, deleted ${deleted} rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  wb.Sheets[sheetName] = newSheet;
  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

const pointCoords = fixDb();
fixMaster(pointCoords);
