// Canonical project_stage vocabulary shared by the one-time recode script and
// the spreadsheet importer, so both older survey values and new import values
// collapse onto the same 5 stages.
export const CANONICAL_PROJECT_STAGES = new Set(['Early Stage', 'Mid-Stage', 'Operational', 'Stalled', 'Unknown']);

// Keyed by the raw value with non-alphanumeric characters stripped, so
// spacing/case variants all resolve to one canonical stage.
const PROJECT_STAGE_ALIASES = {
  projectoperational: 'Operational',
  operational: 'Operational',
  fertig: 'Operational',
  fertigca2006: 'Operational',
  fertigdezember2005: 'Operational',
  stalled: 'Stalled',
  planningrejected: 'Stalled',
  planningwithdrawn: 'Stalled',
  planninggranted: 'Mid-Stage',
  planningsubmitted: 'Mid-Stage',
  aufdemwegzumbioenergiedorf: 'Mid-Stage',
  initialfeasibility: 'Early Stage',
  feasibilitycomplete: 'Early Stage',
  planned: 'Early Stage',
  unknown: 'Unknown',
};

export function normalizeProjectStage(value) {
  if (!value) return 'Unknown';
  const trimmed = String(value).trim();
  if (CANONICAL_PROJECT_STAGES.has(trimmed)) return trimmed;
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROJECT_STAGE_ALIASES[key] || 'Unknown';
}
