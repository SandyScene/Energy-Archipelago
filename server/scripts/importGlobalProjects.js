// One-time import of the curated "Global Community Energy Projects" spreadsheet
// (a hand-researched list of internationally notable community energy projects,
// distinct from the regional survey data already in the master dataset).
//
// Run manually: node scripts/importGlobalProjects.js path/to/Global-Community-Energy-Projects.xlsx
//
// The source file's own ID column (1-79) is NOT related to this project's
// database IDs and must be ignored — every row here is always inserted fresh
// with a new auto-increment ID, never used to match/update an existing row.
//
// 4 of the 79 source rows turned out to already exist in the master dataset
// (same project, matched by name + coordinates during review) and are skipped
// via SKIP_SOURCE_IDS. Technology, venture type, project stage and a 5-word-max
// technology_detail were hand-assigned per row during review, since the source
// text is free-form prose (e.g. "Solar PV + Battery", "Shared Ownership /
// Partnership") that doesn't map mechanically onto this app's canonical
// single-value categories.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, utils } from 'xlsx';
import { db } from '../src/db.js';
import { normalizeProjectStage } from './projectStage.js';

// Already present in the master dataset under a different name — see review notes above.
export const SKIP_SOURCE_IDS = new Set([
  3,  // Middelgrunden Offshore Wind Farm -> existing "Middelgrunden" (Denmark)
  14, // Inis Meain community wind -> existing "Fuinneamh Glas Teoranta (Inis Meain)" (Ireland)
  18, // Isle of Gigha community wind -> existing "The three dancing ladies" (Scotland)
  34, // Swedish wind cooperatives (Varbergsvind...) -> existing "Varbergsvind" (Sweden)
]);

// Per-row overrides: canonical technology/venture type/stage plus a <=5 word
// technology_detail. Country/region overrides fix the 4 rows that used
// "Scotland" as a country (this app files UK nations under country="United
// Kingdom", region="Scotland", matching the rest of the dataset).
export const OVERRIDES = {
  1: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: '31 turbines, community shareholding' },
  2: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Cooperative federation, solar and wind' },
  4: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: '11 onshore turbines, farmer-owned' },
  5: { technology: 'Wind', ventureType: 'Unknown', techDetail: '10 offshore turbines, mixed ownership' },
  6: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Consumer-owned district heating cooperatives' },
  7: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'First Dutch cooperative solar project' },
  8: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Largest cooperative rooftop solar array' },
  9: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: 'Farmer cooperative wind turbines' },
  10: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Citizen-led wind, solar, biomass network' },
  11: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Cooperative electricity supplier and generator' },
  12: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: '29 cooperative-owned wind turbines' },
  13: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: "Ireland's first community wind farm" },
  15: { technology: 'Wind', ventureType: 'Unknown', techDetail: 'Single turbine, fish plant supply' },
  16: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: '3 turbines, common grazings land', country: 'United Kingdom', region: 'Scotland' },
  17: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Hybrid wind, hydro, solar, battery', country: 'United Kingdom', region: 'Scotland' },
  19: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: 'Archimedes screw hydro scheme', country: 'United Kingdom', region: 'Scotland' },
  20: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Cooperative solar, hydro, biogas, wind' },
  21: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Cooperative-financed village solar park' },
  22: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Shared PV, neighbourhood energy communities' },
  23: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Rooftop PV, first Italian REC' },
  24: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Two PV parks, net metering' },
  25: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: 'Planned wind and pumped hydro' },
  26: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Wind and solar farm portfolio' },
  27: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Island-wide rooftop solar, energy sharing' },
  28: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Decentralised solar, social-sector buildings' },
  29: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Rooftop solar, first Croatian citizen-owned' },
  30: { technology: 'Solar', ventureType: 'Community-Public Partnership', techDetail: 'Crowd-funded rooftop solar, development centre' },
  31: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Rooftop solar, first Slovenian cooperative' },
  32: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: "One of Poland's first cooperatives" },
  33: { technology: 'Bioenergy', ventureType: 'Unknown', techDetail: 'Planned biogas heat-and-power network' },
  35: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Rooftop community solar garden' },
  36: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Cooperative rooftop community solar' },
  37: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar array plus battery microgrid' },
  38: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: "Puerto Rico's first electric cooperative" },
  39: { technology: 'Solar', ventureType: 'Community-Public Partnership', techDetail: 'Island microgrid with battery storage' },
  40: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'First Nation-owned solar array' },
  41: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'First Nation-owned solar farm' },
  42: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: 'Community-owned First Nation wind' },
  43: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: 'Proposed Indigenous community wind project' },
  44: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Rural electric cooperative generation' },
  45: { technology: 'Other', ventureType: 'Community-Public Partnership', techDetail: 'Municipal and community-led generation programmes' },
  46: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: 'National run-of-river micro-hydro programme' },
  47: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: '51kW community micro-hydro plant' },
  48: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: '23kW grid-connected micro-hydro plant' },
  49: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: '350kW turbine, local body owned' },
  50: { technology: 'Bioenergy', ventureType: '100% Community Owned', techDetail: 'Biomass gasifier, solar streetlights' },
  51: { technology: 'Solar', ventureType: 'Community-Commercial Partnership', techDetail: 'Solar micro-grid, battery storage' },
  52: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Citizen-funded distributed public solar' },
  53: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: 'Citizen-funded wind turbine' },
  54: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Cooperative solar stations, public land' },
  55: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Citizen-funded rooftop solar array' },
  56: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Village solar cooperative, income' },
  57: { technology: 'Solar', ventureType: 'Community-Public Partnership', techDetail: 'District-wide solar plant network' },
  58: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: 'Indigenous community micro-hydro network' },
  59: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: 'Community-managed run-of-river micro-hydro' },
  60: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'National village-cooperative solar programme' },
  61: { technology: 'Solar', ventureType: 'Community-Public Partnership', techDetail: 'Microcredit-financed solar home systems' },
  62: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'First Kenyan grid-connected solar mini-grid' },
  63: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar-battery mini-grid, Maasai village' },
  64: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar-battery mini-grid, Maasai village' },
  65: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: 'Pioneer micro-hydro hybrid mini-grids' },
  66: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar-battery mini-grid, being upgraded' },
  67: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar-battery mini-grid, planned interconnection' },
  68: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar power hub, health centre' },
  69: { technology: 'Hydro', ventureType: '100% Community Owned', techDetail: 'Run-of-river micro-hydro, mini-grid' },
  70: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Phased village solar mini-grid' },
  71: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Pilot carport solar array' },
  72: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Community solar unit, settlement' },
  73: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Off-grid rooftop solar system' },
  74: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: "Australia's first community-owned wind farm" },
  75: { technology: 'Other', ventureType: '100% Community Owned', techDetail: 'Community battery, co-located wind farm', capacityMw: null },
  76: { technology: 'Wind', ventureType: '100% Community Owned', techDetail: 'Proposed wind farm, consent refused' },
  77: { technology: 'Other', ventureType: 'Unknown', techDetail: 'National community-owned generation sector' },
  78: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Off-grid solar-battery micro-grid' },
  79: { technology: 'Solar', ventureType: '100% Community Owned', techDetail: 'Solar-diesel hybrid, three atolls' },
};

