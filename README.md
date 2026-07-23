# Energy Archipelago

A living map of community energy organisations and projects. Pins aggregate into
region and nation polygons as you zoom out, so anyone can see the shape of the
sector at whatever level they need — from a single project to a national
overview.

Revives the concept of the original [Energy Archipelago](https://scene.community/blog2/the-end-for-now-energy-archipelago),
led by [Scene](https://www.scene.community).

## Stack

- **Client**: React + Vite, [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)
- **Server**: Express + SQLite (via Node's built-in `node:sqlite`)

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- A [Mapbox access token](https://account.mapbox.com/access-tokens/) (free tier is fine)

## Setup

Install dependencies for both apps:

```bash
cd server && npm install
cd ../client && npm install
```

Create `client/.env.local` with your Mapbox token:

```
VITE_MAPBOX_TOKEN=pk.your_token_here
```

## Running locally

Two terminals:

```bash
cd server && npm run dev    # API on http://localhost:4000
```

```bash
cd client && npm run dev    # App on http://localhost:5173
```

## Adding project data

There's no in-app form — project data goes in via a backend-only spreadsheet
import. Use `server/templates/master-spreadsheet-template.csv` as a starting
point for column headers, then run:

```bash
cd server
npm run import -- path/to/your-spreadsheet.xlsx   # or .csv
```

Rows missing a project name, latitude, or longitude are skipped. Re-running
the import does not de-duplicate existing rows.

To insert one example project for testing:

```bash
npm run seed
```

## Project structure

```
client/
  src/
    components/     # MapView, FilterPanel, AboutPage
    api.js          # fetch wrappers for the backend
    mapConfig.js     # zoom breakpoints, map style, choropleth colors
    technologyConfig.js  # pin colors per technology
    pinIcons.js      # generates the marker SVGs used on the map

server/
  src/
    routes/          # /api/projects, /api/aggregates/:level, /api/filters
    aggregate.js      # point-in-polygon aggregation for nation/region layers
    db.js            # SQLite schema
  data/
    nations.geojson   # country boundaries
    regions.geojson    # region/state boundaries (includes UK council areas)
    raw-shapefiles/    # source shapefiles the above were converted from
  scripts/
    importSpreadsheet.js
    seed.js
  templates/
    master-spreadsheet-template.csv
```

## Data fields

Each project record has: date of data source, project name, primary
organisation and type, technology, venture type, total project capacity (MW),
estimated annual generation (MWh), project stage, latitude/longitude, country,
and region.

## Credits

Led by [Scene](https://www.scene.community), a social enterprise for local
energy futures. Created by [Sandy Robinson](https://scene.community/sceneteam).
