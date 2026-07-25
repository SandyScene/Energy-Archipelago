import { TECHNOLOGY_GROUPS } from './technologyGroups.js';

const FILTER_PARAM_TO_COLUMN = {
  country: 'country',
  region: 'region',
  technology: 'technology',
  ventureType: 'venture_type',
  projectStage: 'project_stage',
};

export function buildProjectFilter(query) {
  const clauses = [];
  const params = [];

  for (const [param, column] of Object.entries(FILTER_PARAM_TO_COLUMN)) {
    const value = query[param];
    if (value) {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  const technologies = TECHNOLOGY_GROUPS[query.technologyGroup];
  if (technologies?.length) {
    clauses.push(`technology IN (${technologies.map(() => '?').join(', ')})`);
    params.push(...technologies);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}
