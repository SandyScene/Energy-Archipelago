// One-time cleanup: rewrite technology_detail values to 5 words max, focused on
// technology/approach. Run against both the live DB and the master spreadsheet
// so Render's auto-import (which reads the spreadsheet on an empty DB) stays
// consistent with the live data.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function simplifyDistrictHeating(text) {
  if (!/^District Heating Network/i.test(text)) return null;
  const hasHeatPump = /large heat pump/i.test(text);
  const hasBoiler = /electric boiler/i.test(text);
  const hasSolar = /solar thermal collectors/i.test(text);
  const parts = ['District heating'];
  if (hasHeatPump && hasBoiler) {
    parts.push('heat pump, boiler');
  } else if (hasHeatPump) {
    parts.push('heat pump' + (hasSolar ? ', solar' : ''));
  } else if (hasBoiler) {
    parts.push('electric boiler' + (hasSolar ? ', solar' : ''));
  } else if (hasSolar) {
    parts.push('solar thermal');
  } else {
    return 'District Heating Network';
  }
  return parts.join(', ');
}

// Free-text one-off project descriptions -> 5-word-max technology summaries.
// Keyed by the original text with whitespace collapsed/trimmed.
const MANUAL_MAP = {
  "we hope to install a mixture of ground mounted and roof mounted pV - this is still at the feasibility stage using RCEF  stage 1 funding": "Ground and roof-mounted solar PV",
  "we have one project planned of 150 kw solar for a  hospital": "Solar PV for hospital",
  "we have an offer of RCEF funding for feasibility for ground mounted PV, co-located battery storage and EV charging. I doubt it will be viable but parts of it might be; or maybe with grant funding. Our generation figs are very low for the last year as our turbine broke down for 5 months": "Solar PV, battery, EV charging",
  "we have a network of charge points around the county and plan several more  we are assisting a community organisation to raise funding for and invest in electric vehicles; to install more charge points at community centres and hospital car parks": "EV charging point network",
  "we have 6 community buildings where we have installed battery storage of 10 kwh to store surplus solar for use in periods when the solar is insufficient to meet needs": "Community battery storage",
  "we are running a pilot electric car club funded by a lottery grant.; continuing the pilot above": "Electric car club pilot",
  "we are considering this in relation to solar farm development": "Solar farm development",
  "our RCEF feasibility study will include EV charging points": "EV charging feasibility study",
  "none currently - but several battery projects under investigation; several battery projects under investigation": "Battery storage under investigation",
  "installing charge points and seeking new sites for charge points; installing charge points": "EV charging points",
  "hoping to work up a new project - still very unclear  what and where": "Undetermined technology, early stage",
  "a 99kW hydro in South Wales": "Hydropower, South Wales",
  "Working with PCC and EU partners on Heatpump projects": "Heat pump projects",
  "Working on shared-loop GSHP heat coops in W Mids": "Shared-loop ground source heat pump",
  "Work on a fast-track hybrid systems project about individuals in our communities": "Hybrid energy systems project",
  "We would like to install 70 kW on Totnes Pavilions Leisure Centre (guy and heated pool). We have pre-accredited FIT to install 30 kW on Bidwell Brook School (Dartington). We have submitted a development grant application to RCEF to install a mini grid with 180 kW solar pv at Clay Park Eco-Homes": "Multiple solar PV installations",
  "We would like to do a feasibility study for a 10MW solar farm on a site with a grid connection for a gas peaker. We opposed the planning application for the peaker and would now like to explore that site for solar and batteries instead We're helping two local schools with <50kW solar": "Solar farm feasibility study",
  "We will help community groups install batteries in community buildings; We will help community groups install batteries in community buildings": "Community battery installations",
  "We will be installing a small electrical storage battery on Elmore House, Brixton as part of our Brixton Energy Solar 1 Coop. This is part of the peer-peer energy trading project with EDF and UKPN to maximise onsite usage of the solar electricity and offer flexibility services": "Battery storage, peer-to-peer trading",
  "We use an electric vehicle to get us about to do draughtproofing and events": "Electric vehicle for outreach",
  "We promote electric vehicles.  We hold an EV display (6 different vehicles) annually in the Alton Classic Car Rally, which is always very popular.  Owners talk with the public.; An EV car club with https://www.co-wheels.org.uk  a national social enterprise": "EV promotion and car club",
  "We plan to install solar panels on 6 public buildings in the community. (Library, Office, Hall, Rugby Club, Cricket Club and Bowls)": "Solar PV, public buildings",
  "We plan to conduct a feasibility study to see whether a viable business plan exists for a solar plant of up to 3MW in our 8Ha field. We plan to partner with a community energy company.": "Solar farm feasibility study",
  "We installed a 10kWh Pure Drive battery to store surplus energy generated by the solar panels on the village hall. As most activities in the hall happend in the evening, it was important to be able to store unused energy for use later in the day. Any residue is then sent on to the grid.": "Battery storage, village hall",
  "We hope to undertake an initial feasibility study on an area heating system for Tanygrisiau.": "Area heating feasibility study",
  "We hope to start planning another community generation project later this year, possibly in partnership with Petersfield.": "Future community generation project",
  "We hope to install solar panels on a community building.": "Solar PV, community building",
  "We hope add to roof top projects , one 40 kWp and the other under 30 kWp  The first is not pre -registered the second is": "Rooftop solar PV",
  "We have supported the setting up of car club - we hope this will migrate to electric vehicles; As above": "Car club, transitioning electric",
  "We have several leads that are at various stages (one being reviewed by a board, another at an early stage of establishing a relationship before even looking at feasibility) but nothing that is a definite project at the time of writing. All are rooftop PV.": "Rooftop solar PV, early-stage",
  "We have secured £40k from the Rural Community Energy Fund to develop feasibility for a community owned microgrid and zero carbon heat network for a 300 home mixed development in central Frome": "Microgrid and heat network",
  "We have recently constructed a 900kW EWT turbine and will be energising by end of March": "Wind turbine, 900kW",
  "We have pressurised our City Council to provide cycle racks local and to provide better signage to cycle tracks.": "Cycling infrastructure advocacy",
  "We have made application to RCEF for a feasibility grant for a solar farm project of between 4 and 5 MW size located within the Parish boundary of Hayfield": "Solar farm feasibility grant",
  "We have installed cables for 8 EV charging points with only one connected to double 13 amp outdoor socket. It is intended to install EV charginging points incrementally as we perceive the need.": "EV charging points",
  "We have installed a tesla powerwall in our village hall": "Tesla Powerwall battery",
  "We have installed 2 electric vehicle chargers at the village hall. The chargers were installed free of charge by Connected Kerb as a case study": "EV chargers, village hall",
  "We have formed a new CBS-TrydaNi Charge Place-Wales Ltd. We are coo-ordinating across Wales to install charge points.; More charge points and employ staff.": "EV charge point network",
  "We have carried out a feasibility study and in the process of fitting EV chargers; EV chargers at local solar farm": "EV chargers, solar farm",
  "We have borrowed an electric car for a year but the Ogwen Partnership has a Rural lottery application which hopes to develop this further.; A scheme to transport visitors to Cwm Idwal and residents without transport to the Hospital and shopping. All subject to the success of our funding application.": "Electric car, community transport",
  "We have been working on two pre-registrations for 50kWp rooftop PV. One fell away at the end of last year. We heard today that the other one won't now be going forward, but we may be able to see if we can implement without FiT.  We have a number of other early irins in the fire": "Rooftop solar PV",
  "We have a planning consent for a wind project and will only proceed if it is financially viable.": "Wind project, planning consent",
  "We have a 16 seater 100% electric minibus which has been donated to the project. It is in need of some new battery and we are searching for support to enable us to use it to shuttle our visitors to our site.; We have recently created and agreed a transport plan with the local authority which will encourage visitors to use bicycles, electric vehicles and or local buses to access the site.": "Electric minibus, community transport",
  "We assessed our communities need for off street charging and found that circa 50 houses do not have access to off street EV charging. We have planned an installation with the support of the Parish Council to allow resident access to charging in the community car park.; We are installing with the support of the Parish Council, EV charging points for those residents that do not have access to off street parking. This will be at a cost of £6500 and will be installed in February 2020. The cost was supported by OLEV.": "EV charging, off-street parking",
  "We are working with Ovesco and Forest Row Energy and UK Power Networks on an NIC project that plans to transition 500 homes and a whole community off oil heating to electric heating and add mobility. Project sign off planned for November 2020": "Heating electrification, mobility project",
  "We are undertaking a feasibility study of installing a solar canopy at a local car park. We have £15,000 of LCEF funding to undertake this.": "Solar canopy feasibility study",
  "We are supporting the TrydaNi project and we have been exploring a Hydrogen rail project in Milford.": "Hydrogen rail feasibility",
  "We are submitting planning request for 5MW battery storage": "Battery storage, 5MW",
  "We are running a Next Generation project to test out EV charging linked to PV arrays; As above continuing the next phase of the Next Generation project": "EV charging linked to solar",
  "We are planning to carry out a feasibility study in the first half of 2020 . we will look to implement up to a 10 acre 5000 panel solar farm generating 2 GWhr/yr.": "Solar farm feasibility study",
  "We are planning 650kW of rooftop solar PV spread over 4 schoools and 4 hospital sites": "Rooftop solar PV, schools",
  "We are part of the TrydaNi project which is looking to develop a network of community owned charging point.; We will continue to support TrydaNi with the community owned car charging network.": "Community EV charging network",
  "We are looking into feasibility of putting battery storage into buildings where we have already installed solar PV and where there is not good fit between demand and supply": "Battery storage feasibility study",
  "We are investigating installing an air source heat pump in a new-building community building.": "Air source heat pump",
  "We are installing solar on 5 local schools and a local social enterprise. In conversation with two local businesses but no agreement yet.": "Solar PV, schools",
  "We are in the pre-planning stage for a community eco housing scheme. Which will be off-gas with a GSHP. 30 passivhauses, onsite solar and V2G car pool": "Ground source heat pump, housing",
  "We are hoping to install the zero carbon heat network at Saxonvale timed with phased development which is due to start at the end of the year / beginning of 2021": "Zero carbon heat network",
  "We are hoping to install a 20 kWp system on a new build community building.": "Solar PV, new build",
  "We are formulating policies firstly to recognise taxis as a 'public transport' facility and then to facilitate the purchase of electric vehicles by offering low or zero interest loans to the taxi companies.": "EV taxi policy advocacy",
  "We are doing feasibility studies at two sites on the river Seiont but as FIT has finished it is much harder to create a viable plan.": "Hydropower feasibility study",
  "We are developing several projects which would be delivered by new or existing bodies. Big Solar Co-op is our main development project": "Solar co-op development",
  "We are developing a number of opportunities but it's unlikely that any will be able to be generating by 2020.  We are developing a 30 MW solar farm but if all goes to plan that will not be operational until 2023.": "Solar farm, 30MW",
  "We are currently planning to survey 8 schools which are members of the same multi Academy Trust": "Solar PV survey, schools",
  "We are considering at small solar farms": "Small solar farms",
  "We are Riding sunbeams project started by Repower Balcombe": "Riding Sunbeams solar project",
  "Using ebikes; Develop ebikes and active routes": "E-bikes, active travel",
  "Trying to find a suitable roof.": "Rooftop solar, site search",
  "Trying to establish a communal solar power scheme across groups of houses.": "Communal solar power scheme",
  "This is connected to our Watton Village development with every house having its own solar panels. We are considering whether or not to have a site battery system or Powerwall on each house": "Solar PV, battery storage",
  "This has been advisory - but we have been supporting the Greater Brighton City Region with future planning scenarios for the transition to EVs; Yes we are developing a Community Electric Minibus project and we want to promote Community Energy working with Electric Vehicles": "EV transition advisory, minibus",
  "This forms part of our roadmaps.": "Future roadmap, unspecified technology",
  "There is a need for flexibility services and peak back up in our area, we'd like to do it using a battery and solar. So far its just an aim, we will be applying for RCEF feasibility funding for it this year": "Battery and solar feasibility",
  "Solar for Dalmain Primary School (funded through Lewisham Community Energy Fund) - not community owned. Size tbc around 12kWp, cost around £15,000. Selce may take an ongoing management fee.": "Solar PV, primary school",
  "See above re Solar for Schools.  Also interested in acquiring an existing hydro electric scheme on the town's weir.": "Solar for schools, hydro",
  "School - 49.9kWp solar array School - 99 kWp solar array  Agricultural College - 97.1 kWp solar array  Housing Co-op - 6.7 kWp": "Multiple rooftop solar arrays",
  "SRECBS solar PV canopy model improves with addition of battery.    At present cost of batteries means payback period is too long but Freemantle is a pilot so we are exploring opportunities.": "Solar PV canopy, battery",
  "Running EV workshops at local Greener Living Fair which we run jointly with the District Council. Liaising with District Council and LEP on Charging Infrastructure.; Continuing liaison with District Council to install comprehensive charging infrastructure and re-visiting proposal for a local car share scheme.": "EV charging infrastructure advocacy",
  "Roof top solar, around 500-600kW across a portfolio of projects": "Rooftop solar PV portfolio",
  "Researching local community owned energy to public transport opportunities and infrastructure": "Community energy, public transport",
  "Research & development of renewables to battery storage to leverage increased revenue & utilisation of renewable energy in local public transport.": "Renewables, battery, public transport",
  "Recently received planning permission for 200kW PV array.  Subject to financing, planning to be operational by end 2020": "Solar PV, planning permission",
  "RCEF project will look at PV with battery storage": "Solar PV with battery storage",
  "RCEF funded project to assist rural communities transition to renewable heat": "Renewable heat transition project",
  "Proposed JV with private developer for 75kW hydro": "Hydropower joint venture",
  "Possible PV and possible small scale hydro.": "Solar PV and hydro",
  "Planning to install 46kW of hydropower on River Thames at Caversham weir, to be installed summer 2020": "Hydropower, River Thames weir",
  "Planning on installing a mounted solar array on the Gwrhyd": "Mounted solar array",
  "Pioneer programme for Big Solar Co-op": "Solar co-op pioneer programme",
  "Pasturisation of raw sewage at Brampton sewage treatment plant": "Sewage treatment pasteurisation",
  "Part of the TrydaNi crew in Wales trying to install EVCPs Working with two communities about setting up a community minibus for public transport; Part of the TrydaNi crew in Wales trying to install EVCPs Working with two communities about setting up a community minibus for public transport": "EV charge points, Wales",
  "Part of Rising Sunbeams Project.  Also have some smaller PV projects.": "Rising Sunbeams, solar PV",
  "Our site is off grid and currently we are in the process of identifying several green energy generation technologies which will be used in combination with battery storage with a generator as a back up for essential services.; On our new 15 acre off grid community development": "Off-grid, battery, generator backup",
  "One application in for grant-funded rooftop PV (section 106). Early stage discussion with potential hosts for community funded rooftop PV and ground source heat pump.": "Rooftop solar, heat pump",
  "None so far. Schools project envisages  examination of solar power storage for  car  use.; As above": "Solar power storage, EVs",
  "None so far- 2020 plan; Schools MAT investigation of feasibility.": "Feasibility investigation, schools",
  "None in the last 12 months but is being considered as part of our solar farm project": "Solar farm project",
  "None in the UK.; TBC, economics marginal but wish to test it.": "Feasibility uncertain, unspecified technology",
  "None but we aim to look at EV car sharing; EV car sharing": "EV car sharing",
  "No tangible plans currently but a number of projects on our roadmap as we build organisational capacity.; Electric vehicle promotion, car clubs, charging infrastructure and potential for community owned public transport.": "EV promotion, car clubs, charging",
  "Low Carbon Hub are working with us to purchase a share in a proposed solar farm near Eynsham": "Solar farm share purchase",
  "Looking to install EV charging points at the schools. Experimental phase so far.; one or two trail EV charging points.": "EV charging points, schools",
  "Looking at embedding solar PV within Leicester schools Trying to be involved with two solar farms Feasibility study site specific": "Solar PV, schools, solar farms",
  "Large school Pipeline of many more smaller projects but difficult to progress without FiT Discussing framework agreements with local authorities": "Rooftop solar, schools pipeline",
  "It is hoped to install a multi-MW battery storage system on site when the AD plant is operational to further enhance our capacity and generate more income for community benefit": "Battery storage, anaerobic digestion site",
  "Installing and operating EV chargepoints in Cumbria and Lancashire. Carrying out feasibility work on expanding the network of chargepoints.; Expanding the network for chargepoints by 60 and raising funding through community shares.": "EV chargepoint network expansion",
  "Installed a 22KW Air Source Heat Pump at a health and wellbeing centre, providing underfloor heating.; air source heat pump for 10 properties in a rural village Ground Source heat pump for school 180kW": "Air and ground heat pumps",
  "Installed a 12kW 'SunAmp Thermal Energy Storage Solution' for a high street shop in Lewes Installed a 4kW battery in a residence in Brighton; Solar battery storage to provide night-time energy solutions for 10 off grid rural properties Energy trading and flexibility services for small neighbourhoods": "Thermal and battery storage",
  "Installed 16 domestic batteries as part of our Solar Streets project; We may include batteries within the Flex Community pilot project, also looking at battery storage behind the meter and co-located with existing solar arrays": "Domestic battery storage, solar",
  "Installation of 292kW of Solar PV on five sites in Windsor and Maidenhead, all community buildings with power supplied to the site.  184kW was pre-registered, and 108kW is going on one building without FIT": "Solar PV, multiple sites",
  "Information and awareness; Within our NIC project": "Information and awareness campaign",
  "In June we installed an air source heat pump in a home in fuel poverty in Hindon SP3": "Air source heat pump",
  "Hope to install 50kW pv on coop supermarket roof in Southwell.": "Rooftop solar PV, co-op",
  "HEI created Harbury e-Wheels, now a separate company and registered charity (1182910). We use 2 EV cars to provide free volunteer transport to people referred to us by social agencies and surgeries. In 2019 we delivered 1600 hours of free transport covering 17,300 miles.; Continuation of Harbury e-Wheels. Working on a project with RCEF Stage 1 grant to provide EV charging from a vertical axis wind turbine.": "EV car club, wind turbine",
  "Further schools in Ealing (based on a post FiT model)": "Rooftop solar, schools",
  "Freemantle Academy is looking to fund solar PV canopy themselves using SALIX and own reserves.  Target install date is July/ Aug 2020.  SRECBS share offer will look to raise >£240k to fund 3 solar PV canopies and install in December.": "Solar PV canopy, school",
  "Fossil-fuel free, retrofit, hybrid heat network - GSHP with ASHP and thermal storage to deliver 5GWh / year to the village.": "Hybrid heat pump network",
  "Following an unsuccessful 2Mw community solar farm project in 2015, as the result of the landowner withdrawing consent at the last minute, we are currently talking with the Wyre Forest District Council and a local landowner about potential sites for a community energy project.": "Community solar farm, feasibility",
  "Feasibility work on battery storage to support EV charging.; Battery storage for renewables at chargepoint sites.": "Battery storage for EV charging",
  "Extremely difficult to make economics work unless pre-registered or it is a large school in the south or coastal area. Organisations who are focused on limited geographic areas in low sun areas will struggle to make the economics viable in most cases based on electricity sales alone.": "Rooftop solar, schools economics",
  "Early stage discussion for possible borehole heatpump installation.  A charity is converting a wing of an old building into accomodation for 20 people.  Insulation will be upgraded and a new heating system is required.": "Borehole heat pump, retrofit",
  "Domestic air source heat pumps as part of our Flex Community pilot": "Domestic air source heat pumps",
  "Continuing to run 100kW grid-servicing TESLA battery on HAB Housing's Lovedon Fields development, Winchester.  This was installed in 2017.": "Grid-servicing Tesla battery",
  "Consider potential locations for charging points and some connection with TrydaNI; Research on potential charge point sites": "EV charge point siting",
  "Completion of pre-registered Feed in Tariff (FiT) sites to 31/3/20. 3 sites currently being installed, 6 to 8 further pre-registered sites possible, adding about 250kWp.  FiT free sites thereafter. Several FiT free quotes issues already, including 3 in a new Council area which total over 500kWp.": "Rooftop solar PV, FiT sites",
  "Community HR plan - initial steps.": "Community HR planning",
  "Community Energy South is an aggregator - we are supporting Riding Sunbeams pipeline and other community energy groups with expert advice.  We are also developing an approach with our local water companies to deliver 20MW of generation.": "Community energy aggregator, water utilities",
  "Co Wheels Shared Car Scheme based on our neighbourhood.; Building use of the Shared Car Scheme.": "Shared car club scheme",
  "City of London Community energy - 50kWp on social housing": "Solar PV, social housing",
  "Charging points to be provided in village car park; As above": "EV charging points, village",
  "Car Club with 49 members 2 Electric Vehicles 3 Diesel Vehicles using Biofuel 4 Electric Bikes available to Members": "Car club, EVs, e-bikes",
  "Cant do this as we are waiting for details from potential partners who apply to us for grant funding.": "Awaiting grant funding details",
  "Campaign to keep village buses, despite all subsidies removed by Oxfordshire County Council": "Public transport advocacy campaign",
  "At the same site as the gas peaker we will be exploring an EV charging hub.; At the same site as the gas peaker we will be exploring an EV charging hub. And our housing project will have EV charging and V2G": "EV charging hub feasibility",
  "Assist smooth running of Machynlleth Car Club. Loose partner in recently started pilot project called Getting EV moving in Mid Wales. (Led by Open Newtown and funded by Arwain (LEADER in Powys)); Hope to assist/manage charging point with/for new EV Car Club": "EV car club support",
  "As part of Banister House Solar we have partnered with Green Runnings / Verv and have installed energy batteries in communal areas for the scheme. We are also exploring battery storage as part of our trial with EDF at Elmore House, Brixton Energy Solar 1.": "Communal battery storage, solar",
  "As above, possibly in conjunction with Solar and Battery": "Solar and battery storage",
  "As above, in conjunction with Solar and Battery; As babove": "Solar and battery storage",
  "Another hydro system, this time 100 kW turbine": "Hydropower turbine, 100kW",
  "Anaerobic Digestion. Pruduction of Electricity, Heat and Sludge.": "Anaerobic digestion, CHP",
  "Ambition Lawrence Weston (AL developing their own community owned wind turbine to tackle fuel poverty and other issues within the community. Due to start building this year. ALW also have an ambition for an Energy Learning Zone to create a virtual network of employers,  teaching new skills.": "Community wind turbine project",
  "Actively exploring a WSHP, with gas boiler backup, for an athletics centre, decommissioning 8 existing gas boilers.": "Water source heat pump",
  "A smaller number of solar PV sites.  We expect school sites with higher electricity costs will just about break even without FiT.": "Rooftop solar PV, schools",
  "A number of EV charging points as part of our Flex Community pilot project": "EV charging points",
  "A Next Generation grant linked combined Solar/Battery/(and maybe heat pump) install on Social Housing A school solar install": "Solar, battery, heat pump",
  "86kW rooftop solar on a leisure centre": "Rooftop solar, leisure centre",
  "7MW battery to the point of planning before business case fell over \n\nInstalled a 5kW smart battery into a home with ASHP.": "Battery storage with heat pump",
  "60kw solar PV at Christleton Leisure Centre CH3 7AS 60kw solar PV at Neston Leisure Centre CH64 9NQ": "Rooftop solar, leisure centres",
  "6 Tesla Powerwall 2 batteries delivering 81KWh \nDaily average consumption is 100KWh \nDaily average generation is 110 KWh": "Tesla Powerwall battery storage",
  "5kWh in village Hall under a 10kW installation of PV. We are interested in bi-directional EV charging.": "Solar PV with EV charging",
  "3 x MW-scale battery systems hosted on our site but owned by a 3rd party.": "Third-party battery storage",
  "3 more sites for PV of 100, 100 & 60 kw": "Rooftop solar PV",
  "29 kh p solar array on a  community building  21.03.2020 Preregistered for the FIT": "Solar PV, community building",
  "24 + 26 kWp on a local school, Malorees Infant & Junior NW6 7PB": "Rooftop solar, school",
  "228kWh Tesla battery installed at Killan solar farm": "Tesla battery, solar farm",
  "160kW commercial rooftop with occupier long-term PPA which we have been developing for over a year.": "Commercial rooftop solar, PPA",
  "152 kw  Solar-photovoltaic rooftop installation on Bristol Indoor Bowls Club should be completed by end of March 2020.": "Rooftop solar PV",
  "15 solar PV and 2 hydro projects": "Solar PV and hydro",
  "100kw morer solar PV with power purchase by building users": "Rooftop solar PV, PPA",
  "1 Wind turbine, 600kW (possibly upgraded to 850kW)": "Wind turbine, 600kW",
  "Demonstration project as part of the EU Horizon 20/20 Sensible Project. \n6 kW Energy storage units fitted to 11 houses with PV generation, 4 houses on Dual Tariff meters and 6 houses with Immersun installations. 6 houses without energy storage also fitted with monitoring kit. \nGeneration, storage and use profiles collected in order to simulate and assess the potential for inter community energy sharing. Experiments also carried out on grid stability when energy is dumped form storage units.": "Battery storage demonstration project",
};

