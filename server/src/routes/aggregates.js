import { Router } from 'express';
import { db } from '../db.js';
import { aggregateNations, aggregateRegions, aggregateCouncils } from '../aggregate.js';
import { buildProjectFilter } from '../filters.js';

const router = Router();

const LEVEL_HANDLERS = {
  nation: aggregateNations,
  region: aggregateRegions,
  council: aggregateCouncils,
};

router.get('/:level', (req, res) => {
  const handler = LEVEL_HANDLERS[req.params.level];
  if (!handler) {
    return res.status(400).json({ error: `Unknown level "${req.params.level}". Use one of: ${Object.keys(LEVEL_HANDLERS).join(', ')}` });
  }
  const { where, params } = buildProjectFilter(req.query);
  const projects = db
    .prepare(`SELECT latitude, longitude, capacity_mw, project_stage, venture_type, technology, technology_detail FROM projects ${where}`)
    .all(...params);
  res.json(handler(projects));
});

export default router;
