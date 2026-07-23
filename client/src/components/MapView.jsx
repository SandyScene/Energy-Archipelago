import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchProjects, fetchAggregates } from '../api';
import { MAP_STYLE, MAPBOX_TOKEN, INITIAL_VIEW, ZOOM_BREAKS, zoomBand, CHOROPLETH_FILL_COLOR, CHOROPLETH_OPACITY } from '../mapConfig';
import { TECHNOLOGY_COLORS, TECHNOLOGY_ICON_EXPRESSION } from '../technologyConfig';
import { loadPinIcons } from '../pinIcons';
import FilterPanel from './FilterPanel';

const EMPTY_FILTERS = { country: '', region: '', technology: '', ventureType: '' };

mapboxgl.accessToken = MAPBOX_TOKEN;

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function projectsToGeoJSON(projects) {
  return {
    type: 'FeatureCollection',
    features: projects.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: p,
    })),
  };
}

function numberOrDash(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function polygonTooltipHTML(props) {
  const title = props.admin && props.admin !== props.name ? `${props.name}, ${props.admin}` : props.name;
  return `
    <div class="ea-tooltip">
      <strong>${title}</strong>
      <div>Projects: ${numberOrDash(props.projectCount, 0)}</div>
      <div>Installed capacity: ${numberOrDash(props.totalCapacityMw)} MW</div>
      <div>Est. generation: ${numberOrDash(props.totalGenerationMwh, 0)} MWh/yr</div>
    </div>
  `;
}

function pinPopupHTML(p) {
  return `
    <div class="ea-tooltip ea-tooltip-pin">
      <strong>${p.project_name}</strong>
      ${p.primary_organisation ? `<div>${p.primary_organisation}</div>` : ''}
      <div class="ea-tooltip-grid">
        ${p.technology ? `<span>Technology</span><span>${p.technology}</span>` : ''}
        ${p.venture_type ? `<span>Venture type</span><span>${p.venture_type}</span>` : ''}
        ${p.total_project_capacity_mw != null ? `<span>Capacity</span><span>${numberOrDash(p.total_project_capacity_mw)} MW</span>` : ''}
        ${p.generation_capacity_mwh != null ? `<span>Generation</span><span>${numberOrDash(p.generation_capacity_mwh, 0)} MWh/yr</span>` : ''}
        ${p.project_stage ? `<span>Stage</span><span>${p.project_stage}</span>` : ''}
        ${p.region_level_1 ? `<span>Region</span><span>${p.region_level_1}</span>` : ''}
        ${p.country ? `<span>Country</span><span>${p.country}</span>` : ''}
      </div>
    </div>
  `;
}

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hoverPopupRef = useRef(null);

  const [band, setBand] = useState('nation');
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
  const [mapReady, setMapReady] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [legendOpen, setLegendOpen] = useState(true);

  // Load data whenever the map first becomes ready or filters change.
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;

    async function loadAll() {
      const [projects, nations, regions] = await Promise.all([
        fetchProjects(filters),
        fetchAggregates('nation', filters),
        fetchAggregates('region', filters),
      ]);
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) return;
      map.getSource('projects')?.setData(projectsToGeoJSON(projects));
      map.getSource('nations')?.setData(nations);
      map.getSource('regions')?.setData(regions);
    }

    loadAll();
    return () => { cancelled = true; };
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
      setBand(zoomBand(map.getZoom()));
      setZoom(map.getZoom());
    });

    // 'style.load' fires once the style spec + our layers can be added, without
    // waiting on the (rAF-driven) tile paint that the full 'load' event waits for.
    map.on('style.load', async () => {
      await loadPinIcons(map, TECHNOLOGY_COLORS);

      map.addSource('nations', { type: 'geojson', data: EMPTY_FC });
      map.addSource('regions', { type: 'geojson', data: EMPTY_FC });
      map.addSource('projects', {
        type: 'geojson',
        data: EMPTY_FC,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: 'nations-fill', type: 'fill', source: 'nations',
        maxzoom: ZOOM_BREAKS.nationMax,
        paint: { 'fill-color': CHOROPLETH_FILL_COLOR, 'fill-opacity': CHOROPLETH_OPACITY },
      });
      map.addLayer({
        id: 'nations-outline', type: 'line', source: 'nations',
        maxzoom: ZOOM_BREAKS.nationMax,
        paint: { 'line-color': '#4a5568', 'line-width': 0.5 },
      });

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

      ['nations-fill', 'regions-fill'].forEach((layerId) => {
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
        new mapboxgl.Popup({ offset: 12 })
          .setLngLat(e.lngLat)
          .setHTML(pinPopupHTML(feature.properties))
          .addTo(map);
      });

      setBand(zoomBand(map.getZoom()));
      setZoom(map.getZoom());
      setMapReady(true);
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetMap() {
    mapRef.current?.jumpTo({ center: INITIAL_VIEW.center, zoom: INITIAL_VIEW.zoom });
  }

  const bandLabel = {
    nation: 'Nation polygons',
    region: 'Region polygons',
    pins: 'Individual project pins',
  }[band];

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

      <FilterPanel filters={filters} onChange={setFilters} />

      <div className="zoom-readout">
        <div className="zoom-readout-level">Zoom: {zoom.toFixed(1)}</div>
        <div className="zoom-readout-band">{bandLabel}</div>
        <button className="reset-map-btn" onClick={resetMap}>Reset map</button>
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
