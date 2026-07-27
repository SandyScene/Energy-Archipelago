// Audit: find non-offshore-capable projects (anything except Wind or
// Marine) whose coordinates land clearly outside their stated country's
// land boundary — i.e. sitting in the sea, which is wrong for anything
// that isn't an offshore turbine. Reuses the same nations.geojson boundary
// data and turf point-in-polygon approach as aggregate.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nations = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'nations.geojson'), 'utf-8'));

// Flatten into single-polygon parts, same as aggregate.js, so a scattered
// multi-part country (islands, overseas territories) doesn't get one huge
// bounding box.
const parts = [];
nations.features.forEach((feature) => {
  let flattened;
  try {
    flattened = turf.flatten(feature).features;
  } catch {
    flattened = [feature];
  }
  for (const part of flattened) parts.push(part);
});

function distanceToNearestLand(lng, lat) {
  const point = turf.point([lng, lat]);
  let best = Infinity;
  for (const part of parts) {
    try {
      if (turf.booleanPointInPolygon(point, part)) return 0;
      const d = turf.pointToPolygonDistance(point, part, { units: 'kilometers' });
      if (d < best) best = d;
    } catch {
      // malformed geometry; skip
    }
  }
  return best;
}

const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'energy-archipelago.db'));
const rows = db.prepare(
  `SELECT id, project_name, technology, country, latitude, longitude FROM projects
   WHERE technology NOT IN ('Wind', 'Marine') AND latitude IS NOT NULL AND longitude IS NOT NULL`,
).all();

const suspects = [];
for (const row of rows) {
  const d = distanceToNearestLand(row.longitude, row.latitude);
  if (d > 2) suspects.push({ ...row, distanceKm: Math.round(d * 10) / 10 });
}

suspects.sort((a, b) => b.distanceKm - a.distanceKm);
console.log(`Checked ${rows.length} non-offshore-capable rows. ${suspects.length} sit more than 2km from any land.`);
for (const s of suspects) console.log(JSON.stringify(s));

db.close();
