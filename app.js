// ============================================================
// CONFIG
// ============================================================
const ZIPS = [
  '20814','20816','20817','20818',           // Bethesda MD
  '20850','20852','20854',                   // Rockville / Potomac MD
  '20878','20899',                           // Gaithersburg MD
  '20147',                                   // Ashburn VA
  '20164','20165',                           // Sterling VA
  '20170',                                   // Herndon VA
  '20190','20191','20194',                   // Reston VA
  '22027','22043','22066',                   // Fairfax / Falls Church / Great Falls VA
  '22101','22102',                           // McLean VA
  '22180','22181','22182',                   // Vienna VA
];

const ZIP_INFO = {
  '20814': { city: 'Bethesda',     state: 'MD' },
  '20816': { city: 'Bethesda',     state: 'MD' },
  '20817': { city: 'Bethesda',     state: 'MD' },
  '20818': { city: 'Bethesda',     state: 'MD' },
  '20850': { city: 'Rockville',    state: 'MD' },
  '20852': { city: 'Rockville',    state: 'MD' },
  '20854': { city: 'Potomac',      state: 'MD' },
  '20878': { city: 'Gaithersburg', state: 'MD' },
  '20899': { city: 'Gaithersburg', state: 'MD' },
  '20147': { city: 'Ashburn',      state: 'VA' },
  '20164': { city: 'Sterling',     state: 'VA' },
  '20165': { city: 'Sterling',     state: 'VA' },
  '20170': { city: 'Herndon',      state: 'VA' },
  '20190': { city: 'Reston',       state: 'VA' },
  '20191': { city: 'Reston',       state: 'VA' },
  '20194': { city: 'Reston',       state: 'VA' },
  '22027': { city: 'Fairfax',      state: 'VA' },
  '22043': { city: 'Falls Church', state: 'VA' },
  '22066': { city: 'Great Falls',  state: 'VA' },
  '22101': { city: 'McLean',       state: 'VA' },
  '22102': { city: 'McLean',       state: 'VA' },
  '22180': { city: 'Vienna',       state: 'VA' },
  '22181': { city: 'Vienna',       state: 'VA' },
  '22182': { city: 'Vienna',       state: 'VA' },
};

const METRICS = {
  income: {
    label:      'Median Household Income',
    shortLabel: 'Income',
    censusVar:  'B19013_001E',
    format:     v => (v != null && v > 0) ? '$' + v.toLocaleString() : 'N/A',
    colors:     ['#fef3e2', '#f6a623', '#c05c00'],
  },
  households: {
    label:      'Total Households',
    shortLabel: 'Households',
    censusVar:  'B11001_001E',
    format:     v => (v != null && v > 0) ? v.toLocaleString() : 'N/A',
    colors:     ['#f0f4ff', '#7b9ef0', '#1a3a8f'],
  },
};

const CENSUS_YEAR = '2023';
const CENSUS_NULL = -666666666;
const NA_COLOR    = '#cbd5e1';

// ============================================================
// STATE
// ============================================================
let map, lightTiles, darkTiles, geojsonLayer;
let demoData           = {};
let selectedZip        = null;
let activeMetric       = null;   // null = no overlay (default)
let colorScale         = null;
let isDark             = false;
let rankReversed       = false;
let isZoomedToSelection = false;

// ============================================================
// INIT
// ============================================================
async function init() {
  initMap();
  await loadAll();
}

