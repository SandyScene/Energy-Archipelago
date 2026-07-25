// One-time cleanup: broaden "Heat Pump" into "Low Carbon Heating" so the
// category covers all low-carbon heating projects, not just heat pumps —
// per user request. Renames every existing "Heat Pump" row, and pulls in the
// "Other" rows whose technology_detail names a heating project (district
// heating network, electric boiler heat network, etc.) that couldn't
// previously be filed under any of the canonical categories.
//
// These "Other" rows were the single biggest contributor to the "Other"
// bucket's operational capacity (~89% of it, almost entirely Danish district
// heating networks whose specific heat source was never recorded in the
// source data) — see analysis behind this change for the full breakdown.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keyed by technology_detail, only applied to rows currently tagged "Other" —
// hand-picked from every Other row whose detail text names a heating project.
const OTHER_TO_LOW_CARBON_HEATING = [
  'District Heating Network',
  'District heating, electric boiler',
  'Zero carbon heat network',
  'Consumer-owned district heating cooperatives',
  'Renewable heat transition project',
  'Area heating feasibility study',
  'Heating electrification, mobility project',
];

function recodeDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');
  const renamed = db.prepare(`UPDATE projects SET technology = 'Low Carbon Heating' WHERE technology = 'Heat Pump'`).run().changes;

  const updateDetail = db.prepare(`UPDATE projects SET technology = 'Low Carbon Heating' WHERE technology = 'Other' AND technology_detail = ?`);
  let reclassified = 0;
  for (const detail of OTHER_TO_LOW_CARBON_HEATING) {
    reclassified += updateDetail.run(detail).changes;
  }
  db.exec('COMMIT');

  console.log(`DB: renamed ${renamed} "Heat Pump" rows to "Low Carbon Heating".`);
  console.log(`DB: reclassified ${reclassified} "Other" rows to "Low Carbon Heating".`);
  console.log('DB: technology distribution now:', db.prepare('SELECT technology, COUNT(*) c, SUM(capacity_mw) cap FROM projects GROUP BY technology ORDER BY c DESC').all());
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

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (row[techIndex] === 'Heat Pump') {
      row[techIndex] = 'Low Carbon Heating';
      updated += 1;
      continue;
    }
    if (row[techIndex] !== 'Other') continue;
    const detail = row[detailIndex] === undefined ? '' : String(row[detailIndex]);
    if (OTHER_TO_LOW_CARBON_HEATING.includes(detail)) {
      row[techIndex] = 'Low Carbon Heating';
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
