import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const nations = JSON.parse(fs.readFileSync(path.join(dataDir, 'nations.geojson'), 'utf-8'));
const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'regions.geojson'), 'utf-8'));

// Precompute each feature's bounding box once at startup. A cheap bbox check lets us
// skip the expensive exact point-in-polygon test for the vast majority of features —
// without this, aggregating regions (2.5k projects x 4.5k polygons, ~11M exact checks
// per request) is slow enough to time out on Render's free tier.
function withBbox(collection) {
  return collection.features.map((feature) => ({ feature, bbox: turf.bbox(feature) }));
}

const nationsIndexed = withBbox(nations);
const regionsIndexed = withBbox(regions);

function pointInBbox(lng, lat, [minX, minY, maxX, maxY]) {
  return lng >= minX && lng <= maxX && lat >= minY && lat <= maxY;
}

function emptyStats() {
  return { projectCount: 0, totalCapacityMw: 0 };
}

// Installed capacity should only reflect projects that are both built (operational)
// and community owned — planned/under-construction and non-community-owned
// projects still count toward projectCount but not toward totalCapacityMw.
function isOperationalCommunityOwned(project) {
  const stage = (project.project_stage || '').toLowerCase();
  const venture = (project.venture_type || '').toLowerCase();
  return stage.includes('operational') && venture.includes('community owned');
}

function addProjectToStats(stats, project) {
  stats.projectCount += 1;
  if (isOperationalCommunityOwned(project)) {
    stats.totalCapacityMw += Number(project.capacity_mw) || 0;
  }
}

// Some project points sit just outside every polygon — usually a coastal or
// harbour project falling in a gap left by a generalized/simplified coastline.
// Rather than silently dropping them from every aggregate, snap each one to
// whichever polygon is nearest. This only runs for the (rare) unmatched
// leftovers, so it doesn't reintroduce the O(projects x polygons) cost the
// bbox prefilter above exists to avoid.
function findNearestFeatureIndex(point, indexed) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < indexed.length; i++) {
    try {
      const distance = turf.pointToPolygonDistance(point, indexed[i].feature, { units: 'kilometers' });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    } catch {
      // malformed geometry in source dataset; skip
    }
  }
  return bestIndex;
}

function aggregateByBoundary(projects, indexed) {
  const statsByFeatureIndex = indexed.map(() => emptyStats());
  const unmatched = [];

  for (const project of projects) {
    const lng = project.longitude;
    const lat = project.latitude;
    const point = turf.point([lng, lat]);
    let matched = false;
    for (let i = 0; i < indexed.length; i++) {
      const { feature, bbox } = indexed[i];
      if (!pointInBbox(lng, lat, bbox)) continue;
      try {
        if (turf.booleanPointInPolygon(point, feature)) {
          addProjectToStats(statsByFeatureIndex[i], project);
          matched = true;
          break;
        }
      } catch {
        // malformed geometry in source dataset; skip
      }
    }
    if (!matched) unmatched.push({ project, point });
  }

  for (const { project, point } of unmatched) {
    const nearestIndex = findNearestFeatureIndex(point, indexed);
    if (nearestIndex >= 0) addProjectToStats(statsByFeatureIndex[nearestIndex], project);
  }

  return {
    type: 'FeatureCollection',
    features: indexed.map(({ feature }, i) => ({
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
  return aggregateByBoundary(projects, nationsIndexed);
}

export function aggregateRegions(projects) {
  return aggregateByBoundary(projects, regionsIndexed);
}
