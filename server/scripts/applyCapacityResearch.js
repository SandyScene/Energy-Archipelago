// Applies capacity_mw findings from the background research agents (see
// results_us.json / results_se.json / results_rest.json / results_nl.json in
// the scratchpad) to the live DB and master spreadsheet.
//
// These rows all belong to the "Global Community Energy Projects" import
// batch, which has no ID correspondence in the master spreadsheet at all
// (blank-ID legacy rows — same category documented in
// syncTechnologyToMaster.js). Master rows are matched by exact project_name,
// disambiguated by exact coordinates when a name isn't unique; ambiguous or
// unmatched rows are skipped and logged rather than guessed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scratch = 'C:\\Users\\alexa\\AppData\\Local\\Temp\\claude\\C--Users-alexa-Desktop-EA-2-0\\85372cb3-1e4a-4ca6-8eda-8b3eb7013b26\\scratchpad\\';

const RESULT_FILES = ['results_us.json', 'results_se.json', 'results_rest.json', 'results_nl.json'];

function loadFindings() {
  const findings = [];
  for (const file of RESULT_FILES) {
    const arr = JSON.parse(readFileSync(scratch + file, 'utf8'));
    for (const r of arr) {
      if (r.capacity_mw != null && !Number.isNaN(Number(r.capacity_mw))) {
        findings.push({ id: r.id, capacity_mw: Number(r.capacity_mw), source_url: r.source_url || '', note: r.note || '' });
      }
    }
  }
  return findings;
}

function updateDb(findings) {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const getRow = db.prepare('SELECT id, project_name, country, latitude, longitude, capacity_mw FROM projects WHERE id = ?');
  const update = db.prepare('UPDATE projects SET capacity_mw = ? WHERE id = ?');

  const applied = [];
  const skipped = [];

  db.exec('BEGIN');
  for (const f of findings) {
    const row = getRow.get(f.id);
    if (!row) { skipped.push({ ...f, reason: 'id not found in DB' }); continue; }
    update.run(f.capacity_mw, f.id);
    applied.push({ ...f, project_name: row.project_name, country: row.country, latitude: row.latitude, longitude: row.longitude });
  }
  db.exec('COMMIT');

  console.log(`DB: applied capacity to ${applied.length} rows, skipped ${skipped.length}.`);
  db.close();
  return applied;
}

function updateMaster(applied) {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const nameIndex = headerRow.indexOf('Project Name');
  const capIndex = headerRow.indexOf('Capacity (kW)');
  const latIndex = headerRow.indexOf('Latitude');
  const lonIndex = headerRow.indexOf('Longitude');
  if (nameIndex === -1 || capIndex === -1) throw new Error('Required column not found');

  // Index master rows by name for matching.
  const byName = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row[nameIndex]) continue;
    const key = row[nameIndex];
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  let updated = 0;
  const unmatched = [];
  const ambiguous = [];

  for (const f of applied) {
    const candidates = byName.get(f.project_name) || [];
    let target = null;
    if (candidates.length === 1) {
      target = candidates[0];
    } else if (candidates.length > 1) {
      const coordMatches = candidates.filter((r) => r[latIndex] === f.latitude && r[lonIndex] === f.longitude);
      if (coordMatches.length === 1) target = coordMatches[0];
      else { ambiguous.push(f); continue; }
    } else {
      unmatched.push(f);
      continue;
    }
    target[capIndex] = f.capacity_mw * 1000;
    updated += 1;
  }

  console.log(`Master: updated ${updated} rows. Unmatched: ${unmatched.length}. Ambiguous (skipped): ${ambiguous.length}.`);
  if (unmatched.length) console.log('Unmatched names:', unmatched.map((u) => u.project_name).join(' | '));
  if (ambiguous.length) console.log('Ambiguous names:', ambiguous.map((a) => a.project_name).join(' | '));

  const newSheet = utils.aoa_to_sheet(rows);
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

const findings = loadFindings();
console.log(`Loaded ${findings.length} capacity findings from research results.`);
const applied = updateDb(findings);
updateMaster(applied);
