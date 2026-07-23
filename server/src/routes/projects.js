import { Router } from 'express';
import { db } from '../db.js';
import { buildProjectFilter } from '../filters.js';

const router = Router();

const REQUIRED_FIELDS = ['project_name', 'latitude', 'longitude'];

const COLUMNS = [
  'date_of_data_source',
  'project_name',
  'lead_organisation',
  'organisation_website',
  'organisation_type',
  'venture_type',
  'technology',
  'technology_detail',
  'capacity_mw',
  'project_stage',
  'latitude',
  'longitude',
  'country',
  'region',
];

router.get('/', (req, res) => {
  const { where, params } = buildProjectFilter(req.query);
  const rows = db.prepare(`SELECT * FROM projects ${where} ORDER BY created_at DESC`).all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const body = req.body ?? {};

  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }

  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (Number.isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Latitude must be a number between -90 and 90' });
  }
  if (Number.isNaN(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Longitude must be a number between -180 and 180' });
  }

  const values = COLUMNS.map((col) => {
    if (col === 'latitude') return lat;
    if (col === 'longitude') return lng;
    if (col === 'capacity_mw') {
      return body[col] === undefined || body[col] === '' ? null : Number(body[col]);
    }
    return body[col] ?? null;
  });

  const placeholders = COLUMNS.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${placeholders})`);
  const result = stmt.run(...values);

  const created = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM projects WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.status(204).end();
});

export default router;
