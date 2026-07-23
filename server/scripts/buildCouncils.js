// Builds server/data/councils.geojson from the ONS Open Geography Portal UK
// Local Authority District boundaries (server/data/raw-shapefiles/uk-lad.geojson).
// This is its own tier (nation -> region -> council -> pins), separate from
// regions.geojson's country-level England/Scotland/Wales/Northern Ireland
// polygons — the two used to be merged into one file, replacing the country
// blobs with councils, but that meant there was no broader Scotland/England/
// Wales view at all, only ~350 small council shapes.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '..', 'data', 'raw-shapefiles');
const dataDir = path.join(__dirname, '..', 'data');

const lad = JSON.parse(fs.readFileSync(path.join(rawDir, 'uk-lad.geojson'), 'utf-8'));

const councilFeatures = lad.features
  .filter((f) => /^[EWS]/.test(f.properties.LAD24CD))
  .map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      name: f.properties.LAD24NM,
      admin: 'United Kingdom',
      type_en: 'Council Area',
      iso_3166_2: '',
      adm1_code: f.properties.LAD24CD,
    },
  }));

const simplified = turf.simplify(
  { type: 'FeatureCollection', features: councilFeatures },
  { tolerance: 0.002, highQuality: false, mutate: true },
);

fs.writeFileSync(path.join(dataDir, 'councils.geojson'), JSON.stringify(simplified));
console.log(
  `Wrote councils.geojson: ${simplified.features.length} features, ` +
  `${fs.statSync(path.join(dataDir, 'councils.geojson')).size} bytes`,
);