function initMap() {
  map = L.map('map', {
    center: [38.96, -77.18],
    zoom: 11,
    zoomControl: false,
  });

  // Zoom controls + custom zoom button
  const ZoomControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function(map) {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const zoomIn = L.DomUtil.create('a', 'leaflet-control-zoom-in', container);
      const zoomOut = L.DomUtil.create('a', 'leaflet-control-zoom-out', container);
      const zoomCustom = L.DomUtil.create('a', 'leaflet-control-zoom-custom', container);

      zoomIn.href = '#';
      zoomIn.title = 'Zoom in';
      zoomIn.textContent = '+';
      zoomOut.href = '#';
      zoomOut.title = 'Zoom out';
      zoomOut.textContent = '−';
      zoomCustom.href = '#';
      zoomCustom.id = 'map-zoom-custom-btn';
      zoomCustom.textContent = 'Zoom to Selection';
      zoomCustom.style.display = 'none';

      L.DomEvent.on(zoomIn, 'click', e => {
        L.DomEvent.preventDefault(e);
        map.zoomIn();
      });
      L.DomEvent.on(zoomOut, 'click', e => {
        L.DomEvent.preventDefault(e);
        map.zoomOut();
      });
      L.DomEvent.on(zoomCustom, 'click', e => {
        L.DomEvent.preventDefault(e);
        zoomToSelection();
      });

      return container;
    }
  });

  new ZoomControl().addTo(map);

  lightTiles = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 }
  ).addTo(map);

  darkTiles = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 }
  );
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadAll() {
  setLoading(true, 'Loading territory data\u2026');
  try {
    const [geo, demo] = await Promise.all([fetchBoundaries(), fetchDemographics()]);
    demoData = demo;
    renderPolygons(geo);
    buildColorScale();
    refreshPolygonStyles();
    updateLegend();
    renderRankingList();
    updateZoomLabel();
    stampUpdated();
  } catch (err) {
    console.error(err);
    setLoading(true, 'Failed to load data — check connection and refresh.');
    return;
  }
  setLoading(false);
}

async function fetchBoundaries() {
  const res = await fetch('./boundaries.json');
  if (!res.ok) throw new Error(`Failed to load boundaries: ${res.status}`);
  return res.json();
}

async function fetchDemographics() {
  const vars    = Object.values(METRICS).map(m => m.censusVar).join(',');
  const zipList = ZIPS.join(',');
  const url = `https://api.census.gov/data/${CENSUS_YEAR}/acs/acs5?get=NAME,${vars}&for=zip%20code%20tabulation%20area:${zipList}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Census API error ${res.status}`);
  const raw = await res.json();

  const headers = raw[0];
  const zipIdx  = headers.indexOf('zip code tabulation area');

  const result = {};
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const zip = row[zipIdx];
    result[zip] = {};
    Object.entries(METRICS).forEach(([key, m]) => {
      const idx = headers.indexOf(m.censusVar);
      const v   = parseInt(row[idx], 10);
      result[zip][key] = (isNaN(v) || v === CENSUS_NULL) ? null : v;
    });
  }
  return result;
}

// ============================================================
// RENDER POLYGONS
// ============================================================
function getZip(feature) {
  const p = feature.properties;
  return p.ZCTA5 || p.zcta5 || p.ZIP || '';
}

function renderPolygons(geo) {
  if (geojsonLayer) map.removeLayer(geojsonLayer);

  geojsonLayer = L.geoJSON(geo, {
    style:         feature => styleFor(getZip(feature)),
    onEachFeature: (feature, layer) => {
      const zip = getZip(feature);
      layer.on({
        mouseover: e => onEnter(e, zip),
        mousemove: e => moveTooltip(e),
        mouseout:  e => onLeave(e, zip),
        click:     ()  => onClickZip(zip),
      });
    },
  }).addTo(map);

  map.invalidateSize();
  const initBounds = geojsonLayer.getBounds();
  map.setView(initBounds.getCenter(), map.getBoundsZoom(initBounds, false));
}

function styleFor(zip) {
  const selected = zip === selectedZip;

  // Zoomed into selection: always just a border, no fill
  if (selected && isZoomedToSelection) {
    return { fillOpacity: 0, color: '#1d4ed8', weight: 3, opacity: 1 };
  }

  // No metric selected: blue borders only, no fill
  if (!activeMetric) {
    return {
      fillOpacity: 0,
      color:  selected ? '#1d4ed8' : '#3b82f6',
      weight: selected ? 2.5 : 1.5,
      opacity: 1,
    };
  }

  // Metric active: choropleth fill
  return {
    fillColor:   getColor(zip),
    fillOpacity: selected ? 0.60 : 0.40,
    color:       selected ? '#1d4ed8' : '#ffffff',
    weight:      selected ? 2.5 : 1,
    opacity:     1,
  };
}

// ============================================================
// COLOR SCALE
// ============================================================
function buildColorScale() {
  if (!activeMetric) { colorScale = null; return null; }
  const values = ZIPS
    .map(z => demoData[z]?.[activeMetric])
    .filter(v => v != null && v > 0);
  if (!values.length) { colorScale = null; return null; }

  const min = Math.min(...values);
  const max = Math.max(...values);
  colorScale = chroma.scale(METRICS[activeMetric].colors).domain([min, max]).mode('lch');
  return { min, max };
}

