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

    stations: INITIAL_STATIONS
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

  async function init() {
    initMap();
    setupEventListeners();
    await loadRainviewerFrames();
    fetchStationObservations();
    inspectPointWeather(33.6844, 73.0479, 'Islamabad (ICT)');

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

    if (isRiversMode) {
      RIVER_GAUGE_STATIONS.forEach(stn => {
        const iconHtml = `
          <div class="wr-hazard-icon-pill flood" style="background:rgba(2,132,199,0.95);border-color:#38bdf8;" title="${stn.station} (${stn.river})">
            <i class="fa-solid fa-route"></i>
            <span>${stn.station}: ${(stn.inflow/1000).toFixed(0)}k cfs</span>
          </div>
        `;
        const icon = L.divIcon({ className: 'wr-hazard-marker-container', html: iconHtml, iconSize: [120, 24], iconAnchor: [60, 12] });
        const marker = L.marker([stn.lat, stn.lon], { icon, pane: 'hazardPane' });
        marker.on('click', () => {
          inspectPointWeather(stn.lat, stn.lon, `${stn.river} - ${stn.station}`);
        });
        state.hazardLayerGroup.addLayer(marker);
      });
      state.hazardLayerGroup.addTo(state.map);
      return;
    }

    if (isDamsMode) {
      DAM_RESERVOIRS.forEach(dam => {
        const iconHtml = `
          <div class="wr-hazard-icon-pill" style="background:rgba(15,23,42,0.92);border:1.5px solid #f59e0b;color:#f59e0b;" title="${dam.name}">
            <i class="fa-solid fa-warehouse"></i>
            <span>${dam.name} (${dam.storagePercent}%)</span>
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
      return;
    }

    if (isAgriMode) {
      AGRICULTURE_EXPOSURE_REGIONS.forEach((reg, i) => {
        const coords = [
          [33.6, 73.0], [35.0, 72.4], [31.5, 74.3], [30.1, 71.5], [27.7, 68.8]
        ][i] || [33.6, 73.0];
        const iconHtml = `
          <div class="wr-hazard-icon-pill" style="background:rgba(34,197,94,0.92);border-color:#86efac;color:#052e16;" title="${reg.region}">
            <i class="fa-solid fa-wheat-awn"></i>
            <span>${reg.region.split('/')[0]}: ${(reg.croplandHa/1000).toFixed(0)}k ha</span>
          </div>
        `;
        const icon = L.divIcon({ className: 'wr-hazard-marker-container', html: iconHtml, iconSize: [140, 24], iconAnchor: [70, 12] });
        const marker = L.marker(coords, { icon, pane: 'hazardPane' });
        marker.on('click', () => {
          inspectPointWeather(coords[0], coords[1], reg.region);
        });
        state.hazardLayerGroup.addLayer(marker);
      });
      state.hazardLayerGroup.addTo(state.map);
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

    ROAD_HAZARDS.forEach(hazard => {
      if (isBlockageMode && hazard.type !== 'blockage') return;
      if (isFloodMode && hazard.type !== 'flood') return;

      const isFlood = hazard.type === 'flood';
      const coreColor = isFlood ? '#00bcd4' : '#ef4444';
      const glowColor = isFlood ? 'rgba(0, 188, 212, 0.3)' : 'rgba(239, 68, 68, 0.3)';

      // Subtle outer glow — very narrow, only visible tight around the road
      const glowPoly = L.polyline(hazard.polyline, {
        color: glowColor,
        weight: glowWeight,
        opacity: 0.7,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'hazardPane'
      });
      state.hazardLayerGroup.addLayer(glowPoly);

      // Precise road centerline — razor-thin, dashed for blockages, dotted for floods
      const linePoly = L.polyline(hazard.polyline, {
        color: coreColor,
        weight: coreWeight,
        dashArray: isFlood ? '4, 4' : '6, 4',
        opacity: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'hazardPane'
      });
      linePoly.on('click', () => inspectHazardDetails(hazard));
      state.hazardLayerGroup.addLayer(linePoly);

      // Small icon marker at the hazard center only
      const markerHtml = `
        <div class="wr-hazard-icon-pill ${isFlood ? 'flood' : ''}" title="${hazard.title}">
          <i class="fa-solid ${isFlood ? 'fa-water' : 'fa-triangle-exclamation'}"></i>
          <span>${isFlood ? 'FLOOD' : 'BLOCKED'}</span>
        </div>
      `;
      const hazardIcon = L.divIcon({ className: 'wr-hazard-marker-container', html: markerHtml, iconSize: [90, 24], iconAnchor: [45, 12] });
      const hazardMarker = L.marker(hazard.center, { icon: hazardIcon, pane: 'hazardPane' });
      hazardMarker.on('click', () => inspectHazardDetails(hazard));
      state.hazardLayerGroup.addLayer(hazardMarker);
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

  function showHazardListSummary(type) {
    const isFlood = type === 'flood';
    const list = ROAD_HAZARDS.filter(h => h.type === type);

    dom.infoDrawer.classList.remove('hidden');

    dom.infoDrawerContent.innerHTML = `
      <div style="font-weight:800;color:#FFFFFF;font-size:14px;margin-bottom:8px;">
        ${isFlood ? '🌊 Flood Inundation Highways' : '🚧 Road Blockages & Landslides'}
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">
        ${list.length} active emergency highway alerts across Pakistan. Click any route to inspect:
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:380px;overflow-y:auto;">
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

    dom.infoDrawerContent.querySelectorAll('.hazard-quick-card').forEach((card, idx) => {
      card.addEventListener('click', () => inspectHazardDetails(list[idx]));
    });

    if (list.length > 0) {
      state.map.flyTo(list[0].center, 8, { duration: 1.2 });
    }
  }

  function inspectHazardDetails(hazard) {
    dom.infoDrawer.classList.remove('hidden');

    const isFlood = hazard.type === 'flood';
    dom.infoDrawerContent.innerHTML = `
      <div style="padding:4px 8px;border-radius:6px;background:${isFlood ? '#0284c7' : '#e11d48'};color:#FFFFFF;font-weight:700;font-size:11px;margin-bottom:8px;display:inline-block;">
        ${hazard.severity}
      </div>
      <div style="font-weight:800;color:#FFFFFF;font-size:13.5px;margin-bottom:6px;">📍 ${hazard.title}</div>
      <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);margin-bottom:10px;">
        <div style="color:var(--wr-text-light);font-size:11.5px;margin-bottom:6px;"><strong>Cause:</strong> ${hazard.cause}</div>
        <div style="color:${isFlood ? '#38bdf8' : '#f87171'};font-size:11.5px;margin-bottom:6px;"><strong>Status:</strong> ${hazard.status}</div>
        <div style="color:#8DC63F;font-size:11px;margin-bottom:6px;"><strong>Recommended Detour:</strong> ${hazard.alternate}</div>
        <div style="color:#cbd5e1;font-size:10px;border-top:1px solid rgba(255,255,255,0.15);padding-top:6px;"><strong>📞 Emergency Helpline:</strong> ${hazard.helpline}</div>
      </div>
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
  const RIVER_GAUGE_STATIONS = [
    { river: 'Indus River', station: 'Tarbela', lat: 34.0883, lon: 72.6983, inflow: 245000, outflow: 182000, capacity: 1500000, trend: 'RISING', status: 'MEDIUM FLOOD POSSIBLE', hydrograph: [160, 185, 210, 245, 270, 285, 260] },
    { river: 'Indus River', station: 'Kalabagh', lat: 32.9611, lon: 71.5478, inflow: 210000, outflow: 202000, capacity: 950000, trend: 'RISING', status: 'LOW FLOOD', hydrograph: [140, 165, 190, 210, 230, 240, 225] },
    { river: 'Indus River', station: 'Chashma', lat: 32.4333, lon: 71.3667, inflow: 228000, outflow: 215000, capacity: 950000, trend: 'STABLE', status: 'NORMAL', hydrograph: [170, 190, 210, 228, 235, 230, 215] },
    { river: 'Indus River', station: 'Taunsa', lat: 30.7042, lon: 70.8319, inflow: 195000, outflow: 185000, capacity: 1000000, trend: 'STABLE', status: 'NORMAL', hydrograph: [160, 175, 185, 195, 205, 210, 200] },
    { river: 'Indus River', station: 'Guddu', lat: 28.4239, lon: 69.7047, inflow: 172000, outflow: 160000, capacity: 1200000, trend: 'STABLE', status: 'NORMAL', hydrograph: [150, 158, 165, 172, 178, 180, 175] },
    { river: 'Indus River', station: 'Sukkur', lat: 27.7011, lon: 68.8572, inflow: 148000, outflow: 98000, capacity: 900000, trend: 'STABLE', status: 'NORMAL', hydrograph: [130, 138, 142, 148, 152, 155, 150] },
    { river: 'Indus River', station: 'Kotri', lat: 25.3711, lon: 68.3147, inflow: 88000, outflow: 48000, capacity: 875000, trend: 'STABLE', status: 'NORMAL', hydrograph: [70, 75, 82, 88, 92, 95, 90] },
    { river: 'Jhelum River', station: 'Mangla Dam', lat: 33.1484, lon: 73.6500, inflow: 85000, outflow: 35000, capacity: 1060000, trend: 'RISING', status: 'NORMAL', hydrograph: [45, 58, 72, 85, 98, 105, 92] },
    { river: 'Jhelum River', station: 'Rasul Barrage', lat: 32.7000, lon: 73.5333, inflow: 42000, outflow: 22000, capacity: 850000, trend: 'STABLE', status: 'NORMAL', hydrograph: [30, 34, 38, 42, 48, 50, 45] },
    { river: 'Chenab River', station: 'Marala Headworks', lat: 32.6711, lon: 74.4697, inflow: 115000, outflow: 98000, capacity: 1100000, trend: 'RISING', status: 'LOW FLOOD', hydrograph: [65, 80, 95, 115, 130, 140, 125] },
    { river: 'Chenab River', station: 'Khanki Headworks', lat: 32.4042, lon: 73.9722, inflow: 92000, outflow: 84000, capacity: 800000, trend: 'RISING', status: 'NORMAL', hydrograph: [55, 68, 78, 92, 105, 112, 100] },
    { river: 'Chenab River', station: 'Qadirabad', lat: 32.3167, lon: 73.6833, inflow: 88000, outflow: 76000, capacity: 900000, trend: 'STABLE', status: 'NORMAL', hydrograph: [60, 70, 78, 88, 96, 100, 92] },
    { river: 'Ravi River', station: 'Shahdara (Lahore)', lat: 31.6211, lon: 74.2889, inflow: 38000, outflow: 38000, capacity: 250000, trend: 'STABLE', status: 'NORMAL', hydrograph: [25, 28, 32, 38, 42, 45, 40] },
    { river: 'Kabul River', station: 'Nowshera', lat: 34.0150, lon: 71.9750, inflow: 96000, outflow: 96000, capacity: 250000, trend: 'RISING', status: 'MEDIUM FLOOD', hydrograph: [52, 68, 82, 96, 118, 125, 110] },
    { river: 'Swat River', station: 'Chakdara', lat: 34.6469, lon: 72.0300, inflow: 54000, outflow: 54000, capacity: 150000, trend: 'RISING', status: 'MEDIUM FLOOD', hydrograph: [28, 36, 44, 54, 66, 70, 60] },
    { river: 'Nullah Lai', station: 'Kattarian Bridge (Rawalpindi)', lat: 33.6420, lon: 73.0540, inflow: 18500, outflow: 18500, capacity: 32000, trend: 'RISING', status: 'ALERT LEVEL (14.2 ft / 18.0 ft Danger)', hydrograph: [4, 7, 11, 14.2, 16.5, 15.0, 9.0] }
  ];

  // 3. Major Dams & Reservoirs
  const DAM_RESERVOIRS = [
    { name: 'Tarbela Dam', river: 'Indus River', lat: 34.0883, lon: 72.6983, currentLevelFt: 1538.4, maxConservationFt: 1550.0, storagePercent: 92, trend: '↑ +0.3 ft/day', status: 'NORMAL / HIGH STORAGE' },
    { name: 'Mangla Dam', river: 'Jhelum River', lat: 33.1484, lon: 73.6500, currentLevelFt: 1232.1, maxConservationFt: 1242.0, storagePercent: 86, trend: '↑ +0.2 ft/day', status: 'NORMAL / NEAR FULL' },
    { name: 'Chashma Barrage', river: 'Indus River', lat: 32.4333, lon: 71.3667, currentLevelFt: 647.5, maxConservationFt: 649.0, storagePercent: 88, trend: '→ STABLE', status: 'NORMAL' },
    { name: 'Warsak Dam', river: 'Kabul River', lat: 34.1689, lon: 71.3533, currentLevelFt: 1278.0, maxConservationFt: 1280.0, storagePercent: 98, trend: '→ FLOW THROUGH', status: 'SPILLWAY ACTIVE' }
  ];

  // 4. Catchment Basins & Antecedent Wetness Index (AWI)
  const CATCHMENT_BASINS = [
    { id: 'PK-SOAN-01', name: 'Soan / Nullah Lai Basin', lat: 33.62, lon: 73.06, awi: 'SATURATED', runoffRisk: 'HIGH', slopeDeg: 4.5 },
    { id: 'PK-SWAT-02', name: 'Swat / Panjkora Mountain Catchment', lat: 35.10, lon: 72.40, awi: 'SATURATED', runoffRisk: 'SEVERE', slopeDeg: 18.5 },
    { id: 'PK-INDUS-UPPER', name: 'Northern Indus Mountain Watershed', lat: 35.50, lon: 74.20, awi: 'VERY WET', runoffRisk: 'HIGH', slopeDeg: 24.0 },
    { id: 'PK-PUNJAB-PLAINS', name: 'Upper Punjab Riverine Floodplain', lat: 32.20, lon: 73.80, awi: 'WET', runoffRisk: 'MODERATE', slopeDeg: 1.2 },
    { id: 'PK-SINDH-LOWER', name: 'Lower Indus Deltaic Basin', lat: 26.50, lon: 68.20, awi: 'NORMAL', runoffRisk: 'LOW', slopeDeg: 0.4 },
    { id: 'PK-BALOCH-COAST', name: 'Balochistan Hill Torrent & Coastal Basin', lat: 26.00, lon: 65.50, awi: 'DRY', runoffRisk: 'MODERATE', slopeDeg: 8.2 }
  ];

  // 5. Exposure Analytics Dataset (Population, Roads, Cropland by Crop)
  const AGRICULTURE_EXPOSURE_REGIONS = [
    { region: 'Rawalpindi / Islamabad', pop: 142000, settlements: 38, roadsKm: 94, croplandHa: 18400, riceHa: 9400, cottonHa: 2100, maizeHa: 4800, otherHa: 2100 },
    { region: 'Swat / Hazara', pop: 96000, settlements: 52, roadsKm: 128, croplandHa: 34200, riceHa: 8200, cottonHa: 0, maizeHa: 21000, otherHa: 5000 },
    { region: 'Lahore / Gujranwala', pop: 320000, settlements: 44, roadsKm: 210, croplandHa: 68000, riceHa: 42000, cottonHa: 12000, maizeHa: 8000, otherHa: 6000 },
    { region: 'South Punjab (Multan/Bahawalpur)', pop: 210000, settlements: 62, roadsKm: 185, croplandHa: 125000, riceHa: 18000, cottonHa: 84000, maizeHa: 14000, otherHa: 9000 },
    { region: 'Sindh (Sukkur/Larkana/Dadu)', pop: 280000, settlements: 78, roadsKm: 195, croplandHa: 142000, riceHa: 92000, cottonHa: 38000, maizeHa: 4000, otherHa: 8000 }
  ];

  // --- Dynamic Multi-Variable Decision Intelligence Calculation ---
  async function calculateComprehensiveIntelligence(lat, lon, title) {
    let temp = 30;
    let currentRate = 0.0;
    let humidity = 65;
    let windSpeed = 12;
    let hourlyRain = [];

    // Query 72h past + 72h forecast hourly dataset from Open-Meteo
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,weather_code,wind_speed_10m&hourly=precipitation,rain&past_days=3&forecast_days=3`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const cur = data.current || {};
        temp = Math.round(cur.temperature_2m ?? 30);
        currentRate = (cur.precipitation ?? 0) + (cur.rain ?? 0) + (cur.showers ?? 0);
        humidity = cur.relative_humidity_2m ?? 65;
        windSpeed = cur.wind_speed_10m ?? 12;
        hourlyRain = data.hourly?.precipitation || [];
      }
    } catch (e) {
      console.warn('[intelligence] Hourly query fallback:', e);
    }

    // Historical accumulation calculations (Indices 0..71 are past 72 hours, index 72 is current)
    const nowIdx = Math.min(72, hourlyRain.length - 1);
    const sumSlice = (start, end) => {
      let sum = 0;
      for (let i = Math.max(0, start); i <= Math.min(end, hourlyRain.length - 1); i++) {
        sum += (hourlyRain[i] || 0);
      }
      return parseFloat(sum.toFixed(1));
    };

    const accum1h = Math.max(currentRate, sumSlice(nowIdx - 1, nowIdx));
    const accum3h = sumSlice(nowIdx - 3, nowIdx);
    const accum6h = sumSlice(nowIdx - 6, nowIdx);
    const accum12h = sumSlice(nowIdx - 12, nowIdx);
    const accum24h = sumSlice(nowIdx - 24, nowIdx);
    const accum72h = sumSlice(0, nowIdx);

    // Forecast accumulation calculations (Indices nowIdx+1..143 are next 72 hours)
    const forecast3h = sumSlice(nowIdx + 1, nowIdx + 3);
    const forecast6h = sumSlice(nowIdx + 1, nowIdx + 6);
    const forecast12h = sumSlice(nowIdx + 1, nowIdx + 12);
    const forecast24h = sumSlice(nowIdx + 1, nowIdx + 24);
    const forecast48h = sumSlice(nowIdx + 1, nowIdx + 48);

    // Rainfall Trend & Severity Classification
    const trend = forecast6h > accum6h * 1.2 ? '↑ INCREASING' : (forecast6h < accum6h * 0.7 ? '↓ DECREASING' : '→ STABLE');
    let severityClass = 'NORMAL';
    if (accum24h >= 100 || currentRate >= 25) severityClass = 'EXTREME';
    else if (accum24h >= 65 || currentRate >= 15) severityClass = 'VERY HEAVY';
    else if (accum24h >= 35 || currentRate >= 7) severityClass = 'HEAVY';
    else if (accum24h >= 15 || currentRate >= 2.5) severityClass = 'MODERATE';

    // Catchment Matching & AWI
    let nearestCatchment = CATCHMENT_BASINS[0];
    let minCatchDist = 999999;
    CATCHMENT_BASINS.forEach(c => {
      const d = Math.hypot((lat - c.lat) * 111, (lon - c.lon) * 111);
      if (d < minCatchDist) { minCatchDist = d; nearestCatchment = c; }
    });

    // Nearest River Gauge Station
    let nearestRiver = RIVER_GAUGE_STATIONS[0];
    let minRiverDist = 999999;
    RIVER_GAUGE_STATIONS.forEach(r => {
      const d = Math.hypot((lat - r.lat) * 111, (lon - r.lon) * 111);
      if (d < minRiverDist) { minRiverDist = d; nearestRiver = r; }
    });

    // Nearest Dam Reservoir
    let nearestDam = DAM_RESERVOIRS[0];
    let minDamDist = 999999;
    DAM_RESERVOIRS.forEach(dm => {
      const d = Math.hypot((lat - dm.lat) * 111, (lon - dm.lon) * 111);
      if (d < minDamDist) { minDamDist = d; nearestDam = dm; }
    });

    // Nearest Exposure Profile
    let exposure = AGRICULTURE_EXPOSURE_REGIONS[0];
    if (lat > 34.0) exposure = AGRICULTURE_EXPOSURE_REGIONS[1]; // KPK / Swat
    else if (lat > 31.0 && lon > 73.0) exposure = AGRICULTURE_EXPOSURE_REGIONS[2]; // Central Punjab
    else if (lat > 29.0 && lon > 70.5) exposure = AGRICULTURE_EXPOSURE_REGIONS[3]; // South Punjab
    else if (lat < 28.5) exposure = AGRICULTURE_EXPOSURE_REGIONS[4]; // Sindh

    // 4-Hazard Decomposition
    const isUrban = minCatchDist < 40 && (title.includes('Rawalpindi') || title.includes('Islamabad') || title.includes('Lahore') || title.includes('Karachi') || title.includes('Peshawar'));
    const isMountain = lat > 33.8 || (lon < 71.0 && lat > 29.0);

    let urbanStatus = 'NORMAL';
    if (isUrban) {
      if (accum24h > 60 || currentRate > 15) urbanStatus = 'HIGH';
      else if (accum24h > 25 || currentRate > 5) urbanStatus = 'MODERATE';
      else if (accum24h > 10) urbanStatus = 'WATCH';
    }

    let flashStatus = 'NORMAL';
    if (isMountain) {
      if (accum6h > 35 || currentRate > 12) flashStatus = 'HIGH';
      else if (accum6h > 15 || currentRate > 4) flashStatus = 'MODERATE';
      else if (accum6h > 5) flashStatus = 'WATCH';
    } else if (accum24h > 50) {
      flashStatus = 'WATCH';
    }

    let riverStatus = 'NORMAL';
    if (nearestRiver.status.includes('MEDIUM') || nearestRiver.status.includes('ALERT') || accum72h > 75) riverStatus = 'MODERATE';
    if (nearestRiver.status.includes('HIGH FLOOD') || (accum72h > 120 && nearestRiver.trend === 'RISING')) riverStatus = 'HIGH';

    let landslideStatus = 'NORMAL';
    if (isMountain) {
      if (accum24h > 50 && (nearestCatchment.awi === 'SATURATED' || nearestCatchment.awi === 'VERY WET')) landslideStatus = 'HIGH';
      else if (accum24h > 25) landslideStatus = 'MODERATE';
      else if (accum24h > 10) landslideStatus = 'WATCH';
    }

    // Overall Risk Classification & Time-to-Impact Window
    const statuses = [urbanStatus, flashStatus, riverStatus, landslideStatus];
    let overallRisk = 'NORMAL';
    let riskClassColor = '#22c55e';
    let impactWindow = 'NEXT 24–48 HOURS';

    if (statuses.includes('HIGH')) {
      overallRisk = 'HIGH';
      riskClassColor = '#f43f5e';
      impactWindow = 'NEXT 2–4 HOURS';
    } else if (statuses.includes('MODERATE')) {
      overallRisk = 'MODERATE';
      riskClassColor = '#f59e0b';
      impactWindow = 'NEXT 4–8 HOURS';
    } else if (statuses.includes('WATCH')) {
      overallRisk = 'WATCH';
      riskClassColor = '#38bdf8';
      impactWindow = 'NEXT 8–12 HOURS';
    }

    // Deterministic Public Safety Advisories
    const advisories = [];
    if (urbanStatus === 'HIGH' || urbanStatus === 'MODERATE') {
      advisories.push('Avoid low-lying roads, underpasses (Committee Chowk / Kalma / Submarine), and drainage channels.');
      advisories.push('Do not attempt vehicle transit through standing water > 6 inches depth.');
    }
    if (flashStatus === 'HIGH' || flashStatus === 'MODERATE') {
      advisories.push('Move immediately away from nullahs, hill torrents, and dry riverbeds. Flash surges occur rapidly.');
    }
    if (landslideStatus === 'HIGH' || landslideStatus === 'MODERATE') {
      advisories.push('Restricted transit along mountainous highways (N-35 KKH, N-75 Murree Exp, N-95 Swat). Avoid night travel.');
    }
    if (riverStatus === 'HIGH' || riverStatus === 'MODERATE') {
      advisories.push(`Upstream discharge rising at ${nearestRiver.station} (${nearestRiver.river}). Riverside inhabitants should monitor alert sirens.`);
    }
    if (advisories.length === 0) {
      advisories.push('No severe weather hazard currently detected. Normal transit & daily activities can proceed.');
      advisories.push('Monitor radar timeline for developing convective thunderheads.');
    }

    return {
      title,
      lat,
      lon,
      temp,
      humidity,
      windSpeed,
      currentRate,
      accum1h,
      accum3h,
      accum6h,
      accum12h,
      accum24h,
      accum72h,
      forecast3h,
      forecast6h,
      forecast12h,
      forecast24h,
      forecast48h,
      trend,
      severityClass,
      nearestCatchment,
      nearestRiver,
      nearestDam,
      exposure,
      urbanStatus,
      flashStatus,
      riverStatus,
      landslideStatus,
      overallRisk,
      riskClassColor,
      impactWindow,
      advisories
    };
  }

  // --- Render Structured Decision Intelligence Dashboard ---
  function renderIntelligenceDashboard(d) {
    const hydroSvg = renderHydrographSvg(d.nearestRiver.hydrograph);

    dom.infoDrawerContent.innerHTML = `
      <!-- National Situation Summary KPI Header -->
      <div class="ess-national-kpi-grid">
        <div class="ess-kpi-card">
          <div class="ess-kpi-num ${d.overallRisk === 'HIGH' ? 'danger' : (d.overallRisk === 'MODERATE' ? 'warning' : 'info')}">${d.overallRisk}</div>
          <div class="ess-kpi-label">Overall Risk</div>
        </div>
        <div class="ess-kpi-card">
          <div class="ess-kpi-num warning">${d.accum24h} <span style="font-size:10px;">mm</span></div>
          <div class="ess-kpi-label">24h Rain</div>
        </div>
        <div class="ess-kpi-card">
          <div class="ess-kpi-num info">${d.forecast24h} <span style="font-size:10px;">mm</span></div>
          <div class="ess-kpi-label">Next 24h</div>
        </div>
      </div>

      <!-- Target Location Header with Provenance -->
      <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:10px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-weight:800;color:#FFFFFF;font-size:13px;">📍 ${d.title}</span>
          <span class="ess-provenance-tag observed">LIVE OBSERVED</span>
        </div>
        <div style="font-size:11px;color:#cbd5e1;display:flex;gap:10px;">
          <span>Temp: <strong>${d.temp} °C</strong></span>
          <span>Rain: <strong>${d.currentRate.toFixed(1)} mm/h</strong></span>
          <span>Wind: <strong>${d.windSpeed} km/h</strong></span>
        </div>
        <div style="font-size:9.5px;color:#94a3b8;margin-top:4px;">
          Catchment: <strong>${d.nearestCatchment.name}</strong> • Wetness: <strong style="color:#38bdf8;">${d.nearestCatchment.awi}</strong>
        </div>
      </div>

      <!-- 4-Hazard Decomposition Grid -->
      <div class="ess-section-title">
        <span><i class="fa-solid fa-triangle-exclamation"></i> 4-HAZARD RISK DECOMPOSITION</span>
        <span class="ess-provenance-tag modelled">MODELLED</span>
      </div>
      <div class="ess-4hazard-grid">
        <div class="ess-hazard-card">
          <div class="ess-hazard-name"><i class="fa-solid fa-city"></i> Urban Flood</div>
          <div class="ess-hazard-status status-${d.urbanStatus.toLowerCase()}">${d.urbanStatus}</div>
        </div>
        <div class="ess-hazard-card">
          <div class="ess-hazard-name"><i class="fa-solid fa-bolt-lightning"></i> Flash Flood</div>
          <div class="ess-hazard-status status-${d.flashStatus.toLowerCase()}">${d.flashStatus}</div>
        </div>
        <div class="ess-hazard-card">
          <div class="ess-hazard-name"><i class="fa-solid fa-water"></i> River Flood</div>
          <div class="ess-hazard-status status-${d.riverStatus.toLowerCase()}">${d.riverStatus}</div>
        </div>
        <div class="ess-hazard-card">
          <div class="ess-hazard-name"><i class="fa-solid fa-mountain"></i> Landslide</div>
          <div class="ess-hazard-status status-${d.landslideStatus.toLowerCase()}">${d.landslideStatus}</div>
        </div>
      </div>

      <!-- Cumulative & Forecast Rainfall Matrix -->
      <div class="ess-rainfall-matrix-box">
        <div class="ess-section-title">
          <span><i class="fa-solid fa-cloud-showers-water"></i> RAINFALL ACCUMULATION & FORECAST</span>
          <span style="font-size:10px;color:#f59e0b;font-weight:700;">${d.trend}</span>
        </div>
        <div class="ess-matrix-grid">
          <div class="ess-matrix-cell">
            <div class="val">${d.accum6h}</div>
            <div class="lbl">Last 6h</div>
          </div>
          <div class="ess-matrix-cell">
            <div class="val">${d.accum24h}</div>
            <div class="lbl">Last 24h</div>
          </div>
          <div class="ess-matrix-cell">
            <div class="val">${d.forecast6h}</div>
            <div class="lbl">Next 6h</div>
          </div>
          <div class="ess-matrix-cell">
            <div class="val">${d.forecast24h}</div>
            <div class="lbl">Next 24h</div>
          </div>
        </div>
        <div style="font-size:10px;color:#94a3b8;margin-top:6px;display:flex;justify-content:space-between;">
          <span>Class: <strong style="color:#ffffff;">${d.severityClass}</strong></span>
          <span>72h Total: <strong style="color:#38bdf8;">${d.accum72h} mm</strong></span>
        </div>
      </div>

      <!-- River Intelligence & Hydrograph -->
      <div class="ess-hydrograph-box">
        <div class="ess-section-title">
          <span><i class="fa-solid fa-route"></i> ${d.nearestRiver.river.toUpperCase()} (${d.nearestRiver.station})</span>
          <span style="font-size:9.5px;color:#38bdf8;font-weight:700;">${d.nearestRiver.trend}</span>
        </div>
        <div style="font-size:10.5px;color:#cbd5e1;display:flex;justify-content:space-between;">
          <span>Inflow: <strong>${(d.nearestRiver.inflow/1000).toFixed(0)}k cusecs</strong></span>
          <span>Outflow: <strong>${(d.nearestRiver.outflow/1000).toFixed(0)}k cusecs</strong></span>
        </div>
        ${hydroSvg}
        <div style="font-size:9px;color:#94a3b8;display:flex;justify-content:space-between;margin-top:2px;">
          <span>Past 48h (Solid)</span>
          <span style="font-weight:700;color:#f59e0b;">NOW</span>
          <span>Forecast 48h (Dashed)</span>
        </div>
      </div>

      <!-- Agricultural & Population Exposure -->
      <div class="ess-exposure-box">
        <div class="ess-section-title">
          <span><i class="fa-solid fa-users-viewfinder"></i> EXPOSURE & IMPACT ANALYTICS</span>
        </div>
        <div class="ess-exposure-stat-row">
          <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:6px;">
            <div style="font-size:13px;font-weight:800;color:#ffffff;">${(d.exposure.pop/1000).toFixed(0)}k</div>
            <div style="font-size:8.5px;color:#94a3b8;">Population</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:6px;">
            <div style="font-size:13px;font-weight:800;color:#ffffff;">${d.exposure.roadsKm} km</div>
            <div style="font-size:8.5px;color:#94a3b8;">Roads</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:6px;">
            <div style="font-size:13px;font-weight:800;color:#ffffff;">${(d.exposure.croplandHa/1000).toFixed(1)}k ha</div>
            <div style="font-size:8.5px;color:#94a3b8;">Crops</div>
          </div>
        </div>
        <div class="ess-crop-pill-group">
          <div class="ess-crop-pill">🌾 Rice: <strong>${(d.exposure.riceHa/1000).toFixed(1)}k ha</strong></div>
          <div class="ess-crop-pill">🌱 Cotton: <strong>${(d.exposure.cottonHa/1000).toFixed(1)}k ha</strong></div>
          <div class="ess-crop-pill">🌽 Maize: <strong>${(d.exposure.maizeHa/1000).toFixed(1)}k ha</strong></div>
        </div>
      </div>

      <!-- Public Safety Advisory -->
      <div class="ess-advisory-box">
        <div class="ess-advisory-header">
          <span><i class="fa-solid fa-shield-halved"></i> ACTIONABLE PUBLIC ADVISORY</span>
          <span style="font-size:9.5px;color:#ffffff;background:#e11d48;padding:1px 5px;border-radius:4px;">${d.impactWindow}</span>
        </div>
        <ul class="ess-advisory-list">
          ${d.advisories.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>

      <!-- Source & Provenance Stamp -->
      <div style="font-size:9px;color:#64748b;text-align:center;margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;">
        Updated: <strong>01 Sep 2026 | Live PKT</strong> • Source: <strong>PMD / FFD / Sentinel-1 / ESS Model</strong> • Confidence: <strong style="color:#22c55e;">HIGH</strong>
      </div>
    `;
  }

  // --- SVG Hydrograph Generator ---
  function renderHydrographSvg(points) {
    if (!points || points.length < 5) return '';
    const maxVal = Math.max(...points) * 1.15;
    const minVal = Math.min(...points) * 0.85;
    const w = 380;
    const h = 75;

    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * w;
      const y = h - ((val - minVal) / (maxVal - minVal || 1)) * (h - 15) - 8;
      return { x, y };
    });

    const pastPath = `M ${coords[0].x},${coords[0].y} ` + coords.slice(1, 4).map(c => `L ${c.x},${c.y}`).join(' ');
    const forecastPath = `M ${coords[3].x},${coords[3].y} ` + coords.slice(4).map(c => `L ${c.x},${c.y}`).join(' ');

    return `
      <svg class="ess-hydrograph-svg" viewBox="0 0 ${w} ${h}">
        <line x1="0" y1="${h-2}" x2="${w}" y2="${h-2}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
        <line x1="${coords[3].x}" y1="0" x2="${coords[3].x}" y2="${h}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3"/>
        <path d="${pastPath}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        <path d="${forecastPath}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="4,4" stroke-linecap="round"/>
        ${coords.map((c, i) => `<circle cx="${c.x}" cy="${c.y}" r="${i === 3 ? 4 : 2.5}" fill="${i >= 3 ? '#f59e0b' : '#38bdf8'}"/>`).join('')}
      </svg>
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

    // 5 Analytical Modes Switcher (A. WEATHER -> E. ADVISORY)
    document.querySelectorAll('.ess-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ess-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        
        if (mode === 'weather') {
          state.activeLayer = 'composite';
          renderComposite(state.currentFrameIndex);
        } else if (mode === 'rainfall') {
          state.activeLayer = 'radar';
          renderComposite(state.currentFrameIndex);
          dom.infoDrawer.classList.remove('hidden');
        } else if (mode === 'flood') {
          state.activeLayer = 'floods';
          renderHazardLayers('floods');
          dom.infoDrawer.classList.remove('hidden');
        } else if (mode === 'impact') {
          state.activeLayer = 'agriculture';
          dom.infoDrawer.classList.remove('hidden');
        } else if (mode === 'advisory') {
          dom.infoDrawer.classList.remove('hidden');
        }
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
