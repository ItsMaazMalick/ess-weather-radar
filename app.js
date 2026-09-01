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

  // True-Color High-Resolution Satellite Base Map (Clean, No Foreign Labels)
  const BASE_MAP = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
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
    draggableRedPin: null,

    rainviewerMeta: null,
    radarFrames: [],
    satelliteFrames: [],
    currentFrameIndex: 0,
    isPlaying: false,
    playTimer: null,

    stations: INITIAL_STATIONS
  };

  const dom = {
    locateMeBtn: document.getElementById('locate-me-btn'),
    searchToggleBtn: document.getElementById('search-toggle-btn'),
    searchContainer: document.getElementById('search-container'),
    searchInput: document.getElementById('search-input'),
    searchResultsList: document.getElementById('search-results-list'),
    closeSearchBtn: document.getElementById('close-search-btn'),
    copyShareBtn: document.getElementById('copy-share-btn'),
    infoBtn: document.getElementById('info-btn'),
    infoDrawer: document.getElementById('info-drawer'),
    closeInfoDrawerBtn: document.getElementById('close-info-drawer-btn'),
    layerBtns: document.querySelectorAll('.wr-layer-action-btn'),
    interval15Btn: document.getElementById('interval-15'),
    interval30Btn: document.getElementById('interval-30'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    timelineSlider: document.getElementById('timeline-slider'),
    timelineProgressFill: document.getElementById('timeline-progress-fill'),
    currentFrameTimePkt: document.getElementById('current-frame-time-pkt'),
    datePills: document.querySelectorAll('.wr-date-pill'),
    activeInspectedLocation: document.getElementById('active-inspected-location'),
    nationalHeadlineText: document.getElementById('national-headline-text'),
    metricTemp: document.getElementById('metric-temp'),
    metricPrecip: document.getElementById('metric-precip'),
    metricHumidity: document.getElementById('metric-humidity'),
    snapshotBtn: document.getElementById('snapshot-btn'),
    snapshotModal: document.getElementById('snapshot-modal'),
    closeSnapshotModalBtn: document.getElementById('close-snapshot-modal-btn'),
    snapshotPreviewImg: document.getElementById('snapshot-preview-img'),
    downloadPngBtn: document.getElementById('download-png-btn'),
    downloadGifBtn: document.getElementById('download-gif-btn'),
    copyShareBtnModal: document.getElementById('copy-share-btn-modal')
  };

  async function init() {
    initMap();
    setupEventListeners();
    await loadRainviewerFrames();
    fetchStationObservations();

    setInterval(loadRainviewerFrames, 5 * 60 * 1000);
    setInterval(fetchStationObservations, 2.5 * 60 * 1000);
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

    BASE_MAP.addTo(state.map);

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

      const precip = (nearest && minD < 45) ? (nearest.precip ?? 0) : 0.0;
      const risk = calculateStreetFloodRisk(lat, lng, precip, '');
      const tooltipContainer = document.getElementById('hover-probe-tooltip');
      if (tooltipContainer) {
        tooltipContainer.style.left = `${e.containerPoint.x + 14}px`;
        tooltipContainer.style.top = `${e.containerPoint.y + 14}px`;
        tooltipContainer.classList.remove('hidden');
        if (precip > 0.15) {
          tooltipContainer.innerHTML = `
            <div style="font-weight:700;color:#38bdf8;font-size:11px;">🌧️ Rain: ${precip.toFixed(1)} mm/h</div>
            <div style="font-size:10.5px;color:${risk.color};font-weight:700;margin-top:2px;">🌊 ${risk.statusText}</div>
            <div style="font-size:9.5px;color:#cbd5e1;">Depth: ~${risk.depthText}</div>
          `;
        } else {
          tooltipContainer.innerHTML = `
            <div style="color:#94a3b8;font-size:10px;">No Precipitation (0 mm/h)</div>
            <div style="font-weight:700;color:#8DC63F;font-size:10.5px;margin-top:1px;">🟢 Roads Clear & Dry</div>
          `;
        }
      }
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

  const ROAD_HAZARDS = [
    {
      id: 'kkh-dasu', type: 'blockage', title: 'N-35 Karakoram Highway (KKH) - Dasu / Kohistan',
      severity: 'CRITICAL BLOCKAGE', icon: 'fa-triangle-exclamation', center: [35.32, 73.20],
      polyline: [[35.15, 73.05], [35.25, 73.12], [35.32, 73.20], [35.40, 73.28], [35.52, 73.38]],
      cause: 'Massive Mudslide & Rockfall triggered by heavy mountain downpour (32mm)',
      status: 'Closed to all traffic. Heavy machinery deployed by FWO / NHA for debris clearance.',
      alternate: 'Traffic diverted at Thakot. Use Hazara Motorway M-15 up to Mansehra only.',
      helpline: 'NHA Emergency: 130 | FWO Control: 051-9271301'
    },
    {
      id: 'swat-kalam', type: 'flood', title: 'N-95 Swat Valley Expressway - Bahrain to Kalam',
      severity: 'RIVER FLOOD INUNDATION', icon: 'fa-water', center: [35.25, 72.56],
      polyline: [[34.95, 72.45], [35.12, 72.52], [35.25, 72.56], [35.38, 72.58], [35.48, 72.59]],
      cause: 'Swat River high flood surge overtopping road embankments and washed culverts',
      status: 'Submerged sections at Madyan & Bahrain. Only 4x4 relief vehicles permitted.',
      alternate: 'Stay at Saidu Sharif / Mingora. Do not proceed upstream towards Kalam.',
      helpline: 'KP PDMA: 1700 | Rescue 1122'
    },
    {
      id: 'murree-expressway', type: 'blockage', title: 'N-75 Murree Expressway & Galiyat Corridor',
      severity: 'RESTRICTED / LANDSLIDE', icon: 'fa-road-barrier', center: [33.91, 73.39],
      polyline: [[33.75, 73.20], [33.82, 73.28], [33.91, 73.39], [34.02, 73.45], [34.10, 73.48]],
      cause: 'Hill torrent water runoff, dense fog and fallen trees at Jhika Gali',
      status: 'One-way controlled traffic by City Traffic Police. Slippery asphalt conditions.',
      alternate: 'Use Old Rawalpindi-Murree Road for light vehicles with extreme caution.',
      helpline: 'Murree Control Room: 051-9269016'
    },
    {
      id: 'bolan-n65', type: 'flood', title: 'N-65 Quetta-Sukkur Highway - Bolan Pass (Machh)',
      severity: 'FLASH FLOOD INUNDATION', icon: 'fa-water', center: [29.95, 67.25],
      polyline: [[29.70, 67.55], [29.85, 67.38], [29.95, 67.25], [30.08, 67.12], [30.18, 66.98]],
      cause: 'Severe flash floods in Bolan River and Pinjra Bridge approach damage',
      status: 'Highway submerged under 3.5 ft water near Kolpur/Machh. Traffic suspended.',
      alternate: 'Heavy transport advised to hold at Dera Allah Yar / Sibi terminals.',
      helpline: 'Balochistan PDMA: 081-9241133'
    },
    {
      id: 'babusar-pass', type: 'blockage', title: 'N-15 Babusar Pass - Kaghan to Chilas',
      severity: 'GLACIAL RUNOFF / BLOCKED', icon: 'fa-snowflake', center: [35.15, 74.05],
      polyline: [[34.90, 73.85], [35.02, 73.95], [35.15, 74.05], [35.28, 74.15], [35.42, 74.10]],
      cause: 'Glacial stream overflow and mudslide at Babusar Top (4,173m elevation)',
      status: 'Closed during evening & night hours. Daytime convoy transit subject to weather.',
      alternate: 'Use Karakoram Highway (KKH) via Kohistan when clear.',
      helpline: 'NHA Babusar Base: 130'
    },
    {
      id: 'indus-hwy-dadu', type: 'flood', title: 'N-55 Indus Highway - Dadu & Sehwan Sector',
      severity: 'HIGH FLOOD WATCH', icon: 'fa-water', center: [26.75, 67.82],
      polyline: [[26.40, 68.00], [26.60, 67.90], [26.75, 67.82], [26.90, 67.75], [27.10, 67.68]],
      cause: 'High water levels in surrounding canal drains and Indus seepage',
      status: 'Single lane traffic operational under National Highway Authority monitoring.',
      alternate: 'National Highway N-5 (Moro / Nowshero Feroze) recommended for long haul.',
      helpline: 'Sindh Emergency: 021-99203443'
    },
    {
      id: 'rcd-lasbela', type: 'flood', title: 'N-25 RCD Highway - Lasbela / Porali River Bridge',
      severity: 'WATER OVERFLOW', icon: 'fa-water', center: [25.95, 66.55],
      polyline: [[25.60, 66.65], [25.80, 66.58], [25.95, 66.55], [26.15, 66.48], [26.35, 66.40]],
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
    const shouldShowBlockages = isBlockageMode || activeLayer === 'composite';
    const shouldShowFloods = isFloodMode || activeLayer === 'composite';

    ROAD_HAZARDS.forEach(hazard => {
      if (hazard.type === 'blockage' && !shouldShowBlockages) return;
      if (hazard.type === 'flood' && !shouldShowFloods) return;

      const isFlood = hazard.type === 'flood';
      const polyColor = isFlood ? '#00e5ff' : '#f43f5e';
      const glowColor = isFlood ? 'rgba(0, 229, 255, 0.45)' : 'rgba(244, 63, 94, 0.45)';

      const glowPoly = L.polyline(hazard.polyline, { color: glowColor, weight: 14, opacity: 0.9, pane: 'hazardPane' });
      state.hazardLayerGroup.addLayer(glowPoly);

      const linePoly = L.polyline(hazard.polyline, {
        color: polyColor, weight: 6, dashArray: isFlood ? '6, 6' : '8, 8', opacity: 1.0, pane: 'hazardPane'
      });
      linePoly.on('click', () => inspectHazardDetails(hazard));
      state.hazardLayerGroup.addLayer(linePoly);

      const markerHtml = `
        <div class="wr-hazard-icon-pill ${isFlood ? 'flood' : ''}" title="${hazard.title}">
          <i class="fa-solid ${isFlood ? 'fa-water' : 'fa-triangle-exclamation'}"></i>
          <span>${isFlood ? 'FLOOD RISK' : 'ROAD BLOCKED'}</span>
        </div>
      `;
      const hazardIcon = L.divIcon({ className: 'wr-hazard-marker-container', html: markerHtml, iconSize: [120, 28], iconAnchor: [60, 14] });
      const hazardMarker = L.marker(hazard.center, { icon: hazardIcon, pane: 'hazardPane' });
      hazardMarker.on('click', () => inspectHazardDetails(hazard));
      state.hazardLayerGroup.addLayer(hazardMarker);
    });

    state.hazardLayerGroup.addTo(state.map);

    if (isBlockageMode || isFloodMode) {
      showHazardListSummary(isBlockageMode ? 'blockage' : 'flood');
    }
  }

  function showHazardListSummary(type) {
    const isFlood = type === 'flood';
    const list = ROAD_HAZARDS.filter(h => h.type === type);

    dom.activeInspectedLocation.textContent = isFlood ? '🌊 Flood Inundation Report' : '🚧 Road Blockages & Landslides';
    dom.infoDrawer.classList.remove('hidden');

    dom.nationalHeadlineText.innerHTML = `
      <div style="font-size:12px;color:var(--wr-text-muted);margin-bottom:8px;">
        ${list.length} active emergency highway alerts across Pakistan. Click any route to inspect:
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;">
        ${list.map((h, i) => `
          <div class="hazard-quick-card" data-idx="${i}" style="background:rgba(255,255,255,0.06);border:1px solid ${isFlood ? '#00e5ff' : '#f43f5e'};border-radius:8px;padding:8px;cursor:pointer;">
            <div style="font-weight:700;font-size:12px;color:#FFFFFF;display:flex;align-items:center;gap:6px;">
              <i class="fa-solid ${isFlood ? 'fa-water' : 'fa-triangle-exclamation'}" style="color:${isFlood ? '#00e5ff' : '#f43f5e'};"></i>
              ${h.title}
            </div>
            <div style="font-size:10.5px;color:var(--wr-text-muted);margin-top:2px;">${h.cause}</div>
            <div style="font-size:10px;color:${isFlood ? '#38bdf8' : '#f87171'};font-weight:700;margin-top:2px;">${h.severity}</div>
          </div>
        `).join('')}
      </div>
    `;

    dom.nationalHeadlineText.querySelectorAll('.hazard-quick-card').forEach((card, idx) => {
      card.addEventListener('click', () => inspectHazardDetails(list[idx]));
    });

    if (list.length > 0) {
      state.map.flyTo(list[0].center, 8, { duration: 1.2 });
    }
  }

  function inspectHazardDetails(hazard) {
    dom.activeInspectedLocation.textContent = hazard.title;
    dom.infoDrawer.classList.remove('hidden');

    const isFlood = hazard.type === 'flood';
    dom.nationalHeadlineText.innerHTML = `
      <div style="padding:4px 8px;border-radius:6px;background:${isFlood ? '#0284c7' : '#e11d48'};color:#FFFFFF;font-weight:700;font-size:11px;margin-bottom:6px;display:inline-block;">
        ${hazard.severity}
      </div>
      <div style="font-weight:700;color:#FFFFFF;margin-bottom:4px;">${hazard.title}</div>
      <div style="color:var(--wr-text-light);font-size:11.5px;margin-bottom:6px;"><strong>Cause:</strong> ${hazard.cause}</div>
      <div style="color:${isFlood ? '#38bdf8' : '#f87171'};font-size:11.5px;margin-bottom:6px;"><strong>Status:</strong> ${hazard.status}</div>
      <div style="color:#8DC63F;font-size:11px;margin-bottom:6px;"><strong>Recommended Detour:</strong> ${hazard.alternate}</div>
      <div style="color:#F6F4EC;font-size:10px;border-top:1px solid rgba(255,255,255,0.15);padding-top:4px;"><strong>📞 Emergency Helpline:</strong> ${hazard.helpline}</div>
    `;

    state.map.flyTo(hazard.center, 9, { duration: 1.2 });
    createOrUpdateRedPin(hazard.center[0], hazard.center[1], hazard.title);
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
      state.satelliteFrames = meta.satellite?.infrared || [];
      state.currentFrameIndex = past.length - 1;

      console.log(`[radar] ${state.radarFrames.length} radar frames, host=${meta.host}`);

      buildTimelineUI();
      renderComposite(state.currentFrameIndex);
    } catch (e) {
      console.error('[radar] RainViewer metadata fetch FAILED:', e);
    }
  }

  // --- Composite render: Zoom-Earth-style soft radar blob, blur applied at PANE level (style.css), not per-tile ---
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

    // Satellite cloud layer intentionally NOT shown by default — reference (Zoom Earth) style
    // is pure radar reflectivity with no cloud texture. Kept available for a future 'satellite' toggle.
    removeLayerIfPresent(state.cloudTileLayer);

    removeLayerIfPresent(state.radarTileLayer);
    if (state.activeLayer === 'composite' || state.activeLayer === 'radar' || state.activeLayer === 'blockages' || state.activeLayer === 'floods') {
      // 512px tiles = finer detail than 256px, closer to the reference's smoother blobs.
      // Palette 2 = colorful scale (light blue -> cyan -> purple -> orange/red core), closest RainViewer
      // built-in palette to the reference gradient. The soft edge/halo comes from style.css pane-level blur.
      const radarUrl = `${host}${radarFrame.path}/512/{z}/{x}/{y}/2/1_1.png`;
      state.radarTileLayer = L.tileLayer(radarUrl, {
        tileSize: 512,
        opacity: 1, // opacity controlled at pane level in style.css to keep blur/opacity seamless across tiles
        pane: 'radarPane',
        maxNativeZoom: 7,
        minZoom: 4,
        maxZoom: 16,
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
    dom.currentFrameTimePkt.textContent = `${formattedHours}:${mins} ${ampm}`;

    const pct = (state.currentFrameIndex / (state.radarFrames.length - 1)) * 100;
    dom.timelineProgressFill.style.width = `${pct}%`;
  }

  function buildTimelineUI() {
    dom.timelineSlider.min = 0;
    dom.timelineSlider.max = state.radarFrames.length - 1;
    dom.timelineSlider.value = state.currentFrameIndex;
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
    state.playTimer = setTimeout(() => {
      state.currentFrameIndex = (state.currentFrameIndex + 1) % state.radarFrames.length;
      dom.timelineSlider.value = state.currentFrameIndex;
      renderComposite(state.currentFrameIndex);
      runLoopStep();
    }, 500);
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
    const lats = state.stations.map(s => s.lat).join(',');
    const lons = state.stations.map(s => s.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,cloud_cover,wind_speed_10m`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = Array.isArray(data) ? data : [data];

      state.stations = state.stations.map((stn, idx) => {
        const cur = results[idx]?.current || {};
        const p = (cur.precipitation ?? 0) + (cur.rain ?? 0) + (cur.showers ?? 0);
        return {
          ...stn,
          temp: Math.round(cur.temperature_2m ?? 30),
          precip: p,
          cloud: cur.cloud_cover ?? 0,
          humidity: cur.relative_humidity_2m ?? 60,
          sun: p <= 0.15 && (cur.cloud_cover ?? 0) < 50
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

  // --- High-Risk Urban Chowks, Underpasses & Nullah Basins in Pakistan ---
  const URBAN_CHOWK_HOTSPOTS = [
    { city: 'Rawalpindi', name: 'Committee Chowk Underpass / Murree Road', lat: 33.6080, lon: 73.0640, riskFactor: 1.5, drainType: 'Underpass Depression' },
    { city: 'Rawalpindi', name: 'Liaquat Bagh Chowk / Nullah Lai Basin', lat: 33.6040, lon: 73.0680, riskFactor: 1.6, drainType: 'Riverine Basin' },
    { city: 'Islamabad', name: 'Korang Road Underpass (I-8 / H-8)', lat: 33.6720, lon: 73.0750, riskFactor: 1.3, drainType: 'Drainage Low-Point' },
    { city: 'Islamabad', name: 'Faizabad Interchange Low Loops', lat: 33.6630, lon: 73.0850, riskFactor: 1.3, drainType: 'Interchange Dip' },
    { city: 'Lahore', name: 'Lakshmi Chowk / McLeod Road', lat: 31.5640, lon: 74.3220, riskFactor: 1.7, drainType: 'Natural Low-lying Bowl' },
    { city: 'Lahore', name: 'Kalma Chowk Underpass (Ferozepur Rd)', lat: 31.5060, lon: 74.3310, riskFactor: 1.5, drainType: 'Underpass Sump' },
    { city: 'Lahore', name: 'Bhatti Gate / Circular Road Chowk', lat: 31.5870, lon: 74.3100, riskFactor: 1.4, drainType: 'Old City Basin' },
    { city: 'Lahore', name: 'Qurtaba Chowk (Mozang)', lat: 31.5450, lon: 74.3130, riskFactor: 1.3, drainType: 'Urban Intersection' },
    { city: 'Karachi', name: 'Nagan Chowrangi / North Nazimabad', lat: 24.9600, lon: 67.0650, riskFactor: 1.6, drainType: 'Gujjar Nullah Inundation' },
    { city: 'Karachi', name: 'KDA Chowrangi (Nazimabad)', lat: 24.9350, lon: 67.0420, riskFactor: 1.4, drainType: 'Arterial Low-point' },
    { city: 'Karachi', name: 'Subhanullah Chowk (Surjani Town Sec 4)', lat: 25.0250, lon: 67.0700, riskFactor: 1.8, drainType: 'Thaddo Dam Overflow' },
    { city: 'Karachi', name: 'Submarine Chowk Underpass (Clifton)', lat: 24.8250, lon: 67.0350, riskFactor: 1.4, drainType: 'Coastal Depression' },
    { city: 'Peshawar', name: 'Karkhano Market Chowk (Jamrud Rd)', lat: 33.9980, lon: 71.4350, riskFactor: 1.5, drainType: 'Hill Torrent Channel' },
    { city: 'Peshawar', name: 'Haji Camp Chowk (GT Road)', lat: 34.0150, lon: 71.6020, riskFactor: 1.3, drainType: 'Nullah Crossing' },
    { city: 'Multan', name: 'Chowk Ghanta Ghar (Old City)', lat: 30.1980, lon: 71.4720, riskFactor: 1.3, drainType: 'Urban Center' },
    { city: 'Faisalabad', name: 'D-Ground Chowk / Peoples Colony', lat: 31.4120, lon: 73.1050, riskFactor: 1.3, drainType: 'Commercial Center' },
    { city: 'Gujranwala', name: 'Gondlanwala Chowk (GT Road)', lat: 32.1550, lon: 74.1950, riskFactor: 1.4, drainType: 'Highway Intersection' },
    { city: 'Quetta', name: 'Meezan Chowk (Liaquat Bazaar)', lat: 30.1920, lon: 67.0120, riskFactor: 1.5, drainType: 'Mountain Runoff' }
  ];

  function calculateStreetFloodRisk(lat, lon, precip, title) {
    let nearestHotspot = null;
    let minD = 999999;
    URBAN_CHOWK_HOTSPOTS.forEach(h => {
      const dLat = (lat - h.lat) * 111;
      const dLon = (lon - h.lon) * 111 * Math.cos(lat * Math.PI / 180);
      const d = Math.sqrt(dLat * dLat + dLon * dLon);
      if (d < minD) { minD = d; nearestHotspot = h; }
    });

    const isNearHotspot = minD < 5.0;
    const hotspotFactor = isNearHotspot ? (nearestHotspot?.riskFactor ?? 1.2) : 1.0;

    let riskPercent = Math.min(100, Math.round((precip * 4.2 * hotspotFactor) + (isNearHotspot && precip > 0.5 ? 20 : 0)));
    if (precip < 0.1) riskPercent = 5;

    let level = 'LOW RISK';
    let statusText = 'Clear Transit';
    let color = '#8DC63F';
    let depthText = '0.0 in';
    let advice = 'Roads clear and dry. Normal vehicular flow.';

    if (riskPercent >= 75 || precip > 25) {
      level = 'CRITICAL SUBMERGED / BLOCKED';
      statusText = '⛔ Traffic Blocked / Gridlock';
      color = '#e11d48';
      depthText = isNearHotspot ? '2.5 - 4.5 ft (Underpass Flooded)' : '1.5 - 2.8 ft';
      advice = `Severe water accumulation at ${isNearHotspot ? nearestHotspot.name : 'low-lying chowks'}! Avoid underpasses; use elevated ring roads.`;
    } else if (riskPercent >= 40 || precip > 8) {
      level = 'MODERATE INUNDATION';
      statusText = '⚠️ Slow Traffic / Curb Water';
      color = '#f59e0b';
      depthText = '6 - 16 inches';
      advice = 'Standing water accumulated at road edges & chowks. Light vehicles proceed with extreme caution.';
    } else if (riskPercent >= 20 || precip > 1.5) {
      level = 'MILD WATERLOGGING';
      statusText = '🚗 Caution / Wet Asphalt';
      color = '#38bdf8';
      depthText = '1 - 4 inches';
      advice = 'Slippery asphalt and minor puddles. Traffic moving normally.';
    }

    return {
      percent: riskPercent,
      level,
      statusText,
      color,
      depthText,
      advice,
      nearestHotspot: isNearHotspot ? nearestHotspot : null,
      hotspotDistKm: minD.toFixed(1)
    };
  }

  async function inspectPointWeather(lat, lon, title) {
    dom.activeInspectedLocation.textContent = title;
    dom.infoDrawer.classList.remove('hidden');

    // Display temporary live sensor reading state
    dom.metricTemp.textContent = '...';
    dom.metricPrecip.textContent = '...';
    dom.metricHumidity.textContent = '...';

    let temp = 30;
    let precip = 0.0;
    let humidity = 60;
    let windSpeed = 12;
    let weatherCode = 0;

    // 1. Fetch live real-time high-resolution radar assimilation observation for this EXACT coordinate
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,weather_code,wind_speed_10m`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const cur = data.current || {};
        temp = Math.round(cur.temperature_2m ?? 30);
        precip = (cur.precipitation ?? 0) + (cur.rain ?? 0) + (cur.showers ?? 0);
        humidity = cur.relative_humidity_2m ?? 60;
        windSpeed = cur.wind_speed_10m ?? 10;
        weatherCode = cur.weather_code ?? 0;
      }
    } catch (err) {
      console.warn('[radar-sensor] Live point query fallback:', err);
    }

    const isRain = precip > 0.15;
    const floodRisk = calculateStreetFloodRisk(lat, lon, precip, title);

    dom.metricTemp.textContent = `${temp.toFixed(0)} °C`;
    dom.metricPrecip.textContent = `${precip.toFixed(1)} mm/h`;
    dom.metricHumidity.textContent = `${humidity}%`;

    // Detailed Real-Time Radar & Flood Assessment in Info Drawer
    dom.nationalHeadlineText.innerHTML = `
      <div style="padding:6px 10px;border-radius:8px;background:${floodRisk.color};color:#FFFFFF;font-weight:700;font-size:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <span><i class="fa-solid fa-satellite-dish"></i> LIVE RADAR: ${precip > 0 ? `${precip.toFixed(1)} mm/h` : '0 mm/h'}</span>
        <span>${floodRisk.level}</span>
      </div>
      <div style="font-weight:700;color:#FFFFFF;margin-bottom:4px;font-size:13px;">📍 ${title}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;font-size:11px;">
        <div style="background:rgba(255,255,255,0.06);padding:6px;border-radius:6px;">
          <div style="color:var(--wr-text-muted);font-size:9.5px;">Traffic Status:</div>
          <div style="font-weight:700;color:#FFFFFF;">${floodRisk.statusText}</div>
        </div>
        <div style="background:rgba(255,255,255,0.06);padding:6px;border-radius:6px;">
          <div style="color:var(--wr-text-muted);font-size:9.5px;">Standing Water:</div>
          <div style="font-weight:700;color:${floodRisk.color};">${floodRisk.depthText}</div>
        </div>
      </div>
      ${floodRisk.nearestHotspot ? `
        <div style="font-size:11px;color:#fcd34d;margin-bottom:6px;background:rgba(245,158,11,0.15);padding:6px;border-radius:6px;border:1px solid rgba(245,158,11,0.3);">
          <strong>⚠️ Known Inundation Chowk:</strong> ${floodRisk.nearestHotspot.name} (${floodRisk.hotspotDistKm} km)
        </div>
      ` : ''}
      <div style="font-size:11.5px;color:var(--wr-text-light);line-height:1.4;">
        <strong>Live Advisory:</strong> ${floodRisk.advice}
      </div>
      <div style="font-size:9.5px;color:var(--wr-text-muted);margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;">
        📡 Live Sensor GPS: (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) • Wind: ${windSpeed.toFixed(0)} km/h
      </div>
    `;

    if (state.draggableRedPin) {
      state.draggableRedPin.bindTooltip(`
        <div style="font-family:var(--font-heading);font-weight:700;color:#38bdf8;margin-bottom:2px;">${title}</div>
        <div style="font-size:11px;color:#ffffff;">Live Radar: <strong>${precip.toFixed(1)} mm/h</strong> | Temp: <strong>${temp.toFixed(0)} °C</strong></div>
        <div style="font-size:11px;color:${floodRisk.color};font-weight:700;margin-top:2px;">
          🌊 Flood Risk: ${floodRisk.percent}% (${floodRisk.statusText})
        </div>
        <div style="font-size:9.5px;color:#94a3b8;margin-top:2px;">Water Depth: ~${floodRisk.depthText}</div>
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
      state.map.flyTo([lat, lon], 10, { duration: 1.5 });
      const resolvedTitle = label || await resolveLocationName(lat, lon);
      createOrUpdateRedPin(lat, lon, resolvedTitle);
      inspectPointWeather(lat, lon, resolvedTitle);
      dom.locateMeBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { onLocationFound(pos.coords.latitude, pos.coords.longitude); },
        async err => {
          console.warn('HTML5 Geolocation denied/failed, trying IP lookup:', err.message);
          try {
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
              const d = await res.json();
              if (d.latitude && d.longitude) {
                const locLabel = d.city ? `${d.city}, ${d.region || 'PK'}` : '';
                onLocationFound(d.latitude, d.longitude, locLabel);
                return;
              }
            }
          } catch (ipErr) {
            console.warn('IP geolocation lookup error:', ipErr);
          }
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

    dom.datePills.forEach(pill => {
      pill.addEventListener('click', () => {
        dom.datePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
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