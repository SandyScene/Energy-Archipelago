const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function queryString(filters) {
  const params = new URLSearchParams();
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchProjects(filters) {
  return fetch(`${API_BASE}/api/projects${queryString(filters)}`).then(handle);
}

export function fetchAggregates(level, filters) {
  return fetch(`${API_BASE}/api/aggregates/${level}${queryString(filters)}`).then(handle);
}

export function fetchFilterOptions() {
  return fetch(`${API_BASE}/api/filters`).then(handle);
}
