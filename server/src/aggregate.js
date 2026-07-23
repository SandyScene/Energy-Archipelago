import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const nations = JSON.parse(fs.readFileSync(path.join(dataDir, 'nations.geojson'), 'utf-8'));
const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'regions.geojson'), 'utf-8'));
const councils = JSON.parse(fs.readFileSync(path.join(dataDir, 'councils.geojson'), 'utf-8'));

// A single country/region feature can be a MultiPolygon with parts scattered
// across the globe (e.g. the UK's 50 parts include Falklands, South Georgia,
// etc. alongside the mainland). Bounding-boxing the *whole feature* would give
// a box spanning most of the planet for these, making every point on Earth a
// "candidate" and defeating the bbox prefilter entirely. Flattening into
// single-polygon parts first — each with its own tight bbox — keeps the
// prefilter meaningful regardless of how scattered a feature's territory is.
const FALLBACK_PAD_DEGREES = 0.2; // roughly 20km at UK latitudes

function withPartsIndex(collection) {
  const parts = [];
  collection.features.forEach((feature, parentIndex) => {
    let flattened;
    try {
      flattened = turf.flatten(feature).features;
    } catch {
      flattened = [feature];
    }
    for (const part of flattened) {
      try {
        const [minX, minY, maxX, maxY] = turf.bbox(part);
        parts.push({
          parentIndex,
          feature: part,
          bbox: [minX, minY, maxX, maxY],
          fallbackBbox: [minX - FALLBACK_PAD_DEGREES, minY - FALLBACK_PAD_DEGREES, maxX + FALLBACK_PAD_DEGREES, maxY + FALLBACK_PAD_DEGREES],
        });
      } catch {
        // malformed geometry in source dataset; skip this part
      }
    }
  });
  return { features: collection.features, parts };
}

const nationsIndexed = withPartsIndex(nations);
const regionsIndexed = withPartsIndex(regions);
const councilsIndexed = withPartsIndex(councils);

function pointInBbox(lng, lat, [minX, minY, maxX, maxY]) {
  return lng >= minX && lng <= maxX && lat >= minY && lat <= maxY;
}

function emptyStats() {
  return { projectCount: 0, totalElectricityCapacityMw: 0, totalHeatCapacityMw: 0 };
}

// Installed capacity should only reflect projects that are actually built
// (operational) — planned/under-construction projects still count toward
// projectCount but not toward the capacity totals. Deliberately not gated on
// venture type: ownership structure is unrecorded ("Unknown") for ~80% of
// the dataset (entire countries in the older international data have no
// venture type at all), so requiring "community owned" here made totals
// read as zero for most of the map even though real operational capacity
// exists. Users who want the community-owned-only view can already get it
// via the venture type filter, which applies to this same aggregate.
function isOperational(project) {
  const stage = (project.project_stage || '').toLowerCase();
  return stage.includes('operational');
}

// No dedicated field distinguishes electricity vs heat generation, so this
// infers it from the technology + technology detail text. Anything that
// reads as a heat pump, boiler, CHP, district heating network or thermal
// system is bucketed as heat; everything else (solar, wind, hydro, marine,
// generic bioenergy, etc.) as electricity. CHP genuinely produces both, but
// splitting its single capacity figure between two outputs isn't something
// the source data supports, so it counts wholly as heat here.
const HEAT_KEYWORDS = /heat|chp|boiler|thermal/i;

function isHeatTechnology(project) {
  const text = `${project.technology || ''} ${project.technology_detail || ''}`;
  return HEAT_KEYWORDS.test(text);
}

function addProjectToStats(stats, project) {
  stats.projectCount += 1;
  if (isOperational(project)) {
    const capacity = Number(project.capacity_mw) || 0;
    if (isHeatTechnology(project)) {
      stats.totalHeatCapacityMw += capacity;
    } else {
      stats.totalElectricityCapacityMw += capacity;
    }
  }
}

// Some project points sit just outside every polygon — usually a coastal or
// harbour project falling in a gap left by a generalized/simplified coastline.
// Rather than silently dropping them from every aggregate, snap each one to
// whichever nearby polygon part is nearest. Only parts whose padded bbox is
// actually close to the point are considered, so a point with no genuinely
// nearby coverage (e.g. a country this boundary set doesn't have regions for)
// is left unmatched rather than force-assigned to whatever happens to be
// least-far-away on the other side of the map.
function findNearestParentIndex(lng, lat, point, parts) {
  let bestParent = -1;
  let bestDistance = Infinity;
  for (const part of parts) {
    if (!pointInBbox(lng, lat, part.fallbackBbox)) continue;
    try {
      const distance = turf.pointToPolygonDistance(point, part.feature, { units: 'kilometers' });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestParent = part.parentIndex;
      }
    } catch {
      // malformed geometry in source dataset; skip
    }
  }
  return bestParent;
}

function aggregateByBoundary(projects, { features, parts }) {
  const statsByFeatureIndex = features.map(() => emptyStats());
  const unmatched = [];

  for (const project of projects) {
    const lng = project.longitude;
    const lat = project.latitude;
    const point = turf.point([lng, lat]);
    let matched = false;
    for (const part of parts) {
      if (!pointInBbox(lng, lat, part.bbox)) continue;
      try {
        if (turf.booleanPointInPolygon(point, part.feature)) {
          addProjectToStats(statsByFeatureIndex[part.parentIndex], project);
          matched = true;
          break;
        }
      } catch {
        // malformed geometry in source dataset; skip
      }
    }
    if (!matched) unmatched.push({ project, lng, lat, point });
  }

  for (const { project, lng, lat, point } of unmatched) {
    const parentIndex = findNearestParentIndex(lng, lat, point, parts);
    if (parentIndex >= 0) addProjectToStats(statsByFeatureIndex[parentIndex], project);
  }

  return {
    type: 'FeatureCollection',
    features: features.map((feature, i) => ({
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

export function aggregateCouncils(projects) {
  return aggregateByBoundary(projects, councilsIndexed);
}