const normalized = {};
for (const [k, v] of Object.entries(MANUAL_MAP)) {
  normalized[k.replace(/\s+/g, ' ').trim()] = v;
}

function simplify(text) {
  if (text === null || text === undefined) return { value: text, changed: false };
  const str = String(text);
  if (countWords(str) <= 5) return { value: str, changed: false };

  const dhn = simplifyDistrictHeating(str);
  if (dhn) return { value: dhn, changed: true };

  const key = str.replace(/\s+/g, ' ').trim();
  if (normalized[key]) return { value: normalized[key], changed: true };

  return { value: null, changed: false, unmatched: true };
}

export { simplify, countWords, MANUAL_MAP };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const dbPath = path.join(__dirname, '..', 'data', 'energy-archipelago.db');
  const db = new DatabaseSync(dbPath);

  const rows = db.prepare('SELECT DISTINCT technology_detail FROM projects WHERE technology_detail IS NOT NULL').all();
  let updated = 0;
  const unmatched = [];
  const update = db.prepare('UPDATE projects SET technology_detail = ? WHERE technology_detail = ?');

  db.exec('BEGIN');
  for (const row of rows) {
    const original = row.technology_detail;
    const result = simplify(original);
    if (result.unmatched) {
      unmatched.push(original);
      continue;
    }
    if (result.changed) {
      update.run(result.value, original);
      updated += 1;
    }
  }
  db.exec('COMMIT');

  console.log(`Updated ${updated} distinct technology_detail values.`);
  if (unmatched.length) {
    console.log(`UNMATCHED (${unmatched.length}):`);
    for (const u of unmatched) console.log(' -', u);
  }

  const remaining = db.prepare('SELECT technology_detail FROM projects WHERE technology_detail IS NOT NULL').all()
    .filter((r) => countWords(r.technology_detail) > 5);
  console.log(`Rows still over 5 words: ${remaining.length}`);
  db.close();
}
