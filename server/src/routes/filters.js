import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function distinctValues(column) {
  return db
    .prepare(`SELECT DISTINCT ${column} AS value FROM projects WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY value`)
    .all()
    .map((row) => row.value);
}

router.get('/', (req, res) => {
  res.json({
    countries: distinctValues('country'),
    regions: distinctValues('region'),
    technologies: distinctValues('technology'),
    ventureTypes: distinctValues('venture_type'),
  });
});

export default router;
