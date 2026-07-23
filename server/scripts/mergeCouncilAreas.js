// Replaces the single England/Scotland/Wales blobs in regions.geojson with
// their constituent UK council areas (Local Authority Districts), sourced from
// the ONS Open Geography Portal (server/data/raw-shapefiles/uk-lad.geojson).
// Northern Ireland and every other country's regions are left untouched.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '..', 'data', 'raw-shapefiles');
const dataDir = path.join(__dirname, '..', 'data');

const REPLACED_NAMES = new Set(['England', 'Scotland', 'Wales']);

const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'regions.geojson'), 'utf-8'));
const lad = JSON.parse(fs.readFileSync(path.join(rawDir, 'uk-lad.geojson'), 'utf-8'));

const keptRegions = regions.features.filter((f) => !REPLACED_NAMES.has(f.properties.name));

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

const merged = turf.simplify(
  { type: 'FeatureCollection', features: [...keptRegions, ...councilFeatures] },
  { tolerance: 0.002, highQuality: false, mutate: true },
);

fs.writeFileSync(path.join(dataDir, 'regions.geojson'), JSON.stringify(merged));
console.log(
  `Wrote regions.geojson: ${merged.features.length} features ` +
  `(${keptRegions.length} kept + ${councilFeatures.length} UK council areas), ` +
  `${fs.statSync(path.join(dataDir, 'regions.geojson')).size} bytes`,
);