function getColor(zip) {
  if (!colorScale) return NA_COLOR;
  const data = demoData[zip];
  if (!data) return NA_COLOR;
  const v = data[activeMetric];
  return (v != null && v > 0) ? colorScale(v).hex() : NA_COLOR;
}

function refreshPolygonStyles() {
  if (!geojsonLayer) return;
  geojsonLayer.eachLayer(layer => {
    const zip = getZip(layer.feature);
    layer.setStyle(styleFor(zip));
    if (zip === selectedZip) layer.bringToFront();
  });
}

// ============================================================
// INTERACTIONS
// ============================================================
function onClickZip(zip) {
  selectedZip = zip;
  refreshPolygonStyles();
  updateSidebar(zip);
  renderRankingList();
  updateZoomLabel();
}

function clearSelection() {
  selectedZip = null;
  isZoomedToSelection = false;
  refreshPolygonStyles();
  document.getElementById('sidebar-empty').style.display   = '';
  document.getElementById('sidebar-content').style.display = 'none';
  renderRankingList();
  updateZoomLabel();
}

function onEnter(e, zip) {
  if (zip !== selectedZip) {
    e.target.setStyle({
      fillOpacity: activeMetric ? 0.50 : 0,
      weight: 2,
      color: activeMetric ? '#94a3b8' : '#2563eb',
    });
    e.target.bringToFront();
  }
  showTooltip(e, zip);
}

function onLeave(e, zip) {
  if (zip !== selectedZip) {
    e.target.setStyle(styleFor(zip));
  }
  hideTooltip();
}

// ============================================================
// TOOLTIP
// ============================================================
const tooltip = document.getElementById('tooltip');

function showTooltip(e, zip) {
  const info   = ZIP_INFO[zip] || {};
  const data   = demoData[zip] || {};
  const metric = activeMetric ? METRICS[activeMetric] : null;
  const value  = metric ? data[activeMetric] : null;

  tooltip.innerHTML = `
    <div class="tt-zip">${zip}</div>
    <div class="tt-city">${info.city || ''}, ${info.state || ''}</div>
    ${metric ? `<div class="tt-value">${metric.format(value)}</div><div class="tt-label">${metric.shortLabel}</div>` : '<div class="tt-label">Click to select</div>'}
  `;
  moveTooltip(e);
  tooltip.classList.add('visible');
}

