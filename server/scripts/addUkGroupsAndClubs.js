// Adds researched UK community energy groups + Energy Local clubs.
//
// Two source lists, researched via 6 parallel background agents:
//   1. 20 named UK community energy groups supplied by the user.
//   2. 39 "Energy Local" clubs (energylocal.org.uk/clubs) — each club is a
//      tariff-matching scheme tied to ONE local generation asset; this DB
//      tracks the underlying generation asset, not the tariff mechanism.
//
// Reconciliation notes:
//   - "Settle Local Energy Club" (named-group list) and "Settle" (Energy
//     Local club list) are the same real-world asset (Settle Hydro, 50kW
//     Archimedes screw on the River Ribble) — merged into one row.
//   - "Corwen" and "Glyndwr" Energy Local clubs both draw on the same
//     Corwen Electricity Co-operative hydro schemes (Nant y Pigyn + Bonwm,
//     155kW); Glyndwr is the expanded successor club (adds undocumented
//     solar capacity, no separate site/figure found) — merged into one row
//     rather than double-counting the same physical turbines.
//
// Excluded after research (no DB row added), with reason:
//   - Ellerby Community Energy, Compassionate Energy: no such organisation
//     could be confirmed to exist.
//   - Swanland Village Hall: real charity, but no energy project of any
//     kind found associated with it.
//   - Huddersfield Town AFC: a commercial marketing tie-in with an
//     installer (Utilita Home), not a distinct community energy project.
//   - Environmental Smart CIC: Companies House shows this CIC dissolved
//     28 March 2023 despite a live website; status too uncertain to add
//     as an operating entity.
//   - Energy Local clubs with no identifiable generation asset at all
//     (blank/vague "local renewable source" field and no plausible named
//     candidate): North Devon, Bro Rhian, Llanymddyfri, Glaslyn, Gwyrfai,
//     Pendraw'r Byd, Wnion, Essex, Duddon Valley (450kW figure could not be
//     reconciled with any confirmed built hydro scheme).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, write, utils } from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-08-04';

