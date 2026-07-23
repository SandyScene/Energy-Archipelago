import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const nations = JSON.parse(fs.readFileSync(path.join(dataDir, 'nations.geojson'), 'utf-8'));
const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'regions.geojson'), 'utf-8'));

function emptyStats() {
  return { projectCount: 0, totalCapacityMw: 0, totalGenerationMwh: 0 };
}

function addProjectToStats(stats, project) {
  stats.projectCount += 1;
  stats.totalCapacityMw += Number(project.total_project_capacity_mw) || 0;
  stats.totalGenerationMwh += Number(project.generation_capacity_mwh) || 0;
}

function aggregateByBoundary(projects, boundaryCollection) {
  const statsByFeatureIndex = boundaryCollection.features.map(() => emptyStats());

  for (const project of projects) {
    const point = turf.point([project.longitude, project.latitude]);
    for (let i = 0; i < boundaryCollection.features.length; i++) {
      const feature = boundaryCollection.features[i];
      try {
        if (turf.booleanPointInPolygon(point, feature)) {
          addProjectToStats(statsByFeatureIndex[i], project);
          break;
        }
      } catch {
        // malformed geometry in source dataset; skip
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: boundaryCollection.features.map((feature, i) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        ...statsByFeatureIndex[i],
      },
    })),
  };
}

export function aggregateNations(projects) {
  return aggregateByBoundary(projects, nations);
}

export function aggregateRegions(projects) {
  return aggregateByBoundary(projects, regions);
}