export const COLUMNS = [
  'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
  'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
  'project_stage', 'latitude', 'longitude', 'country', 'region',
];

// Builds a canonical project row from one raw source row, or returns null if
// it's one of the SKIP_SOURCE_IDS already present in the master dataset.
export function buildRow(raw) {
  const sourceId = Number(raw.ID);
  if (SKIP_SOURCE_IDS.has(sourceId)) return null;

  const override = OVERRIDES[sourceId];
  if (!override) {
    throw new Error(`No override defined for source row ID ${sourceId} ("${raw['Project Name']}")`);
  }

  const capacityRaw = raw['Capacity (MW)'];
  const capacityMw = 'capacityMw' in override
    ? override.capacityMw
    : (capacityRaw === '' || capacityRaw === undefined ? null : Number(capacityRaw));

  return {
    date_of_data_source: raw['Date Data Source'] || null,
    project_name: raw['Project Name'],
    lead_organisation: raw['Lead Organisation'] || null,
    organisation_website: raw['Organisation Website'] || null,
    organisation_type: raw['Organisation Type'] || null,
    venture_type: override.ventureType,
    technology: override.technology,
    technology_detail: override.techDetail,
    capacity_mw: Number.isNaN(capacityMw) ? null : capacityMw,
    project_stage: normalizeProjectStage(raw['Project Stage']),
    latitude: Number(raw.Latitude),
    longitude: Number(raw.Longitude),
    country: override.country || raw.Country,
    region: override.region || raw.Region || null,
  };
}

function importFile(filePath) {
  const buffer = readFileSync(filePath);
  const workbook = read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets['Global Projects'];
  const rows = utils.sheet_to_json(sheet, { defval: '' });

  const insertPlaceholders = COLUMNS.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${insertPlaceholders})`);

  let inserted = 0;
  let skipped = 0;

  for (const raw of rows) {
    const row = buildRow(raw);
    if (!row) {
      skipped += 1;
      continue;
    }
    const values = COLUMNS.map((col) => row[col] ?? null);
    insert.run(...values);
    inserted += 1;
  }

  console.log(`Inserted ${inserted} new projects, skipped ${skipped} already present in the master dataset.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/importGlobalProjects.js <path-to-Global-Community-Energy-Projects.xlsx>');
    process.exit(1);
  }
  importFile(filePath);
}
