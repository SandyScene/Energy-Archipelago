// One-off conversion: reads the user-supplied Natural Earth-style shapefiles in
// server/data/raw-shapefiles/ and writes cleaned, simplified GeoJSON to
// server/data/nations.geojson and server/data/regions.geojson.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as shapefile from 'shapefile';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '..', 'data', 'raw-shapefiles');
const dataDir = path.join(__dirname, '..', 'data');

const NUL = String.fromCharCode(0);

function trim(value) {
  if (typeof value !== 'string') return value;
  return value.split(NUL).join('').trim();
}

async function readShapefile(shpPath, dbfPath) {
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  const features = [];
  let result = await source.read();
  while (!result.done) {
    features.push(result.value);
    result = await source.read();
  }
  return { type: 'FeatureCollection', features };
}

async function convertCountries() {
  const raw = await readShapefile(path.join(rawDir, 'countries.shp'), path.join(rawDir, 'countries.dbf'));
  const simplified = turf.simplify(raw, { tolerance: 0.01, highQuality: false, mutate: true });

  const cleaned = {
    type: 'FeatureCollection',
    features: simplified.features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: trim(f.properties.name),
        admin: trim(f.properties.admin),
        iso_a3: trim(f.properties.iso_a3),
        adm0_a3: trim(f.properties.adm0_a3),
      },
    })),
  };

  fs.writeFileSync(path.join(dataDir, 'nations.geojson'), JSON.stringify(cleaned));
  console.log(`Wrote nations.geojson: ${cleaned.features.length} features, ${fs.statSync(path.join(dataDir, 'nations.geojson')).size} bytes`);
}

async function convertRegions() {
  const raw = await readShapefile(path.join(rawDir, 'regions.shp'), path.join(rawDir, 'regions.dbf'));
  const simplified = turf.simplify(raw, { tolerance: 0.01, highQuality: false, mutate: true });

  const cleaned = {
    type: 'FeatureCollection',
    features: simplified.features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: trim(f.properties.name),
        admin: trim(f.properties.admin),
        type_en: trim(f.properties.type_en),
        iso_3166_2: trim(f.properties.iso_3166_2),
        adm1_code: trim(f.properties.adm1_code),
      },
    })),
  };

  fs.writeFileSync(path.join(dataDir, 'regions.geojson'), JSON.stringify(cleaned));
  console.log(`Wrote regions.geojson: ${cleaned.features.length} features, ${fs.statSync(path.join(dataDir, 'regions.geojson')).size} bytes`);
}

await convertCountries();
await convertRegions();
