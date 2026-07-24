// Applies the results of the community-ownership research pass (262 hydro/
// solar/wind projects >5MW, researched via 12 parallel web-research agents —
// see scratchpad batch files for full per-project findings/sources) to the
// live DB and master spreadsheet.
//
// For each project confirmed as "shared" ownership with a specific
// percentage found, capacity_mw is reduced to the community's share of the
// existing recorded capacity (current_capacity_mw * percentage / 100) —
// keeping our own stored total as the base rather than an externally-cited
// total, so the figure stays internally consistent with the rest of the
// dataset. Projects confirmed "fully_community", or "shared" without a
// specific percentage/MW ever being publicly disclosed, or "not_found", are
// left completely unchanged per the user's explicit instruction not to
// guess without evidence.
//
// Master rows are matched by project_name, NOT by the master's own "ID"
// column. That column turned out to be unreliable: a fresh import into an
// empty DB (what Render always does) assigns IDs purely by row position —
// the stored "ID" cell only matters when re-importing against an
// ALREADY-POPULATED local DB, so it can silently disagree with what a fresh
// import would actually assign. An earlier version of this script matched by
// ID and, verified against a fresh-import simulation, wrote 6 capacity
// fixes to the wrong master rows entirely. Project names here are all
// confirmed unique in the master sheet.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = 'C:/Users/alexa/AppData/Local/Temp/claude/C--Users-alexa-Desktop-EA-2-0/85372cb3-1e4a-4ca6-8eda-8b3eb7013b26/scratchpad/batches/SHARED-ONLY.json';

const shared = JSON.parse(readFileSync(resultsPath, 'utf8')).filter((s) => s.community_percentage != null);

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function applyDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const getRow = db.prepare('SELECT id, project_name, capacity_mw FROM projects WHERE id = ?');
  const update = db.prepare('UPDATE projects SET capacity_mw = ? WHERE id = ?');

  db.exec('BEGIN');
  let updated = 0;
  const applied = [];
  for (const s of shared) {
    const row = getRow.get(s.id);
    if (!row) continue;
    const newCapacity = round(row.capacity_mw * s.community_percentage / 100);
    update.run(newCapacity, s.id);
    applied.push({ name: row.project_name, newCapacityMw: newCapacity });
    updated += 1;
  }
  db.exec('COMMIT');

  console.log(`DB: updated capacity_mw for ${updated} projects.`);
  db.close();
  return applied;
}

function applyMaster(applied) {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const nameIndex = headerRow.indexOf('Project Name');
  const capacityIndex = headerRow.indexOf('Capacity (kW)');

  let updated = 0;
  const unmatched = [];
  for (const a of applied) {
    let matched = false;
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row && row[nameIndex] === a.name) {
        row[capacityIndex] = a.newCapacityMw * 1000; // MW -> kW
        updated += 1;
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(a.name);
  }

  console.log(`Master: updated ${updated} rows by project_name.`);
  if (unmatched.length) console.log('Unmatched:', unmatched);

  const newSheet = utils.aoa_to_sheet(rows);
  wb.Sheets[sheetName] = newSheet;
  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

const applied = applyDb();
applyMaster(applied);
