// Second data-accuracy pass, prompted by user-reported examples: a project
// tagged Wind whose technology_detail was "Run of River" (a hydro technique),
// and "Torrance Farm" (lead_organisation "Torrance Farm Community Wind
// Co-operative") still tagged Other despite the org name naming the tech.
//
// Three categories of fix, all found by auditing technology_detail/
// project_name/lead_organisation against the assigned technology:
//
// 1. DETAIL_FIXES — technology_detail is an unambiguous single-technology
//    phrase (e.g. "Run of River", "Wood Burning Boiler") but the row was
//    tagged with a different technology. Applied regardless of current
//    technology, EXCEPT rows already tagged Low Carbon Transport (those were
//    deliberately kept as Transport even though a generation asset is named
//    as the power source — see reclassifyTransport.js).
// 2. NAME_FIXES — technology_detail is blank or non-specific (e.g. "3x 3MW",
//    "Low Head") but the project_name or lead_organisation names the
//    technology (e.g. "Torrance Farm Community Wind Co-operative",
//    "Hepburn Wind"). Matched by id since these were found by direct
//    inspection, not text pattern.
// 3. REVERT_TO_OTHER — 5 rows from the Global Community Energy Projects
//    import (see importGlobalProjects.js OVERRIDES) were deliberately set to
//    "Other" because their technology_detail describes a genuinely diverse,
//    multi-technology cooperative/network with no single dominant tech (e.g.
//    "Umbrella of 113 local citizen energy cooperatives" covering solar,
//    wind, hydro, biogas...). A later reclassification pass (which built its
//    detail-text map from a different set of rows) coincidentally matched
//    the same detail text and overwrote these with a single first-named
//    technology, silently undoing the more informed original call. Reverted
//    by project_name, the only stable identifier these blank-ID rows have.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DETAIL_FIXES = {
  'Run of River': 'Hydro',
  'Run of river': 'Hydro',
  'Roof Mounted Solar PV': 'Solar',
  'Ground Mounted Solar PV': 'Solar',
  'Solar PV': 'Solar',
  'Solar Thermal': 'Solar',
  'Solar thermal': 'Solar',
  'Wood Burning Boiler': 'Bioenergy',
  'Ground Source Heat Pump': 'Heat Pump',
  'Anaerobic Digestion': 'Bioenergy',
  'Biomass': 'Bioenergy',
  'Tidal': 'Marine',
  'Tidal impoundment': 'Marine',
  'CHP': 'Bioenergy',
  'Air source heat pump': 'Heat Pump',
  'Domestic air source heat pumps': 'Heat Pump',
  'Water source heat pump': 'Heat Pump',
  'Borehole heat pump, retrofit': 'Heat Pump',
  'Shared-loop ground source heat pump': 'Heat Pump',
  'Ground source heat pump, housing': 'Heat Pump',
  'Hybrid heat pump network': 'Heat Pump',
  'Heat pump projects': 'Heat Pump',
  'Community wind turbine project': 'Wind',
  'Wind turbine, 900kW': 'Wind',
  'Wind project, planning consent': 'Wind',
  'Solar. Others confidential.': 'Solar',
  'Solar co-op pioneer programme': 'Solar',
  'Solar co-op development': 'Solar',
  'Solar and battery storage': 'Solar',
  'Communal solar power scheme': 'Solar',
  'Solar farm development': 'Solar',
  'Solar farm project': 'Solar',
  'Solar farm feasibility study': 'Solar',
  'Solar farm feasibility grant': 'Solar',
  'Solar PV, planning permission': 'Solar',
  'Solar PV, community building': 'Solar',
  'Solar PV, schools': 'Solar',
  'Solar PV canopy, school': 'Solar',
  'Rooftop solar PV, co-op': 'Solar',
  "Solar farm, 30MW": 'Solar',
  'Community solar farm, feasibility': 'Solar',
  'Hydropower joint venture': 'Hydro',
  'Hydropower, River Thames weir': 'Hydro',
  'Solar for schools, hydro': 'Hydro',
};

