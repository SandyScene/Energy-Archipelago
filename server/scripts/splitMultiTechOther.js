// Splits genuine single-organisation, multi-technology "Other" rows into one
// row per technology (same org/location/stage), and reclassifies one
// single-technology row that was simply in the wrong bucket. Per-technology
// capacity is only set where independently confirmed by research — left null
// rather than guessed where a combined total couldn't be reliably divided.
//
// Deliberately NOT split (left as "Other"): rows that represent a network/
// federation/movement spanning many separate underlying organisations or
// projects, not one organisation's own physical assets — Buergerwerke eG
// (federation of 145 German cooperatives), Energie Partagée (French citizen
// investment network backing hundreds of separate projects), Enercoop
// (French supplier sourcing from 479+ independent producers), the New
// Zealand national rollup, and Chile's municipal programme rollup. Splitting
// these would misrepresent a statistic as a discrete project.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Each split's capacity per technology, in MW, from research (see commit
// message / conversation for sources) — null where a reliable per-technology
// figure couldn't be confirmed.
const SPLITS = {
  2709: { // Eigg Electric off-grid renewable system
    label: 'Eigg Electric',
    technologies: [
      { technology: 'Wind', capacity_mw: 0.024 },
      { technology: 'Hydro', capacity_mw: 0.110 },
      { technology: 'Solar', capacity_mw: 0.170 },
      { technology: 'Battery Energy Storage System', capacity_mw: 0.156 },
    ],
  },
  2711: { // Som Energia cooperative generation portfolio
    label: 'Som Energia',
    technologies: [
      { technology: 'Solar', capacity_mw: null },
      { technology: 'Hydro', capacity_mw: 1.0 },
      { technology: 'Bioenergy', capacity_mw: 0.499 },
      { technology: 'Wind', capacity_mw: null },
    ],
  },
  2717: { // Agrinio Agricultural Cooperative energy communities
    label: 'Agrinio Agricultural Cooperative',
    technologies: [
      { technology: 'Wind', capacity_mw: null },
      { technology: 'Solar', capacity_mw: null },
    ],
  },
};

const RECLASSIFY_SINGLE = {
  2734: 'Hydro', // Cooperativa de Agua y Energia de Dos de Mayo (Argentina) — El Saltito hydro complex
};

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');

  const getRow = db.prepare('SELECT * FROM projects WHERE id = ?');
  const deleteRow = db.prepare('DELETE FROM projects WHERE id = ?');
  const columns = [
    'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
    'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
    'project_stage', 'latitude', 'longitude', 'country', 'region',
  ];
  const insert = db.prepare(`INSERT INTO projects (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);

  let splitCount = 0;
  for (const [id, { label, technologies }] of Object.entries(SPLITS)) {
    const row = getRow.get(Number(id));
    if (!row) { console.log(`WARNING: id ${id} (${label}) not found, skipping`); continue; }
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
    console.log(`Split ${label} (was id ${id}) into ${technologies.length} rows.`);
  }

  const updateSingle = db.prepare('UPDATE projects SET technology = ? WHERE id = ?');
  let reclassified = 0;
  for (const [id, technology] of Object.entries(RECLASSIFY_SINGLE)) {
    reclassified += updateSingle.run(technology, Number(id)).changes;
  }

  db.exec('COMMIT');
  console.log(`DB: created ${splitCount} split rows, reclassified ${reclassified} single rows.`);
  console.log('DB: Other count now:', db.prepare("SELECT COUNT(*) c FROM projects WHERE technology='Other'").get());
  db.close();
}

// Master matched by exact coordinates (its own ID column doesn't reliably
// line up with the DB's for these legacy rows — same drift documented in
// fixOrkneyWindMislabels.js and reclassifyRetrofit.js).
const MASTER_COORD_SPLITS = [
  { lat: 56.9, lon: -6.13, label: 'Eigg', technologies: SPLITS[2709].technologies },
  { lat: 41.9794, lon: 2.8214, label: 'Som Energia', technologies: SPLITS[2711].technologies },
  { lat: 38.621, lon: 21.408, label: 'Agrinio', technologies: SPLITS[2717].technologies },
];
const MASTER_COORD_RECLASSIFY = [
  { lat: -27.03, lon: -54.66, technology: 'Hydro' }, // Dos de Mayo
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
  const capIndex = headerRow.indexOf('Capacity (kW)');
  const latIndex = headerRow.indexOf('Latitude');
  const lonIndex = headerRow.indexOf('Longitude');
  if (techIndex === -1 || latIndex === -1 || lonIndex === -1) throw new Error('Required column not found');

  const newRows = [headerRow];
  let splitCount = 0;
  let reclassified = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;

    const splitMatch = MASTER_COORD_SPLITS.find((s) => row[latIndex] === s.lat && row[lonIndex] === s.lon);
    if (splitMatch) {
      for (const { technology, capacity_mw } of splitMatch.technologies) {
        const clone = [...row];
        clone[techIndex] = technology;
        if (capIndex !== -1) clone[capIndex] = capacity_mw == null ? clone[capIndex] : capacity_mw * 1000;
        newRows.push(clone);
        splitCount += 1;
      }
      continue;
    }

    const reclassifyMatch = MASTER_COORD_RECLASSIFY.find((r) => row[latIndex] === r.lat && row[lonIndex] === r.lon);
    if (reclassifyMatch) {
      row[techIndex] = reclassifyMatch.technology;
      reclassified += 1;
    }

    newRows.push(row);
  }

  console.log(`Master spreadsheet: created ${splitCount} split rows, reclassified ${reclassified} single rows.`);

  const newSheet = utils.aoa_to_sheet(newRows);
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

fixDb();
fixMaster();
