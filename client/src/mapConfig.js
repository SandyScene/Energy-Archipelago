export const ZOOM_BREAKS = {
  nationMax: 5,
  regionMax: 8,
};

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

export const INITIAL_VIEW = { center: [15, 50], zoom: 3.5 };

export function zoomBand(zoom) {
  if (zoom < ZOOM_BREAKS.nationMax) return 'nation';
  if (zoom < ZOOM_BREAKS.regionMax) return 'region';
  return 'pins';
}

const COLOR_SCALE = [
  0, 'rgba(180, 190, 200, 0.15)',
  1, '#cfe8d8',
  5, '#8fd0aa',
  20, '#39a86b',
  75, '#0f7a45',
  200, '#0a5c33',
];

export const CHOROPLETH_FILL_COLOR = ['interpolate', ['linear'], ['get', 'projectCount'], ...COLOR_SCALE];

export const CHOROPLETH_OPACITY = ['case', ['==', ['get', 'projectCount'], 0], 0.08, 0.75];
