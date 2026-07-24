// One-time cleanup: move transport-related projects into the new "Low Carbon
// Transport" category (added alongside Battery Energy Storage System,
// Retrofit and Energy Advice in the previous technology reclassification
// pass). Reviewed every technology_detail mentioning EV charging, car clubs,
// e-bikes, cycling infrastructure, public transport or minibuses/taxis,
// regardless of which technology bucket it had landed in before (some had
// been filed under Solar/Wind/Battery Energy Storage System because a
// generation asset was named alongside the transport activity).
//
// "Electric vehicles talk and discussion" is deliberately left as Energy
// Advice — it describes an advisory/awareness activity, not a transport
// asset itself.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRANSPORT_DETAILS = [
  'Battery storage for EV charging',
  'Renewables, battery, public transport',
  'EV transition advisory, minibus',
  'Car club, EVs, e-bikes',
  'Car club, transitioning electric',
  'Community EV charging network',
  'Community energy, public transport',
  'Cycling infrastructure advocacy',
  'E-bikes, active travel',
  'EV car club support',
  'EV car sharing',
  'EV charge point network',
  'EV charge point siting',
  'EV charge points, Wales',
  'EV chargepoint network expansion',
  'EV chargers, village hall',
  'EV charging feasibility study',
  'EV charging hub feasibility',
  'EV charging infrastructure advocacy',
  'EV charging point network',
  'EV charging points',
  'EV charging points, schools',
  'EV charging points, village',
  'EV charging, off-street parking',
  'EV promotion and car club',
  'EV promotion, car clubs, charging',
  'EV taxi policy advocacy',
  'Electric car club pilot',
  'Electric car, community transport',
  'Electric minibus, community transport',
  'Electric vehicle for outreach',
  'Have installed three EV Chargers.',
  'Public transport advocacy campaign',
  'Shared car club scheme',
  'assessing chargepoints and carclub potential',
  'EV chargers, solar farm',
  'EV charging linked to solar',
  'Solar PV with EV charging',
  'Solar PV, battery, EV charging',
  'EV car club, wind turbine',
];

function recodeDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const update = db.prepare(`UPDATE projects SET technology = 'Low Carbon Transport' WHERE technology_detail = ?`);
  db.exec('BEGIN');
  let updated = 0;
  for (const detail of TRANSPORT_DETAILS) {
    const result = update.run(detail);
    updated += result.changes;
  }
  db.exec('COMMIT');

  console.log(`DB: reclassified ${updated} rows to "Low Carbon Transport".`);
  const remaining = db.prepare('SELECT technology, COUNT(*) c FROM projects GROUP BY technology ORDER BY c DESC').all();
  console.log('DB: technology distribution now:', remaining);
  db.close();
}

function recodeMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const techIndex = headerRow.indexOf('Technology');
  const detailIndex = headerRow.indexOf('Technology Detail');
  if (techIndex === -1 || detailIndex === -1) throw new Error('Technology columns not found');

  const transportSet = new Set(TRANSPORT_DETAILS);
  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const detail = row[detailIndex] === undefined ? '' : String(row[detailIndex]);
    if (transportSet.has(detail) && row[techIndex] !== 'Low Carbon Transport') {
      row[techIndex] = 'Low Carbon Transport';
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

recodeDb();
recodeMaster();
