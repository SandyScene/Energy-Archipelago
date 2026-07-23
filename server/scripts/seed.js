// Inserts one example project for testing/QA purposes. Safe to re-run — skips
// if an example project already exists.
import { db } from '../src/db.js';

const existing = db.prepare(`SELECT id FROM projects WHERE project_name = ?`).get('Ardrossan Community Wind Turbine');

if (existing) {
  console.log('Example project already present (id %d), skipping.', existing.id);
  process.exit(0);
}

const COLUMNS = [
  'date_of_data_source', 'project_name', 'primary_organisation', 'primary_organisation_type',
  'technology', 'venture_type', 'total_project_capacity_mw', 'generation_capacity_mwh',
  'project_stage', 'latitude', 'longitude', 'country', 'region_level_1',
];

const example = {
  date_of_data_source: '2026-01-15',
  project_name: 'Ardrossan Community Wind Turbine',
  primary_organisation: 'Ardrossan Renewable Energy Cooperative',
  primary_organisation_type: 'Community Cooperative',
  technology: 'Wind',
  venture_type: 'Community Owned',
  total_project_capacity_mw: 0.9,
  generation_capacity_mwh: 2100,
  project_stage: 'Operational',
  latitude: 55.6431,
  longitude: -4.8092,
  country: 'United Kingdom',
  region_level_1: 'Scotland',
};

const placeholders = COLUMNS.map(() => '?').join(', ');
db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${placeholders})`).run(...COLUMNS.map((c) => example[c]));

console.log('Inserted example project: %s', example.project_name);
