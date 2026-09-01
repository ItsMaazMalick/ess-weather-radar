import json, re

with open('app.js', 'r') as f:
    code = f.read()

split_token = '  // --- High-Risk Urban Chowks, Underpasses & Nullah Basins in Pakistan ---'
prefix = code.split(split_token)[0]

suffix = """  // ==========================================================================
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
    dom.activeInspectedLocation.textContent = title;
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
"""

# Replace dom selectors to add infoDrawerContent
prefix = prefix.replace("infoDrawer: document.getElementById('info-drawer'),", "infoDrawer: document.getElementById('info-drawer'),\\n    infoDrawerContent: document.getElementById('info-drawer-content'),")

with open('app.js', 'w') as f:
    f.write(prefix + suffix)

print("Updated app.js successfully!")