const NAME_FIXES = [
  { id: 5, technology: 'Solar' },
  { id: 6, technology: 'Solar' },
  { id: 10, technology: 'Wind' },
  { id: 11, technology: 'Wind' },
  { id: 12, technology: 'Solar' },
  { id: 16, technology: 'Solar' },
  { id: 17, technology: 'Wind' },
  { id: 18, technology: 'Wind' },
  { id: 19, technology: 'Solar' },
  { id: 27, technology: 'Solar' },
  { id: 29, technology: 'Wind' },
  { id: 30, technology: 'Solar' },
  { id: 2213, technology: 'Wind' },
  { id: 2222, technology: 'Wind' },
  { id: 2243, technology: 'Hydro' },
  { id: 2254, technology: 'Hydro' },
  { id: 2255, technology: 'Wind' },
  { id: 2266, technology: 'Wind' }, // Torrance Farm
  { id: 2281, technology: 'Wind' },
  { id: 2305, technology: 'Wind' },
  { id: 2519, technology: 'Wind' },
];

const REVERT_TO_OTHER_NAMES = [
  'Buergerwerke eG (federation of citizen energy cooperatives)',
  'Energie Partagee citizen renewable energy network',
  'Eigg Electric off-grid renewable system',
  'Som Energia cooperative generation portfolio',
  'Agrinio Agricultural Cooperative energy communities',
];

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');

  let detailFixed = 0;
  const updateDetail = db.prepare(`UPDATE projects SET technology = ? WHERE technology_detail = ? AND technology != 'Low Carbon Transport' AND technology != ?`);
  for (const [detail, technology] of Object.entries(DETAIL_FIXES)) {
    detailFixed += updateDetail.run(technology, detail, technology).changes;
  }

  let nameFixed = 0;
  const updateById = db.prepare(`UPDATE projects SET technology = ? WHERE id = ? AND technology = 'Other'`);
  for (const { id, technology } of NAME_FIXES) {
    nameFixed += updateById.run(technology, id).changes;
  }

  let reverted = 0;
  const revert = db.prepare(`UPDATE projects SET technology = 'Other' WHERE project_name = ?`);
  for (const name of REVERT_TO_OTHER_NAMES) {
    reverted += revert.run(name).changes;
  }

  db.exec('COMMIT');

  console.log(`DB: fixed ${detailFixed} rows via detail-text match.`);
  console.log(`DB: fixed ${nameFixed} rows via name/org match.`);
  console.log(`DB: reverted ${reverted} Global Projects rows to Other.`);
  console.log('DB: technology distribution now:', db.prepare('SELECT technology, COUNT(*) c FROM projects GROUP BY technology ORDER BY c DESC').all());
  db.close();
}

function fixMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const nameIndex = headerRow.indexOf('Project Name');
  const techIndex = headerRow.indexOf('Technology');
  const detailIndex = headerRow.indexOf('Technology Detail');

  let detailFixed = 0;
  let nameFixed = 0;
  let reverted = 0;

  // NAME_FIXES were found via local-DB ids, which (as this whole episode
  // demonstrated) don't reliably correspond to master rows for blank-ID
  // entries — so match master rows by project_name instead, restricted to
  // rows currently tagged Other to avoid touching an unrelated row that
  // happens to share a name.
  const nameFixLookup = new Map();
  {
    const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'energy-archipelago.db'));
    for (const { id, technology } of NAME_FIXES) {
      const row = db.prepare('SELECT project_name FROM projects WHERE id = ?').get(id);
      if (row) nameFixLookup.set(row.project_name, technology);
    }
    db.close();
  }

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;

    const detail = row[detailIndex];
    if (row[techIndex] !== 'Low Carbon Transport' && detail !== undefined && DETAIL_FIXES[detail] && DETAIL_FIXES[detail] !== row[techIndex]) {
      row[techIndex] = DETAIL_FIXES[detail];
      detailFixed += 1;
      continue;
    }

    if (row[techIndex] === 'Other' && nameFixLookup.has(row[nameIndex])) {
      row[techIndex] = nameFixLookup.get(row[nameIndex]);
      nameFixed += 1;
      continue;
    }

    if (REVERT_TO_OTHER_NAMES.includes(row[nameIndex]) && row[techIndex] !== 'Other') {
      row[techIndex] = 'Other';
      reverted += 1;
    }
  }

  console.log(`Master: fixed ${detailFixed} rows via detail-text match, ${nameFixed} via name match, reverted ${reverted}.`);

  const newSheet = utils.aoa_to_sheet(rows);
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

fixDb();
fixMaster();
