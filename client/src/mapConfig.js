export const ZOOM_BREAKS = {
  ukCountriesMin: 5,
  nationMax: 5.5,
  regionMax: 6.5,
};

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

export const INITIAL_VIEW = { center: [15, 50], zoom: 3.5 };

const COLOR_SCALE = [
  0, 'rgba(180, 190, 200, 0.15)',
  1, '#cfe8d8',
  5, '#8fd0aa',
  20, '#39a86b',
  75, '#0f7a45',
  200, '#0a5c33',
];

export const CHOROPLETH_FILL_COLOR = ['interpolate', ['linear'], ['get', 'projectCount'], ...COLOR_SCALE];

// UK council areas (~350 features) top out around 60 projects even for the
// busiest area (the Highlands) — nation/region/uk-country counts reach into
// the hundreds, so the shared scale above left every council crammed into
// its bottom two tiers with the top two never reached at all. Same colors,
// rescaled breakpoints for this tier's actual magnitude.
const COLOR_SCALE_FINE = [
  0, 'rgba(180, 190, 200, 0.15)',
  1, '#cfe8d8',
  4, '#8fd0aa',
  10, '#39a86b',
  25, '#0f7a45',
  65, '#0a5c33',
];

export const CHOROPLETH_FILL_COLOR_FINE = ['interpolate', ['linear'], ['get', 'projectCount'], ...COLOR_SCALE_FINE];

export const CHOROPLETH_OPACITY = ['case', ['==', ['get', 'projectCount'], 0], 0.08, 0.75];
