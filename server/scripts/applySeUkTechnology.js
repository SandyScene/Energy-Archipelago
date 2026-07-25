// Applies technology-type findings from background research for the
// Sweden/UK "Other"-tagged organisations (see conversation for the full
// per-org research summary). Single-technology reclassifications just
// update the technology column; genuine multi-technology orgs are split
// into one row per technology, following the same pattern as
// splitMultiTechOther.js. Per-technology capacity is only set where the
// research (or the row's own technology_detail, e.g. "1x 6kW" matching a
// specific turbine) gave a reliable figure.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scratch = 'C:\\Users\\alexa\\AppData\\Local\\Temp\\claude\\C--Users-alexa-Desktop-EA-2-0\\85372cb3-1e4a-4ca6-8eda-8b3eb7013b26\\scratchpad\\';

const SINGLE_RECLASSIFY = {
  1907: 'Solar', 1933: 'Solar', 1947: 'Solar', 1959: 'Solar',
  2258: 'Wind', 2261: 'Wind', 2282: 'Wind',
  2342: 'Solar', 2406: 'Solar', 2442: 'Solar', 2532: 'Solar',
  2575: 'Wind', 2576: 'Solar', 2590: 'Hydro', 2591: 'Solar',
  2599: 'Hydro', 2603: 'Solar', 2621: 'Solar', 2671: 'Hydro',
  2260: 'Wind', 2240: 'Wind', 2259: 'Wind', 2220: 'Wind',
  2384: 'Solar', 2687: 'Solar', 2278: 'Hydro', 2456: 'Solar',
  2686: 'Solar', 2377: 'Solar', 2692: 'Solar',
};

const SPLITS = {
  1932: [{ technology: 'Low Carbon Heating', capacity_mw: null }, { technology: 'Bioenergy', capacity_mw: null }],
  1976: [{ technology: 'Low Carbon Heating', capacity_mw: null }, { technology: 'Bioenergy', capacity_mw: null }],
  1992: [{ technology: 'Bioenergy', capacity_mw: null }, { technology: 'Wind', capacity_mw: null }, { technology: 'Solar', capacity_mw: null }],
  2000: [{ technology: 'Low Carbon Heating', capacity_mw: null }, { technology: 'Bioenergy', capacity_mw: null }],
  2003: [{ technology: 'Solar', capacity_mw: null }, { technology: 'Wind', capacity_mw: null }],
  2451: [{ technology: 'Solar', capacity_mw: null }, { technology: 'Battery Energy Storage System', capacity_mw: null }],
  2606: [{ technology: 'Solar', capacity_mw: null }, { technology: 'Battery Energy Storage System', capacity_mw: null }],
  2674: [{ technology: 'Solar', capacity_mw: 0.5 }, { technology: 'Wind', capacity_mw: null }],
  2285: [{ technology: 'Wind', capacity_mw: 0.006 }, { technology: 'Low Carbon Heating', capacity_mw: null }],
};

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
    for (const { technology, capacity_mw } of technologies) {
      const values = columns.map((c) => {
        if (c === 'technology') return technology;
        if (c === 'capacity_mw') return capacity_mw;
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
  const coords = JSON.parse(readFileSync(scratch + 'se_uk_coords.json', 'utf8'));
  const coordById = new Map(coords.map((r) => [r.id, r]));

  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const nameIndex = headerRow.indexOf('Project Name');
  const techIndex = headerRow.indexOf('Technology');
  const capIndex = headerRow.indexOf('Capacity (kW)');
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
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;

    // Is this row one of our split targets?
    let splitId = null;
    for (const [idStr] of Object.entries(SPLITS)) {
      const info = coordById.get(Number(idStr));
      if (info && row[nameIndex] === info.project_name && row[latIndex] === info.latitude && row[lonIndex] === info.longitude) {
        splitId = Number(idStr);
        break;
      }
    }

    if (splitId !== null) {
      const candidates = byName.get(row[nameIndex]) || [];
      const info = coordById.get(splitId);
      const coordMatches = candidates.filter((r) => r[latIndex] === info.latitude && r[lonIndex] === info.longitude);
      if (coordMatches.length !== 1) { unmatchedSplit.push(splitId); newRows.push(row); continue; }
      for (const { technology, capacity_mw } of SPLITS[splitId]) {
        const clone = [...row];
        clone[techIndex] = technology;
        if (capIndex !== -1 && capacity_mw != null) clone[capIndex] = capacity_mw * 1000;
        newRows.push(clone);
        splitCount += 1;
      }
      continue;
    }

    newRows.push(row);
  }

  console.log(`Master: reclassified ${reclassified} single rows (unmatched: ${unmatchedSingle.join(', ') || 'none'}).`);
  console.log(`Master: created ${splitCount} split rows (unmatched splits: ${unmatchedSplit.join(', ') || 'none'}).`);

  const newSheet = utils.aoa_to_sheet(newRows);
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

fixDb();
fixMaster();
