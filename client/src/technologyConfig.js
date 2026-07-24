export const TECHNOLOGY_COLORS = {
  Solar: '#ffd400',
  Wind: '#9e9e9e',
  Hydro: '#6b3fa0',
  'Battery Energy Storage System': '#2f6fed',
  'Heat Pump': '#d0294f',
  Bioenergy: '#6fbf3f',
  Marine: '#1fb6a6',
  Retrofit: '#8d6e63',
  'Energy Advice': '#f06292',
  'Low Carbon Transport': '#00acc1',
  Other: '#f2994a',
};

export const TECHNOLOGIES = Object.keys(TECHNOLOGY_COLORS);

export const DEFAULT_TECHNOLOGY_COLOR = TECHNOLOGY_COLORS.Other;

export const TECHNOLOGY_COLOR_EXPRESSION = [
  'match',
  ['get', 'technology'],
  ...Object.entries(TECHNOLOGY_COLORS).flat(),
  DEFAULT_TECHNOLOGY_COLOR,
];

export const TECHNOLOGY_ICON_EXPRESSION = [
  'match',
  ['get', 'technology'],
  ...Object.keys(TECHNOLOGY_COLORS).flatMap((label) => [label, `pin-${label}`]),
  'pin-Other',
];