function moveTooltip(e) {
  const p   = e.containerPoint;
  const map = document.getElementById('map');
  const tx  = p.x + 18;
  const ty  = p.y + 18;
  tooltip.style.left = Math.min(tx, map.offsetWidth  - tooltip.offsetWidth  - 12) + 'px';
  tooltip.style.top  = Math.min(ty, map.offsetHeight - tooltip.offsetHeight - 12) + 'px';
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

// ============================================================
// SIDEBAR
// ============================================================
function updateSidebar(zip) {
  document.getElementById('sidebar-empty').style.display   = 'none';
  document.getElementById('sidebar-content').style.display = '';

  const info = ZIP_INFO[zip] || {};
  document.getElementById('zip-code-label').textContent     = zip;
  document.getElementById('zip-location-label').textContent = `${info.city || 'Unknown'}, ${info.state || ''}`;

  const data = demoData[zip] || {};

  // Compute ranks for each metric (descending: rank 1 = highest value)
  const ranks = {};
  Object.keys(METRICS).forEach(key => {
    const sorted = ZIPS
      .map(z => ({ zip: z, val: demoData[z]?.[key] ?? null }))
      .filter(x => x.val != null && x.val > 0)
      .sort((a, b) => b.val - a.val);
    const idx = sorted.findIndex(x => x.zip === zip);
    ranks[key] = {
      rank:  idx >= 0 ? idx + 1 : null,
      total: sorted.length,
      fill:  idx >= 0 ? (1 - idx / Math.max(sorted.length - 1, 1)) * 100 : 0,
    };
  });

  const grid = document.getElementById('metrics-grid');
  grid.innerHTML = '';

  Object.entries(METRICS).forEach(([key, metric]) => {
    const value = data[key];
    const rank  = ranks[key];
    const active = key === activeMetric;

    const card = document.createElement('div');
    card.className = 'metric-card' + (active ? ' active' : '');
    card.onclick   = () => setMetric(key);
    card.title     = `Click to color map by ${metric.shortLabel}`;

    card.innerHTML = `
      <div class="metric-card-header">
        <span class="metric-card-label">${metric.shortLabel}</span>
        ${rank.rank ? `<span class="metric-card-badge">Rank ${rank.rank} of ${rank.total}</span>` : '<span class="metric-card-badge">N/A</span>'}
      </div>
      <div class="metric-card-value">${metric.format(value)}</div>
      <div class="rank-bar-track">
        <div class="rank-bar-fill" style="width:${rank.fill.toFixed(1)}%"></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ============================================================
// METRIC SWITCHING
// ============================================================
function setMetric(metric) {
  if (!METRICS[metric]) return;
  // Toggle off if already active, otherwise switch to it
  activeMetric = (activeMetric === metric) ? null : metric;

  document.querySelectorAll('.metric-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.metric === activeMetric)
  );

  buildColorScale();
  refreshPolygonStyles();
  updateLegend();
  renderRankingList();
  if (selectedZip) updateSidebar(selectedZip);
}

// ============================================================
// LEGEND
// ============================================================
function updateLegend(range) {
  const legend = document.getElementById('legend');
  if (!activeMetric) { legend.innerHTML = ''; legend.style.display = 'none'; return; }
  legend.style.display = '';

  const metric = METRICS[activeMetric];

  if (!range) {
    const values = ZIPS.map(z => demoData[z]?.[activeMetric]).filter(v => v != null && v > 0);
    if (!values.length) { legend.innerHTML = ''; return; }
    range = { min: Math.min(...values), max: Math.max(...values) };
  }

  const stops = Array.from({ length: 7 }, (_, i) =>
    chroma.scale(metric.colors).mode('lch')(i / 6).hex()
  ).join(', ');

  legend.innerHTML = `
    <div class="legend-title">${metric.shortLabel}</div>
    <div class="legend-gradient" style="background:linear-gradient(to right,${stops})"></div>
    <div class="legend-labels">
      <span class="legend-label">${metric.format(range.min)}</span>
      <span class="legend-label">${metric.format(range.max)}</span>
    </div>
  `;
}

// ============================================================
// RANKING LIST
// ============================================================
function renderRankingList() {
  const section = document.getElementById('ranking-section');
  const list    = document.getElementById('ranking-list');
  const sortKey = activeMetric || 'income';   // default sort by income
  const metric  = METRICS[sortKey];

  const items = ZIPS.map(z => ({
    zip:   z,
    info:  ZIP_INFO[z] || {},
    value: demoData[z]?.[sortKey] ?? null,
  })).sort((a, b) => {
    if (a.value == null && b.value == null) return 0;
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return rankReversed ? a.value - b.value : b.value - a.value;
  });

  // Assign ranks only to entries with data
  let rankCounter = 0;
  list.innerHTML = items.map(item => {
    const hasData  = item.value != null;
    if (hasData) rankCounter++;
    const rankStr  = hasData ? `#${rankCounter}` : '—';
    const selected = item.zip === selectedZip;

    return `<div class="ranking-item${selected ? ' selected' : ''}" onclick="onClickZip('${item.zip}')">
      <span class="ranking-rank">${rankStr}</span>
      <div class="ranking-info">
        <span class="ranking-zip">${item.zip}</span>
        <span class="ranking-city">${item.info.city || ''}, ${item.info.state || ''}</span>
      </div>
      <span class="ranking-value">${metric.format(item.value)}</span>
    </div>`;
  }).join('');

  section.style.display = '';

  // Scroll selected item into view
  if (selectedZip) {
    const el = list.querySelector('.ranking-item.selected');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function toggleRanking() {
  rankReversed = !rankReversed;
  const btn = document.getElementById('ranking-dir-btn');
  btn.textContent = rankReversed ? '↑ Low → High' : '↓ High → Low';
  renderRankingList();
}

// ============================================================
// REFRESH
// ============================================================
async function refreshData() {
  const btn  = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  btn.disabled = true;
  icon.classList.add('spinning');

  try {
    demoData = await fetchDemographics();
    buildColorScale();
    refreshPolygonStyles();
    updateLegend();
    renderRankingList();
    if (selectedZip) updateSidebar(selectedZip);
    stampUpdated();
  } catch (err) {
    console.error(err);
    alert('Failed to refresh — check your connection and try again.');
  } finally {
    btn.disabled = false;
    icon.classList.remove('spinning');
  }
}

// ============================================================
// ZOOM CONTROL
// ============================================================
function zoomToSelection() {
  if (!geojsonLayer) return;

  map.invalidateSize();

  if (selectedZip && !isZoomedToSelection) {
    // Zoom to selected ZIP — fit exactly to bounds, no overshoot
    let layer = null;
    geojsonLayer.eachLayer(l => {
      if (getZip(l.feature) === selectedZip) layer = l;
    });
    if (layer) {
      const bounds = layer.getBounds();
      map.setView(bounds.getCenter(), map.getBoundsZoom(bounds, false));
      isZoomedToSelection = true;
      refreshPolygonStyles(); // clear fill now that we're zoomed in
    }
  } else {
    // Zoom to all ZIPs — tightest fit that keeps all in frame
    const bounds = geojsonLayer.getBounds();
    map.setView(bounds.getCenter(), map.getBoundsZoom(bounds, false));
    isZoomedToSelection = false;
  }

  updateZoomLabel();
}

function updateZoomLabel() {
  const btn = document.getElementById('map-zoom-custom-btn');
  if (!btn) return;

  if (!selectedZip) {
    // No selection: hide button
    btn.style.display = 'none';
    isZoomedToSelection = false;
  } else {
    // Selection made: show button
    btn.style.display = '';
    // Button text depends on whether we're already zoomed to selection
    btn.textContent = isZoomedToSelection ? 'Zoom All' : 'Zoom to Selection';
  }
}

// Update label when selection changes
function updateZoomLabelOnSelect() {
  updateZoomLabel();
}

// ============================================================
// THEME TOGGLE
// ============================================================
function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

  if (isDark) {
    map.removeLayer(lightTiles);
    darkTiles.addTo(map);
  } else {
    map.removeLayer(darkTiles);
    lightTiles.addTo(map);
  }

  document.getElementById('icon-sun').style.display  = isDark ? 'none' : '';
  document.getElementById('icon-moon').style.display = isDark ? ''     : 'none';
}

// ============================================================
// HELPERS
// ============================================================
function setLoading(visible, text) {
  const overlay = document.getElementById('loading-overlay');
  if (text) document.getElementById('loading-text').textContent = text;
  if (visible) {
    overlay.style.display = '';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
  }
}

function stampUpdated() {
  const el = document.getElementById('last-updated');
  el.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// SEARCH  (Nominatim / OpenStreetMap geocoding)
// ============================================================
let searchMarker = null;

function toggleSearch() {
  const wrapper = document.getElementById('search-wrapper');
  const input   = document.getElementById('search-input');
  const btn     = document.getElementById('search-btn');
  const isOpen  = wrapper.classList.contains('open');

  if (isOpen) {
    closeSearch();
  } else {
    wrapper.classList.add('open');
    btn.classList.add('active');
    setTimeout(() => input.focus(), 200);
  }
}

function closeSearch() {
  const wrapper = document.getElementById('search-wrapper');
  const input   = document.getElementById('search-input');
  const btn     = document.getElementById('search-btn');
  wrapper.classList.remove('open');
  btn.classList.remove('active');
  input.value = '';
  clearSearchMarker();
}

function handleSearchKey(e) {
  if (e.key === 'Enter')  performSearch();
  if (e.key === 'Escape') closeSearch();
}

async function performSearch() {
  const input = document.getElementById('search-input');
  const q     = input.value.trim();
  if (!q) return;

  input.disabled = true;
  clearSearchMarker();

  try {
    // Bias toward DC Metro area; countrycodes=us keeps it domestic
    const viewbox = '-77.65,39.25,-76.85,38.80';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us&viewbox=${viewbox}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const results = await res.json();

    if (!results.length) {
      flashSearchError(input);
      return;
    }

    const { lat, lon } = results[0];
    const latlng = [parseFloat(lat), parseFloat(lon)];

    // Drop a red dot on the result
    searchMarker = L.circleMarker(latlng, {
      radius:      9,
      fillColor:   '#ef4444',
      color:       '#ffffff',
      weight:      2.5,
      fillOpacity: 0.90,
    }).addTo(map);

    map.setView(latlng, 14);

  } catch (err) {
    console.error('Search error:', err);
    flashSearchError(input);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function flashSearchError(input) {
  input.classList.add('search-error');
  setTimeout(() => input.classList.remove('search-error'), 1500);
}

function clearSearchMarker() {
  if (searchMarker) {
    map.removeLayer(searchMarker);
    searchMarker = null;
  }
}

// ============================================================
// START
// ============================================================
init();
