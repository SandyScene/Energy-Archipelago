import { db } from './db.js';
import { isOperational, isHeatTechnology } from './aggregate.js';

// Total operational generation by country, split into electricity vs heat.
// Grouped by the flat `country` column (not spatial polygon matching, unlike
// the map's nation/region aggregates) since this only needs country-level
// totals, not boundary geometry to render.
export function aggregateByCountry() {
  const rows = db
    .prepare(`SELECT country, capacity_mw, project_stage, technology, technology_detail FROM projects WHERE country IS NOT NULL`)
    .all();

  const byCountry = new Map();
  for (const row of rows) {
    if (!isOperational(row)) continue;
    let stats = byCountry.get(row.country);
    if (!stats) {
      stats = { country: row.country, projectCount: 0, totalElectricityCapacityMw: 0, totalHeatCapacityMw: 0 };
      byCountry.set(row.country, stats);
    }
    stats.projectCount += 1;
    const capacity = Number(row.capacity_mw) || 0;
    if (isHeatTechnology(row)) {
      stats.totalHeatCapacityMw += capacity;
    } else {
      stats.totalElectricityCapacityMw += capacity;
    }
  }

  return Array.from(byCountry.values()).sort(
    (a, b) => (b.totalElectricityCapacityMw + b.totalHeatCapacityMw) - (a.totalElectricityCapacityMw + a.totalHeatCapacityMw),
  );
}

// Project count + operational capacity by technology, and total capacity
// (any stage) by project stage — optionally scoped to one country.
export function aggregateSummary(country) {
  const where = country ? 'WHERE country = ?' : '';
  const params = country ? [country] : [];
  const rows = db.prepare(`SELECT technology, project_stage, capacity_mw FROM projects ${where}`).all(...params);

  const byTechnology = new Map();
  const byStage = new Map();

  for (const row of rows) {
    const capacity = Number(row.capacity_mw) || 0;

    const technology = row.technology || 'Other';
    let techStats = byTechnology.get(technology);
    if (!techStats) {
      techStats = { technology, projectCount: 0, operationalCapacityMw: 0 };
      byTechnology.set(technology, techStats);
    }
    techStats.projectCount += 1;
    if (isOperational(row)) techStats.operationalCapacityMw += capacity;

    const projectStage = row.project_stage || 'Unknown';
    let stageStats = byStage.get(projectStage);
    if (!stageStats) {
      stageStats = { projectStage, totalCapacityMw: 0 };
      byStage.set(projectStage, stageStats);
    }
    stageStats.totalCapacityMw += capacity;
  }

  return {
    byTechnology: Array.from(byTechnology.values()).sort((a, b) => b.projectCount - a.projectCount),
    byStage: Array.from(byStage.values()).sort((a, b) => b.totalCapacityMw - a.totalCapacityMw),
  };
}
