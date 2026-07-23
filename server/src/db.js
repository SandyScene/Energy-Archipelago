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

db.exec(`
  CREATE TABLE IF NOT EXISTS data_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    organisation_name TEXT NOT NULL,
    organisation_type TEXT NOT NULL,
    data_use TEXT NOT NULL,
    comments TEXT,
    country TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
