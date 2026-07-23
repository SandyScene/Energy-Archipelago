import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function distinctValues(column, whereExtra = '', params = []) {
  return db
    .prepare(`SELECT DISTINCT ${column} AS value FROM projects WHERE ${column} IS NOT NULL AND ${column} != '' ${whereExtra} ORDER BY value`)
    .all(...params)
    .map((row) => row.value);
}

router.get('/', (req, res) => {
  const { country } = req.query;
  res.json({
    countries: distinctValues('country'),
    regions: country ? distinctValues('region', 'AND country = ?', [country]) : distinctValues('region'),
    technologies: distinctValues('technology'),
    ventureTypes: distinctValues('venture_type'),
  });
});

export default router;
