/**
 * Weather & Radar (WetterOnline) Unified Truth Meteorological Engine
 * v4: Zoom-Earth-style soft radar blob rendering — real RainViewer data,
 * pane-level blur (not per-tile) for seamless halo edges, 512px tiles for detail,
 * satellite IR dropped from default composite (reference has none).
 */

(function () {
  'use strict';

  const PAKISTAN_CENTER = [32.5, 73.8];
  const DEFAULT_ZOOM = 6.4;
  const RAINVIEWER_META_URL = 'https://api.rainviewer.com/public/weather-maps.json';  // Comprehensive Cities, Divisions & Key Districts Across Pakistan Only
  const INITIAL_STATIONS = [
    { name: 'Islamabad', lat: 33.6844, lon: 73.0479 },
    { name: 'Rawalpindi', lat: 33.5973, lon: 73.0479 },
    { name: 'Lahore', lat: 31.5204, lon: 74.3587 },
    { name: 'Karachi', lat: 24.8607, lon: 67.0011 },
    { name: 'Peshawar', lat: 34.0151, lon: 71.5249 },
    { name: 'Quetta', lat: 30.1798, lon: 66.9750 },
    { name: 'Multan', lat: 30.1575, lon: 71.5249 },
    { name: 'Faisalabad', lat: 31.4504, lon: 73.1350 },
    { name: 'Gujranwala', lat: 32.1877, lon: 74.1945 },
    { name: 'Sialkot', lat: 32.4945, lon: 74.5229 },
    { name: 'Hyderabad', lat: 25.3960, lon: 68.3578 },
    { name: 'Sukkur', lat: 27.7052, lon: 68.8574 },
    { name: 'Gilgit', lat: 35.9221, lon: 74.3087 },
    { name: 'Skardu', lat: 35.2971, lon: 75.6333 },
    { name: 'Hunza', lat: 36.3167, lon: 74.6500 },
    { name: 'Muzaffarabad', lat: 34.3700, lon: 73.4711 },
    { name: 'Mirpur (AJK)', lat: 33.1484, lon: 73.7519 },
    { name: 'Abbottabad', lat: 34.1688, lon: 73.2215 },
    { name: 'Mardan', lat: 34.1989, lon: 72.0404 },
    { name: 'Mingora (Swat)', lat: 34.7717, lon: 72.3600 },
    { name: 'Gwadar', lat: 25.1216, lon: 62.3254 },
    { name: 'D.I. Khan', lat: 31.8327, lon: 70.9024 },
    { name: 'Bahawalpur', lat: 29.3544, lon: 71.6911 },
    { name: 'Sargodha', lat: 32.0836, lon: 72.6711 },
    { name: 'Jhelum', lat: 32.9405, lon: 73.7276 },
    { name: 'Chitral', lat: 35.8510, lon: 71.7864 },
    { name: 'Khuzdar', lat: 27.8119, lon: 66.6053 },
    { name: 'Turbat', lat: 26.0031, lon: 63.0544 },
    { name: 'Rahim Yar Khan', lat: 28.4212, lon: 70.2989 }
  ];

  // Official Pakistan Meteorological Department (PMD) Doppler Radar Stations
  const PMD_RADAR_STATIONS = [
    { id: 'isb-hq', name: 'Islamabad PMD HQ Doppler Radar', city: 'Islamabad', lat: 33.6844, lon: 73.0479, radiusKm: 450, frequency: 'C-Band Doppler (5.6 GHz)', elevation: '580m', status: 'OPERATIONAL' },
    { id: 'lhr-pmd', name: 'Lahore Doppler Weather Radar', city: 'Lahore', lat: 31.5204, lon: 74.3587, radiusKm: 450, frequency: 'C-Band Dual-Pol', elevation: '217m', status: 'OPERATIONAL' },
    { id: 'khi-pmd', name: 'Karachi Marine Doppler Radar', city: 'Karachi', lat: 24.8607, lon: 67.0011, radiusKm: 450, frequency: 'S-Band Storm Tracker', elevation: '25m', status: 'OPERATIONAL' },
    { id: 'mgl-pmd', name: 'Mangla Dam Catchment Radar', city: 'Mangla (AJK)', lat: 33.1484, lon: 73.6500, radiusKm: 250, frequency: 'X-Band Hydrological', elevation: '350m', status: 'OPERATIONAL' },
    { id: 'ryk-pmd', name: 'Rahim Yar Khan PMD Radar', city: 'Rahim Yar Khan', lat: 28.4212, lon: 70.2989, radiusKm: 450, frequency: 'C-Band Doppler', elevation: '88m', status: 'OPERATIONAL' },
    { id: 'mul-pmd', name: 'Multan PMD Doppler Radar', city: 'Multan', lat: 30.1575, lon: 71.5249, radiusKm: 450, frequency: 'C-Band Dual-Pol', elevation: '122m', status: 'OPERATIONAL' },
    { id: 'psn-pmd', name: 'Pasni / Makran Coastal Radar', city: 'Pasni', lat: 25.2631, lon: 63.4831, radiusKm: 450, frequency: 'S-Band Marine Doppler', elevation: '15m', status: 'OPERATIONAL' }
  ];

  // 1. AccuWeather / MSN Style Day Topographic Relief Basemap
  const DAY_BASE_MAP = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri, DeLorme, NAVTEQ',
    maxZoom: 18
  });

  // 2. Windy / Dark Mode Night Satellite Imagery
  const NIGHT_BASE_MAP = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  });

  const state = {
    map: null,
    activeLayer: 'composite',
    radarTileLayer: null,
    cloudTileLayer: null,
    stationMarkersLayer: null,
    hazardLayerGroup: null,
    pmdLayerGroup: null,
    draggableRedPin: null,

    rainviewerMeta: null,
    radarFrames: [],
    satelliteFrames: [],
    pastCount: 0,
    currentFrameIndex: 0,
    isPlaying: false,
    playTimer: null,
    playbackSpeed: 1, // 1x, 2x, 3x

    themeMode: 'day', // 'day' or 'night'
    currentBaseMap: DAY_BASE_MAP,
    pmdConesVisible: true,

    stations: INITIAL_STATIONS,

    // --- ESS Weather & Flood Intelligence (Phase 1) ---
    activeMode: 'weather',          // weather | rainfall | flood | impact | advisory
    essConfig: null,                // published thresholds/risk scale from the API
    national: null,                 // latest national situation sweep
    nationalTimeline: null,         // real past/forecast risk at -48h..+48h (spec §21)
    selectedOffsetHours: 0,         // which timeline point the risk surface currently shows
    lastReport: null,               // latest single-location decision object
    riskSurfaceLayer: null,         // national district risk overlay
    reportInFlight: null
  };

  const dom = {
    locateMeBtn: document.getElementById('locate-me-btn'),
    searchToggleBtn: document.getElementById('search-toggle-btn'),
    searchContainer: document.getElementById('search-container'),
    searchInput: document.getElementById('search-input'),
    searchResultsList: document.getElementById('search-results-list'),
    closeSearchBtn: document.getElementById('close-search-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeIcon: document.getElementById('theme-icon'),
    themeLabel: document.getElementById('theme-label'),
    pmdRadarToggleBtn: document.getElementById('pmd-radar-toggle-btn'),
    copyShareBtn: document.getElementById('copy-share-btn'),
    infoBtn: document.getElementById('info-btn'),
    infoDrawer: document.getElementById('info-drawer'),
    infoDrawerContent: document.getElementById('info-drawer-content'),
    closeInfoDrawerBtn: document.getElementById('close-info-drawer-btn'),
    layerBtns: document.querySelectorAll('.wr-layer-action-btn'),
    interval15Btn: document.getElementById('interval-15'),
    interval30Btn: document.getElementById('interval-30'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    speedToggleBtn: document.getElementById('speed-toggle-btn'),
    timelineSlider: document.getElementById('timeline-slider'),
    timelineProgressFill: document.getElementById('timeline-progress-fill'),
    timelineNowMarker: document.getElementById('timeline-now-marker'),
    currentFrameTimePkt: document.getElementById('current-frame-time-pkt'),
    datePills: document.querySelectorAll('.wr-date-pill'),
    snapshotBtn: document.getElementById('snapshot-btn'),
    snapshotModal: document.getElementById('snapshot-modal'),
    closeSnapshotModalBtn: document.getElementById('close-snapshot-modal-btn'),
    snapshotPreviewImg: document.getElementById('snapshot-preview-img'),
    downloadPngBtn: document.getElementById('download-png-btn'),
    downloadGifBtn: document.getElementById('download-gif-btn'),
    copyShareBtnModal: document.getElementById('copy-share-btn-modal')
  };

  // ==========================================================================
  // ESS INTELLIGENCE API CLIENT
  //
  // All flood/rainfall/risk analytics come from the ESS backend (/api/v1), which
  // computes them from live Open-Meteo observations and Copernicus DEM terrain.
  // Nothing in this file invents a meteorological or hydrological value.
  // ==========================================================================
  const ESS_API = {
    base: '/api/v1',

    async request(path, { timeoutMs = 20000 } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${this.base}${path}`, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message = body?.error?.message || `Request failed (${res.status})`;
          const err = new Error(message);
          err.type = body?.error?.type || 'HTTP_ERROR';
          throw err;
        }
        return body;
      } finally {
        clearTimeout(timer);
      }
    },

    config() { return this.request('/config'); },
    national() { return this.request('/national', { timeoutMs: 45000 }); },
    nationalTimeline() { return this.request('/national/timeline', { timeoutMs: 45000 }); },
    location(lat, lon, label) {
      const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
      if (label) q.set('label', label);
      return this.request(`/location?${q.toString()}`, { timeoutMs: 30000 });
    },
    // Real GloFAS river-alert + WorldPop/OSM exposure data. Separate call
    // because these upstream sources are slow (WorldPop/Overpass) — fetched
    // after the core report is already on screen, never blocking it.
    locationEnrichment(lat, lon, current24hMm) {
      const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
      if (current24hMm != null) q.set('current_24h_mm', current24hMm);
      return this.request(`/location/enrichment?${q.toString()}`, { timeoutMs: 25000 });
    },
    riverAlert(lat, lon) {
      const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
      return this.request(`/river-alert?${q.toString()}`, { timeoutMs: 20000 });
    }
  };

  /** Risk level -> presentation. Colours mirror the server-side risk scale. */
  const RISK_STYLE = {
    NORMAL:   { color: '#22c55e', label: 'Normal',   emoji: '🟢' },
    WATCH:    { color: '#eab308', label: 'Watch',    emoji: '🟡' },
    MODERATE: { color: '#f59e0b', label: 'Moderate', emoji: '🟠' },
    HIGH:     { color: '#f97316', label: 'High',     emoji: '🟠' },
    SEVERE:   { color: '#ef4444', label: 'Severe',   emoji: '🔴' },
    UNKNOWN:  { color: '#64748b', label: 'Unknown',  emoji: '⚪' }
  };
  const riskStyle = level => RISK_STYLE[level] || RISK_STYLE.UNKNOWN;

  /**
   * Provenance chip (spec §23). Every figure on screen is tagged with how it was
   * produced so observed, forecast and modelled values are never confused.
   */
  const DATA_TYPE_STYLE = {
    OBSERVED: { bg: 'rgba(34,197,94,0.16)', fg: '#4ade80', text: 'OBSERVED' },
    FORECAST: { bg: 'rgba(56,189,248,0.16)', fg: '#38bdf8', text: 'FORECAST' },
    MODELLED: { bg: 'rgba(168,85,247,0.16)', fg: '#c084fc', text: 'MODELLED' },
    VERIFIED: { bg: 'rgba(250,204,21,0.16)', fg: '#facc15', text: 'VERIFIED' },
    SATELLITE_OBSERVED: { bg: 'rgba(244,114,182,0.16)', fg: '#f472b6', text: 'SATELLITE' },
    PENDING: { bg: 'rgba(100,116,139,0.18)', fg: '#94a3b8', text: 'NOT CONNECTED' }
  };

  function dataTypeChip(type) {
    const s = DATA_TYPE_STYLE[type] || DATA_TYPE_STYLE.PENDING;
    return `<span style="background:${s.bg};color:${s.fg};font-size:8.5px;font-weight:800;padding:1.5px 5px;border-radius:4px;letter-spacing:0.4px;white-space:nowrap;">${s.text}</span>`;
  }

  function confidenceChip(confidence) {
    const map = {
      HIGH: { fg: '#4ade80', bg: 'rgba(34,197,94,0.14)' },
      MODERATE: { fg: '#fbbf24', bg: 'rgba(251,191,36,0.14)' },
      LOW: { fg: '#fb7185', bg: 'rgba(251,113,133,0.14)' }
    };
    const s = map[confidence] || map.LOW;
    return `<span style="background:${s.bg};color:${s.fg};font-size:8.5px;font-weight:800;padding:1.5px 5px;border-radius:4px;">CONFIDENCE: ${confidence || 'LOW'}</span>`;
  }

  /**
   * Road status tiers (spec §17) — a pure re-labelling of the 0..4 risk scale
   * into OPEN/CAUTION/FLOOD AFFECTED/BLOCKED, mirroring the server's
   * predictedRoadStatus() in riskEngine.js. Always PREDICTED, never VERIFIED —
   * no NHA/NDMA closure feed exists to confirm actual road state.
   */
  const ROAD_STATUS_TIERS = [
    { min: 0, key: 'OPEN', emoji: '🟢', label: 'Open', color: '#22c55e' },
    { min: 1, key: 'CAUTION', emoji: '🟡', label: 'Caution', color: '#eab308' },
    { min: 3, key: 'FLOOD_AFFECTED', emoji: '🔵', label: 'Flood Affected', color: '#38bdf8' },
    { min: 4, key: 'BLOCKED', emoji: '🔴', label: 'Blocked', color: '#ef4444' }
  ];

  function predictedRoadStatus(hazardCodes) {
    const usable = hazardCodes.filter(c => Number.isFinite(c));
    if (!usable.length) return { key: 'UNKNOWN', emoji: '⚪', label: 'Unknown', color: '#64748b' };
    const worst = Math.max(...usable);
    let match = ROAD_STATUS_TIERS[0];
    for (const tier of ROAD_STATUS_TIERS) if (worst >= tier.min) match = tier;
    return match;
  }

  const escapeHtml = str => String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtMm = v => (v == null ? '—' : `${Number(v).toFixed(1)} mm`);

  function fmtPkt(iso) {
    if (!iso) return '—';
    const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi'
    }) + ' PKT';
  }

  async function init() {
    initMap();
    setupEventListeners();
    await loadRainviewerFrames();
    fetchStationObservations();

    // Publish thresholds first so legends and classes match the engine exactly.
    ESS_API.config()
      .then(cfg => { state.essConfig = cfg; })
      .catch(err => console.warn('[ess] config unavailable:', err.message));

    inspectPointWeather(33.6844, 73.0479, 'Islamabad (ICT)');
    refreshNationalSituation();

    setInterval(loadRainviewerFrames, 5 * 60 * 1000);
    setInterval(fetchStationObservations, 2.5 * 60 * 1000);
    setInterval(refreshNationalSituation, 10 * 60 * 1000);
  }

  function initMap() {
    state.map = L.map('map', {
      center: PAKISTAN_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: true,
      zoomAnimation: true,
      minZoom: 4,
      maxZoom: 16
    });

    state.map.createPane('cloudPane');
    state.map.getPane('cloudPane').style.zIndex = '300';

    state.map.createPane('radarPane');
    state.map.getPane('radarPane').style.zIndex = '350';

    state.map.createPane('hazardPane');
    state.map.getPane('hazardPane').style.zIndex = '400';

    state.map.createPane('cityLabelsPane');
    state.map.getPane('cityLabelsPane').style.zIndex = '450';

    state.map.createPane('redPinPane');
    state.map.getPane('redPinPane').style.zIndex = '900';

    // Initialize Day / Night Topography Basemap
    initDayNightMode();

    // Render PMD Doppler Radar Coverage Cones
    renderPmdRadarCones();

    // Load official Pakistan National Boundary Line
    fetch('./pakistan_boundary.geojson')
      .then(res => res.json())
      .then(geoData => {
        L.geoJSON(geoData, {
          style: {
            color: '#8DC63F',
            weight: 2,
            opacity: 0.85,
            fillColor: 'transparent',
            dashArray: '6, 6'
          }
        }).addTo(state.map);
      })
      .catch(e => console.warn('Pakistan boundary overlay load:', e));

    createOrUpdateRedPin(33.6844, 73.0479, 'Islamabad');

    // Cursor-following station probe. Shows the nearest observed station's
    // real rainfall reading only — deliberately does NOT estimate a "street
    // flood risk" or "depth" at the cursor. There is no real data source for
    // per-pixel street-level flood depth, and computing it live on every
    // mousemove would mean either inventing a number or spamming the risk
    // engine's upstream APIs (Open-Meteo, which already has a real hourly
    // quota) hundreds of times per second while the user just moves the mouse.
    state.map.on('mousemove', e => {
      const { lat, lng } = e.latlng;
      let nearest = null;
      let minD = 999999;
      state.stations.forEach(s => {
        const dLat = (lat - s.lat) * 111;
        const dLon = (lng - s.lon) * 111 * Math.cos(lat * Math.PI / 180);
        const d = Math.sqrt(dLat * dLat + dLon * dLon);
        if (d < minD) {
          minD = d;
          nearest = s;
        }
      });

      const tooltipContainer = document.getElementById('hover-probe-tooltip');
      if (!tooltipContainer) return;

      if (!nearest || minD >= 45) {
        tooltipContainer.classList.add('hidden');
        return;
      }

      const precip = nearest.precip;
      tooltipContainer.style.left = `${e.containerPoint.x + 14}px`;
      tooltipContainer.style.top = `${e.containerPoint.y + 14}px`;
      tooltipContainer.classList.remove('hidden');
      tooltipContainer.innerHTML = precip != null
        ? `<div style="font-weight:700;color:#38bdf8;font-size:11px;">🌧️ ${escapeHtml(nearest.name)}: ${precip.toFixed(1)} mm/h</div>
           <div style="font-size:9px;color:#94a3b8;margin-top:1px;">Nearest observed station · ${minD.toFixed(0)} km away</div>`
        : `<div style="color:#94a3b8;font-size:10px;">${escapeHtml(nearest.name)}: loading…</div>`;
    });

    state.map.on('mouseout', () => {
      const tooltipContainer = document.getElementById('hover-probe-tooltip');
      if (tooltipContainer) tooltipContainer.classList.add('hidden');
    });

    state.map.on('click', async e => {
      const { lat, lng } = e.latlng;
      const title = await resolveLocationName(lat, lng);
      createOrUpdateRedPin(lat, lng, title);
      inspectPointWeather(lat, lng, title);
    });
  }

  // --- Official PMD Doppler Radar Coverage Cones ---
  function renderPmdRadarCones() {
    if (state.pmdLayerGroup && state.map.hasLayer(state.pmdLayerGroup)) {
      state.map.removeLayer(state.pmdLayerGroup);
    }
    state.pmdLayerGroup = L.layerGroup();
    if (!state.pmdConesVisible) return;

    PMD_RADAR_STATIONS.forEach(station => {
      // 1. 450km Outer Radar Detection Range Sweep
      const outerCircle = L.circle([station.lat, station.lon], {
        radius: station.radiusKm * 1000,
        color: 'rgba(56, 189, 248, 0.45)',
        weight: 1.5,
        dashArray: '6, 6',
        fillColor: 'rgba(56, 189, 248, 0.035)',
        fillOpacity: 0.035,
        pane: 'cloudPane'
      });
      state.pmdLayerGroup.addLayer(outerCircle);

      // 2. 200km Mid-Range Doppler Reflection Ring
      const midCircle = L.circle([station.lat, station.lon], {
        radius: (station.radiusKm > 250 ? 200 : 120) * 1000,
        color: 'rgba(56, 189, 248, 0.25)',
        weight: 1,
        dashArray: '3, 6',
        fill: false,
        pane: 'cloudPane'
      });
      state.pmdLayerGroup.addLayer(midCircle);

      // 3. Central Radar Tower Marker Badge
      const towerHtml = `
        <div class="wr-pmd-radar-badge" title="${station.name}">
          <i class="fa-solid fa-tower-broadcast"></i>
          <span>${station.city} Radar</span>
        </div>
      `;
      const towerIcon = L.divIcon({
        className: 'wr-pmd-radar-icon-container',
        html: towerHtml,
        iconSize: [110, 24],
        iconAnchor: [55, 12]
      });
      const towerMarker = L.marker([station.lat, station.lon], { icon: towerIcon, pane: 'cityLabelsPane' });
      towerMarker.on('click', () => {
        inspectPointWeather(station.lat, station.lon, station.name);
      });
      state.pmdLayerGroup.addLayer(towerMarker);
    });

    state.pmdLayerGroup.addTo(state.map);
  }

  // --- Day / Night Solar Lighting Mode ---
  function initDayNightMode() {
    const now = new Date();
    const utcHours = now.getUTCHours() + 5; // PKT is UTC+5
    const isDayTime = utcHours >= 6 && utcHours < 19;
    setThemeMode(isDayTime ? 'day' : 'night');
  }

  function setThemeMode(mode) {
    state.themeMode = mode;
    if (state.currentBaseMap && state.map.hasLayer(state.currentBaseMap)) {
      state.map.removeLayer(state.currentBaseMap);
    }
    state.currentBaseMap = (mode === 'day') ? DAY_BASE_MAP : NIGHT_BASE_MAP;
    state.currentBaseMap.addTo(state.map);

    const isDay = mode === 'day';
    dom.themeIcon.className = isDay ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    dom.themeLabel.textContent = isDay ? 'Day' : 'Night';
    dom.themeToggleBtn.classList.toggle('active', !isDay);
    
    document.getElementById('map').classList.toggle('night-mode', !isDay);
    document.getElementById('map').classList.toggle('day-mode', isDay);
  }

  const ROAD_HAZARDS = [
    {
      id: 'kkh-dasu', type: 'blockage', title: 'N-35 Karakoram Highway (KKH) - Dasu / Kohistan',
      severity: 'CRITICAL BLOCKAGE', icon: 'fa-triangle-exclamation', center: [35.29, 73.22],
      polyline: [[35.1478, 73.08173], [35.14861, 73.08526], [35.15048, 73.08872], [35.15417, 73.09355], [35.15779, 73.09837], [35.16167, 73.09857], [35.16385, 73.10006], [35.16814, 73.1016], [35.17298, 73.10325], [35.17403, 73.10507], [35.17908, 73.10775], [35.18307, 73.10733], [35.1844, 73.10513], [35.18434, 73.11082], [35.18693, 73.11214], [35.18865, 73.11701], [35.19254, 73.11957], [35.19597, 73.12294], [35.20049, 73.12547], [35.20551, 73.1312], [35.20854, 73.13733], [35.21072, 73.14063], [35.21236, 73.14273], [35.21431, 73.14717], [35.21849, 73.15289], [35.22275, 73.15542], [35.22328, 73.15792], [35.225, 73.16094], [35.2265, 73.16554], [35.22936, 73.17093], [35.23215, 73.17415], [35.23554, 73.17602], [35.23796, 73.17773], [35.24181, 73.17836], [35.24325, 73.18493], [35.24425, 73.19036], [35.24475, 73.19835], [35.24435, 73.20445], [35.24845, 73.20988], [35.25487, 73.21165], [35.25835, 73.21604], [35.26117, 73.21941], [35.26631, 73.22388], [35.27268, 73.22316], [35.28134, 73.22501], [35.28873, 73.22414], [35.29201, 73.22078], [35.29025, 73.22091], [35.28664, 73.22027], [35.28825, 73.21997], [35.28989, 73.21765], [35.28998, 73.21901], [35.2911, 73.21621], [35.29147, 73.21698], [35.29036, 73.2202], [35.2917, 73.22109], [35.29382, 73.21734], [35.29596, 73.20873], [35.29581, 73.19899], [35.29983, 73.19794], [35.30284, 73.19867], [35.30513, 73.19482], [35.30946, 73.19063], [35.31524, 73.19173], [35.31852, 73.19701], [35.3218, 73.2], [35.33081, 73.20191], [35.33368, 73.20406], [35.33917, 73.20587], [35.34541, 73.20528], [35.35091, 73.20518], [35.35467, 73.20395], [35.36374, 73.20024], [35.36811, 73.20157], [35.37411, 73.20557], [35.38109, 73.20468], [35.38754, 73.20046], [35.39576, 73.19847], [35.40093, 73.20171], [35.40433, 73.20429], [35.40949, 73.20536], [35.41405, 73.20309], [35.4168, 73.20284], [35.42198, 73.20201], [35.42672, 73.20268], [35.42959, 73.20086], [35.43131, 73.20683], [35.43427, 73.21143], [35.43846, 73.2146], [35.44129, 73.21786], [35.44375, 73.2201], [35.44621, 73.22362], [35.44945, 73.22706], [35.45186, 73.22986], [35.45444, 73.2331], [35.45519, 73.23451], [35.45695, 73.23628], [35.45999, 73.24359], [35.46123, 73.24695], [35.46515, 73.2518], [35.47004, 73.25516], [35.47226, 73.25668], [35.47488, 73.25776], [35.47709, 73.25977], [35.48038, 73.26362], [35.47826, 73.27184], [35.48027, 73.27262], [35.48008, 73.27626], [35.48064, 73.28367], [35.48432, 73.28921], [35.48738, 73.29277], [35.49066, 73.29523], [35.49148, 73.29808], [35.49565, 73.29792], [35.4993, 73.30007], [35.50292, 73.30227], [35.50599, 73.30704], [35.50763, 73.31114], [35.50579, 73.3191], [35.50211, 73.32623], [35.50109, 73.32938], [35.50121, 73.33543], [35.50108, 73.3365]],
      cause: 'Massive Mudslide & Rockfall triggered by heavy mountain downpour (32mm)',
      status: 'Closed to all traffic. Heavy machinery deployed by FWO / NHA for debris clearance.',
      alternate: 'Traffic diverted at Thakot. Use Hazara Motorway M-15 up to Mansehra only.',
      helpline: 'NHA Emergency: 130 | FWO Control: 051-9271301'
    },
    {
      id: 'swat-kalam', type: 'flood', title: 'N-95 Swat Valley Expressway - Bahrain to Kalam',
      severity: 'RIVER FLOOD INUNDATION', icon: 'fa-water', center: [35.20, 72.54],
      polyline: [[34.89778, 72.45696], [34.89703, 72.45687], [34.8961, 72.45937], [34.89513, 72.46121], [34.89468, 72.46251], [34.89461, 72.46393], [34.89386, 72.46555], [34.89365, 72.46744], [34.89423, 72.46763], [34.8935, 72.46879], [34.89189, 72.46827], [34.8901, 72.46791], [34.88889, 72.46745], [34.88798, 72.46594], [34.88816, 72.46475], [34.88798, 72.46269], [34.88768, 72.46135], [34.88727, 72.46016], [34.88751, 72.45974], [34.88846, 72.45995], [34.88998, 72.45872], [34.89088, 72.45772], [34.8917, 72.45685], [34.89299, 72.45547], [34.89361, 72.45446], [34.89292, 72.4539], [34.89319, 72.45362], [34.89456, 72.45309], [34.89462, 72.45176], [34.89536, 72.45081], [34.89578, 72.44945], [34.89593, 72.44742], [34.89502, 72.44849], [34.89411, 72.4494], [34.89333, 72.44984], [34.89224, 72.44986], [34.89091, 72.44879], [34.89033, 72.44683], [34.89029, 72.44468], [34.89845, 72.44403], [34.90337, 72.44795], [34.91636, 72.45103], [34.9286, 72.46101], [34.93329, 72.46666], [34.93701, 72.4694], [34.95439, 72.47243], [34.96997, 72.4704], [34.98164, 72.47076], [34.99176, 72.47059], [34.99647, 72.46941], [35.00424, 72.46894], [35.01751, 72.47023], [35.02567, 72.4744], [35.02884, 72.47455], [35.04442, 72.48031], [35.06453, 72.48628], [35.0722, 72.49152], [35.07481, 72.49005], [35.08125, 72.49471], [35.0948, 72.50133], [35.09915, 72.50423], [35.1067, 72.50984], [35.10858, 72.51381], [35.11256, 72.51522], [35.12049, 72.52075], [35.12637, 72.52586], [35.13213, 72.53136], [35.13836, 72.53657], [35.14245, 72.53744], [35.14586, 72.5379], [35.14911, 72.53259], [35.15436, 72.5318], [35.16275, 72.53045], [35.16625, 72.53006], [35.17306, 72.53215], [35.17699, 72.53516], [35.17992, 72.53729], [35.18496, 72.53451], [35.18898, 72.53821], [35.19575, 72.54234], [35.19969, 72.54277], [35.20484, 72.54453], [35.20755, 72.54922], [35.21082, 72.55027], [35.21288, 72.55329], [35.21642, 72.55874], [35.2206, 72.56468], [35.22651, 72.57019], [35.23162, 72.57316], [35.23387, 72.5747], [35.239, 72.57783], [35.24202, 72.5806], [35.24475, 72.58256], [35.24824, 72.58721], [35.25552, 72.59462], [35.26577, 72.59825], [35.2713, 72.5991], [35.27687, 72.60028], [35.27825, 72.60173], [35.28137, 72.60334], [35.28706, 72.60554], [35.29105, 72.60602], [35.29551, 72.61131], [35.3087, 72.61312], [35.32126, 72.61341], [35.32612, 72.6113], [35.33351, 72.61212], [35.34306, 72.61095], [35.35364, 72.60772], [35.36102, 72.60322], [35.36553, 72.60187], [35.36997, 72.60152], [35.37827, 72.60275], [35.38556, 72.60469], [35.39375, 72.60503], [35.39723, 72.60617], [35.40385, 72.60566], [35.41122, 72.60094], [35.42164, 72.60143], [35.43106, 72.60533], [35.44044, 72.60159], [35.4487, 72.59931], [35.45423, 72.59759], [35.46056, 72.59608], [35.46603, 72.59626], [35.47002, 72.5929], [35.47557, 72.5913], [35.47994, 72.58944]],
      cause: 'Swat River high flood surge overtopping road embankments and washed culverts',
      status: 'Submerged sections at Madyan & Bahrain. Only 4x4 relief vehicles permitted.',
      alternate: 'Stay at Saidu Sharif / Mingora. Do not proceed upstream towards Kalam.',
      helpline: 'KP PDMA: 1700 | Rescue 1122'
    },
    {
      id: 'murree-expressway', type: 'blockage', title: 'N-75 Murree Expressway & Galiyat Corridor',
      severity: 'RESTRICTED / LANDSLIDE', icon: 'fa-road-barrier', center: [33.88, 73.35],
      polyline: [[33.72022, 73.18013], [33.72468, 73.18217], [33.72708, 73.18738], [33.72986, 73.18812], [33.73366, 73.1893], [33.73774, 73.19546], [33.73844, 73.19077], [33.73949, 73.17908], [33.7474, 73.19314], [33.75563, 73.20794], [33.76378, 73.22097], [33.76505, 73.22876], [33.77053, 73.23834], [33.77546, 73.24731], [33.78221, 73.26125], [33.79104, 73.2797], [33.79982, 73.29568], [33.8066, 73.29927], [33.80678, 73.29612], [33.80841, 73.29583], [33.80952, 73.29537], [33.81089, 73.29676], [33.81215, 73.29659], [33.81302, 73.29737], [33.81287, 73.29672], [33.81154, 73.29717], [33.81003, 73.29567], [33.80864, 73.29515], [33.80759, 73.29644], [33.8045, 73.29025], [33.80613, 73.28608], [33.80788, 73.28382], [33.80743, 73.28301], [33.80761, 73.27922], [33.81236, 73.27781], [33.81638, 73.27882], [33.81824, 73.27685], [33.82223, 73.27812], [33.82407, 73.28225], [33.82676, 73.28589], [33.82948, 73.28782], [33.83005, 73.28697], [33.8324, 73.28627], [33.83572, 73.28843], [33.83495, 73.2916], [33.83455, 73.29621], [33.83646, 73.29814], [33.84116, 73.30749], [33.84296, 73.31244], [33.84565, 73.31419], [33.84828, 73.3192], [33.85191, 73.31713], [33.85557, 73.31924], [33.8574, 73.32215], [33.86147, 73.32431], [33.86478, 73.32752], [33.86397, 73.3269], [33.86175, 73.32818], [33.86491, 73.3322], [33.86848, 73.33356], [33.87221, 73.33548], [33.87609, 73.33728], [33.88115, 73.34005], [33.88004, 73.3461], [33.88136, 73.35231], [33.88048, 73.35804], [33.88789, 73.36048], [33.89575, 73.36767], [33.90372, 73.37047], [33.90343, 73.37607], [33.90646, 73.38123], [33.91181, 73.38257], [33.91186, 73.38906], [33.91663, 73.39284], [33.9121, 73.39281], [33.91027, 73.39038], [33.91157, 73.39221], [33.9158, 73.39356], [33.91738, 73.39732], [33.92058, 73.40158], [33.92169, 73.4106], [33.92036, 73.41293], [33.92018, 73.41573], [33.91519, 73.42029], [33.9144, 73.42502], [33.91429, 73.42816], [33.91512, 73.43263], [33.91933, 73.43681], [33.92494, 73.44057], [33.92892, 73.44094], [33.93133, 73.44406], [33.93591, 73.44737], [33.9398, 73.44578], [33.9423, 73.44721], [33.9444, 73.45128], [33.94712, 73.4523], [33.95228, 73.45328], [33.95623, 73.45349], [33.95902, 73.45436], [33.96291, 73.45572], [33.96718, 73.45825], [33.97115, 73.4603], [33.97593, 73.46353], [33.98037, 73.47034], [33.98616, 73.47258], [33.98723, 73.46975], [33.99305, 73.47322], [33.99923, 73.47447], [34.00385, 73.47691], [34.00929, 73.47874], [34.01696, 73.48046], [34.02306, 73.48561], [34.02824, 73.48662], [34.02597, 73.48505], [34.0254, 73.48244], [34.02352, 73.48001], [34.0216, 73.47802], [34.02, 73.47569], [34.02023, 73.47522], [34.01893, 73.47375], [34.01919, 73.47285], [34.01881, 73.47238]],
      cause: 'Hill torrent water runoff, dense fog and fallen trees at Jhika Gali',
      status: 'One-way controlled traffic by City Traffic Police. Slippery asphalt conditions.',
      alternate: 'Use Old Rawalpindi-Murree Road for light vehicles with extreme caution.',
      helpline: 'Murree Control Room: 051-9269016'
    },
    {
      id: 'bolan-n65', type: 'flood', title: 'N-65 Quetta-Sukkur Highway - Bolan Pass (Machh)',
      severity: 'FLASH FLOOD INUNDATION', icon: 'fa-water', center: [29.95, 67.25],
      polyline: [[29.61182, 67.482], [29.61081, 67.48128], [29.60947, 67.48208], [29.60565, 67.48482], [29.59877, 67.48353], [29.59573, 67.48034], [29.58983, 67.47184], [29.58275, 67.4559], [29.58438, 67.44959], [29.59656, 67.43755], [29.60241, 67.43315], [29.61194, 67.42228], [29.62683, 67.41461], [29.63378, 67.41335], [29.64182, 67.41173], [29.64864, 67.41176], [29.65601, 67.4101], [29.6681, 67.40435], [29.67914, 67.39934], [29.69163, 67.38904], [29.69571, 67.38812], [29.70603, 67.38209], [29.71154, 67.38142], [29.71386, 67.38131], [29.71648, 67.37947], [29.72278, 67.37854], [29.73256, 67.37674], [29.74017, 67.37444], [29.74625, 67.37307], [29.7566, 67.37151], [29.77299, 67.36624], [29.7989, 67.34938], [29.80771, 67.3444], [29.81275, 67.33773], [29.81555, 67.33173], [29.82111, 67.32846], [29.82653, 67.32742], [29.83006, 67.32457], [29.83375, 67.3219], [29.83715, 67.3208], [29.83915, 67.3214], [29.84344, 67.31995], [29.85292, 67.3169], [29.85932, 67.31454], [29.86295, 67.31329], [29.87097, 67.31095], [29.87507, 67.30718], [29.87788, 67.30401], [29.87912, 67.29817], [29.87933, 67.29391], [29.88097, 67.28635], [29.88489, 67.28034], [29.89025, 67.27355], [29.89983, 67.26435], [29.90751, 67.26006], [29.91268, 67.25506], [29.91611, 67.25113], [29.91993, 67.24498], [29.92221, 67.23912], [29.92311, 67.23198], [29.92416, 67.22146], [29.92809, 67.21448], [29.93144, 67.21024], [29.93279, 67.20759], [29.93478, 67.20434], [29.93722, 67.20075], [29.93831, 67.19859], [29.93798, 67.19454], [29.93975, 67.1933], [29.93962, 67.1907], [29.9402, 67.18701], [29.94038, 67.18494], [29.94062, 67.18343], [29.93997, 67.18243], [29.93799, 67.1767], [29.93545, 67.17252], [29.93619, 67.16994], [29.93501, 67.16675], [29.9346, 67.16314], [29.93135, 67.15842], [29.9259, 67.15353], [29.92385, 67.15352], [29.92043, 67.15234], [29.91801, 67.15075], [29.91496, 67.14623], [29.91063, 67.13491], [29.91194, 67.1266], [29.91092, 67.12036], [29.92525, 67.09172], [29.92867, 67.08546], [29.97534, 67.02742], [29.9769, 67.02114], [29.97864, 67.01003], [29.99193, 66.99995], [30.01268, 66.98398], [30.02561, 66.98392], [30.04253, 66.98456], [30.05019, 66.98289], [30.05856, 66.98051], [30.07432, 66.97722], [30.09412, 66.97414], [30.09854, 66.97399], [30.10074, 66.97396], [30.10649, 66.97407], [30.11124, 66.97465], [30.11881, 66.97646], [30.1232, 66.97759], [30.13312, 66.97996], [30.13732, 66.9808], [30.13937, 66.98133], [30.14606, 66.98233], [30.15117, 66.98349], [30.15512, 66.98464], [30.16059, 66.98641], [30.16395, 66.98811], [30.166, 66.98881], [30.17079, 66.98601], [30.17153, 66.98441], [30.17694, 66.98076], [30.17957, 66.98082], [30.17998, 66.97999]],
      cause: 'Severe flash floods in Bolan River and Pinjra Bridge approach damage',
      status: 'Highway submerged under 3.5 ft water near Kolpur/Machh. Traffic suspended.',
      alternate: 'Heavy transport advised to hold at Dera Allah Yar / Sibi terminals.',
      helpline: 'Balochistan PDMA: 081-9241133'
    },
    {
      id: 'babusar-pass', type: 'blockage', title: 'N-15 Babusar Pass - Kaghan to Chilas',
      severity: 'GLACIAL RUNOFF / BLOCKED', icon: 'fa-snowflake', center: [35.15, 74.05],
      polyline: [[34.9142, 73.87595], [34.91764, 73.87352], [34.92254, 73.87196], [34.93236, 73.86847], [34.9393, 73.86716], [34.94365, 73.87269], [34.94381, 73.87982], [34.94844, 73.88931], [34.95107, 73.89683], [34.95231, 73.90444], [34.95587, 73.9132], [34.96684, 73.92272], [34.97083, 73.92856], [34.98926, 73.93374], [34.99905, 73.93795], [35.00389, 73.93972], [35.00519, 73.93998], [35.01332, 73.94129], [35.01797, 73.93943], [35.02459, 73.93869], [35.02881, 73.93719], [35.03321, 73.93582], [35.03968, 73.93644], [35.04933, 73.93573], [35.05673, 73.93643], [35.06626, 73.94047], [35.07389, 73.93882], [35.07947, 73.93556], [35.08147, 73.92865], [35.08749, 73.93238], [35.09061, 73.94223], [35.09613, 73.95189], [35.09898, 73.96419], [35.10039, 73.96819], [35.10115, 73.96967], [35.10407, 73.97433], [35.10698, 73.97774], [35.10977, 73.97982], [35.11476, 73.989], [35.11839, 73.99533], [35.12337, 74.00499], [35.12507, 74.00567], [35.128, 74.00785], [35.13182, 74.01236], [35.13305, 74.01806], [35.13547, 74.02579], [35.13768, 74.02915], [35.14364, 74.04128], [35.14465, 74.04114], [35.14639, 74.04752], [35.14794, 74.04618], [35.15033, 74.04419], [35.15564, 74.04571], [35.1554, 74.0466], [35.1544, 74.04793], [35.15677, 74.04812], [35.15719, 74.04896], [35.15771, 74.04946], [35.16085, 74.04931], [35.16085, 74.05], [35.16426, 74.0501], [35.1656, 74.05042], [35.16869, 74.0496], [35.16931, 74.05043], [35.17098, 74.05082], [35.17098, 74.0513], [35.17473, 74.05029], [35.17701, 74.04808], [35.17788, 74.04842], [35.17863, 74.04851], [35.18034, 74.04504], [35.18103, 74.04406], [35.1823, 74.04315], [35.18465, 74.04337], [35.18532, 74.04393], [35.19052, 74.04322], [35.19494, 74.04438], [35.19934, 74.04481], [35.20412, 74.04858], [35.20715, 74.04921], [35.21079, 74.05348], [35.21677, 74.05981], [35.22734, 74.06798], [35.23194, 74.07007], [35.23571, 74.0701], [35.24021, 74.07325], [35.24377, 74.07754], [35.24667, 74.08163], [35.25227, 74.08595], [35.25826, 74.0896], [35.26518, 74.09227], [35.27224, 74.09518], [35.27848, 74.09759], [35.28368, 74.10328], [35.28605, 74.10312], [35.29133, 74.10649], [35.29611, 74.11545], [35.30396, 74.11878], [35.30832, 74.12412], [35.31497, 74.128], [35.32138, 74.13017], [35.33007, 74.13244], [35.33613, 74.13621], [35.34138, 74.13854], [35.34683, 74.13698], [35.35364, 74.13752], [35.35947, 74.1415], [35.36597, 74.14046], [35.37145, 74.14248], [35.37587, 74.14242], [35.38246, 74.14396], [35.38764, 74.14113], [35.3967, 74.14157], [35.40269, 74.14378], [35.40849, 74.14291], [35.41312, 74.13159], [35.42282, 74.11879], [35.42231, 74.11114], [35.41835, 74.10689], [35.41595, 74.10604], [35.4187, 74.10016], [35.41885, 74.09961]],
      cause: 'Glacial stream overflow and mudslide at Babusar Top (4,173m elevation)',
      status: 'Closed during evening & night hours. Daytime convoy transit subject to weather.',
      alternate: 'Use Karakoram Highway (KKH) via Kohistan when clear.',
      helpline: 'NHA Babusar Base: 130'
    },
    {
      id: 'indus-hwy-dadu', type: 'flood', title: 'N-55 Indus Highway - Dadu & Sehwan Sector',
      severity: 'HIGH FLOOD WATCH', icon: 'fa-water', center: [26.75, 67.82],
      polyline: [[26.38961, 67.96811], [26.38745, 67.96907], [26.38718, 67.97236], [26.38698, 67.97481], [26.38585, 67.97606], [26.39336, 67.98018], [26.40142, 67.98053], [26.41684, 67.98116], [26.43124, 67.98172], [26.44503, 67.98229], [26.44457, 67.98634], [26.44943, 67.99408], [26.47269, 67.98944], [26.48227, 67.98301], [26.48558, 67.97951], [26.48847, 67.9788], [26.49268, 67.98049], [26.49566, 67.9817], [26.49849, 67.98202], [26.50225, 67.98159], [26.50814, 67.98051], [26.51093, 67.97931], [26.51418, 67.97563], [26.51674, 67.97242], [26.51908, 67.97101], [26.52421, 67.97218], [26.52869, 67.97323], [26.54293, 67.97356], [26.5585, 67.97389], [26.56676, 67.9742], [26.57656, 67.97515], [26.58035, 67.97575], [26.59063, 67.97877], [26.60918, 67.9843], [26.62165, 67.98803], [26.6381, 67.9929], [26.64117, 67.9938], [26.6421, 67.99388], [26.64318, 67.99364], [26.65102, 67.99101], [26.65801, 67.98862], [26.66503, 67.98625], [26.66598, 67.98626], [26.66754, 67.98696], [26.67099, 67.98846], [26.6823, 67.96652], [26.68996, 67.95178], [26.70164, 67.92951], [26.71555, 67.90472], [26.717, 67.89719], [26.72215, 67.86402], [26.72681, 67.83361], [26.73332, 67.79738], [26.7352, 67.81128], [26.73962, 67.81695], [26.74029, 67.81735], [26.7435, 67.8174], [26.7477, 67.81952], [26.75183, 67.8219], [26.75518, 67.82391], [26.7581, 67.82529], [26.75778, 67.82539], [26.75415, 67.82326], [26.75017, 67.82109], [26.74748, 67.81937], [26.74321, 67.81778], [26.73976, 67.81735], [26.73956, 67.81689], [26.73457, 67.8066], [26.7333, 67.79725], [26.73442, 67.79202], [26.73581, 67.78848], [26.73936, 67.78434], [26.7443, 67.78139], [26.75555, 67.78048], [26.76991, 67.77813], [26.77329, 67.77714], [26.7757, 67.77472], [26.78791, 67.77011], [26.79584, 67.76936], [26.80921, 67.76897], [26.81495, 67.76802], [26.81676, 67.76688], [26.81805, 67.76541], [26.82256, 67.75679], [26.83465, 67.73537], [26.83742, 67.73126], [26.83861, 67.73049], [26.85886, 67.72237], [26.88247, 67.71267], [26.89694, 67.70632], [26.90329, 67.70292], [26.91688, 67.69735], [26.93142, 67.69518], [26.94482, 67.69618], [26.95499, 67.69194], [26.96024, 67.6916], [26.96489, 67.69239], [26.96785, 67.69118], [26.9706, 67.68851], [26.97572, 67.68435], [26.99497, 67.6886], [26.99921, 67.69094], [27.01446, 67.70115], [27.0176, 67.70478], [27.01963, 67.70615], [27.02097, 67.70637], [27.02291, 67.70669], [27.02685, 67.70914], [27.03514, 67.71456], [27.03734, 67.71611], [27.04056, 67.7185], [27.04383, 67.71974], [27.05087, 67.7218], [27.06057, 67.72459], [27.06839, 67.72646], [27.07361, 67.72702], [27.07795, 67.72497], [27.08179, 67.7236], [27.08499, 67.72374], [27.0882, 67.7249], [27.09357, 67.72571], [27.09756, 67.71354], [27.0985, 67.71231], [27.10012, 67.71005], [27.10512, 67.69171], [27.10389, 67.6794]],
      cause: 'High water levels in surrounding canal drains and Indus seepage',
      status: 'Single lane traffic operational under National Highway Authority monitoring.',
      alternate: 'National Highway N-5 (Moro / Nowshero Feroze) recommended for long haul.',
      helpline: 'Sindh Emergency: 021-99203443'
    },
    {
      id: 'rcd-lasbela', type: 'flood', title: 'N-25 RCD Highway - Lasbela / Porali River Bridge',
      severity: 'WATER OVERFLOW', icon: 'fa-water', center: [25.95, 66.55],
      polyline: [[25.59331, 66.62783], [25.61003, 66.62169], [25.63901, 66.61092], [25.65934, 66.61057], [25.66171, 66.6106], [25.67479, 66.61071], [25.6775, 66.61075], [25.69392, 66.61086], [25.70449, 66.61091], [25.71409, 66.61192], [25.73162, 66.61695], [25.73834, 66.61877], [25.74498, 66.62068], [25.75413, 66.62328], [25.76119, 66.62527], [25.77477, 66.62645], [25.784, 66.6256], [25.79631, 66.6248], [25.80241, 66.62589], [25.80485, 66.62634], [25.80826, 66.62696], [25.81134, 66.62739], [25.81521, 66.62786], [25.82012, 66.62833], [25.82421, 66.6272], [25.8246, 66.62692], [25.82551, 66.62657], [25.82622, 66.62668], [25.82664, 66.62665], [25.83094, 66.6255], [25.84346, 66.62228], [25.84832, 66.62101], [25.85873, 66.61681], [25.85974, 66.61638], [25.86851, 66.61247], [25.87477, 66.60951], [25.90003, 66.59694], [25.91841, 66.58766], [25.92522, 66.58417], [25.94223, 66.57522], [25.95226, 66.56514], [25.95109, 66.56256], [25.94833, 66.55648], [25.94804, 66.5541], [25.94723, 66.55203], [25.94663, 66.55045], [25.94571, 66.5493], [25.94455, 66.54767], [25.94411, 66.54676], [25.94286, 66.54368], [25.93889, 66.53726], [25.93529, 66.5331], [25.93004, 66.52906], [25.92908, 66.52803], [25.92949, 66.5287], [25.93325, 66.53141], [25.93693, 66.53472], [25.94241, 66.54297], [25.94386, 66.5462], [25.94442, 66.54743], [25.94518, 66.54878], [25.94644, 66.55014], [25.94685, 66.55086], [25.94755, 66.55268], [25.94805, 66.5542], [25.94898, 66.55793], [25.9512, 66.56278], [25.95317, 66.56768], [25.97713, 66.55289], [26.03678, 66.51696], [26.05713, 66.50516], [26.06332, 66.49306], [26.07398, 66.46999], [26.11167, 66.42819], [26.12454, 66.41311], [26.12804, 66.40882], [26.13171, 66.39294], [26.15152, 66.37446], [26.1554, 66.37314], [26.15704, 66.37089], [26.17199, 66.34897], [26.18483, 66.33088], [26.18634, 66.32611], [26.18756, 66.3231], [26.19067, 66.31994], [26.19325, 66.31878], [26.19664, 66.31406], [26.19813, 66.30796], [26.19713, 66.30224], [26.19468, 66.29078], [26.19562, 66.28751], [26.20699, 66.27792], [26.21511, 66.2717], [26.23783, 66.26984], [26.2505, 66.26877], [26.25228, 66.26851], [26.27175, 66.25821], [26.27294, 66.25832], [26.29011, 66.26125], [26.29623, 66.26279], [26.29732, 66.26424], [26.29799, 66.26829], [26.30142, 66.2695], [26.30821, 66.27008], [26.30874, 66.27353], [26.30945, 66.27559], [26.33439, 66.28511], [26.34966, 66.29148], [26.35368, 66.29639], [26.35073, 66.299], [26.34941, 66.30021], [26.34974, 66.30177], [26.34971, 66.30228], [26.34903, 66.3026], [26.34815, 66.30397], [26.34847, 66.30447], [26.34913, 66.30514], [26.35018, 66.30577], [26.35019, 66.30616], [26.34917, 66.30798], [26.34733, 66.31168], [26.34787, 66.31385], [26.34815, 66.31452], [26.34847, 66.31534], [26.34776, 66.31674], [26.3473, 66.31896], [26.34678, 66.31958], [26.34641, 66.32054], [26.34684, 66.32341], [26.34779, 66.3239], [26.34841, 66.32413], [26.34802, 66.32627], [26.34996, 66.32666], [26.3525, 66.32733]],
      cause: 'Porali River flash flood surging over bridge approach causeway',
      status: 'Slow moving traffic, heavy vehicles escorted by Motorway Police.',
      alternate: 'Coastal Highway N-10 for Makran-bound transit.',
      helpline: 'Motorway Police: 130'
    }
  ];

  function renderHazardLayers(activeLayer) {
    if (state.hazardLayerGroup && state.map.hasLayer(state.hazardLayerGroup)) {
      state.map.removeLayer(state.hazardLayerGroup);
    }

    state.hazardLayerGroup = L.layerGroup();

    const isBlockageMode = activeLayer === 'blockages';
    const isFloodMode = activeLayer === 'floods';
    const isRiversMode = activeLayer === 'rivers';
    const isDamsMode = activeLayer === 'dams';
    const isAgriMode = activeLayer === 'agriculture';

    // River gauging & barrage sites. No FFD/WAPDA telemetry exists (no public
    // API), but real Copernicus GloFAS discharge-exceedance alerts DO — each
    // station is checked live and coloured by whatever GloFAS actually reports,
    // never a static placeholder.
    if (isRiversMode) {
      const CHECKING = '#64748b';
      const markers = RIVER_GAUGE_STATIONS.map(stn => {
        const iconHtml = `
          <div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border:1.5px solid ${CHECKING};color:${CHECKING};" title="${escapeHtml(stn.station)} (${escapeHtml(stn.river)})">
            <i class="fa-solid fa-spinner fa-spin"></i><span>${escapeHtml(stn.station)}</span>
          </div>`;
        const icon = L.divIcon({ className: 'wr-hazard-marker-container', html: iconHtml, iconSize: [130, 24], iconAnchor: [65, 12] });
        const marker = L.marker([stn.lat, stn.lon], { icon, pane: 'hazardPane' });
        marker.on('click', () => inspectPointWeather(stn.lat, stn.lon, `${stn.river} — ${stn.station}`));
        state.hazardLayerGroup.addLayer(marker);
        return { stn, marker };
      });
      state.hazardLayerGroup.addTo(state.map);

      showDataGapSummary(
        '🌊 River intelligence',
        'No Pakistan FFD/WAPDA gauge telemetry is connected (no public API exists for it). Each station below is checked live against Copernicus GloFAS — a real global discharge-forecasting model, not an official Pakistani reading.',
        `Checking ${RIVER_GAUGE_STATIONS.length} stations for active GloFAS exceedance alerts…`
      );

      // Check every station concurrently; render each marker as its own
      // result lands rather than waiting for the slowest of 16 to finish.
      const results = [];
      Promise.all(markers.map(({ stn, marker }) =>
        ESS_API.riverAlert(stn.lat, stn.lon).then(alert => {
          results.push({ stn, alert });
          if (!state.map.hasLayer(marker)) return; // layer swapped away while loading
          const isAlert = alert.status === 'ACTIVE_ALERT';
          const color = isAlert ? '#f97316' : alert.status === 'NO_ACTIVE_ALERT' ? '#22c55e' : CHECKING;
          const label = isAlert ? 'ALERT' : alert.status === 'NO_ACTIVE_ALERT' ? 'NORMAL' : 'N/A';
          marker.setIcon(L.divIcon({
            className: 'wr-hazard-marker-container',
            html: `<div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border:1.5px solid ${color};color:${color};" title="${escapeHtml(stn.station)} — ${escapeHtml(label)} (GloFAS)">
                     <i class="fa-solid fa-route"></i><span>${escapeHtml(stn.station)}: ${label}</span>
                   </div>`,
            iconSize: [150, 24], iconAnchor: [75, 12]
          }));
        }).catch(() => { results.push({ stn, alert: { status: 'UNAVAILABLE' } }); })
      )).then(() => {
        const alertCount = results.filter(r => r.alert.status === 'ACTIVE_ALERT').length;
        showDataGapSummary(
          '🌊 River intelligence',
          `No Pakistan FFD/WAPDA gauge telemetry is connected. All ${results.length} stations checked live against Copernicus GloFAS: ${alertCount} under an active discharge-exceedance alert, ${results.length - alertCount} normal or unavailable.`,
          'GloFAS is a real global hydrological model, not an official Pakistani reading — it only reports a value when it has an active alert. Click any station on the map for live rainfall, wetness and modelled flood risk there.'
        );
      });
      return;
    }

    if (isDamsMode) {
      DAM_RESERVOIRS.forEach(dam => {
        const iconHtml = `
          <div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border:1.5px solid #f59e0b;color:#f59e0b;" title="${dam.name} — reservoir telemetry not connected">
            <i class="fa-solid fa-warehouse"></i>
            <span>${dam.name}</span>
          </div>
        `;
        const icon = L.divIcon({ className: 'wr-hazard-marker-container', html: iconHtml, iconSize: [130, 24], iconAnchor: [65, 12] });
        const marker = L.marker([dam.lat, dam.lon], { icon, pane: 'hazardPane' });
        marker.on('click', () => {
          inspectPointWeather(dam.lat, dam.lon, dam.name);
        });
        state.hazardLayerGroup.addLayer(marker);
      });
      state.hazardLayerGroup.addTo(state.map);
      showDataGapSummary(
        '🏞️ Reservoir situation',
        'Reservoir level, conservation level, storage percentage and trend require WAPDA or IRSA data access. Those values are not shown because they are not measured by this system.',
        `${DAM_RESERVOIRS.length} major reservoirs are mapped by location. Click any one for live rainfall analytics over its area.`
      );
      return;
    }

    // Agriculture exposure needs crop maps intersected with flood extent — not
    // available in Phase 1, so the mode explains the gap instead of drawing
    // hectare figures nobody measured.
    if (isAgriMode) {
      state.hazardLayerGroup.addTo(state.map);
      showDataGapSummary(
        '🌾 Agriculture exposure',
        'Cropland at risk by crop type and growth stage requires a crop-type map, a crop-calendar/stage layer and a flood or risk polygon to intersect them with.',
        'None of those datasets are connected yet, so no hectare figures are shown. This is Phase 3 of the delivery plan.'
      );
      return;
    }

    // In default radar mode, keep map clean
    if (!isBlockageMode && !isFloodMode) {
      return;
    }

    // Zoom-adaptive line weight: thin at overview, slightly thicker when zoomed in
    const zoom = state.map.getZoom();
    const coreWeight = zoom >= 12 ? 3.5 : zoom >= 10 ? 3 : zoom >= 8 ? 2.5 : 2;
    const glowWeight = coreWeight + 2;

    // Draw immediately in a neutral "checking" state, then colour each corridor
    // by its LIVE predicted tier (spec §17's OPEN/CAUTION/FLOOD AFFECTED/BLOCKED)
    // once the risk engine responds — never a static colour that could go stale.
    const CHECKING_COLOR = '#64748b';
    const relevantHazards = ROAD_HAZARDS.filter(hazard => {
      if (isBlockageMode && hazard.type !== 'blockage') return false;
      if (isFloodMode && hazard.type !== 'flood') return false;
      return true;
    });

    relevantHazards.forEach(hazard => {
      const isFlood = hazard.type === 'flood';

      const glowPoly = L.polyline(hazard.polyline, {
        color: CHECKING_COLOR, weight: glowWeight, opacity: 0.5,
        lineCap: 'round', lineJoin: 'round', pane: 'hazardPane'
      });
      state.hazardLayerGroup.addLayer(glowPoly);

      const linePoly = L.polyline(hazard.polyline, {
        color: CHECKING_COLOR, weight: coreWeight, dashArray: isFlood ? '4, 4' : '6, 4',
        opacity: 1.0, lineCap: 'round', lineJoin: 'round', pane: 'hazardPane'
      });
      linePoly.on('click', () => inspectHazardDetails(hazard));
      state.hazardLayerGroup.addLayer(linePoly);

      const markerHtml = `
        <div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border-color:${CHECKING_COLOR};color:${CHECKING_COLOR};" title="${escapeHtml(hazard.title)}">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>CHECKING</span>
        </div>`;
      const hazardIcon = L.divIcon({ className: 'wr-hazard-marker-container', html: markerHtml, iconSize: [100, 24], iconAnchor: [50, 12] });
      const hazardMarker = L.marker(hazard.center, { icon: hazardIcon, pane: 'hazardPane' });
      hazardMarker.on('click', () => inspectHazardDetails(hazard));
      state.hazardLayerGroup.addLayer(hazardMarker);

      // Live tier fetch, applied in place once resolved. A failure must show a
      // clear "couldn't check" state, never leave the marker spinning forever.
      const applyErrorState = () => {
        if (!state.map.hasLayer(glowPoly)) return;
        const errColor = '#94a3b8';
        glowPoly.setStyle({ color: errColor, opacity: 0.4 });
        linePoly.setStyle({ color: errColor });
        hazardMarker.setIcon(L.divIcon({
          className: 'wr-hazard-marker-container',
          html: `<div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border:1.5px dashed ${errColor};color:${errColor};" title="${escapeHtml(hazard.title)} — live risk check failed, retry by reopening this layer">
                   <i class="fa-solid fa-triangle-exclamation"></i><span>CHECK FAILED</span>
                 </div>`,
          iconSize: [110, 24], iconAnchor: [55, 12]
        }));
      };

      calculateComprehensiveIntelligence(hazard.center[0], hazard.center[1], hazard.title).then(d => {
        if (!state.map.hasLayer(glowPoly)) return; // layer swapped away while loading
        if (!d.ok) return applyErrorState();

        const hz = d.report.risk?.detail?.hazards || {};
        const relevant = isFlood ? [hz.river_flood, hz.flash_flood, hz.urban_flood] : [hz.landslide, hz.flash_flood];
        const status = predictedRoadStatus(relevant.filter(Boolean).map(h => h.code));

        glowPoly.setStyle({ color: status.color, opacity: 0.7 });
        linePoly.setStyle({ color: status.color });
        hazardMarker.setIcon(L.divIcon({
          className: 'wr-hazard-marker-container',
          html: `<div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border:1.5px solid ${status.color};color:${status.color};" title="${escapeHtml(hazard.title)} — ${escapeHtml(status.label)} (predicted)">
                   <span>${status.emoji} ${escapeHtml(status.label.toUpperCase())}</span>
                 </div>`,
          iconSize: [130, 24], iconAnchor: [65, 12]
        }));
      }).catch(applyErrorState);
    });

    state.hazardLayerGroup.addTo(state.map);
    showHazardListSummary(isBlockageMode ? 'blockage' : 'flood');

    // Re-render on zoom change so line weight adapts
    state.map.off('zoomend.hazard');
    state.map.on('zoomend.hazard', () => {
      if (state.activeLayer === 'blockages' || state.activeLayer === 'floods') {
        renderHazardLayers(state.activeLayer);
      }
    });
  }

  /**
   * A module whose data source is not connected. Says what is missing and what
   * would be needed, instead of leaving the panel blank or filling it with
   * plausible-looking numbers.
   */
  function showDataGapSummary(title, explanation, detail) {
    dom.infoDrawer.classList.remove('hidden');
    dom.infoDrawerContent.innerHTML = `
      <div style="${CARD}border-style:dashed;border-color:rgba(148,163,184,0.4);">
        <div style="${H}"><span>${title}</span>${dataTypeChip('PENDING')}</div>
        <div style="font-size:11px;color:#e2e8f0;line-height:1.6;margin-bottom:7px;">${escapeHtml(explanation)}</div>
        <div style="font-size:10px;color:#94a3b8;line-height:1.6;">${escapeHtml(detail)}</div>
      </div>`;
  }

  /**
   * Road corridors (spec §17).
   *
   * These are corridors with a KNOWN vulnerability to a given failure mode; they
   * are not verified live closures. The spec is explicit that a predicted road
   * risk must never be presented as a confirmed blockage, so the panel shows the
   * live modelled risk for the corridor and states plainly that no verified
   * closure feed (NHA / NDMA / Motorway Police) is connected.
   */
  function showHazardListSummary(type) {
    const isFlood = type === 'flood';
    const list = ROAD_HAZARDS.filter(h => h.type === type);

    dom.infoDrawer.classList.remove('hidden');

    dom.infoDrawerContent.innerHTML = `
      <div style="${CARD}border-color:rgba(251,191,36,0.4);background:rgba(251,191,36,0.08);">
        <div style="${H}"><span>⚠️ Predicted risk — not verified closures</span>${dataTypeChip('MODELLED')}</div>
        <div style="font-size:10.5px;color:#fde68a;line-height:1.6;">
          No verified road-closure feed (NHA, NDMA or Motorway Police) is connected. These are
          corridors known to be vulnerable to ${isFlood ? 'flood inundation' : 'blockage and landslides'},
          shown with the live modelled risk for their location. Always confirm road status with the
          operating authority before travelling.
        </div>
      </div>
      <div style="${CARD}">
        <div style="${H}"><span>${isFlood ? '🌊 Flood-vulnerable corridors' : '🚧 Blockage-vulnerable corridors'}</span></div>
        <div style="font-size:10px;color:#94a3b8;margin-bottom:8px;">
          ${list.length} corridors mapped. Click any route for its live risk assessment:
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;">
          ${list.map((h, i) => `
            <div class="hazard-quick-card" data-idx="${i}" style="background:rgba(255,255,255,0.06);border:1px solid ${isFlood ? 'rgba(0,229,255,0.5)' : 'rgba(244,63,94,0.5)'};border-radius:8px;padding:8px;cursor:pointer;">
              <div style="font-weight:700;font-size:11.5px;color:#FFFFFF;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid ${isFlood ? 'fa-water' : 'fa-triangle-exclamation'}" style="color:${isFlood ? '#00e5ff' : '#f43f5e'};"></i>
                ${escapeHtml(h.title)}
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:3px;line-height:1.5;">
                Known failure mode: ${escapeHtml(h.cause)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    dom.infoDrawerContent.querySelectorAll('.hazard-quick-card').forEach((card, idx) => {
      card.addEventListener('click', () => inspectHazardDetails(list[idx]));
    });

    if (list.length > 0) {
      state.map.flyTo(list[0].center, 8, { duration: 1.2 });
    }
  }

  /**
   * Corridor detail: live modelled risk at the corridor, plus an explicit
   * statement that this is a prediction rather than a verified closure.
   */
  async function inspectHazardDetails(hazard) {
    dom.infoDrawer.classList.remove('hidden');
    const isFlood = hazard.type === 'flood';

    dom.infoDrawerContent.innerHTML = `
      <div style="${CARD}">
        <div style="font-weight:800;color:#fff;font-size:13px;margin-bottom:6px;">📍 ${escapeHtml(hazard.title)}</div>
        <div style="font-size:10.5px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Assessing live risk for this corridor…</div>
      </div>`;

    state.map.flyTo(hazard.center, 9, { duration: 1.2 });
    createOrUpdateRedPin(hazard.center[0], hazard.center[1], hazard.title);

    const d = await calculateComprehensiveIntelligence(hazard.center[0], hazard.center[1], hazard.title);

    if (!d.ok) {
      dom.infoDrawerContent.innerHTML = `
        <div style="${CARD}border-color:rgba(251,113,133,0.4);">
          <div style="font-weight:800;color:#fff;font-size:13px;margin-bottom:6px;">📍 ${escapeHtml(hazard.title)}</div>
          <div style="font-size:11px;color:#fda4af;">Live risk unavailable: ${escapeHtml(d.error || '')}</div>
        </div>`;
      return;
    }

    const r = d.report;
    const hz = r.risk?.detail?.hazards || {};
    const relevant = isFlood
      ? [hz.river_flood, hz.flash_flood, hz.urban_flood]
      : [hz.landslide, hz.flash_flood];
    const roadStatus = predictedRoadStatus(relevant.filter(Boolean).map(h => h.code));

    dom.infoDrawerContent.innerHTML = `
      <div style="${CARD}border-color:${roadStatus.color}66;background:${roadStatus.color}14;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:16px;font-weight:900;color:${roadStatus.color};">${roadStatus.emoji} ${escapeHtml(roadStatus.label.toUpperCase())}</span>
          <span style="font-size:9px;font-weight:800;color:#fbbf24;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.4);padding:2px 7px;border-radius:5px;">PREDICTED — NOT VERIFIED</span>
        </div>
        <div style="font-size:10px;color:#e2e8f0;line-height:1.6;">
          This status is a model output for the corridor's location, not a confirmed road condition.
          No NHA / NDMA / Motorway Police closure feed is connected.
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.1);font-size:9.5px;color:#94a3b8;">
          <span><strong style="color:#cbd5e1;">Last Verified:</strong> Not verified (no feed connected)</span>
        </div>
        <div style="font-size:9.5px;color:#94a3b8;margin-top:2px;">
          <strong style="color:#cbd5e1;">Source:</strong> ESS Flood Risk Engine v1.0 (modelled from live rainfall + terrain)
        </div>
      </div>

      <div style="${CARD}">
        <div style="font-weight:800;color:#fff;font-size:13px;margin-bottom:5px;">📍 ${escapeHtml(hazard.title)}</div>
        <div style="font-size:10px;color:#94a3b8;line-height:1.6;margin-bottom:8px;">
          Known failure mode: ${escapeHtml(hazard.cause)}
        </div>
        ${relevant.filter(Boolean).map(h => {
          const s = riskStyle(h.level);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <span style="font-size:11px;color:#e2e8f0;">${escapeHtml(h.label)}</span>
              <span style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}66;font-weight:800;font-size:10px;padding:2px 8px;border-radius:5px;">${escapeHtml(h.level)}</span>
            </div>`;
        }).join('')}
        <div style="font-size:10.5px;color:#cbd5e1;margin-top:8px;line-height:1.6;">
          Rain now <strong>${r.rainfall?.current?.rate_mm_h ?? 0} mm/h</strong> ·
          last 6 h <strong>${fmtMm(r.rainfall?.observed?.['6h']?.mm)}</strong> ·
          next 6 h <strong>${fmtMm(r.rainfall?.forecast?.['6h']?.mm)}</strong>
        </div>
        <div style="display:flex;gap:5px;margin-top:7px;flex-wrap:wrap;">
          ${dataTypeChip('MODELLED')} ${confidenceChip(r.confidence)}
          <span style="font-size:8.5px;color:#94a3b8;">Updated ${fmtPkt(r.timestamp)}</span>
        </div>
      </div>
      ${sectionAdvisory(r)}`;
  }

  async function loadRainviewerFrames() {
    try {
      const res = await fetch(RAINVIEWER_META_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();
      state.rainviewerMeta = meta;

      const past = meta.radar?.past || [];
      const nowcast = meta.radar?.nowcast || [];
      state.radarFrames = [...past, ...nowcast];
      state.pastCount = past.length;
      state.satelliteFrames = meta.satellite?.infrared || [];
      state.currentFrameIndex = past.length > 0 ? past.length - 1 : 0;

      console.log(`[radar] ${state.radarFrames.length} frames (${past.length} past, ${nowcast.length} forecast), host=${meta.host}`);

      buildTimelineUI();
      renderComposite(state.currentFrameIndex);
    } catch (e) {
      console.error('[radar] RainViewer metadata fetch FAILED:', e);
    }
  }

  // --- Composite render: AccuWeather / MSN style soft fluid Doppler contours ---
  function renderComposite(frameIdx) {
    if (!state.rainviewerMeta || !state.radarFrames.length) return;
    const radarFrame = state.radarFrames[frameIdx];
    if (!radarFrame) return;
    const host = state.rainviewerMeta.host;

    updateFrameTimeDisplay(radarFrame);
    renderHazardLayers(state.activeLayer);

    if (state.activeLayer === 'lightning') {
      removeLayerIfPresent(state.cloudTileLayer);
      removeLayerIfPresent(state.radarTileLayer);
      return;
    }

    removeLayerIfPresent(state.cloudTileLayer);
    removeLayerIfPresent(state.radarTileLayer);

    if (state.activeLayer === 'composite' || state.activeLayer === 'radar' || state.activeLayer === 'blockages' || state.activeLayer === 'floods') {
      // 512px tiles + Palette 2 (AccuWeather / MSN / Weather Channel green -> yellow -> red -> purple spectrum)
      const radarUrl = `${host}${radarFrame.path}/512/{z}/{x}/{y}/2/1_1.png`;
      state.radarTileLayer = L.tileLayer(radarUrl, {
        tileSize: 512,
        opacity: 0.95,
        pane: 'radarPane',
        maxNativeZoom: 7,
        minZoom: 4,
        maxZoom: 18,
        updateWhenZooming: false,
        keepBuffer: 3
      });
      state.radarTileLayer.on('tileerror', e => console.error('[radar] tile error:', e.tile?.src));
      state.radarTileLayer.addTo(state.map);
    }
  }

  function removeLayerIfPresent(layer) {
    if (layer && state.map.hasLayer(layer)) state.map.removeLayer(layer);
  }

  function updateFrameTimeDisplay(frame) {
    const d = new Date(frame.time * 1000);
    const pkt = new Date(d.getTime() + 5 * 60 * 60 * 1000);
    const hours = pkt.getUTCHours();
    const mins = pkt.getUTCMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const formattedHours = hours % 12 || 12;
    const isForecast = state.currentFrameIndex >= state.pastCount;
    dom.currentFrameTimePkt.innerHTML = `${formattedHours}:${mins} ${ampm} ${isForecast ? '<span style="font-size:9px;color:#f59e0b;font-weight:800;background:rgba(245,158,11,0.2);padding:1px 4px;border-radius:4px;margin-left:3px;">FORECAST</span>' : ''}`;

    const pct = (state.currentFrameIndex / (state.radarFrames.length - 1)) * 100;
    dom.timelineProgressFill.style.width = `${pct}%`;
  }

  function buildTimelineUI() {
    if (!state.radarFrames.length) return;
    dom.timelineSlider.min = 0;
    dom.timelineSlider.max = state.radarFrames.length - 1;
    dom.timelineSlider.value = state.currentFrameIndex;

    // Position the yellow 'NOW' marker divider between past radar scans and forecast
    if (dom.timelineNowMarker && state.radarFrames.length > 1) {
      const nowIdx = Math.max(0, state.pastCount - 1);
      const nowPct = (nowIdx / (state.radarFrames.length - 1)) * 100;
      dom.timelineNowMarker.style.left = `${nowPct}%`;
    }
  }

  function startLoop() {
    if (state.isPlaying) return;
    state.isPlaying = true;
    dom.playIcon.className = 'fa-solid fa-pause';
    runLoopStep();
  }

  function pauseLoop() {
    state.isPlaying = false;
    dom.playIcon.className = 'fa-solid fa-play';
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
  }

  function toggleLoop() {
    if (state.isPlaying) pauseLoop();
    else startLoop();
  }

  function runLoopStep() {
    if (!state.isPlaying) return;
    const intervalMs = Math.round(650 / state.playbackSpeed);
    state.playTimer = setTimeout(() => {
      state.currentFrameIndex = (state.currentFrameIndex + 1) % state.radarFrames.length;
      dom.timelineSlider.value = state.currentFrameIndex;
      renderComposite(state.currentFrameIndex);
      runLoopStep();
    }, intervalMs);
  }

  function togglePlaybackSpeed() {
    if (state.playbackSpeed === 1) state.playbackSpeed = 2;
    else if (state.playbackSpeed === 2) state.playbackSpeed = 3;
    else state.playbackSpeed = 1;

    if (dom.speedToggleBtn) dom.speedToggleBtn.textContent = `${state.playbackSpeed}x`;
    if (state.isPlaying) {
      pauseLoop();
      startLoop();
    }
  }

  function createOrUpdateRedPin(lat, lon, title) {
    const pinHtml = `
      <div class="wr-draggable-red-pin" title="Drag to inspect location">
        <div class="wr-pin-svg">
          <svg width="28" height="42" viewBox="0 0 28 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="14" y1="18" x2="14" y2="41" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="14" cy="14" r="12" fill="#e11d48"/>
            <circle cx="14" cy="14" r="10" fill="#f43f5e"/>
            <circle cx="11" cy="11" r="3.5" fill="#ffffff" fill-opacity="0.85"/>
          </svg>
        </div>
      </div>
    `;

    const pinIcon = L.divIcon({
      className: 'wr-pin-icon', html: pinHtml, iconSize: [28, 42], iconAnchor: [14, 41], tooltipAnchor: [0, -38]
    });

    if (!state.draggableRedPin) {
      state.draggableRedPin = L.marker([lat, lon], {
        icon: pinIcon, draggable: true, autoPan: true, pane: 'redPinPane', zIndexOffset: 10000
      }).addTo(state.map);

      state.draggableRedPin.on('dragstart', () => {
        state.draggableRedPin.bindTooltip('📍 Moving to location...', { permanent: true, direction: 'top', className: 'radar-tooltip' }).openTooltip();
      });

      state.draggableRedPin.on('dragend', async () => {
        const pos = state.draggableRedPin.getLatLng();
        const locTitle = await resolveLocationName(pos.lat, pos.lng);
        inspectPointWeather(pos.lat, pos.lng, locTitle);
      });
    } else {
      state.draggableRedPin.setLatLng([lat, lon]);
    }

    state.draggableRedPin.bindTooltip(`📍 <strong>${title}</strong><br><span style="font-size:10px;color:#94a3b8;">(Drag to inspect weather)</span>`, {
      direction: 'top', className: 'radar-tooltip'
    });
  }

  async function fetchStationObservations() {
    try {
      const results = await Promise.all(state.stations.map(async (stn) => {
        const url = `https://ess-weather-interpulation.vercel.app/api/v1/weather/pin?lat=${stn.lat}&lon=${stn.lon}`;
        try {
          const res = await fetch(url);
          if (!res.ok) return { current: {} };
          return await res.json();
        } catch (err) {
          return { current: {} };
        }
      }));

      state.stations = state.stations.map((stn, idx) => {
        const cur = results[idx]?.current || {};
        const p = (cur.precipitation ?? 0) + (cur.rain ?? 0) + (cur.showers ?? 0);
        return {
          ...stn,
          temp: Math.round(cur.temperature ?? 30),
          precip: p,
          cloud: cur.cloudCover ?? 0,
          humidity: cur.humidity ?? 60,
          sun: p <= 0.15 && (cur.cloudCover ?? 0) < 50
        };
      });

      renderStationBadges();
    } catch (e) {
      console.warn('Station observation fetch failed:', e);
    }
  }

  function renderStationBadges() {
    if (state.stationMarkersLayer && state.map.hasLayer(state.stationMarkersLayer)) {
      state.map.removeLayer(state.stationMarkersLayer);
    }

    state.stationMarkersLayer = L.layerGroup();

    state.stations.forEach(s => {
      let iconHtml = '';
      let tempClass = '';

      if (s.precip > 0.15) {
        iconHtml = '<i class="fa-solid fa-cloud-showers-heavy" style="color:#00e5ff;font-size:14px;"></i>';
        tempClass = 'rain';
      } else if (s.sun) {
        iconHtml = '<i class="fa-solid fa-sun wr-sun-ico"></i>';
      } else {
        iconHtml = '<i class="fa-solid fa-cloud" style="color:#cbd5e1;font-size:14px;"></i>';
        tempClass = 'cool';
      }

      const html = `
        <div class="wr-city-node">
          <div class="wr-weather-row">
            ${iconHtml}
            <span class="wr-temp-num ${tempClass}">${s.temp}</span>
          </div>
          <span class="wr-city-name">${s.name}</span>
        </div>
      `;

      const icon = L.divIcon({ className: 'wr-city-div-icon', html: html, iconSize: [80, 36], iconAnchor: [40, 18] });
      const m = L.marker([s.lat, s.lon], { icon, pane: 'cityLabelsPane' });
      m.on('click', () => {
        createOrUpdateRedPin(s.lat, s.lon, s.name);
        inspectPointWeather(s.lat, s.lon, s.name);
      });
      state.stationMarkersLayer.addLayer(m);
    });

    state.stationMarkersLayer.addTo(state.map);
  }

  // ==========================================================================
  // ESS WEATHER & FLOOD INTELLIGENCE — DATASETS & CALCULATION ENGINES
  // ==========================================================================

  // 1. High-Risk Urban Chowks & Inundation Hotspots
  const URBAN_CHOWK_HOTSPOTS = [
    { city: 'Rawalpindi', name: 'Committee Chowk Underpass / Murree Road', lat: 33.6080, lon: 73.0640, riskFactor: 1.6, drainType: 'Underpass Depression' },
    { city: 'Rawalpindi', name: 'Liaquat Bagh Chowk / Nullah Lai Basin', lat: 33.6040, lon: 73.0680, riskFactor: 1.7, drainType: 'Riverine Basin' },
    { city: 'Islamabad', name: 'Korang Road Underpass (I-8 / H-8)', lat: 33.6720, lon: 73.0750, riskFactor: 1.3, drainType: 'Drainage Low-Point' },
    { city: 'Islamabad', name: 'Faizabad Interchange Low Loops', lat: 33.6630, lon: 73.0850, riskFactor: 1.3, drainType: 'Interchange Dip' },
    { city: 'Lahore', name: 'Lakshmi Chowk / McLeod Road', lat: 31.5640, lon: 74.3220, riskFactor: 1.7, drainType: 'Natural Low-lying Bowl' },
    { city: 'Lahore', name: 'Kalma Chowk Underpass (Ferozepur Rd)', lat: 31.5060, lon: 74.3310, riskFactor: 1.5, drainType: 'Underpass Sump' },
    { city: 'Lahore', name: 'Bhatti Gate / Circular Road Chowk', lat: 31.5870, lon: 74.3100, riskFactor: 1.4, drainType: 'Old City Basin' },
    { city: 'Karachi', name: 'Nagan Chowrangi / North Nazimabad', lat: 24.9600, lon: 67.0650, riskFactor: 1.7, drainType: 'Gujjar Nullah Inundation' },
    { city: 'Karachi', name: 'KDA Chowrangi (Nazimabad)', lat: 24.9350, lon: 67.0420, riskFactor: 1.4, drainType: 'Arterial Low-point' },
    { city: 'Karachi', name: 'Subhanullah Chowk (Surjani Town Sec 4)', lat: 25.0250, lon: 67.0700, riskFactor: 1.8, drainType: 'Thaddo Dam Overflow' },
    { city: 'Peshawar', name: 'Karkhano Market Chowk (Jamrud Rd)', lat: 33.9980, lon: 71.4350, riskFactor: 1.5, drainType: 'Hill Torrent Channel' },
    { city: 'Multan', name: 'Chowk Ghanta Ghar (Old City)', lat: 30.1980, lon: 71.4720, riskFactor: 1.3, drainType: 'Urban Center' },
    { city: 'Gujranwala', name: 'Gondlanwala Chowk (GT Road)', lat: 32.1550, lon: 74.1950, riskFactor: 1.4, drainType: 'Highway Intersection' },
    { city: 'Quetta', name: 'Meezan Chowk (Liaquat Bazaar)', lat: 30.1920, lon: 67.0120, riskFactor: 1.5, drainType: 'Mountain Runoff' }
  ];

  // 2. Official River Gauging & Barrage Stations
  // 2. Reference river gauging & barrage LOCATIONS.
  //    Names and coordinates are real places. Deliberately no stage, inflow,
  //    outflow, discharge or hydrograph values are stored here: those are gauge
  //    observations that require Pakistan FFD / WAPDA telemetry, which has no
  //    public API. Showing an unmeasured river level in a public-safety product
  //    is worse than showing none, so the UI reports the feed as not connected.
  const RIVER_GAUGE_STATIONS = [
    { river: 'Indus River', station: 'Tarbela', lat: 34.0883, lon: 72.6983 },
    { river: 'Indus River', station: 'Kalabagh', lat: 32.9611, lon: 71.5478 },
    { river: 'Indus River', station: 'Chashma', lat: 32.4333, lon: 71.3667 },
    { river: 'Indus River', station: 'Taunsa', lat: 30.7042, lon: 70.8319 },
    { river: 'Indus River', station: 'Guddu', lat: 28.4239, lon: 69.7047 },
    { river: 'Indus River', station: 'Sukkur', lat: 27.7011, lon: 68.8572 },
    { river: 'Indus River', station: 'Kotri', lat: 25.3711, lon: 68.3147 },
    { river: 'Jhelum River', station: 'Mangla Dam', lat: 33.1484, lon: 73.6500 },
    { river: 'Jhelum River', station: 'Rasul Barrage', lat: 32.7000, lon: 73.5333 },
    { river: 'Chenab River', station: 'Marala Headworks', lat: 32.6711, lon: 74.4697 },
    { river: 'Chenab River', station: 'Khanki Headworks', lat: 32.4042, lon: 73.9722 },
    { river: 'Chenab River', station: 'Qadirabad', lat: 32.3167, lon: 73.6833 },
    { river: 'Ravi River', station: 'Shahdara (Lahore)', lat: 31.6211, lon: 74.2889 },
    { river: 'Kabul River', station: 'Nowshera', lat: 34.0150, lon: 71.9750 },
    { river: 'Swat River', station: 'Chakdara', lat: 34.6469, lon: 72.0300 },
    { river: 'Nullah Lai', station: 'Kattarian Bridge (Rawalpindi)', lat: 33.6420, lon: 73.0540 }
  ];

  // 3. Major dams & reservoirs — locations only, for the same reason.
  //    Level, storage percentage and trend require WAPDA / IRSA data access.
  const DAM_RESERVOIRS = [
    { name: 'Tarbela Dam', river: 'Indus River', lat: 34.0883, lon: 72.6983 },
    { name: 'Mangla Dam', river: 'Jhelum River', lat: 33.1484, lon: 73.6500 },
    { name: 'Chashma Barrage', river: 'Indus River', lat: 32.4333, lon: 71.3667 },
    { name: 'Warsak Dam', river: 'Kabul River', lat: 34.1689, lon: 71.3533 }
  ];

  // Catchment wetness, runoff potential and terrain are no longer hard-coded:
  // they are measured per location by the ESS backend from live soil moisture,
  // observed rainfall and the Copernicus DEM. See /api/v1/location.

  // Population, settlement, road-length and cropland exposure figures are NOT
  // defined here. They require WorldPop/PBS census grids, OSM extracts and crop
  // maps (spec §15, §16); until those are connected the IMPACT mode states that
  // the datasets are pending rather than presenting estimated numbers.

  // --- Decision intelligence for one point (computed server-side) ---
  //
  // Delegates to the ESS backend so the hazard models, thresholds and advisory
  // rules have exactly one implementation, shared by the map, the drawer and any
  // future client. Returns the full API report plus the few flat fields the map
  // tooltip already depends on.
  async function calculateComprehensiveIntelligence(lat, lon, title) {
    try {
      const report = await ESS_API.location(lat, lon, title);
      state.lastReport = report;

      const overall = report.risk?.detail?.overall || {};
      const peak = report.rainfall?.peak_window;

      // River (GloFAS), exposure (WorldPop/OSM) and the 20-year historical
      // comparison are real but slow upstream calls — fetch them in the
      // background and merge in without blocking the report already on screen.
      fetchLocationEnrichment(lat, lon, report.rainfall?.observed?.['24h']?.mm ?? 0);

      return {
        ok: true,
        report,
        title: report.location?.label || title,
        lat,
        lon,
        currentRate: report.rainfall?.current?.rate_mm_h ?? 0,
        accum24h: report.rainfall?.observed?.['24h']?.mm ?? 0,
        overallRisk: overall.level || 'UNKNOWN',
        riskClassColor: overall.color || riskStyle(overall.level).color,
        impactWindow: peak ? peak.label.toUpperCase() : 'NO SIGNIFICANT RAINFALL WINDOW'
      };
    } catch (err) {
      // A failed analytics call must read as unavailable, never as "all clear".
      console.error('[ess] location report failed:', err);
      state.lastReport = null;
      return {
        ok: false,
        error: err.message || 'Analytics service unavailable',
        title,
        lat,
        lon,
        currentRate: 0,
        accum24h: 0,
        overallRisk: 'UNKNOWN',
        riskClassColor: '#64748b',
        impactWindow: '—'
      };
    }
  }

  // Guards against a slow enrichment response from a PREVIOUS location
  // overwriting the report for whatever the user has since clicked on.
  let enrichmentRequestSeq = 0;

  async function fetchLocationEnrichment(lat, lon, current24hMm) {
    const seq = ++enrichmentRequestSeq;
    try {
      const enrichment = await ESS_API.locationEnrichment(lat, lon, current24hMm);
      if (seq !== enrichmentRequestSeq || !state.lastReport) return; // superseded or user moved on

      state.lastReport = {
        ...state.lastReport,
        river: enrichment.river,
        exposure: enrichment.exposure,
        historical_comparison: enrichment.historical_comparison
      };
      state.lastReport.source = [...state.lastReport.source, ...enrichment.source];

      if (!dom.infoDrawer.classList.contains('hidden')) {
        renderIntelligenceDashboard({ ok: true, report: state.lastReport });
      }
    } catch (err) {
      console.warn('[ess] enrichment (river/exposure) unavailable:', err.message);
    }
  }

  // ==========================================================================
  // DECISION INTELLIGENCE DASHBOARD
  //
  // Renders the analytics returned by /api/v1. The panel is mode-aware (spec §3):
  // the same map and the same underlying report, with the section relevant to the
  // selected mode brought to the front.
  //
  // Every figure carries its provenance chip (spec §23) and every card carries
  // an updated time, source and confidence (spec §22).
  // ==========================================================================

  const CARD = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 11px;margin-bottom:9px;';
  const H = 'font-weight:800;color:#f8fafc;font-size:11.5px;letter-spacing:0.3px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;';

  function renderIntelligenceDashboard(d) {
    if (!d || !d.ok) {
      dom.infoDrawerContent.innerHTML = `
        <div style="${CARD}border-color:rgba(251,113,133,0.4);">
          <div style="${H}"><span>⚠️ Analytics unavailable</span></div>
          <div style="font-size:11px;color:#fda4af;line-height:1.5;">
            ${escapeHtml(d?.error || 'The ESS analytics service could not be reached.')}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:6px;line-height:1.5;">
            No rainfall, flood-risk or advisory information is shown while the service is
            unreachable. This is deliberate — stale or assumed values are not displayed.
          </div>
        </div>`;
      return;
    }

    const r = d.report;
    const mode = state.activeMode;

    const body = [
      sectionHeader(r),
      mode === 'weather' ? sectionWeather(r) : '',
      (mode === 'weather' || mode === 'rainfall') ? sectionRainfall(r) : '',
      mode === 'rainfall' ? sectionImpactWindows(r) : '',
      mode === 'rainfall' ? sectionHistoricalComparison(r) : '',
      (mode === 'flood' || mode === 'advisory') ? sectionHazards(r) : '',
      mode === 'flood' ? sectionCatchment(r) : '',
      mode === 'flood' ? sectionRiverReservoir(r) : '',
      mode === 'impact' ? sectionImpact(r) : '',
      (mode === 'advisory' || mode === 'flood') ? sectionAdvisory(r) : '',
      sectionNational(),
      sectionSources(r)
    ].filter(Boolean).join('');

    dom.infoDrawerContent.innerHTML = body;
  }

  /* ------------------------------------------------------------ header ---- */
  function sectionHeader(r) {
    const o = r.risk?.detail?.overall || {};
    const s = riskStyle(o.level);
    const loc = r.location || {};
    const ref = loc.reference_district;

    return `
      <div style="${CARD}border-color:${s.color}55;background:linear-gradient(135deg,${s.color}22,rgba(255,255,255,0.04));">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div style="min-width:0;">
            <div style="font-weight:800;color:#fff;font-size:13.5px;line-height:1.3;word-break:break-word;">
              📍 ${escapeHtml(loc.label || 'Selected location')}
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:3px;">
              ${loc.latitude?.toFixed(3)}°, ${loc.longitude?.toFixed(3)}°
              ${loc.elevation_m != null ? ` · ${loc.elevation_m} m` : ''}
              ${loc.terrain_class && loc.terrain_class !== 'UNKNOWN' ? ` · ${escapeHtml(loc.terrain_class.replace(/_/g, ' ').toLowerCase())}` : ''}
              ${loc.slope_deg != null ? ` · ${loc.slope_deg}° gradient` : ''}
            </div>
            ${ref ? `<div style="font-size:9.5px;color:#64748b;margin-top:2px;">
              ${escapeHtml(ref.name)}, ${escapeHtml(ref.province)} · ${escapeHtml(ref.basin || '')} basin
              ${ref.match_type === 'NEAREST_REFERENCE_POINT' ? ` · nearest reference ${ref.distance_km} km` : ''}
            </div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="background:${s.color};color:#0b1120;font-weight:900;font-size:12px;padding:4px 9px;border-radius:6px;white-space:nowrap;">
              ${s.emoji} ${escapeHtml(o.level_label || 'Unknown')}
            </div>
            <div style="font-size:9px;color:#cbd5e1;margin-top:4px;">Overall risk</div>
          </div>
        </div>
        ${o.primary_hazard_label ? `
          <div style="font-size:10.5px;color:#e2e8f0;margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.1);">
            Primary hazard: <strong style="color:${s.color};">${escapeHtml(o.primary_hazard_label)}</strong>
            ${o.compounding ? ` · <span style="color:#fbbf24;">multiple hazards elevated</span>` : ''}
          </div>` : ''}
        <div style="display:flex;gap:5px;margin-top:7px;flex-wrap:wrap;">
          ${dataTypeChip('MODELLED')} ${confidenceChip(r.confidence)}
          <span style="font-size:8.5px;color:#94a3b8;padding:1.5px 0;">Updated ${fmtPkt(r.timestamp)}</span>
        </div>
      </div>`;
  }

  /* ----------------------------------------------------------- weather ---- */
  function sectionWeather(r) {
    const w = r.weather;
    if (!w) return '';
    const tile = (label, value) => `
      <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:6px 7px;">
        <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
        <div style="font-size:13px;font-weight:800;color:#fff;font-family:var(--font-mono,monospace);">${value}</div>
      </div>`;

    return `
      <div style="${CARD}">
        <div style="${H}"><span>🌤️ Current conditions</span>${dataTypeChip('OBSERVED')}</div>
        <div style="font-size:11.5px;color:#e2e8f0;margin-bottom:8px;">${escapeHtml(w.condition)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:6px;">
          ${tile('Temp', w.temperature_c != null ? `${w.temperature_c}°C` : '—')}
          ${tile('Humidity', w.humidity_pct != null ? `${w.humidity_pct}%` : '—')}
          ${tile('Wind', w.wind_speed_kmh != null ? `${Math.round(w.wind_speed_kmh)} km/h` : '—')}
          ${tile('Cloud', w.cloud_cover_pct != null ? `${w.cloud_cover_pct}%` : '—')}
        </div>
        <div style="font-size:9px;color:#64748b;margin-top:6px;">Observed ${fmtPkt(w.observed_at)}</div>
      </div>`;
  }

  /* ---------------------------------------------------------- rainfall ---- */
  function sectionRainfall(r) {
    const rf = r.rainfall;
    if (!rf) return '';

    const CLASS_COLOR = {
      NORMAL: '#22c55e', MODERATE: '#eab308', HEAVY: '#f59e0b',
      VERY_HEAVY: '#f97316', EXTREME: '#ef4444'
    };
    const cell = (label, obj, type) => {
      const cls = obj?.class || 'NORMAL';
      const col = CLASS_COLOR[cls] || '#94a3b8';
      return `
        <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:6px 7px;border-left:2.5px solid ${col};">
          <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.3px;">${label}</div>
          <div style="font-size:13px;font-weight:800;color:#fff;font-family:var(--font-mono,monospace);">${fmtMm(obj?.mm)}</div>
          <div style="font-size:8px;color:${col};font-weight:700;">${cls.replace(/_/g, ' ')}</div>
        </div>`;
    };

    const t = rf.trend || {};
    const trendColor = t.direction === 'RISING' ? '#f97316' : t.direction === 'FALLING' ? '#38bdf8' : '#94a3b8';

    return `
      <div style="${CARD}">
        <div style="${H}"><span>🌧️ Rainfall analytics</span>${dataTypeChip('OBSERVED')}</div>

        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(56,189,248,0.1);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
          <div>
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Current rain</div>
            <div style="font-size:19px;font-weight:900;color:#38bdf8;font-family:var(--font-mono,monospace);line-height:1.1;">
              ${rf.current?.rate_mm_h != null ? rf.current.rate_mm_h.toFixed(1) : '0.0'} <span style="font-size:11px;">mm/h</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Trend</div>
            <div style="font-size:13px;font-weight:800;color:${trendColor};">${t.symbol || ''} ${escapeHtml(t.label || '—')}</div>
            <div style="font-size:8.5px;color:#64748b;">next 6 h vs last 6 h</div>
          </div>
        </div>

        <div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">
          OBSERVED ACCUMULATION ${dataTypeChip('OBSERVED')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(74px,1fr));gap:6px;margin-bottom:9px;">
          ${cell('1 hour', rf.observed?.['1h'])}
          ${cell('3 hours', rf.observed?.['3h'])}
          ${cell('6 hours', rf.observed?.['6h'])}
          ${cell('12 hours', rf.observed?.['12h'])}
          ${cell('24 hours', rf.observed?.['24h'])}
          ${cell('72 hours', rf.observed?.['72h'])}
        </div>

        <div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">
          FORECAST ACCUMULATION ${dataTypeChip('FORECAST')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(74px,1fr));gap:6px;">
          ${cell('Next 3 h', rf.forecast?.['3h'])}
          ${cell('Next 6 h', rf.forecast?.['6h'])}
          ${cell('Next 12 h', rf.forecast?.['12h'])}
          ${cell('Next 24 h', rf.forecast?.['24h'])}
          ${cell('Next 48 h', rf.forecast?.['48h'])}
        </div>
        <div style="font-size:8.5px;color:#475569;margin-top:8px;">Updated ${fmtPkt(r.timestamp)}</div>
      </div>

      ${rf.hourly_timeline?.length ? `
      <div style="${CARD}">
        <div style="${H}"><span>📈 Rainfall over time</span>${dataTypeChip('OBSERVED')}</div>
        <div style="font-size:9px;color:#64748b;margin-bottom:4px;">Hourly rainfall, last 72h through next 48h</div>
        ${renderRainfallTimelineSvg(rf.hourly_timeline, new Date(r.timestamp).getTime())}
      </div>` : ''}`;
  }

  /* ---------------------------------------------------- impact windows ---- */
  function sectionImpactWindows(r) {
    const windows = r.rainfall?.impact_windows || [];
    if (!windows.length) {
      return `
        <div style="${CARD}">
          <div style="${H}"><span>⏱️ Expected impact window</span>${dataTypeChip('FORECAST')}</div>
          <div style="font-size:10.5px;color:#94a3b8;line-height:1.5;">
            No forecast window currently carries enough rainfall to name an impact period.
            Nothing is shown rather than inventing a timing.
          </div>
        </div>`;
    }

    return `
      <div style="${CARD}">
        <div style="${H}"><span>⏱️ Expected impact windows</span>${dataTypeChip('FORECAST')}</div>
        ${windows.map(w => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:11px;color:#e2e8f0;">${escapeHtml(w.label)}</span>
            <strong style="font-size:11.5px;color:#38bdf8;font-family:var(--font-mono,monospace);">${fmtMm(w.rainfall_mm)}</strong>
          </div>`).join('')}
        <div style="font-size:8.5px;color:#475569;margin-top:6px;">Updated ${fmtPkt(r.timestamp)}</div>
      </div>`;
  }

  /* ------------------------------------------------ historical comparison -- */
  function sectionHistoricalComparison(r) {
    const h = r.historical_comparison;
    if (!h) return '';

    if (h.status === 'FETCH_SEPARATELY') {
      return `
        <div style="${CARD}">
          <div style="${H}"><span>📊 Compare with previous events</span>${dataTypeChip('PENDING')}</div>
          <div style="font-size:10.5px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Comparing against 20 years of historical rainfall (ERA5)…</div>
        </div>`;
    }

    if (!h.available) {
      return `
        <div style="${CARD}border-color:rgba(251,191,36,0.35);">
          <div style="${H}"><span>📊 Compare with previous events</span>${dataTypeChip('PENDING')}</div>
          <div style="font-size:10px;color:#94a3b8;">Historical comparison unavailable: ${escapeHtml(h.reason || '')}</div>
        </div>`;
    }

    const pctColor = h.percentile >= 95 ? '#ef4444' : h.percentile >= 80 ? '#f97316' : h.percentile >= 50 ? '#eab308' : '#22c55e';
    const pctText =
      h.percentile >= 98 ? `highest ${(100 - h.percentile).toFixed(1)}%` :
      h.percentile >= 90 ? `top ${(100 - h.percentile).toFixed(0)}%` :
      `${h.percentile}th percentile`;

    return `
      <div style="${CARD}">
        <div style="${H}"><span>📊 Compare with previous events</span>${dataTypeChip('OBSERVED')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px;">
          <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;">
            <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">Today's 24h rainfall</div>
            <div style="font-size:14px;font-weight:800;color:#fff;">${fmtMm(h.current_24h_mm)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;">
            <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">Seasonal average</div>
            <div style="font-size:14px;font-weight:800;color:#94a3b8;">${fmtMm(h.historical_average_mm)}</div>
          </div>
        </div>
        <div style="background:${pctColor}18;border:1px solid ${pctColor}55;border-radius:7px;padding:8px 9px;margin-bottom:7px;">
          <div style="font-size:11px;color:${pctColor};font-weight:800;">
            Within the ${pctText} of ${h.sample_size_days} comparable days
          </div>
          <div style="font-size:9px;color:#94a3b8;margin-top:2px;">
            vs. the same ${h.seasonal_window_days}-day seasonal window across ${h.record_span}
          </div>
        </div>
        <div style="font-size:9.5px;color:#cbd5e1;">
          Previous major event in this window: <strong style="color:#fff;">${fmtMm(h.previous_major_event.mm)}</strong>
          on ${escapeHtml(h.previous_major_event.date)}
        </div>
        <div style="font-size:8.5px;color:#475569;margin-top:6px;line-height:1.5;">${escapeHtml(h.note)}</div>
      </div>`;
  }

  /* ----------------------------------------------------------- hazards ---- */
  function sectionHazards(r) {
    const hz = r.risk?.detail?.hazards;
    if (!hz) return '';
    const order = ['urban_flood', 'flash_flood', 'river_flood', 'landslide'];

    const row = key => {
      const h = hz[key];
      if (!h) return '';
      const s = riskStyle(h.level);
      const drivers = (h.drivers || []).map(dr => `${escapeHtml(dr.label)} ${dr.share}%`).join(' · ');
      return `
        <div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:11.5px;color:#f1f5f9;font-weight:600;">${escapeHtml(h.label)}</span>
            <span style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}66;font-weight:800;font-size:10px;padding:2px 8px;border-radius:5px;white-space:nowrap;">
              ${escapeHtml(h.level || 'UNKNOWN')}
            </span>
          </div>
          ${drivers ? `<div style="font-size:9px;color:#64748b;margin-top:3px;">Driven by: ${drivers}</div>` : ''}
          <div style="font-size:8.5px;color:#475569;margin-top:2px;">Confidence: ${escapeHtml(h.confidence || 'LOW')}</div>
        </div>`;
    };

    return `
      <div style="${CARD}">
        <div style="${H}"><span>🌊 Flood & landslide hazards</span>${dataTypeChip('MODELLED')}</div>
        <div style="font-size:9.5px;color:#94a3b8;margin-bottom:4px;line-height:1.5;">
          Four hazards scored independently by separate weighted models — not one blended score.
        </div>
        ${order.map(row).join('')}
        <div style="font-size:8.5px;color:#475569;margin-top:7px;line-height:1.5;">
          Categorical only. No flood probability is shown because the model is not yet
          calibrated against observed events.
        </div>
      </div>`;
  }

  /* --------------------------------------------------------- catchment ---- */
  function sectionCatchment(r) {
    const c = r.catchment;
    if (!c) return '';
    const WET_COLOR = {
      DRY: '#a3a3a3', NORMAL: '#22c55e', WET: '#38bdf8',
      VERY_WET: '#f59e0b', SATURATED: '#ef4444'
    };
    const RUNOFF_COLOR = { LOW: '#22c55e', MODERATE: '#eab308', HIGH: '#f97316', VERY_HIGH: '#ef4444' };
    const wc = WET_COLOR[c.wetness_class] || '#94a3b8';
    const rc = RUNOFF_COLOR[c.runoff_risk] || '#94a3b8';
    const w = c.wetness_detail || {};
    const d = c.delineation;

    return `
      <div style="${CARD}">
        <div style="${H}"><span>🗺️ Catchment</span>${dataTypeChip(d?.available ? 'OBSERVED' : 'PENDING')}</div>
        ${d?.available ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:2px;">
            <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;">
              <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">This sub-basin</div>
              <div style="font-size:13px;font-weight:800;color:#38bdf8;">${d.sub_area_km2?.toLocaleString()} km²</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;">
              <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">Total upstream area</div>
              <div style="font-size:13px;font-weight:800;color:#38bdf8;">${d.upstream_area_km2?.toLocaleString()} km²</div>
            </div>
          </div>
          <div style="font-size:9px;color:#64748b;margin-top:4px;">
            HYBAS ${d.hybas_id} · flows through ${d.downstream_flow_path.length} basin${d.downstream_flow_path.length === 1 ? '' : 's'} downstream
            ${d.outlet ? ' · terminal (coastal/endorheic sink)' : ''} · ${escapeHtml(d.source)}
          </div>` : `
          <div style="font-size:10.5px;color:#94a3b8;line-height:1.6;">${escapeHtml(d?.reason || 'Catchment data unavailable for this point.')}</div>`}
      </div>

      <div style="${CARD}">
        <div style="${H}"><span>💧 Antecedent wetness & runoff</span>${dataTypeChip('MODELLED')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px;">
          <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;border-left:2.5px solid ${wc};">
            <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">Ground wetness</div>
            <div style="font-size:13px;font-weight:800;color:${wc};">${escapeHtml((c.wetness_class || '—').replace(/_/g, ' '))}</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;border-left:2.5px solid ${rc};">
            <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">Runoff potential</div>
            <div style="font-size:13px;font-weight:800;color:${rc};">${escapeHtml((c.runoff_risk || '—').replace(/_/g, ' '))}</div>
          </div>
        </div>
        <div style="font-size:9.5px;color:#94a3b8;line-height:1.6;">
          ${w.soil_moisture_m3m3 != null
            ? `Soil moisture ${w.soil_moisture_m3m3} m³/m³ · `
            : 'Soil moisture unavailable for this point · '}
          prior 72 h rainfall ${fmtMm(w.prior_rainfall_72h_mm)}
        </div>
        <div style="font-size:8.5px;color:#475569;margin-top:5px;line-height:1.5;">
          Point-scale wetness — describes this pixel, not yet averaged across the whole
          upstream catchment shown above.
        </div>
        <div style="font-size:8.5px;color:#475569;margin-top:6px;">Updated ${fmtPkt(r.timestamp)}</div>
      </div>`;
  }

  /* ------------------------------------------------- river / reservoir ---- */
  function sectionRiverReservoir(r) {
    return riverCard(r.river) + pendingCard('🏞️ Reservoir situation', r.reservoir);
  }

  function riverCard(river) {
    if (!river) return '';

    if (river.status === 'FETCH_SEPARATELY') {
      return `
        <div style="${CARD}">
          <div style="${H}"><span>🌊 River intelligence</span>${dataTypeChip('PENDING')}</div>
          <div style="font-size:10.5px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Checking Copernicus GloFAS for active discharge alerts…</div>
        </div>`;
    }

    if (river.status === 'UNAVAILABLE') {
      return `
        <div style="${CARD}border-color:rgba(251,191,36,0.35);">
          <div style="${H}"><span>🌊 River intelligence</span>${dataTypeChip('PENDING')}</div>
          <div style="font-size:10px;color:#94a3b8;line-height:1.6;">GloFAS could not be reached: ${escapeHtml(river.reason || '')}</div>
        </div>`;
    }

    const isAlert = river.status === 'ACTIVE_ALERT';
    return `
      <div style="${CARD}${isAlert ? 'border-color:rgba(249,115,22,0.5);background:rgba(249,115,22,0.08);' : ''}">
        <div style="${H}"><span>🌊 River intelligence</span>${dataTypeChip('OBSERVED')}</div>
        ${isAlert ? `
          <div style="font-size:11px;color:#fb923c;font-weight:800;margin-bottom:5px;">⚠️ Active GloFAS discharge alert nearby</div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.7;">
            ${Object.entries(river.raw || {}).map(([k, v]) => `<strong style="color:#cbd5e1;">${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join(' &nbsp;·&nbsp; ')}
          </div>` : `
          <div style="font-size:10.5px;color:#94a3b8;line-height:1.6;">${escapeHtml(river.note || 'No active alert.')}</div>`}
        <div style="font-size:8.5px;color:#475569;margin-top:7px;line-height:1.5;">
          Source: Copernicus GloFAS — a global hydrological model, not an official Pakistan FFD/WAPDA
          gauge reading. It only surfaces a value when it has an active return-period exceedance alert;
          silence means no current alert, not "no river."
        </div>
        <div style="font-size:8px;color:#475569;margin-top:3px;">Checked ${fmtPkt(river.checked_at)}</div>
      </div>`;
  }

  function sectionImpact(r) {
    return `
      ${exposureCard(r.exposure, r.timestamp)}
      ${pendingCard('🛰️ Satellite-observed flood extent', r.satellite_flood)}`;
  }

  function exposureCard(exposure, reportTimestamp) {
    if (!exposure) return '';

    if (exposure.status === 'FETCH_SEPARATELY') {
      return `
        <div style="${CARD}">
          <div style="${H}"><span>👥 Impact & exposure</span>${dataTypeChip('PENDING')}</div>
          <div style="font-size:10.5px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Querying live population (WorldPop) and road network (OpenStreetMap)…</div>
        </div>`;
    }

    const pop = exposure.population;
    const roads = exposure.roads;

    const tile = (label, value, ok) => `
      <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;${ok ? '' : 'opacity:0.55;'}">
        <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;">${label}</div>
        <div style="font-size:14px;font-weight:800;color:${ok ? '#fff' : '#64748b'};">${value}</div>
      </div>`;

    return `
      <div style="${CARD}">
        <div style="${H}"><span>👥 Population & road exposure</span>${dataTypeChip(pop?.available || roads?.available ? 'OBSERVED' : 'PENDING')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px;">
          ${tile('Population nearby', pop?.available ? pop.population.toLocaleString() : '—', pop?.available)}
          ${tile('Road network', roads?.available ? `${roads.total_road_km} km` : '—', roads?.available)}
        </div>
        ${pop?.available ? `<div style="font-size:9px;color:#64748b;line-height:1.6;">${escapeHtml(pop.note)}</div>` : ''}
        ${roads?.available ? `<div style="font-size:9px;color:#64748b;line-height:1.6;margin-top:3px;">${escapeHtml(roads.note)}</div>` : ''}
        ${!pop?.available && pop?.reason ? `<div style="font-size:9.5px;color:#94a3b8;">Population unavailable: ${escapeHtml(pop.reason)}</div>` : ''}
        ${!roads?.available && roads?.reason ? `<div style="font-size:9.5px;color:#94a3b8;">Roads unavailable: ${escapeHtml(roads.reason)}</div>` : ''}
        <div style="font-size:8.5px;color:#475569;margin-top:6px;">Updated ${fmtPkt(reportTimestamp)}</div>
      </div>

      <div style="${CARD}border-style:dashed;border-color:rgba(148,163,184,0.35);">
        <div style="${H}"><span>🌾 Settlements, facilities & crop-type exposure</span>${dataTypeChip('PENDING')}</div>
        <div style="font-size:10px;color:#cbd5e1;line-height:1.6;">
          ${escapeHtml(exposure.settlements?.reason || '')} No settlement, school or health-facility
          registry, and no crop-TYPE map, is connected — so counts for those are not shown.
        </div>
      </div>`;
  }

  function pendingCard(title, block) {
    if (!block) return '';
    return `
      <div style="${CARD}border-style:dashed;border-color:rgba(148,163,184,0.35);">
        <div style="${H}"><span>${title}</span>${dataTypeChip('PENDING')}</div>
        <div style="font-size:10.5px;color:#cbd5e1;line-height:1.6;">${escapeHtml(block.note || '')}</div>
        ${Array.isArray(block.required_sources) && block.required_sources.length ? `
          <div style="font-size:9px;color:#64748b;margin-top:6px;line-height:1.6;">
            <strong style="color:#94a3b8;">Requires:</strong> ${block.required_sources.map(escapeHtml).join(' · ')}
          </div>` : ''}
      </div>`;
  }

  /* ---------------------------------------------------------- advisory ---- */
  function sectionAdvisory(r) {
    const list = r.advisory || [];
    if (!list.length) return '';

    const SEV = {
      CRITICAL: '#ef4444', HIGH: '#f97316', MODERATE: '#eab308', INFO: '#22c55e'
    };

    return `
      <div style="${CARD}">
        <div style="${H}"><span>🛡️ What should I do?</span>${dataTypeChip('MODELLED')}</div>
        ${list.map(a => {
          const col = SEV[a.severity] || '#94a3b8';
          return `
            <div style="border-left:3px solid ${col};background:rgba(255,255,255,0.04);border-radius:0 7px 7px 0;padding:7px 9px;margin-bottom:7px;">
              <div style="font-size:10.5px;font-weight:800;color:${col};margin-bottom:3px;">${escapeHtml(a.title)}</div>
              <div style="font-size:11px;color:#e2e8f0;line-height:1.55;">${escapeHtml(a.text_en)}</div>
              <div dir="rtl" lang="ur" style="font-size:11.5px;color:#cbd5e1;line-height:1.9;margin-top:5px;">${escapeHtml(a.text_ur)}</div>
              <div style="font-size:8px;color:#475569;margin-top:4px;">Rule: ${escapeHtml(a.id)} · ${escapeHtml(a.basis)}</div>
            </div>`;
        }).join('')}
        <div style="font-size:8.5px;color:#475569;line-height:1.5;">
          Generated by deterministic rules over the analytics above — no language model decides
          whether an area is safe.
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------- national ---- */
  function sectionNational() {
    const n = state.national;
    if (!n) return '';
    const c = n.counts || {};
    const nx = n.next_24_hours || {};
    const offsetHours = state.selectedOffsetHours;

    const kpi = (label, value, color) => `
      <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:6px 7px;text-align:center;">
        <div style="font-size:17px;font-weight:900;color:${color};font-family:var(--font-mono,monospace);line-height:1.1;">${value}</div>
        <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.3px;margin-top:2px;line-height:1.25;">${label}</div>
      </div>`;

    let timelineBanner = '';
    let effectiveHigh = c.high_risk_zones;
    let effectiveWatch = c.watch_areas;

    if (offsetHours !== 0) {
      const off = state.nationalTimeline?.offsets?.find(o => o.hours === offsetHours);
      if (off) {
        effectiveHigh = off.counts.high_risk_zones;
        effectiveWatch = off.counts.watch_areas;
        timelineBanner = `
          <div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.4);border-radius:7px;padding:7px 9px;margin-bottom:8px;">
            <div style="font-size:10px;font-weight:800;color:#fbbf24;">
              ⏱️ Showing PREDICTED risk at ${escapeHtml(off.label)} — ${fmtPkt(off.timestamp)} (${escapeHtml(off.data_type)})
            </div>
            <div style="font-size:9px;color:#fde68a;margin-top:2px;">Not current conditions. Independently computed from real ${off.hours < 0 ? 'observed history' : 'forecast rainfall'}, not interpolated.</div>
          </div>`;
      }
    }

    return `
      <div style="${CARD}">
        <div style="${H}"><span>🇵🇰 Pakistan situation</span>${dataTypeChip('MODELLED')}</div>
        ${timelineBanner}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(68px,1fr));gap:6px;margin-bottom:8px;">
          ${kpi('High-risk zones', effectiveHigh ?? '—', '#f97316')}
          ${kpi('Watch areas', effectiveWatch ?? '—', '#eab308')}
          ${kpi('Heavy-rain districts', c.heavy_rain_districts ?? '—', '#38bdf8')}
          ${kpi('Landslide watch', c.landslide_watch_districts ?? '—', '#c084fc')}
          ${kpi('River flood watch', c.river_flood_watch_districts ?? '—', '#22d3ee')}
        </div>
        <div style="background:rgba(56,189,248,0.08);border-radius:7px;padding:8px 9px;">
          <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Next 24 hours</div>
          <div style="font-size:11px;color:#e2e8f0;line-height:1.55;">${escapeHtml(nx.primary_concern || '—')}</div>
          ${nx.highest_risk_window ? `<div style="font-size:9.5px;color:#94a3b8;margin-top:5px;">
            Highest-risk window: <strong style="color:#38bdf8;">${escapeHtml(nx.highest_risk_window.label)}</strong>
            (${nx.highest_risk_window.districts} district${nx.highest_risk_window.districts === 1 ? '' : 's'})</div>` : ''}
          ${nx.most_affected_region ? `<div style="font-size:9.5px;color:#94a3b8;margin-top:2px;">
            Most affected region: <strong style="color:#f8fafc;">${escapeHtml(nx.most_affected_region)}</strong></div>` : ''}
        </div>
        <div style="font-size:8.5px;color:#475569;margin-top:6px;line-height:1.5;">
          Computed live across ${c.districts_assessed ?? 0} reference districts · updated ${fmtPkt(n.timestamp)}.
          "Rivers rising" is not counted here — that needs gauge observations, not rainfall analytics.
        </div>
      </div>`;
  }

  /* ----------------------------------------------------------- sources ---- */
  function sectionSources(r) {
    const sources = r.source || [];
    return `
      <div style="${CARD}background:rgba(255,255,255,0.03);">
        <div style="${H}"><span>📋 Sources & confidence</span>${confidenceChip(r.confidence)}</div>
        ${sources.map(s => `
          <div style="font-size:9.5px;color:#94a3b8;line-height:1.6;margin-bottom:3px;">
            <strong style="color:#cbd5e1;">${escapeHtml(s.name)}</strong> — ${escapeHtml(s.role)}
          </div>`).join('')}
        ${Array.isArray(r.confidence_reasons) && r.confidence_reasons.length ? `
          <div style="font-size:9px;color:#64748b;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);line-height:1.6;">
            <strong style="color:#94a3b8;">Limitations:</strong> ${r.confidence_reasons.map(escapeHtml).join('; ')}.
          </div>` : ''}
        <div style="font-size:8.5px;color:#475569;margin-top:5px;">
          ${escapeHtml(r.timezone || '')} · updated ${fmtPkt(r.timestamp)} · ${escapeHtml(r.model_version || '')}
        </div>
      </div>`;
  }

  // ==========================================================================
  // NATIONAL SITUATION & RISK SURFACE (spec §8, §9)
  // ==========================================================================

  /**
   * Switch analytical mode: repaint the map layers for that mode and re-render
   * the panel from the report already in hand (no refetch needed).
   */
  function switchMode(mode) {
    state.activeMode = mode;

    if (mode === 'weather') {
      state.activeLayer = 'composite';
      renderComposite(state.currentFrameIndex);
      renderHazardLayers('composite');
    } else if (mode === 'rainfall') {
      state.activeLayer = 'radar';
      renderComposite(state.currentFrameIndex);
      renderHazardLayers('radar');
    } else if (mode === 'flood' || mode === 'advisory') {
      state.activeLayer = 'composite';
      renderComposite(state.currentFrameIndex);
      renderHazardLayers('composite');
    } else if (mode === 'impact') {
      state.activeLayer = 'composite';
      renderComposite(state.currentFrameIndex);
      renderHazardLayers('composite');
    }

    // The national risk surface belongs to the flood/advisory/impact views.
    renderRiskSurface();

    dom.infoDrawer.classList.remove('hidden');
    if (state.lastReport) {
      renderIntelligenceDashboard({ ok: true, report: state.lastReport });
    } else {
      const c = state.map.getCenter();
      inspectPointWeather(c.lat, c.lng, 'Map centre');
    }
  }

  async function refreshNationalSituation() {
    try {
      const national = await ESS_API.national();
      state.national = national;
      renderRiskSurface();
      // Refresh the open drawer so its national block is not left stale.
      if (state.lastReport && !dom.infoDrawer.classList.contains('hidden')) {
        renderIntelligenceDashboard({ ok: true, report: state.lastReport });
      }
    } catch (err) {
      console.warn('[ess] national situation unavailable:', err.message);
    }

    // Real past/forecast risk timeline (spec §21) — computed from the same
    // data already fetched above, so this is cheap; kept as a separate call
    // only because it is a separate cache entry server-side.
    try {
      state.nationalTimeline = await ESS_API.nationalTimeline();
    } catch (err) {
      console.warn('[ess] risk timeline unavailable:', err.message);
    }
  }

  /**
   * Merge the always-full-detail "now" district list with a timeline offset's
   * compact risk-only data, so the map surface can show real past/forecast
   * risk (spec §21) without the timeline endpoint needing to duplicate every
   * district's lat/lon/rainfall detail at every one of the six offsets.
   */
  function districtsForOffset(offsetHours) {
    const base = state.national?.districts || [];
    if (offsetHours === 0) return base.map(d => ({ ...d, _offset: 0 }));

    const timelineOffset = state.nationalTimeline?.offsets?.find(o => o.hours === offsetHours);
    if (!timelineOffset) return base.map(d => ({ ...d, _offset: 0 })); // fall back to now if unavailable

    const byId = new Map(base.map(d => [d.id, d]));
    return timelineOffset.districts.map(td => {
      const b = byId.get(td.id);
      if (!b) return null;
      return {
        ...b,
        overall: { level: td.overall_level, code: td.overall_code, color: td.color, primary_hazard_label: td.primary_hazard_label },
        _offset: offsetHours,
        _offsetTimestamp: timelineOffset.timestamp,
        _offsetDataType: timelineOffset.data_type
      };
    }).filter(Boolean);
  }

  /**
   * District risk surface. Rendered as graduated circles at district reference
   * points — district boundary polygons need a GIS boundary dataset (Phase 2),
   * so a point surface is drawn rather than implying precise borders.
   */
  function renderRiskSurface() {
    if (state.riskSurfaceLayer && state.map.hasLayer(state.riskSurfaceLayer)) {
      state.map.removeLayer(state.riskSurfaceLayer);
    }
    state.riskSurfaceLayer = null;

    const showFor = ['flood', 'advisory', 'impact'];
    if (!state.national || !showFor.includes(state.activeMode)) return;

    const group = L.layerGroup();
    const districts = districtsForOffset(state.selectedOffsetHours);

    districts.forEach(dist => {
      const s = riskStyle(dist.overall.level);
      // Normal districts stay muted so elevated areas read at a glance.
      const isElevated = dist.overall.code >= 1;
      const radius = isElevated ? 10 + dist.overall.code * 3.5 : 6;

      const circle = L.circleMarker([dist.lat, dist.lon], {
        radius,
        color: s.color,
        weight: isElevated ? 2 : 1,
        opacity: isElevated ? 0.95 : 0.5,
        fillColor: s.color,
        fillOpacity: isElevated ? 0.4 : 0.15,
        pane: 'hazardPane'
      });

      const isNow = dist._offset === 0;
      circle.bindTooltip(`
        <div style="font-weight:800;color:#fff;font-size:11.5px;">${escapeHtml(dist.name)}</div>
        <div style="font-size:10px;color:${s.color};font-weight:700;">${s.emoji} ${escapeHtml(dist.overall.level)}${dist.overall.primary_hazard_label ? ` · ${escapeHtml(dist.overall.primary_hazard_label)}` : ''}</div>
        ${isNow
          ? `<div style="font-size:10px;color:#cbd5e1;">24 h ${fmtMm(dist.rainfall.accum_24h)} · next 24 h ${fmtMm(dist.rainfall.forecast_24h)}</div>`
          : `<div style="font-size:9.5px;color:#fbbf24;">Predicted at ${fmtPkt(dist._offsetTimestamp)} (${escapeHtml(dist._offsetDataType)})</div>`}
      `, { direction: 'top', className: 'radar-tooltip' });

      circle.on('click', () => {
        inspectPointWeather(dist.lat, dist.lon, `${dist.name}, ${dist.province}`);
      });

      group.addLayer(circle);
    });

    state.riskSurfaceLayer = group;
    group.addTo(state.map);
  }

  // --- SVG Hydrograph Generator ---
  /**
   * Real rainfall time-series chart (spec §10's "past <- now -> forecast" visual
   * concept, honestly relabelled). This plots actual observed + forecast
   * PRECIPITATION over time — never invented, and never presented as river
   * discharge, since no real discharge time series is available (spec §11/§10
   * gap: no FFD/WAPDA or raw GloFAS discharge access).
   */
  function renderRainfallTimelineSvg(timeline, nowMs) {
    if (!Array.isArray(timeline) || timeline.length < 5) return '';

    const w = 380;
    const h = 84;
    const padTop = 8;
    const padBottom = 16;
    const maxVal = Math.max(1, ...timeline.map(p => p.mm)) * 1.15;

    const tMin = timeline[0].time;
    const tMax = timeline[timeline.length - 1].time;
    const xOf = t => ((t - tMin) / (tMax - tMin || 1)) * w;
    const yOf = v => h - padBottom - (v / maxVal) * (h - padTop - padBottom);

    const nowX = xOf(nowMs);
    const observed = timeline.filter(p => p.data_type === 'OBSERVED');
    const forecast = timeline.filter(p => p.data_type === 'FORECAST');

    const pathFor = pts => pts.length
      ? `M ${xOf(pts[0].time)},${yOf(pts[0].mm)} ` + pts.slice(1).map(p => `L ${xOf(p.time)},${yOf(p.mm)}`).join(' ')
      : '';

    return `
      <svg class="ess-hydrograph-svg" viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;">
        <line x1="0" y1="${h - padBottom}" x2="${w}" y2="${h - padBottom}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
        <line x1="${nowX}" y1="0" x2="${nowX}" y2="${h - padBottom}" stroke="#f8fafc" stroke-width="1" stroke-dasharray="2,3" opacity="0.6"/>
        <text x="${nowX}" y="10" fill="#f8fafc" font-size="8" text-anchor="middle" opacity="0.8">NOW</text>
        <path d="${pathFor(observed)}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
        <path d="${pathFor(forecast)}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,3" stroke-linecap="round"/>
      </svg>
      <div style="display:flex;gap:14px;margin-top:2px;">
        <span style="font-size:8.5px;color:#38bdf8;"><span style="display:inline-block;width:10px;height:2px;background:#38bdf8;margin-right:4px;vertical-align:middle;"></span>Observed</span>
        <span style="font-size:8.5px;color:#f59e0b;"><span style="display:inline-block;width:10px;height:2px;background:#f59e0b;margin-right:4px;vertical-align:middle;border-top:2px dashed #f59e0b;"></span>Forecast</span>
      </div>
    `;
  }

  async function inspectPointWeather(lat, lon, title) {
    dom.infoDrawer.classList.remove('hidden');

    const intelData = await calculateComprehensiveIntelligence(lat, lon, title);
    renderIntelligenceDashboard(intelData);

    if (state.draggableRedPin) {
      state.draggableRedPin.bindTooltip(`
        <div style="font-family:var(--font-heading);font-weight:700;color:#38bdf8;margin-bottom:2px;">${title}</div>
        <div style="font-size:11px;color:#ffffff;">Live: <strong>${intelData.currentRate.toFixed(1)} mm/h</strong> | 24h: <strong>${intelData.accum24h} mm</strong></div>
        <div style="font-size:11px;color:${intelData.riskClassColor};font-weight:700;margin-top:2px;">
          ⚡ ${intelData.overallRisk} Risk (${intelData.impactWindow})
        </div>
      `, { direction: 'top', className: 'radar-tooltip' }).openTooltip();
    }
  }

  async function resolveLocationName(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const name = addr.suburb || addr.neighbourhood || addr.city || addr.town || addr.village || addr.county;
        if (name) {
          const stateName = addr.state ? `, ${addr.state}` : '';
          return `${name}${stateName}`;
        }
      }
    } catch (e) { }

    let closest = null;
    let minD = 999999;
    state.stations.forEach(s => {
      const dLat = (lat - s.lat) * 111;
      const dLon = (lon - s.lon) * 111 * Math.cos(lat * Math.PI / 180);
      const d = Math.sqrt(dLat * dLat + dLon * dLon);
      if (d < minD) { minD = d; closest = s; }
    });

    if (closest && minD < 22) return closest.name;
    return `Location (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`;
  }

  function locateUserPosition() {
    dom.locateMeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const onLocationFound = async (lat, lon, label = '') => {
      state.map.flyTo([lat, lon], 11, { duration: 1.5 });
      const resolvedTitle = label || await resolveLocationName(lat, lon);
      createOrUpdateRedPin(lat, lon, resolvedTitle);
      inspectPointWeather(lat, lon, resolvedTitle);
      dom.locateMeBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { onLocationFound(pos.coords.latitude, pos.coords.longitude); },
        async err => {
          try {
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
              const d = await res.json();
              if (d.latitude && d.longitude) {
                onLocationFound(d.latitude, d.longitude, d.city ? `${d.city}, PK` : '');
                return;
              }
            }
          } catch (ipErr) { }
          onLocationFound(33.6844, 73.0479, 'Islamabad');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      onLocationFound(33.6844, 73.0479, 'Islamabad');
    }
  }

  function setupEventListeners() {
    dom.locateMeBtn.addEventListener('click', locateUserPosition);

    // 5 Analytical Modes Switcher (A. WEATHER -> E. ADVISORY).
    // Same map, same underlying report — the mode selects which layers are drawn
    // and which analytics the panel leads with (spec §3).
    document.querySelectorAll('.ess-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ess-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        switchMode(btn.dataset.mode);
      });
    });

    // Dedicated 'CHECK MY LOCATION' button
    const checkLocBtn = document.getElementById('check-my-location-btn');
    if (checkLocBtn) {
      checkLocBtn.addEventListener('click', locateUserPosition);
    }

    let searchDebounce = null;
    dom.searchToggleBtn.addEventListener('click', () => {
      dom.searchContainer.classList.toggle('hidden');
      if (!dom.searchContainer.classList.contains('hidden')) dom.searchInput.focus();
    });

    dom.closeSearchBtn.addEventListener('click', () => {
      dom.searchContainer.classList.add('hidden');
      dom.searchResultsList.classList.add('hidden');
    });

    dom.searchInput.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      if (q.length < 2) {
        dom.searchResultsList.innerHTML = '';
        dom.searchResultsList.classList.add('hidden');
        return;
      }

      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(async () => {
        const matchedStations = state.stations.filter(s => s.name.toLowerCase().includes(q));
        let osmResults = [];

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=pk&format=json&limit=5`);
          if (res.ok) osmResults = await res.json();
        } catch (err) { }

        const combined = [];
        matchedStations.forEach(s => combined.push({ title: s.name, subtitle: 'City / Station', lat: s.lat, lon: s.lon }));

        osmResults.forEach(item => {
          if (!combined.some(c => Math.abs(c.lat - parseFloat(item.lat)) < 0.05 && Math.abs(c.lon - parseFloat(item.lon)) < 0.05)) {
            combined.push({
              title: item.display_name.split(',')[0],
              subtitle: item.display_name.split(',').slice(1, 3).join(','),
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon)
            });
          }
        });

        if (combined.length === 0) {
          dom.searchResultsList.innerHTML = '<div class="wr-search-item" style="color:#94a3b8;"><i class="fa-solid fa-circle-question"></i> No matching location found</div>';
          dom.searchResultsList.classList.remove('hidden');
          return;
        }

        dom.searchResultsList.innerHTML = combined.map(loc => `
          <div class="wr-search-item" data-lat="${loc.lat}" data-lon="${loc.lon}" data-title="${loc.title}">
            <i class="fa-solid fa-location-dot"></i>
            <div>
              <div style="font-weight:700;color:#ffffff;">${loc.title}</div>
              <div style="font-size:10px;color:#94a3b8;">${loc.subtitle}</div>
            </div>
          </div>
        `).join('');

        dom.searchResultsList.classList.remove('hidden');

        dom.searchResultsList.querySelectorAll('.wr-search-item').forEach(el => {
          el.addEventListener('click', () => {
            const lat = parseFloat(el.dataset.lat);
            const lon = parseFloat(el.dataset.lon);
            const title = el.dataset.title;
            if (!isNaN(lat) && !isNaN(lon)) {
              state.map.flyTo([lat, lon], 12, { duration: 1.5 });
              createOrUpdateRedPin(lat, lon, title);
              inspectPointWeather(lat, lon, title);
              dom.searchContainer.classList.add('hidden');
              dom.searchResultsList.classList.add('hidden');
              dom.searchInput.value = '';
            }
          });
        });
      }, 250);
    });

    dom.themeToggleBtn.addEventListener('click', () => {
      setThemeMode(state.themeMode === 'day' ? 'night' : 'day');
    });

    dom.pmdRadarToggleBtn.addEventListener('click', () => {
      state.pmdConesVisible = !state.pmdConesVisible;
      dom.pmdRadarToggleBtn.classList.toggle('active', state.pmdConesVisible);
      renderPmdRadarCones();
    });

    if (dom.speedToggleBtn) {
      dom.speedToggleBtn.addEventListener('click', togglePlaybackSpeed);
    }

    dom.copyShareBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.origin + '/');
        alert('Link copied to clipboard!');
      } catch (e) { }
    });

    dom.infoBtn.addEventListener('click', () => dom.infoDrawer.classList.toggle('hidden'));
    dom.closeInfoDrawerBtn.addEventListener('click', () => dom.infoDrawer.classList.add('hidden'));

    dom.layerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.id === 'snapshot-btn') return;
        dom.layerBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeLayer = btn.dataset.layer;
        renderComposite(state.currentFrameIndex);
      });
    });

    dom.interval15Btn.addEventListener('click', () => {
      dom.interval15Btn.classList.add('active');
      dom.interval30Btn.classList.remove('active');
    });

    dom.interval30Btn.addEventListener('click', () => {
      dom.interval30Btn.classList.add('active');
      dom.interval15Btn.classList.remove('active');
    });

    dom.playPauseBtn.addEventListener('click', toggleLoop);
    dom.timelineSlider.addEventListener('input', e => {
      pauseLoop();
      state.currentFrameIndex = parseInt(e.target.value, 10);
      renderComposite(state.currentFrameIndex);
    });

    // Risk-evolution timeline (spec §21): real observed history (-48h/-24h)
    // and real forecast (+12h/+24h/+48h), re-scored from data already fetched
    // for "now" — see server/services/national.js buildNationalTimeline().
    dom.datePills.forEach(pill => {
      pill.addEventListener('click', () => {
        dom.datePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedOffsetHours = Number(pill.dataset.offsetHours) || 0;
        renderRiskSurface();
        if (!dom.infoDrawer.classList.contains('hidden')) {
          renderIntelligenceDashboard({ ok: !!state.lastReport, report: state.lastReport });
        }
      });
    });

    dom.snapshotBtn.addEventListener('click', openSnapshotModal);
    dom.closeSnapshotModalBtn.addEventListener('click', () => dom.snapshotModal.classList.add('hidden'));

    dom.downloadGifBtn.addEventListener('click', () => {
      const center = state.map.getCenter();
      const zoom = Math.round(state.map.getZoom());
      const gifUrl = `/api/generate-gif?lat=${center.lat.toFixed(4)}&lon=${center.lng.toFixed(4)}&zoom=${zoom}&frames=8`;

      dom.downloadGifBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
      const a = document.createElement('a');
      a.href = gifUrl;
      a.setAttribute('download', 'Weather_Radar_Pakistan.gif');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        dom.downloadGifBtn.innerHTML = '<i class="fa-solid fa-download"></i> Download Animated GIF';
      }, 2500);
    });

    dom.copyShareBtnModal.addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.origin + '/');
      dom.copyShareBtnModal.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => {
        dom.copyShareBtnModal.innerHTML = '<i class="fa-solid fa-link"></i> Copy Link';
      }, 2000);
    });
  }

  function openSnapshotModal() {
    dom.snapshotModal.classList.remove('hidden');
    const spinner = document.getElementById('gif-spinner');
    if (spinner) spinner.classList.remove('hidden');

    const center = state.map.getCenter();
    const zoom = Math.round(state.map.getZoom());
    const gifUrl = `/api/generate-gif?lat=${center.lat.toFixed(4)}&lon=${center.lng.toFixed(4)}&zoom=${zoom}&frames=8`;

    dom.snapshotPreviewImg.onload = () => {
      dom.snapshotPreviewImg.classList.remove('hidden');
      if (spinner) spinner.classList.add('hidden');
    };

    dom.snapshotPreviewImg.src = gifUrl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
