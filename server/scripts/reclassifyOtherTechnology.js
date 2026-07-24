// One-time cleanup: infer a more specific technology for projects currently
// bucketed under the generic "Other" category, using the technology_detail
// text as evidence. Also renames "Heat Pumps" -> "Heat Pump" to match the
// current canonical category name (see client/src/technologyConfig.js).
//
// Mapping was built by hand-reviewing every distinct technology_detail value
// under technology="Other" (181 distinct values covering 969 rows) and
// picking the closest of the 10 canonical categories: Wind, Solar, Hydro,
// Battery Energy Storage System, Heat Pump, Bioenergy, Marine, Retrofit,
// Energy Advice, Other. Left as "Other" wherever the detail text doesn't
// name a specific technology (blank, generic "renewable heat", transport-only
// initiatives with no generation asset, etc.) rather than guessing.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keyed by technology_detail (only rows currently tagged technology="Other").
// A key mapped to 'Other' is listed explicitly to document that it was
// reviewed and deliberately left unclassified, not missed.
const RECLASSIFY = {
  'District Heating Network': 'Other',
  'Other': 'Other',
  'District heating, solar thermal': 'Solar',
  'District heating, electric boiler': 'Other',
  'District heating, electric boiler, solar': 'Solar',
  'District heating, heat pump, solar': 'Heat Pump',
  'District heating, heat pump': 'Heat Pump',
  'Rooftop solar PV': 'Solar',
  'Solar farm feasibility study': 'Solar',
  'EV charging points': 'Other',
  'Solar and battery storage': 'Solar',
  'Solar PV and hydro': 'Solar',
  'Rooftop solar PV, schools': 'Solar',
  'District heating, heat pump, boiler': 'Heat Pump',
  'Air source heat pump': 'Heat Pump',
  'domestic solar installs': 'Solar',
  'assessing chargepoints and carclub potential': 'Other',
  'Zero carbon heat network': 'Other',
  'Wood Pellet Factory': 'Bioenergy',
  'Wind turbine, 900kW': 'Wind',
  'Wind project, planning consent': 'Wind',
  'Wind and solar farm portfolio': 'Wind',
  'Water source heat pump': 'Heat Pump',
  'Waste to Heat Network': 'Bioenergy',
  'Warmer homes etc?  School??': 'Retrofit',
  'Undetermined technology, early stage': 'Other',
  'Undecided': 'Other',
  'Two more school installations': 'Other',
  'Tidal impoundment': 'Marine',
  'Third-party battery storage': 'Battery Energy Storage System',
  'Thermal and battery storage': 'Battery Energy Storage System',
  'Tesla battery, solar farm': 'Battery Energy Storage System',
  'Tesla Powerwall battery storage': 'Battery Energy Storage System',
  'Tesla Powerwall battery': 'Battery Energy Storage System',
  'Solar.  Others confidential.': 'Solar',
  'Solar, battery, heat pump': 'Solar',
  'Solar power storage, EVs': 'Solar',
  'Solar for schools, hydro': 'Solar',
  'Solar farm share purchase': 'Solar',
  'Solar farm project': 'Solar',
  'Solar farm feasibility grant': 'Solar',
  'Solar farm development': 'Solar',
  'Solar co-op pioneer programme': 'Solar',
  'Solar co-op development': 'Solar',
  'Solar canopy feasibility study': 'Solar',
  'Solar PV, social housing': 'Solar',
  'Solar PV, schools, solar farms': 'Solar',
  'Solar PV, schools': 'Solar',
  'Solar PV, primary school': 'Solar',
  'Solar PV, new build': 'Solar',
  'Solar PV, multiple sites': 'Solar',
  'Solar PV, community building': 'Solar',
  'Solar PV, battery, EV charging': 'Solar',
  'Solar PV, battery storage': 'Solar',
  'Solar PV with battery storage': 'Solar',
  'Solar PV with EV charging': 'Solar',
  'Solar PV survey, schools': 'Solar',
  'Solar PV for hospital': 'Solar',
  'Solar PV canopy, school': 'Solar',
  'Solar PV canopy, battery': 'Solar',
  'Small solar farms': 'Solar',
  'Shared-loop ground source heat pump': 'Heat Pump',
  'Shared car club scheme': 'Other',
  'Sewage treatment pasteurisation': 'Other',
  'Rural electric cooperative generation': 'Other',
  'Rooftop solar, site search': 'Solar',
  'Rooftop solar, schools pipeline': 'Solar',
  'Rooftop solar, schools economics': 'Solar',
  'Rooftop solar, schools': 'Solar',
  'Rooftop solar, school': 'Solar',
  'Rooftop solar, leisure centres': 'Solar',
  'Rooftop solar, leisure centre': 'Solar',
  'Rooftop solar, heat pump': 'Solar',
  'Rooftop solar PV, early-stage': 'Solar',
  'Rooftop solar PV, PPA': 'Solar',
  'Rooftop solar PV, FiT sites': 'Solar',
  'Rooftop solar PV portfolio': 'Solar',
  'Rising Sunbeams, solar PV': 'Solar',
  'Riding Sunbeams solar project': 'Solar',
  'Renewables, battery, public transport': 'Battery Energy Storage System',
  'Renewable heat transition project': 'Other',
  'Public transport advocacy campaign': 'Other',
  'PV panels on community buildings.': 'Solar',
  'PV on local restaurant': 'Solar',
  'PV on community buildings': 'Solar',
  'Off-grid, battery, generator backup': 'Battery Energy Storage System',
  'National community-owned generation sector': 'Other',
  'Municipal and community-led generation programmes': 'Other',
  'Multiple solar PV installations': 'Solar',
  'Multiple rooftop solar arrays': 'Solar',
  'Mounted solar array': 'Solar',
  'Microgrid and heat network': 'Other',
  'MAT Schools project': 'Other',
  'Information and awareness campaign': 'Energy Advice',
  'Hydropower, River Thames weir': 'Hydro',
  'Hydropower joint venture': 'Hydro',
  'Hydrogen rail feasibility': 'Other',
  'Hybrid wind, hydro, solar, battery': 'Wind',
  'Hybrid heat pump network': 'Heat Pump',
  'Hybrid energy systems project': 'Other',
  'Heating electrification, mobility project': 'Heat Pump',
  'Heat pump projects': 'Heat Pump',
  'Have installed three EV Chargers.': 'Other',
  'Ground source heat pump, housing': 'Heat Pump',
  'Ground and roof-mounted solar PV': 'Solar',
  'Grid-servicing Tesla battery': 'Battery Energy Storage System',
  'Future roadmap, unspecified technology': 'Other',
  'Future community generation project': 'Other',
  'Further solar roofs': 'Solar',
  'Feasibility uncertain, unspecified technology': 'Other',
  'Feasibility investigation, schools': 'Other',
  'Energy Local generation and distribution': 'Other',
  'Electric vehicles talk and discussion': 'Energy Advice',
  'Electric vehicle for outreach': 'Other',
  'Electric minibus, community transport': 'Other',
  'Electric car, community transport': 'Other',
  'Electric car club pilot': 'Other',
  'EV transition advisory, minibus': 'Energy Advice',
  'EV taxi policy advocacy': 'Other',
  'EV promotion, car clubs, charging': 'Other',
  'EV promotion and car club': 'Other',
  'EV charging, off-street parking': 'Other',
  'EV charging points, village': 'Other',
  'EV charging points, schools': 'Other',
  'EV charging point network': 'Other',
  'EV charging linked to solar': 'Solar',
  'EV charging infrastructure advocacy': 'Other',
  'EV charging hub feasibility': 'Other',
  'EV charging feasibility study': 'Other',
  'EV chargers, village hall': 'Other',
  'EV chargers, solar farm': 'Solar',
  'EV chargepoint network expansion': 'Other',
  'EV charge points, Wales': 'Other',
  'EV charge point siting': 'Other',
  'EV charge point network': 'Other',
  'EV car sharing': 'Other',
  'EV car club, wind turbine': 'Wind',
  'EV car club support': 'Other',
  'E-bikes, active travel': 'Other',
  'Domestic battery storage, solar': 'Battery Energy Storage System',
  'Domestic air source heat pumps': 'Heat Pump',
  'Cycling infrastructure advocacy': 'Other',
  'Cooperative solar, hydro, biogas, wind': 'Solar',
  'Cooperative federation, solar and wind': 'Solar',
  'Cooperative electricity supplier and generator': 'Other',
  'Consumer-owned district heating cooperatives': 'Other',
  'Community wind turbine project': 'Wind',
  'Community solar farm, feasibility': 'Solar',
  'Community owned anaerobic digestion plant': 'Bioenergy',
  'Community energy, public transport': 'Other',
  'Community energy aggregator, water utilities': 'Other',
  'Community battery, co-located wind farm': 'Battery Energy Storage System',
  'Community battery storage': 'Battery Energy Storage System',
  'Community battery installations': 'Battery Energy Storage System',
  'Community HR planning': 'Other',
  'Community EV charging network': 'Other',
  'Communal solar power scheme': 'Solar',
  'Communal battery storage, solar': 'Battery Energy Storage System',
  'Commercial rooftop solar, PPA': 'Solar',
  'Citizen-led wind, solar, biomass network': 'Wind',
  'Car club, transitioning electric': 'Other',
  'Car club, EVs, e-bikes': 'Other',
  'Borehole heat pump, retrofit': 'Heat Pump',
  'Battery storage, village hall': 'Battery Energy Storage System',
  'Battery storage, peer-to-peer trading': 'Battery Energy Storage System',
  'Battery storage, anaerobic digestion site': 'Battery Energy Storage System',
  'Battery storage, 5MW': 'Battery Energy Storage System',
  'Battery storage with heat pump': 'Battery Energy Storage System',
  'Battery storage under investigation': 'Battery Energy Storage System',
  'Battery storage for EV charging': 'Battery Energy Storage System',
  'Battery storage feasibility study': 'Battery Energy Storage System',
  'Battery storage demonstration project': 'Battery Energy Storage System',
  'Battery and solar feasibility': 'Battery Energy Storage System',
  'Awaiting grant funding details': 'Other',
  'As above': 'Other',
  'Area heating feasibility study': 'Other',
  'Anaerobic digestion, CHP': 'Bioenergy',
  'Air and ground heat pumps': 'Heat Pump',
  '10kW storage battery.': 'Battery Energy Storage System',
  '10kW': 'Other',
};

function recodeDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const updateDetail = db.prepare(`UPDATE projects SET technology = ? WHERE technology = 'Other' AND technology_detail = ?`);
  const updateNullDetail = db.prepare(`UPDATE projects SET technology = ? WHERE technology = 'Other' AND technology_detail IS NULL`);
  const updateHeatPumps = db.prepare(`UPDATE projects SET technology = 'Heat Pump' WHERE technology = 'Heat Pumps'`);

  db.exec('BEGIN');
  let reclassified = 0;
  for (const [detail, technology] of Object.entries(RECLASSIFY)) {
    if (technology === 'Other') continue; // no-op, already Other
    const result = updateDetail.run(technology, detail);
    reclassified += result.changes;
  }
  updateNullDetail.run('Other'); // no-op placeholder to keep null rows documented as reviewed
  const heatPumpResult = updateHeatPumps.run();
  db.exec('COMMIT');

  console.log(`DB: reclassified ${reclassified} rows out of "Other".`);
  console.log(`DB: renamed ${heatPumpResult.changes} "Heat Pumps" rows to "Heat Pump".`);

  const remaining = db.prepare('SELECT technology, COUNT(*) c FROM projects GROUP BY technology ORDER BY c DESC').all();
  console.log('DB: technology distribution now:', remaining);
  db.close();
}

function recodeMaster() {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const techIndex = headerRow.indexOf('Technology');
  const detailIndex = headerRow.indexOf('Technology Detail');
  if (techIndex === -1 || detailIndex === -1) throw new Error('Technology columns not found');

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (row[techIndex] === 'Heat Pumps') {
      row[techIndex] = 'Heat Pump';
      updated += 1;
      continue;
    }
    if (row[techIndex] !== 'Other') continue;
    const detail = row[detailIndex] === undefined ? '' : String(row[detailIndex]);
    const technology = RECLASSIFY[detail];
    if (technology && technology !== 'Other') {
      row[techIndex] = technology;
      updated += 1;
    }
  }

  console.log(`Master spreadsheet: updated ${updated} rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  newSheet['!ref'] = sheet['!ref'];
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

recodeDb();
recodeMaster();