const NEW_ROWS = [
  // -- 20 named groups (15 included) --
  {
    project_name: 'Acumen Community Buildings – Energy Efficiency Retrofit',
    lead_organisation: 'Acumen Community Buildings Ltd',
    organisation_website: 'https://www.acumencommunitybuildings.co.uk/',
    organisation_type: 'Charity',
    venture_type: 'Unknown',
    technology: 'Retrofit',
    technology_detail: 'VCSE Energy Efficiency Grant funding gas boiler replacement and insulation measures at the charity’s community building.',
    capacity_mw: null,
    project_stage: 'Unknown',
    latitude: 54.839, longitude: -1.4703,
    country: 'United Kingdom', region: 'North East',
  },
  {
    project_name: 'Settle Hydro (Energy Local Settle)',
    lead_organisation: 'Settle Hydro Limited',
    organisation_website: 'https://www.settlehydro.org.uk/',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: '50kW Archimedes screw turbine on the River Ribble at Settle Weir, generating since 2009; output shared locally via the Energy Local Settle club and Settle Local Energy Club, supplemented by local solar PV.',
    capacity_mw: 0.05,
    project_stage: 'Operational',
    latitude: 54.0709, longitude: -2.2775,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Bradford Community Energy Solar (Park Lane & Mayfield Centres)',
    lead_organisation: 'Bradford Community Energy (with Bradford Trident)',
    organisation_website: 'https://bradfordtrident.co.uk/',
    organisation_type: 'Community Group',
    venture_type: 'Community-Commercial Partnership',
    technology: 'Solar',
    technology_detail: '60kW rooftop solar PV on the Park Lane and Mayfield Centres, funded via a community share offer, generating since March 2019.',
    capacity_mw: 0.06,
    project_stage: 'Operational',
    latitude: 53.782, longitude: -1.755,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'YES Energy Solutions Home Retrofit Programme',
    lead_organisation: 'Yorkshire Energy Services CIC (YES Energy Solutions)',
    organisation_website: 'https://www.yesenergysolutions.co.uk/',
    organisation_type: 'Community Interest Company (CIC)',
    venture_type: 'Unknown',
    technology: 'Retrofit',
    technology_detail: 'Fully-funded home energy retrofit (insulation, heating replacement, some solar) delivered via government schemes such as ECO4 and Warm Homes Local Grant.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 53.703, longitude: -1.868,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'SAIL Community Energy Feasibility (Creative Sector)',
    lead_organisation: 'SAIL (Sustainability in the Arts & Cultural Industries, Leeds)',
    organisation_website: 'https://wearesail.org/',
    organisation_type: 'Non-profit Organisation',
    venture_type: 'Unknown',
    technology: 'Energy Advice',
    technology_detail: 'Net Zero Hub-funded feasibility work exploring a community-owned renewable energy model for West Yorkshire’s creative and cultural sector.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 53.7965, longitude: -1.5657,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Leeds Community Energy (Clean Energy Leeds)',
    lead_organisation: 'Leeds Community Energy / Clean Energy Leeds',
    organisation_website: 'https://leedscommunityenergy.org.uk/',
    organisation_type: 'Cooperative',
    venture_type: '100% Community Owned',
    technology: 'Solar',
    technology_detail: 'Grassroots cooperative organising community-owned renewable generation and fuel poverty work across Leeds; recently merged with Alwoodley Community Energy. No completed generation site confirmed yet.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 53.8267, longitude: -1.5528,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Holy Island Village Hall Solar & Battery Storage',
    lead_organisation: 'Holy Island of Lindisfarne Community Development Trust',
    organisation_website: null,
    organisation_type: 'Trust',
    venture_type: 'Community-Public Partnership',
    technology: 'Solar',
    technology_detail: 'Solar panels and battery storage for Holy Island Village Hall, funded by Northumberland County Council’s Environment and Climate Fund and the Northern Powergrid Foundation, part of the ‘Holy Island 2050’ zero-carbon initiative.',
    capacity_mw: null,
    project_stage: 'Mid-Stage',
    latitude: 55.6683, longitude: -1.8025,
    country: 'United Kingdom', region: 'North East',
  },
  {
    project_name: 'Tockwith Community Solar Scheme',
    lead_organisation: 'Tockwith with Wilstrop Parish Council',
    organisation_website: 'https://www.tockwith.gov.uk/Energy_Generation_Scheme_Community_Survey_48600.aspx',
    organisation_type: 'Community Council',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Proposed not-for-profit local solar generation scheme for the village; still gauging community support for feasibility funding as of latest report.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 53.96, longitude: -1.339,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Sheffield Energy Hub',
    lead_organisation: 'South Yorkshire Climate Alliance',
    organisation_website: 'https://sheffieldenergyhub.org/',
    organisation_type: 'Non-profit Organisation',
    venture_type: 'Unknown',
    technology: 'Energy Advice',
    technology_detail: 'Walk-in advice hub covering solar PV, heat pumps, batteries, retrofit and community energy, referring residents to partner groups such as Sheffield Renewables.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 53.3796, longitude: -1.4706,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Leeds Community Sauna (Wood-Fired Heat)',
    lead_organisation: 'Leeds Community Sauna Limited',
    organisation_website: 'https://www.leedscommunitysauna.com/',
    organisation_type: 'Cooperative',
    venture_type: '100% Community Owned',
    technology: 'Bioenergy',
    technology_detail: 'Community-share-funded wood-fired sauna stoves at Kirkstall Valley Farm, using wood sourced from the Leeds Coppice Workers Cooperative as the primary heat source.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 53.8207, longitude: -1.6119,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Acomb Community Solar Farm',
    lead_organisation: 'Acomb Community Energy',
    organisation_website: 'https://acombcommunityenergy.org.uk/',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: '100% Community Owned',
    technology: 'Solar',
    technology_detail: 'Ground-mounted solar array planned near Salmonswell Farm, east of Acomb Common, York; full planning permission granted, expected to generate ~829,000 kWh/year.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 53.9659, longitude: -1.1505,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'Sherburn Hill Community Hub Solar & Battery',
    lead_organisation: 'Sherburn Hill Community Hub',
    organisation_website: null,
    organisation_type: 'Community Group',
    venture_type: '100% Community Owned',
    technology: 'Solar',
    technology_detail: 'Rooftop solar with battery storage and hybrid inverter at the community hub/café, funded by a Northern Powergrid Foundation grant.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 54.7686, longitude: -1.5065,
    country: 'United Kingdom', region: 'North East',
  },
  {
    project_name: 'Horden Minewater Geothermal Heat Scheme',
    lead_organisation: 'Durham County Council (with Horden Together, East Durham Trust, Horden Parish Council)',
    organisation_website: 'https://www.durham.gov.uk/article/31995/Horden-Minewater-project',
    organisation_type: 'Local Authority',
    venture_type: 'Community-Public Partnership',
    technology: 'Low Carbon Heating',
    technology_detail: 'Mine-water geothermal heat network proposal using naturally heated water pumped from former colliery workings, to warm homes, schools and businesses in Horden.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 54.7659, longitude: -1.3115,
    country: 'United Kingdom', region: 'North East',
  },
  {
    project_name: 'Beyond Housing Decarbonisation Retrofit Programme',
    lead_organisation: 'Beyond Housing',
    organisation_website: 'https://beyondhousing.co.uk/',
    organisation_type: 'Housing Association',
    venture_type: 'Unknown',
    technology: 'Retrofit',
    technology_detail: 'Insulation, solar PV and air-source heat pump retrofit across housing stock in North Yorkshire/Teesside, funded in part via the Social Housing Decarbonisation Fund.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 54.6169, longitude: -1.0672,
    country: 'United Kingdom', region: 'North East',
  },
  {
    project_name: 'Zero Carbon Harrogate Community Solar Feasibility',
    lead_organisation: 'Zero Carbon Harrogate',
    organisation_website: 'https://www.zerocarbonharrogate.org.uk/',
    organisation_type: 'Charity',
    venture_type: 'Unknown',
    technology: 'Energy Advice',
    technology_detail: 'Volunteer climate charity; secured North Yorkshire Mayoral funding for a technical feasibility study into a community-owned rooftop solar scheme.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 53.9919, longitude: -1.5378,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },

  // -- Energy Local clubs (28 rows; Settle merged above) --
  {
    project_name: 'Energy Local Ashburton Solar Supply',
    lead_organisation: 'Energy Local Ashburton',
    organisation_website: 'https://energylocal.org.uk/ashburton',
    organisation_type: 'Community Group',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Local solar power club matched via smart meters, supplied via 100Green; specific generating site not publicly named.',
    capacity_mw: null,
    project_stage: 'Unknown',
    latitude: 50.5147, longitude: -3.7524,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Energy Local Blackawton Solar Supply',
    lead_organisation: 'Energy Local Blackawton',
    organisation_website: 'https://energylocal.org.uk/blackawton',
    organisation_type: 'Community Group',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Local solar power club; nearest known solar farm is the ~5MW Oldstone Farm Solar Park, though no confirmed link to the club was found.',
    capacity_mw: null,
    project_stage: 'Unknown',
    latitude: 50.354, longitude: -3.6643,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Energy Local Bridport (Salway Ash Wind Turbine)',
    lead_organisation: 'Dorset Community Energy',
    organisation_website: 'https://www.dorsetcommunityenergy.org.uk/projects/energy-local-bridport/',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: 'Community-Commercial Partnership',
    technology: 'Wind',
    technology_detail: '50kW privately-owned wind turbine at Salway Ash, near Bridport, supplying the Energy Local Bridport club since 2021.',
    capacity_mw: 0.05,
    project_stage: 'Operational',
    latitude: 50.768, longitude: -2.755,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Fairy Hill Solar Farm (Energy Local)',
    lead_organisation: 'Bath & West Community Energy (BWCE)',
    organisation_website: 'https://www.bwce.coop/community-renewables/fairy-hill-solar-farm',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: '100% Community Owned',
    technology: 'Solar',
    technology_detail: '2MW, ~4,264-panel ground-mounted community solar farm at Compton Dando, near Bristol; installation and testing completed 2026 ahead of handover to BWCE.',
    capacity_mw: 2.0,
    project_stage: 'Early Stage',
    latitude: 51.3577, longitude: -2.5058,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Airport Solar Garden, Isles of Scilly (Energy Local)',
    lead_organisation: 'Isles of Scilly Community Venture CIC',
    organisation_website: 'https://www.ioscv.co.uk/energy-local',
    organisation_type: 'Community Interest Company (CIC)',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Ground-mounted solar array next to St Mary’s Airport, part of a wider ~400kW council/community solar rollout across the islands.',
    capacity_mw: null,
    project_stage: 'Unknown',
    latitude: 49.9184, longitude: -6.2926,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Sowton Weir Hydro (Energy Local Moretonhampstead)',
    lead_organisation: 'Totnes Renewable Energy Society (TRESOC)',
    organisation_website: 'https://tresoc.co.uk/project/sowtonhydro/',
    organisation_type: 'Cooperative',
    venture_type: 'Community-Commercial Partnership',
    technology: 'Hydro',
    technology_detail: '100kW Archimedes screw turbine at Sowton Weir on the River Teign, commissioned 2013; TRESOC holds a 30% community equity stake.',
    capacity_mw: 0.1,
    project_stage: 'Operational',
    latitude: 50.68, longitude: -3.7,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Pythouse Farm Solar (Energy Local Tisbury)',
    lead_organisation: 'Nadder Community Energy',
    organisation_website: 'https://www.nadderce.org.uk/',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: '100% Community Owned',
    technology: 'Solar',
    technology_detail: 'Community-funded solar array at Pythouse Farm, near Tisbury, part of Nadder Community Energy’s wider portfolio on the Fonthill Estate.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 51.0564, longitude: -2.1347,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Totnes Weir Hydro (Energy Local Totnes)',
    lead_organisation: 'Totnes Renewable Energy Society (TRESOC) / Dart Renewables Ltd',
    organisation_website: 'https://tresoc.co.uk/project/energy-local-totnes/',
    organisation_type: 'Cooperative',
    venture_type: 'Community-Commercial Partnership',
    technology: 'Hydro',
    technology_detail: '330kW twin Archimedes screw hydro plant on Totnes Weir, River Dart, operational since December 2015; majority owned by Dart Renewables Ltd with a TRESOC community stake.',
    capacity_mw: 0.33,
    project_stage: 'Operational',
    latitude: 50.431, longitude: -3.6852,
    country: 'United Kingdom', region: 'South West',
  },
  {
    project_name: 'Three Green Fields Cooperative (Wethersfield Local Supply)',
    lead_organisation: 'Three Green Fields Cooperative',
    organisation_website: 'https://energylocal.org.uk/threegreenfields',
    organisation_type: 'Cooperative',
    venture_type: 'Unknown',
    technology: 'Other',
    technology_detail: 'Aggregates solar, wind and hydro generation feeding the Wethersfield transformer area (Essex); no single named generating asset identified.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 51.9612, longitude: 0.493,
    country: 'United Kingdom', region: 'East of England',
  },
  {
    project_name: 'Talybont-on-Usk Hydro (Energy Local Brecon)',
    lead_organisation: 'Talybont-on-Usk Energy Ltd',
    organisation_website: 'https://talybontenergy.co.uk/',
    organisation_type: 'Cooperative',
    venture_type: 'Unknown',
    technology: 'Hydro',
    technology_detail: '36kW community hydro turbine at Talybont Reservoir, the first community hydro scheme in Wales (2006); the likely, though not explicitly confirmed, source for the Energy Local Brecon club.',
    capacity_mw: 0.036,
    project_stage: 'Early Stage',
    latitude: 51.9483, longitude: -3.3888,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Cwm Gu Micro-Hydro (Energy Local Crickhowell)',
    lead_organisation: 'Llangattock Green Valleys (LGV) Micro Hydro Co-operative',
    organisation_website: 'https://www.llangattockgreenvalleys.org/energy-local-crickhowell/',
    organisation_type: 'Cooperative',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: 'One of five community micro-hydro schemes run by Llangattock Green Valleys; powers the Energy Local Crickhowell club.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 51.8814, longitude: -3.2103,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Nant y Caws Wind Turbine (Energy Local)',
    lead_organisation: 'CWM Environmental / Carmarthenshire Energy Ltd',
    organisation_website: 'https://www.cwmenvironmental.co.uk/',
    organisation_type: 'Public Body',
    venture_type: 'Unknown',
    technology: 'Wind',
    technology_detail: '500kW EWT wind turbine at CWM Environmental’s Nant y Caws recycling site, near Carmarthen, installed 2014; serves neighbouring commercial premises.',
    capacity_mw: 0.5,
    project_stage: 'Early Stage',
    latitude: 51.8377, longitude: -4.3336,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'South Cornelly Local Energy Market',
    lead_organisation: 'Bridgend County Borough Council',
    organisation_website: 'https://bridgend.gov.uk/residents/housing/low-carbon-communities/south-cornelly-local-energy-market',
    organisation_type: 'Local Authority',
    venture_type: 'Community-Public Partnership',
    technology: 'Solar',
    technology_detail: 'Wales’ first Low Carbon Communities demonstrator: rooftop solar PV, solar-assisted ventilation and home batteries fitted to volunteer households behind a single substation.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 51.5375, longitude: -3.6947,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Eoligarry Community Wind Turbine, Barra',
    lead_organisation: 'Barra and Vatersay Community Ltd',
    organisation_website: 'https://www.barra-vatersay-areaforum.org.uk/',
    organisation_type: 'Community Group',
    venture_type: '100% Community Owned',
    technology: 'Wind',
    technology_detail: '900kW community-owned wind turbine at Eoligarry, north Barra; the associated Energy Local club has been unable to launch due to a grid voltage mismatch between the turbine and local households.',
    capacity_mw: 0.9,
    project_stage: 'Operational',
    latitude: 57.0186, longitude: -7.4703,
    country: 'United Kingdom', region: 'Scotland',
  },
  {
    project_name: 'Buchanan Community Hydro',
    lead_organisation: 'Buchanan Community Hydro Society',
    organisation_website: 'https://buchananhydro.coop/',
    organisation_type: 'Cooperative',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: '100kWp run-of-river hydro scheme on the Achlais Burn, east of Loch Lomond, operational since July 2022, supplying the Energy Local East Loch Lomond club.',
    capacity_mw: 0.1,
    project_stage: 'Operational',
    latitude: 56.1167, longitude: -4.5333,
    country: 'United Kingdom', region: 'Scotland',
  },
  {
    project_name: 'Energy Local Tiree Solar Supply',
    lead_organisation: 'Energy Local Tiree',
    organisation_website: 'https://energylocal.org.uk/tiree',
    organisation_type: 'Community Group',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Local solar power club distinct from the island’s larger Tilley community wind turbine (which is not connected at the same voltage as the club); specific solar site not named.',
    capacity_mw: null,
    project_stage: 'Unknown',
    latitude: 56.5023, longitude: -6.8025,
    country: 'United Kingdom', region: 'Scotland',
  },
  {
    project_name: 'Howsham Mill Hydro',
    lead_organisation: 'Renewable Heritage Trust',
    organisation_website: 'https://www.howshammill.org.uk/',
    organisation_type: 'Trust',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: 'Restored 18th-century watermill fitted with two Archimedes screw turbines (2007 and 2018), combined ~55kW output, most exported to the grid.',
    capacity_mw: 0.055,
    project_stage: 'Operational',
    latitude: 54.088, longitude: -0.868,
    country: 'United Kingdom', region: 'Yorkshire and The Humber',
  },
  {
    project_name: 'SEBrum (South East Birmingham Local Energy Cooperative)',
    lead_organisation: 'SEBrum',
    organisation_website: 'https://acocksgreener.com/sebrum-our-power-our-way/',
    organisation_type: 'Cooperative',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Enables local trading of surplus household and organisational rooftop solar PV across the Hall Green substation catchment in South-East Birmingham.',
    capacity_mw: null,
    project_stage: 'Operational',
    latitude: 52.4322, longitude: -1.8283,
    country: 'United Kingdom', region: 'West Midlands',
  },
  {
    project_name: 'Anafon Hydro (Energy Local Aber)',
    lead_organisation: 'Ynni Anafon Energy Cyf',
    organisation_website: 'http://www.anafonhydro.co.uk/',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: 'Run-of-river hydro scheme on the Afon Anafon, piping water from the Carneddau mountains through a turbine near Abergwyngregyn.',
    capacity_mw: 0.27,
    project_stage: 'Operational',
    latitude: 53.2277, longitude: -3.9963,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Energy Local Bermo (Barmouth) Hydro Supply',
    lead_organisation: 'Energy Local Bermo',
    organisation_website: 'https://energylocal.org.uk/bermo',
    organisation_type: 'Community Group',
    venture_type: 'Unknown',
    technology: 'Hydro',
    technology_detail: 'Local hydro power club serving Barmouth (Y Bermo); no specific named generating scheme confirmed.',
    capacity_mw: null,
    project_stage: 'Unknown',
    latitude: 52.7217, longitude: -4.0522,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Ynni Ogwen Hydro (Energy Local Bethesda)',
    lead_organisation: 'Ynni Ogwen Cyf',
    organisation_website: 'https://www.partneriaethogwen.cymru/en/projects/ynni-ogwen/',
    organisation_type: 'Community Benefit Society (BenCom) / Registered Society',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: '100kW run-of-river hydro scheme on the Afon Ogwen, commissioned 2017 via community share offer; profits fund further community solar/environmental projects.',
    capacity_mw: 0.1,
    project_stage: 'Operational',
    latitude: 53.1839, longitude: -4.0508,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Corwen Electricity Co-operative Hydro (Nant y Pigyn & Bonwm)',
    lead_organisation: 'Corwen Electricity Co-operative',
    organisation_website: 'http://corwenelectricity.org.uk/',
    organisation_type: 'Cooperative',
    venture_type: '100% Community Owned',
    technology: 'Hydro',
    technology_detail: 'Two community-share-funded hydro schemes, Nant y Pigyn (55kW, 2016) and Bonwm (100kW, 2018), together supplying the Corwen area; the original Energy Local Corwen club is now closed to new members and succeeded by the Glyndwr club, which draws on the same hydro assets plus additional (undocumented) solar capacity.',
    capacity_mw: 0.155,
    project_stage: 'Operational',
    latitude: 52.9808, longitude: -3.3654,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Dyffryn Banw Anaerobic Digestion & Wind Supply',
    lead_organisation: 'Energy Local Dyffryn Banw',
    organisation_website: 'https://energylocal.org.uk/dyffrynbanw',
    organisation_type: 'Unknown',
    venture_type: 'Unknown',
    technology: 'Bioenergy',
    technology_detail: 'Combined anaerobic digester and wind turbine (475kW total) serving Llanerfyl, Llangadfan and Llanfair Caereinion; likely a farm-based installation, operator not identified.',
    capacity_mw: 0.475,
    project_stage: 'Operational',
    latitude: 52.6167, longitude: -3.4667,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Llanidloes and District Community Solar (Energy Local)',
    lead_organisation: 'Llanidloes & District Energy Local Club Limited',
    organisation_website: 'https://energylocal.org.uk/llanidloes',
    organisation_type: 'Community Group',
    venture_type: 'Unknown',
    technology: 'Solar',
    technology_detail: 'Community solar initiative developed with the Big Solar Co-op and Powys ‘Energy for All’ feasibility work; no built generating asset confirmed yet.',
    capacity_mw: null,
    project_stage: 'Early Stage',
    latitude: 52.4514, longitude: -3.5309,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Esgairweddan Farm Hydro (Energy Local Machynlleth)',
    lead_organisation: 'Energy Local Machynlleth',
    organisation_website: 'https://energylocal.org.uk/machynlleth',
    organisation_type: 'Unknown',
    venture_type: 'Unknown',
    technology: 'Hydro',
    technology_detail: '60kW farm hydro scheme at Esgairweddan, Pennal, in the Dyfi Valley near Machynlleth.',
    capacity_mw: 0.06,
    project_stage: 'Operational',
    latitude: 52.5906, longitude: -3.856,
    country: 'United Kingdom', region: 'Wales',
  },
  {
    project_name: 'Brixton Energy Solar 3 (Roupell Park Estate)',
    lead_organisation: 'Brixton Energy Solar 3 Co-operative Limited',
    organisation_website: 'https://brixtonenergy.co.uk/projects/brixton-energy-solar-3/',
    organisation_type: 'Cooperative',
    venture_type: 'Community-Public Partnership',
    technology: 'Solar',
    technology_detail: '52kWp community-owned rooftop solar PV across four Roupell Park Estate buildings (council-owned social housing), live since September 2014, with added battery storage; feeds the Energy Local Roupell Park club.',
    capacity_mw: 0.052,
    project_stage: 'Operational',
    latitude: 51.446, longitude: -0.117,
    country: 'United Kingdom', region: 'London',
  },
  {
    project_name: 'Sustainable Hockerton Wind & Solar',
    lead_organisation: 'Sustainable Hockerton Ltd',
    organisation_website: 'https://sustainablehockerton.org/',
    organisation_type: 'Cooperative',
    venture_type: '100% Community Owned',
    technology: 'Wind',
    technology_detail: '225kW community-owned wind turbine (2010) plus ~87kW of solar PV on farm buildings around Hockerton, Nottinghamshire, supplying the Energy Local Southwell Area club.',
    capacity_mw: 0.225,
    project_stage: 'Operational',
    latitude: 53.0861, longitude: -0.9614,
    country: 'United Kingdom', region: 'East Midlands',
  },
  {
    project_name: 'Copys Green Farm Anaerobic Digester (Greenhoe Local Energy Club)',
    lead_organisation: 'J F Temple and Son (Copys Green Farm)',
    organisation_website: 'https://www.walsinghamvillage.org/2025/12/greenhoe-local-energy-club/',
    organisation_type: 'Unknown',
    venture_type: 'Unknown',
    technology: 'Bioenergy',
    technology_detail: '170kW electrical anaerobic digester CHP plant at Copys Green Farm, Wighton, operating since 2009; one of several small local generators (including village hall solar) proposed to supply the Greenhoe Local Energy Club.',
    capacity_mw: 0.17,
    project_stage: 'Early Stage',
    latitude: 52.9179, longitude: 0.858,
    country: 'United Kingdom', region: 'East of England',
  },
];

// Sanity check: every row should sit within rough UK bounding box.
for (const row of NEW_ROWS) {
  if (row.latitude < 49 || row.latitude > 61 || row.longitude < -8.5 || row.longitude > 2) {
    throw new Error(`Out-of-bounds UK coordinate for "${row.project_name}": ${row.latitude}, ${row.longitude}`);
  }
}

const COLUMNS = [
  'date_of_data_source', 'project_name', 'lead_organisation', 'organisation_website',
  'organisation_type', 'venture_type', 'technology', 'technology_detail', 'capacity_mw',
  'project_stage', 'latitude', 'longitude', 'country', 'region',
];

function insertDb() {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const insert = db.prepare(`INSERT INTO projects (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`);
  const insertedIds = [];

  db.exec('BEGIN');
  for (const row of NEW_ROWS) {
    const values = COLUMNS.map((c) => (c === 'date_of_data_source' ? TODAY : row[c] ?? null));
    const result = insert.run(...values);
    insertedIds.push(Number(result.lastInsertRowid));
  }
  db.exec('COMMIT');

  console.log('Inserted DB ids:', insertedIds);
  console.log(db.prepare(`SELECT id, project_name, technology, region FROM projects WHERE id IN (${insertedIds.join(',')})`).all());
  db.close();
  return insertedIds;
}

function appendMaster(insertedIds) {
  const filePath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  const buf = readFileSync(filePath);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = 'Master Dataset';
  const sheet = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const headerRow = rows[0];
  const col = (name) => headerRow.indexOf(name);

  for (let i = 0; i < NEW_ROWS.length; i += 1) {
    const row = NEW_ROWS[i];
    const id = insertedIds[i];
    const newRow = new Array(headerRow.length).fill('');
    newRow[col('ID')] = id;
    newRow[col('Date Data Source')] = TODAY;
    newRow[col('Project Name')] = row.project_name;
    newRow[col('Lead Organisation')] = row.lead_organisation;
    newRow[col('Organisation Website')] = row.organisation_website;
    newRow[col('Organisation Type')] = row.organisation_type;
    newRow[col('Venture Type')] = row.venture_type;
    newRow[col('Technology')] = row.technology;
    newRow[col('Technology Detail')] = row.technology_detail;
    newRow[col('Capacity (kW)')] = row.capacity_mw != null ? row.capacity_mw * 1000 : '';
    newRow[col('Project Stage')] = row.project_stage;
    newRow[col('Latitude')] = row.latitude;
    newRow[col('Longitude')] = row.longitude;
    newRow[col('Country')] = row.country;
    newRow[col('Region')] = row.region;
    newRow[col('Location Precision')] = '';
    newRow[col('Source File')] = 'Manually added (community-submitted list + energylocal.org.uk research)';
    rows.push(newRow);
  }

  console.log(`Master: appended ${NEW_ROWS.length} rows.`);

  const newSheet = utils.aoa_to_sheet(rows);
  if (sheet['!cols']) newSheet['!cols'] = sheet['!cols'];
  wb.Sheets[sheetName] = newSheet;

  const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filePath, outBuf);
  console.log('Wrote', filePath);
}

const ids = insertDb();
appendMaster(ids);
