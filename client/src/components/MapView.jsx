import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchProjects, fetchAggregates } from '../api';
import { MAP_STYLE, MAPBOX_TOKEN, INITIAL_VIEW, ZOOM_BREAKS, CHOROPLETH_FILL_COLOR, CHOROPLETH_FILL_COLOR_FINE, CHOROPLETH_OPACITY } from '../mapConfig';
import { TECHNOLOGY_COLORS, TECHNOLOGY_ICON_EXPRESSION } from '../technologyConfig';
import { loadPinIcons } from '../pinIcons';
import FilterPanel from './FilterPanel';

const EMPTY_FILTERS = { country: '', region: '', technology: '', ventureType: '', projectStage: '' };

mapboxgl.accessToken = MAPBOX_TOKEN;

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

// Projects that share an organisation and exact coordinates (e.g. several
// technologies or project stages at one site) are the same physical pin —
// group them so only one marker shows, with the popup paging through each.
function groupProjectsByOrgAndLocation(projects) {
  const groups = new Map();
  const order = [];
  projects.forEach((p, i) => {
    const key = p.lead_organisation ? `${p.lead_organisation}|${p.latitude}|${p.longitude}` : `__ungrouped_${i}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(p);
  });
  return order.map((key) => groups.get(key));
}

function projectsToGeoJSON(projects) {
  const groups = groupProjectsByOrgAndLocation(projects);
  return {
    type: 'FeatureCollection',
    features: groups.map((group) => {
      const first = group[0];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [first.longitude, first.latitude] },
        properties: { technology: first.technology, projectsJson: JSON.stringify(group) },
      };
    }),
  };
}

function numberOrDash(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function polygonTooltipHTML(props) {
  const title = props.admin && props.admin !== props.name ? `${props.name}, ${props.admin}` : props.name;
  return `
    <div class="ea-tooltip">
      <strong>${escapeHtml(title)}</strong>
      <div>Projects: ${numberOrDash(props.projectCount, 0)}</div>
      <div>Electricity capacity: ${numberOrDash(props.totalElectricityCapacityMw)} MW</div>
      <div>Heat capacity: ${numberOrDash(props.totalHeatCapacityMw)} MW</div>
    </div>
  `;
}

function pinPopupHTML(projects, index) {
  const p = projects[index];
  const website = p.organisation_website ? safeHref(p.organisation_website) : null;
  const pager = projects.length > 1 ? `
    <div class="ea-pager">
      <button class="ea-pager-btn" data-dir="-1" ${index === 0 ? 'disabled' : ''} aria-label="Previous project">&#8249;</button>
      <span>Project ${index + 1} of ${projects.length}</span>
      <button class="ea-pager-btn" data-dir="1" ${index === projects.length - 1 ? 'disabled' : ''} aria-label="Next project">&#8250;</button>
    </div>
  ` : '';
  return `
    <div class="ea-tooltip ea-tooltip-pin">
      ${pager}
      <strong>${escapeHtml(p.project_name)}</strong>
      ${p.lead_organisation ? `<div>${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">${escapeHtml(p.lead_organisation)}</a>` : escapeHtml(p.lead_organisation)}</div>` : ''}
      <div class="ea-tooltip-grid">
        ${p.organisation_type ? `<span>Org type</span><span>${escapeHtml(p.organisation_type)}</span>` : ''}
        ${p.venture_type ? `<span>Venture type</span><span>${escapeHtml(p.venture_type)}</span>` : ''}
        ${p.technology ? `<span>Technology</span><span>${escapeHtml(p.technology)}</span>` : ''}
        ${p.technology_detail ? `<span>Detail</span><span>${escapeHtml(p.technology_detail)}</span>` : ''}
        ${p.capacity_mw != null ? `<span>Capacity</span><span>${numberOrDash(p.capacity_mw * 1000)} kW</span>` : ''}
        ${p.project_stage ? `<span>Stage</span><span>${escapeHtml(p.project_stage)}</span>` : ''}
        ${p.region ? `<span>Region</span><span>${escapeHtml(p.region)}</span>` : ''}
        ${p.country ? `<span>Country</span><span>${escapeHtml(p.country)}</span>` : ''}
      </div>
    </div>
  `;
}

// Wires the popup's prev/next buttons, re-wiring on every render since
// setHTML() replaces the popup's DOM (and any listeners attached to it).
function renderPinPopup(popup, projects, index) {
  popup.setHTML(pinPopupHTML(projects, index));
  popup.getElement()?.querySelectorAll('.ea-pager-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextIndex = index + Number(btn.dataset.dir);
      if (nextIndex >= 0 && nextIndex < projects.length) renderPinPopup(popup, projects, nextIndex);
    });
  });
}

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hoverPopupRef = useRef(null);

  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
  const [mapReady, setMapReady] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [legendOpen, setLegendOpen] = useState(true);
  const [showLoadingBar, setShowLoadingBar] = useState(false);
  const [viewMode, setViewMode] = useState('polygons');

  // Load data whenever the map first becomes ready or filters change. Retries on failure
  // since the free-tier API can be asleep and take 30-60s to wake on the first request.
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    let retryTimer = null;

    // Only show the loading bar if the request is still pending after a short
    // delay — avoids a flash for the common case where the API is already warm.
    const showBarTimer = setTimeout(() => {
      if (!cancelled) setShowLoadingBar(true);
    }, 300);

    async function loadAll(attempt = 0) {
      try {
        const [projects, nations, ukCountries, regions, councils] = await Promise.all([
          fetchProjects(filters),
          fetchAggregates('nation', filters),
          fetchAggregates('uk-country', filters),
          fetchAggregates('region', filters),
          fetchAggregates('council', filters),
        ]);
        if (cancelled) return;
        const map = mapRef.current;
        if (!map) return;
        map.getSource('projects')?.setData(projectsToGeoJSON(projects));
        map.getSource('nations')?.setData(nations);
        map.getSource('uk-countries')?.setData(ukCountries);
        map.getSource('regions')?.setData(regions);
        map.getSource('councils')?.setData(councils);
        setShowLoadingBar(false);
      } catch (err) {
        if (cancelled) return;
        // Exponential backoff (5s, 10s, 20s... capped at 60s) so a struggling API isn't
        // hammered with retries on top of whatever is already slowing it down.
        const delay = Math.min(5000 * 2 ** attempt, 60000);
        console.error(`Failed to load map data, retrying in ${delay / 1000}s:`, err);
        retryTimer = setTimeout(() => loadAll(attempt + 1), delay);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
      clearTimeout(showBarTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [mapReady, filters]);

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__eaMap = map;

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

    map.on('zoom', () => {
      setZoom(map.getZoom());
    });

    // 'style.load' fires once the style spec + our layers can be added, without
    // waiting on the (rAF-driven) tile paint that the full 'load' event waits for.
    map.on('style.load', async () => {
      await loadPinIcons(map, TECHNOLOGY_COLORS);

      map.addSource('nations', { type: 'geojson', data: EMPTY_FC });
      map.addSource('uk-countries', { type: 'geojson', data: EMPTY_FC });
      map.addSource('regions', { type: 'geojson', data: EMPTY_FC });
      // tolerance: 0 disables geometry simplification — councils.geojson has
      // ~350 small, densely-packed unitary authorities (much of England's
      // small councils cluster tightly, e.g. the Midlands), and Mapbox's
      // default simplification at this zoom band can visually blur adjacent
      // boundaries together, making a 0-project council look like it's part
      // of a neighbouring high-count one.
      map.addSource('councils', { type: 'geojson', data: EMPTY_FC, tolerance: 0 });
      map.addSource('projects', {
        type: 'geojson',
        data: EMPTY_FC,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Once uk-countries-fill takes over (zoom >= ukCountriesMin), stop drawing the
      // UK nation polygon entirely rather than relying on uk-countries-fill to visually
      // cover it. uk-countries.geojson's simplified coastline doesn't perfectly align
      // with nations.geojson's — small gaps between the two let the UK nation polygon
      // show through at those spots, displaying "United Kingdom" instead of the
      // correct constituent country. With nothing underneath, a coastline gap just
      // shows the base map instead of a wrongly-labelled polygon.
      map.addLayer({
        id: 'nations-fill', type: 'fill', source: 'nations',
        maxzoom: ZOOM_BREAKS.nationMax,
        filter: ['any', ['<', ['zoom'], ZOOM_BREAKS.ukCountriesMin], ['!=', ['get', 'name'], 'United Kingdom']],
        paint: { 'fill-color': CHOROPLETH_FILL_COLOR, 'fill-opacity': CHOROPLETH_OPACITY },
      });
      map.addLayer({
        id: 'nations-outline', type: 'line', source: 'nations',
        maxzoom: ZOOM_BREAKS.nationMax,
        filter: ['any', ['<', ['zoom'], ZOOM_BREAKS.ukCountriesMin], ['!=', ['get', 'name'], 'United Kingdom']],
        paint: { 'line-color': '#4a5568', 'line-width': 0.5 },
      });

      // UK-only: reveals England/Scotland/Wales/Northern Ireland in place of
      // the single UK nation polygon for the tail end of the nation zoom
      // range, rendered on top of nations-fill so it visually replaces it.
      map.addLayer({
        id: 'uk-countries-fill', type: 'fill', source: 'uk-countries',
        minzoom: ZOOM_BREAKS.ukCountriesMin, maxzoom: ZOOM_BREAKS.nationMax,
        paint: { 'fill-color': CHOROPLETH_FILL_COLOR, 'fill-opacity': CHOROPLETH_OPACITY },
      });
      map.addLayer({
        id: 'uk-countries-outline', type: 'line', source: 'uk-countries',
        minzoom: ZOOM_BREAKS.ukCountriesMin, maxzoom: ZOOM_BREAKS.nationMax,
        paint: { 'line-color': '#4a5568', 'line-width': 0.5 },
      });

      // Regions (global admin-1 data) and councils (UK-only local authority
      // areas) share the same zoom band rather than a sequential handoff —
      // regions.geojson has no UK coverage and councils.geojson has nothing
      // but UK, so exactly one of the two ever renders for a given point.
      map.addLayer({
        id: 'regions-fill', type: 'fill', source: 'regions',
        minzoom: ZOOM_BREAKS.nationMax, maxzoom: ZOOM_BREAKS.regionMax,
        paint: { 'fill-color': CHOROPLETH_FILL_COLOR, 'fill-opacity': CHOROPLETH_OPACITY },
      });
      map.addLayer({
        id: 'regions-outline', type: 'line', source: 'regions',
        minzoom: ZOOM_BREAKS.nationMax, maxzoom: ZOOM_BREAKS.regionMax,
        paint: { 'line-color': '#4a5568', 'line-width': 0.5 },
      });

      map.addLayer({
        id: 'councils-fill', type: 'fill', source: 'councils',
        minzoom: ZOOM_BREAKS.nationMax, maxzoom: ZOOM_BREAKS.regionMax,
        paint: { 'fill-color': CHOROPLETH_FILL_COLOR_FINE, 'fill-opacity': CHOROPLETH_OPACITY },
      });
      // Thin, light outline — councils.geojson has huge size variance (Highland
      // is ~26,000km2, Middlesbrough ~55km2), and a thicker/darker stroke than
      // the other polygon tiers would visually swamp the fill on the smallest
      // shapes, making a near-transparent 0-project council look solid dark.
      map.addLayer({
        id: 'councils-outline', type: 'line', source: 'councils',
        minzoom: ZOOM_BREAKS.nationMax, maxzoom: ZOOM_BREAKS.regionMax,
        paint: { 'line-color': '#94a3b8', 'line-width': 0.3 },
      });

      // Re-paint water on top of the choropleth, but only up to regionMax —
      // nation/council boundaries legitimately extend into tidal water in
      // places, so the fill can wrongly colour an estuary. A previous
      // attempt at this had no zoom cap and also re-drew every inland lake
      // at every zoom, which covered bridges and lake-name labels that are
      // meant to render on top of water. Capping it to the same zoom band
      // the choropleth actually uses means it disappears once zoomed in
      // past the polygon view, where those details start to matter — the
      // "Polygons" toggle's extended range (past regionMax) is the one case
      // that can still show a wrongly-coloured estuary, a smaller trade-off
      // than the default view being affected.
      const waterLayer = map.getLayer('water');
      if (waterLayer) {
        map.addLayer({
          id: 'water-mask',
          type: 'fill',
          source: waterLayer.source,
          'source-layer': waterLayer['source-layer'],
          maxzoom: ZOOM_BREAKS.regionMax,
          paint: { 'fill-color': map.getPaintProperty('water', 'fill-color') || '#a0c8f0' },
        });
      }

      map.addLayer({
        id: 'clusters', type: 'circle', source: 'projects',
        minzoom: ZOOM_BREAKS.regionMax,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#8fd0aa', 10, '#39a86b', 50, '#0f7a45'],
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'projects',
        minzoom: ZOOM_BREAKS.regionMax,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'unclustered-point', type: 'symbol', source: 'projects',
        minzoom: ZOOM_BREAKS.regionMax,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': TECHNOLOGY_ICON_EXPRESSION,
          'icon-size': 1.8,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      ['nations-fill', 'uk-countries-fill', 'regions-fill', 'councils-fill'].forEach((layerId) => {
        map.on('mousemove', layerId, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const feature = e.features?.[0];
          if (!feature) return;
          if (!hoverPopupRef.current) {
            hoverPopupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
          }
          hoverPopupRef.current
            .setLngLat(e.lngLat)
            .setHTML(polygonTooltipHTML(feature.properties))
            .addTo(map);
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
          hoverPopupRef.current?.remove();
        });
      });

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'clusters', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties.cluster_id;
        map.getSource('projects').getClusterExpansionZoom(clusterId, (err, expansionZoom) => {
          if (err) return;
          map.jumpTo({ center: feature.geometry.coordinates, zoom: expansionZoom });
        });
      });

      map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const projects = JSON.parse(feature.properties.projectsJson);
        const popup = new mapboxgl.Popup({ offset: 12 }).setLngLat(e.lngLat).addTo(map);
        renderPinPopup(popup, projects, 0);
      });

      setZoom(map.getZoom());
      setMapReady(true);
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "polygons" (default, toggle off) is the natural zoom-driven drill-down:
  // nation -> uk-country -> region/council, handing off to clustered pins at
  // ZOOM_BREAKS.regionMax. "pins" (toggle on) overrides this to force pins at
  // every zoom level instead, hiding the choropleth entirely.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const polygonLayers = ['nations-fill', 'nations-outline', 'uk-countries-fill', 'uk-countries-outline', 'regions-fill', 'regions-outline', 'councils-fill', 'councils-outline'];
    const pinLayers = ['clusters', 'cluster-count', 'unclustered-point'];
    const lastTierLayers = ['regions-fill', 'regions-outline', 'councils-fill', 'councils-outline'];

    if (viewMode === 'pins') {
      polygonLayers.forEach((id) => map.setLayoutProperty(id, 'visibility', 'none'));
      pinLayers.forEach((id) => map.setLayoutProperty(id, 'visibility', 'visible'));
      pinLayers.forEach((id) => map.setLayerZoomRange(id, 0, 24));
    } else {
      polygonLayers.forEach((id) => map.setLayoutProperty(id, 'visibility', 'visible'));
      pinLayers.forEach((id) => map.setLayoutProperty(id, 'visibility', 'visible'));
      pinLayers.forEach((id) => map.setLayerZoomRange(id, ZOOM_BREAKS.regionMax, 24));
      lastTierLayers.forEach((id) => map.setLayerZoomRange(id, ZOOM_BREAKS.nationMax, ZOOM_BREAKS.regionMax));
    }
  }, [viewMode, mapReady]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="map-shell">
        <div className="map-config-error">
          <strong>Map can't load: no Mapbox access token configured.</strong>
          <p>Set <code>VITE_MAPBOX_TOKEN</code> as an environment variable wherever this is deployed, then rebuild.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-container" />

      {showLoadingBar && (
        <div className="loading-bar" role="progressbar" aria-label="Loading map data">
          <div className="loading-bar-fill" />
        </div>
      )}

      <FilterPanel filters={filters} onChange={setFilters} />

      <div className="zoom-badge">{zoom.toFixed(1)}</div>

      <button
        className={`pin-toggle${viewMode === 'pins' ? ' active' : ''}`}
        onClick={() => setViewMode(viewMode === 'pins' ? 'polygons' : 'pins')}
        aria-pressed={viewMode === 'pins'}
        aria-label="Toggle map pins"
        title={viewMode === 'pins' ? 'Always showing pins — click for default view' : 'Default view — click to always show pins'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
      </button>

      <div className="build-note">
        <strong>Alpha Build v0.6</strong>
        <br />
        Data loading times may be up to 50 seconds
      </div>

      {legendOpen ? (
        <div className="map-legend">
          <div className="legend-header">
            <span>Legend</span>
            <button className="legend-close" onClick={() => setLegendOpen(false)} aria-label="Close legend">×</button>
          </div>
          {Object.entries(TECHNOLOGY_COLORS).map(([label, color]) => (
            <div className="legend-row" key={label}>
              <span className="legend-pin" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      ) : (
        <button className="legend-reopen" onClick={() => setLegendOpen(true)}>Show legend</button>
      )}
    </div>
  );
}
