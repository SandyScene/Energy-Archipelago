// Third data-accuracy pass, prompted by: "still some projects called wind
// farm with different technologies and unexpectedly high capacities,
// particularly in scottish data."
//
// Found 30 projects whose project_name or lead_organisation explicitly names
// them as a wind farm/project/turbine (e.g. "Kilbraur Wind Farm", "Stornoway
// Wind Farm") but were tagged Solar/Hydro/Bioenergy/Marine — 29 of them in
// Scotland. The "unexpectedly high capacity" read was a symptom of the same
// bug: a 150MW project tagged "Solar" looks like an error (community solar
// rarely reaches that scale), but 150MW is entirely plausible for a large
// wind development — once retagged Wind, the capacity makes sense and isn't
// itself wrong.
//
// One exception: "Solar and Wind Energy Cooperative (Eunpyeong)" — the co-op
// name mentions wind, but its technology_detail describes 5 solar PV
// stations specifically, so it's correctly Solar and is left alone.
//
// Also fixes one genuine capacity data-entry error found while checking
// "Nx Y MW" technology_detail values against capacity_mw across the whole
// dataset: Spirit of Lanarkshire's "6 x 2.5 MW" implies 15 MW, not the 1.5
// MW recorded (a misplaced decimal point).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIND_FIX_NAMES = [
  'Alness Transition Town Wind Project',
  'Ardeonaig Outdoor Centre Wind Project',
  'Baile an Truseil / Loch Sminig Wind Project',
  'Barra and Vatersay Wind Energy',
  'Ben Aketil wind farm',
  'Cushnie Wind Farm',
  'Dummuies Wind Installation',
  'Dunbeath Wind Farm',
  'Hoprigshiels Community wind Farm',
  'Innerleithen Community Wind Turbine Feasibility Study',
  'Iochdar Hill Wind Farm',
  'Kerrera Wind Turbines',
  'Kilbraur Wind Farm',
  'Melness and Tongue Community Wind Project',
  'Melness Community Wind Energy Project',
  'Millennium wind farm',
  'Mull & Iona Community Wind Turbine',
  'National Sports Centre Wind Project',
  'Neilston Community Wind Farm',
  'Newton Dee Wind Project',
  'North Yell Wind Farm',
  'Point Wind Farm',
  'Portobellow & Leith Community Wind Energy Project',
  'ROK Wind Turbine',
  'Skerries Hall Wind Study',
  'Spirit of Lanarkshire Wind Energy Cooperative',
  'Spurlens Rig Wind Farm proposal',
  'Staffin Community Hall Wind Project',
  'Stornoway Wind Farm',
  'Black Oak Wind Farm',
  'Denmark Community Windfarm',
  'BWECT (Baywind Energy Community Trust)',
  'Small Wind Cooperative',
];

function fixDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');

  let techFixed = 0;
  const updateTech = db.prepare(`UPDATE projects SET technology = 'Wind' WHERE project_name = ? AND technology != 'Wind'`);
  for (const name of WIND_FIX_NAMES) {
    techFixed += updateTech.run(name).changes;
  }

  const capacityFixed = db.prepare(`UPDATE projects SET capacity_mw = 15 WHERE project_name = 'Spirit of Lanarkshire Wind Energy Cooperative' AND capacity_mw = 1.5`).run().changes;

  db.exec('COMMIT');

  console.log(`DB: retagged ${techFixed} wind farms to Wind.`);
  console.log(`DB: fixed ${capacityFixed} capacity value(s) (1.5 -> 15 MW).`);
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
  const capacityIndex = headerRow.indexOf('Capacity (kW)');

  let techFixed = 0;
  let capacityFixed = 0;
  const windNames = new Set(WIND_FIX_NAMES);

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (windNames.has(row[nameIndex]) && row[techIndex] !== 'Wind') {
      row[techIndex] = 'Wind';
      techFixed += 1;
    }
    if (row[nameIndex] === 'Spirit of Lanarkshire Wind Energy Cooperative' && row[capacityIndex] === 1500) {
      row[capacityIndex] = 15000; // 15 MW in kW, matching this sheet's capacity unit
      capacityFixed += 1;
    }
  }

  console.log(`Master: retagged ${techFixed} wind farms to Wind, fixed ${capacityFixed} capacity value(s).`);

  const newSheet = utils.aoa_to_sheet(rows);
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

fixDb();
fixMaster();
