// Inserts one example project for testing/QA purposes. Safe to re-run — skips
// if an example project already exists.
import { db } from '../src/db.js';

const existing = db.prepare(`SELECT id FROM projects WHERE project_name = ?`).get('Ardrossan Community Wind Turbine');

if (existing) {
  console.log('Example project already present (id %d), skipping.', existing.id);
  process.exit(0);
}

const COLUMNS = [
  'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
  'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
  'project_stage', 'latitude', 'longitude', 'country', 'region',
];

const example = {
  date_of_data_source: '2026-01-15',
  project_name: 'Ardrossan Community Wind Turbine',
  lead_organisation: 'Ardrossan Renewable Energy Cooperative',
  organisation_website: 'https://example.org/ardrossan-energy-coop',
  organisation_type: 'Community Cooperative',
  venture_type: 'Community Owned',
  technology: 'Wind',
  technology_detail: 'Single onshore turbine, 900kW',
  capacity_mw: 0.9,
  project_stage: 'Operational',
  latitude: 55.6431,
  longitude: -4.8092,
  country: 'United Kingdom',
  region: 'Scotland',
};

const placeholders = COLUMNS.map(() => '?').join(', ');
db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${placeholders})`).run(...COLUMNS.map((c) => example[c]));

console.log('Inserted example project: %s', example.project_name);
