// Applies technology-type findings from background research for the 176
// Dutch "Other"-tagged organisations (see conversation for the full
// research summary — primarily HIER opgewekt's Lokale Energie Monitor and
// individual org site verification). Single-technology reclassifications
// just update the technology column; genuine multi-technology orgs are
// split into one row per technology, following the pattern established in
// splitMultiTechOther.js and applySeUkTechnology.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scratch = 'C:\\Users\\alexa\\AppData\\Local\\Temp\\claude\\C--Users-alexa-Desktop-EA-2-0\\85372cb3-1e4a-4ca6-8eda-8b3eb7013b26\\scratchpad\\';

const results = JSON.parse(readFileSync(scratch + 'results_nl_technology.json', 'utf8'));

const SINGLE_RECLASSIFY = {};
const SPLITS = {};
for (const r of results) {
  if (r.technology === 'Other') continue;
  if (r.technology === 'Multiple') {
    SPLITS[r.id] = r.multiple_technologies;
  } else {
    SINGLE_RECLASSIFY[r.id] = r.technology;
  }
}
console.log(`Loaded ${Object.keys(SINGLE_RECLASSIFY).length} single reclassifications, ${Object.keys(SPLITS).length} splits.`);

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');

  const updateSingle = db.prepare('UPDATE projects SET technology = ? WHERE id = ?');
  let reclassified = 0;
  for (const [id, technology] of Object.entries(SINGLE_RECLASSIFY)) {
    reclassified += updateSingle.run(technology, Number(id)).changes;
  }

  const getRow = db.prepare('SELECT * FROM projects WHERE id = ?');
  const deleteRow = db.prepare('DELETE FROM projects WHERE id = ?');
  const columns = [
    'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
    'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
    'project_stage', 'latitude', 'longitude', 'country', 'region',
  ];
  const insert = db.prepare(`INSERT INTO projects (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);

  let splitCount = 0;
  for (const [id, technologies] of Object.entries(SPLITS)) {
    const row = getRow.get(Number(id));
    if (!row) { console.log(`WARNING: id ${id} not found, skipping split`); continue; }
    deleteRow.run(Number(id));
    for (const technology of technologies) {
      const values = columns.map((c) => {
        if (c === 'technology') return technology;
        return row[c];
      });
      insert.run(...values);
      splitCount += 1;
    }
  }

  db.exec('COMMIT');
  console.log(`DB: reclassified ${reclassified} single rows, created ${splitCount} split rows.`);
  console.log('DB: Other count now:', db.prepare("SELECT COUNT(*) c FROM projects WHERE technology='Other'").get());
  db.close();
}

function fixMaster() {
  // Split rows no longer exist under their original id once fixDb() has run,
  // so matching uses a coordinate snapshot taken before that mutation
  // (nl_coords_snapshot.json), keyed by the original id.
  const snapshot = JSON.parse(readFileSync(scratch + 'nl_coords_snapshot.json', 'utf8'));
  const coordById = new Map(snapshot.map((r) => [r.id, r]));

  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const nameIndex = headerRow.indexOf('Project Name');
  const techIndex = headerRow.indexOf('Technology');
  const latIndex = headerRow.indexOf('Latitude');
  const lonIndex = headerRow.indexOf('Longitude');

  const byName = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row[nameIndex]) continue;
    const key = row[nameIndex];
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  function findUniqueMatch(id) {
    const info = coordById.get(id);
    if (!info) return null;
    const candidates = byName.get(info.project_name) || [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const coordMatches = candidates.filter((r) => r[latIndex] === info.latitude && r[lonIndex] === info.longitude);
      if (coordMatches.length === 1) return coordMatches[0];
    }
    return null;
  }

  let reclassified = 0;
  const unmatchedSingle = [];
  for (const [idStr, technology] of Object.entries(SINGLE_RECLASSIFY)) {
    const target = findUniqueMatch(Number(idStr));
    if (!target) { unmatchedSingle.push(idStr); continue; }
    target[techIndex] = technology;
    reclassified += 1;
  }

  const newRows = [headerRow];
  let splitCount = 0;
  const unmatchedSplit = [];
  const handledRowRefs = new Set();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;

    let splitId = null;
    for (const idStr of Object.keys(SPLITS)) {
      const info = coordById.get(Number(idStr));
      if (info && row[nameIndex] === info.project_name && row[latIndex] === info.latitude && row[lonIndex] === info.longitude) {
        splitId = Number(idStr);
        break;
      }
    }

    if (splitId !== null && !handledRowRefs.has(row)) {
      const candidates = byName.get(row[nameIndex]) || [];
      const info = coordById.get(splitId);
      const coordMatches = candidates.filter((r) => r[latIndex] === info.latitude && r[lonIndex] === info.longitude);
      if (coordMatches.length !== 1) { unmatchedSplit.push(splitId); newRows.push(row); continue; }
      for (const technology of SPLITS[splitId]) {
        const clone = [...row];
        clone[techIndex] = technology;
        newRows.push(clone);
        splitCount += 1;
      }
      continue;
    }

    newRows.push(row);
  }

  console.log(`Master: reclassified ${reclassified} single rows (unmatched: ${unmatchedSingle.length}).`);
  console.log(`Master: created ${splitCount} split rows (unmatched splits: ${unmatchedSplit.length}).`);
  if (unmatchedSingle.length) console.log('Unmatched single ids:', unmatchedSingle.join(', '));
  if (unmatchedSplit.length) console.log('Unmatched split ids:', unmatchedSplit.join(', '));

  const newSheet = utils.aoa_to_sheet(newRows);
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

fixDb();
fixMaster();
