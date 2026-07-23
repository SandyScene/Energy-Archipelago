import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_of_data_source TEXT,
    project_name TEXT NOT NULL,
    primary_organisation TEXT,
    primary_organisation_type TEXT,
    technology TEXT,
    venture_type TEXT,
    total_project_capacity_mw REAL,
    generation_capacity_mwh REAL,
    project_stage TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    country TEXT,
    region_level_1 TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
