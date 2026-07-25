import { Router } from 'express';
import { aggregateByCountry, aggregateSummary } from '../analysis.js';

const router = Router();

router.get('/by-country', (req, res) => {
  res.json(aggregateByCountry());
});

router.get('/summary', (req, res) => {
  res.json(aggregateSummary(req.query.country));
});

export default router;
