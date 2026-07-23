import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'energy-archipelago.db');

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_of_data_source TEXT,
    project_name TEXT NOT NULL,
    lead_organisation TEXT,
    organisation_website TEXT,
    organisation_type TEXT,
    venture_type TEXT,
    technology TEXT,
    technology_detail TEXT,
    capacity_mw REAL,
    project_stage TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    country TEXT,
    region TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
