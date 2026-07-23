import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const REQUIRED_FIELDS = ['name', 'email', 'organisation_name', 'organisation_type', 'data_use', 'country'];

router.post('/', (req, res) => {
  const body = req.body ?? {};

  const missing = REQUIRED_FIELDS.filter((f) => !body[f] || !String(body[f]).trim());
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }

  const stmt = db.prepare(`
    INSERT INTO data_requests (name, email, organisation_name, organisation_type, data_use, comments, country)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    body.name,
    body.email,
    body.organisation_name,
    body.organisation_type,
    body.data_use,
    body.comments || null,
    body.country,
  );

  res.status(201).json({ ok: true });
});

// Lightweight review endpoint for the site owner — gated by a shared secret
// (ADMIN_KEY env var) since submissions contain names and email addresses.
router.get('/', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    return res.status(404).json({ error: 'Not found' });
  }
  const rows = db.prepare('SELECT * FROM data_requests ORDER BY created_at DESC').all();
  res.json(rows);
});

export default router;
