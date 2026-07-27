// Adds two new community energy projects researched from primary sources:
//
//   - Living Energy Lab (Multifunctional Solar Kiosk), Chamanculo/Aeroporto A,
//     Maputo, Mozambique — a community-governed solar + battery kiosk built
//     under the CESET research project (UKRI GCRF funded), delivered with
//     Universidade Eduardo Mondlane and run day-to-day by the local AEROSOL
//     committee. Source: https://cesetproject.com/news/living-energy-lab-maputo-complete
//     Split into Solar + Battery Energy Storage System rows (same pattern as
//     other multi-technology single-site projects this session) since no
//     capacity split between the two was published.
//   - Gihembe refugee camp solar microgrid, Kageyo sector, Gicumbi District,
//     Rwanda — solar home systems and street lighting delivered under the
//     Renewable Energy for Refugees (RE4R) project, a Practical Action/UNHCR
//     partnership. No published kW figure found for Gihembe specifically
//     (unlike Mahama/Nyabiheke camps, which do have published figures) —
//     left null rather than guessed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-07-27';

const NEW_ROWS = [
  {
    date_of_data_source: TODAY,
    project_name: 'Living Energy Lab (Multifunctional Solar Kiosk)',
    lead_organisation: 'AEROSOL Committee / Universidade Eduardo Mondlane (CESET Project)',
    organisation_website: 'https://cesetproject.com',
    organisation_type: 'Community Group',
    venture_type: 'Community-Public Partnership',
    technology: 'Solar',
    technology_detail: 'Solar kiosk with battery storage',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: -25.9247,
    longitude: 32.5732,
    country: 'Mozambique',
    region: 'Maputo City',
  },
  {
    date_of_data_source: TODAY,
    project_name: 'Living Energy Lab (Multifunctional Solar Kiosk)',
    lead_organisation: 'AEROSOL Committee / Universidade Eduardo Mondlane (CESET Project)',
    organisation_website: 'https://cesetproject.com',
    organisation_type: 'Community Group',
    venture_type: 'Community-Public Partnership',
    technology: 'Battery Energy Storage System',
    technology_detail: 'Solar kiosk with battery storage',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: -25.9247,
    longitude: 32.5732,
    country: 'Mozambique',
    region: 'Maputo City',
  },
  {
    date_of_data_source: TODAY,
    project_name: 'Gihembe Refugee Camp Solar Microgrid',
    lead_organisation: 'Practical Action / UNHCR (Renewable Energy for Refugees)',
    organisation_website: 'https://practicalaction.org/our-work/projects/energy-for-refugees',
    organisation_type: 'Non-profit Organisation',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Solar home systems and street lighting',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: -1.6111,
    longitude: 30.0869,
    country: 'Rwanda',
    region: 'Northern Province',
  },
];

const COLUMNS = [
  'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
  'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
  'project_stage', 'latitude', 'longitude', 'country', 'region',
];

function insertDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const insert = db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`);
  const insertedIds = [];

  db.exec('BEGIN');
  for (const row of NEW_ROWS) {
    const values = COLUMNS.map((c) => row[c] ?? null);
    const result = insert.run(...values);
    insertedIds.push(Number(result.lastInsertRowid));
  }
  db.exec('COMMIT');

  console.log('Inserted DB ids:', insertedIds);
  console.log(db.prepare(`SELECT id, project_name, technology, country FROM projects WHERE id IN (${insertedIds.join(',')})`).all());
  db.close();
  return insertedIds;
}

function appendMaster(insertedIds) {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const col = (name) => headerRow.indexOf(name);

  for (let i = 0; i < NEW_ROWS.length; i += 1) {
    const row = NEW_ROWS[i];
    const id = insertedIds[i];
    const newRow = new Array(headerRow.length).fill('');
    newRow[col('ID')] = id;
    newRow[col('Date Data Source')] = row.date_of_data_source;
    newRow[col('Project Name')] = row.project_name;
    newRow[col('Lead Organisation')] = row.lead_organisation;
    newRow[col('Organisation Website')] = row.organisation_website;
    newRow[col('Organisation Type')] = row.organisation_type;
    newRow[col('Venture Type')] = row.venture_type;
    newRow[col('Technology')] = row.technology;
    newRow[col('Technology Detail')] = row.technology_detail;
    newRow[col('Capacity (kW)')] = row.capacity_mw != null ? row.capacity_mw * 1000 : '';
    newRow[col('Project Stage')] = row.project_stage;
    newRow[col('Latitude')] = row.latitude;
    newRow[col('Longitude')] = row.longitude;
    newRow[col('Country')] = row.country;
    newRow[col('Region')] = row.region;
    newRow[col('Location Precision')] = '';
    newRow[col('Source File')] = 'Manually added (cesetproject.com / practicalaction.org research)';
    rows.push(newRow);
  }

  console.log(`Master: appended ${NEW_ROWS.length} rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

const ids = insertDb();
appendMaster(ids);
