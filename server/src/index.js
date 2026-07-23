import express from 'express';
import cors from 'cors';
import compression from 'compression';
import './db.js';
import projectsRouter from './routes/projects.js';
import aggregatesRouter from './routes/aggregates.js';
import filtersRouter from './routes/filters.js';
import dataRequestsRouter from './routes/dataRequests.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(compression());
app.use(cors());
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/aggregates', aggregatesRouter);
app.use('/api/filters', filtersRouter);
app.use('/api/data-requests', dataRequestsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Energy Archipelago API listening on http://localhost:${PORT}`);
});
