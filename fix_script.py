with open('app.js') as f:
    code = f.read()

# 1. In renderPmdRadarCones
old_tower = """      towerMarker.on('click', () => {
        inspectPointWeather(station.lat, station.lon, station.name);
        dom.nationalHeadlineText.innerHTML = `
          <div style="background:rgba(56,189,248,0.15);border:1px solid #38bdf8;padding:8px;border-radius:8px;margin-bottom:8px;">
            <div style="font-weight:700;color:#38bdf8;font-size:13px;"><i class="fa-solid fa-tower-broadcast"></i> ${station.name}</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">Type: <strong>${station.frequency}</strong> • Elevation: <strong>${station.elevation}</strong></div>
            <div style="font-size:11px;color:#8DC63F;font-weight:700;margin-top:2px;">● Status: ${station.status} (Coverage: ${station.radiusKm} km)</div>
          </div>
          <div style="font-size:11.5px;color:#e2e8f0;line-height:1.4;">
            Active high-precision Doppler weather radar operated under Pakistan Meteorological Department (PMD) & Flood Forecasting Division.
          </div>
        `;
      });"""

new_tower = """      towerMarker.on('click', () => {
        inspectPointWeather(station.lat, station.lon, station.name);
      });"""

code = code.replace(old_tower, new_tower)

# 2. In showHazardListSummary
old_hazard_list = """  function showHazardListSummary(type) {
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
  }"""

new_hazard_list = """  function showHazardListSummary(type) {
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
  }"""

code = code.replace(old_hazard_list, new_hazard_list)

# 3. In inspectHazardDetails
old_hazard_details = """  function inspectHazardDetails(hazard) {
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
  }"""

new_hazard_details = """  function inspectHazardDetails(hazard) {
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
  }"""

code = code.replace(old_hazard_details, new_hazard_details)

# 4. In inspectPointWeather
code = code.replace("    dom.activeInspectedLocation.textContent = title;\n", "")

# 5. In dom object, remove unused dom references
code = code.replace("    activeInspectedLocation: document.getElementById('active-inspected-location'),\n", "")
code = code.replace("    nationalHeadlineText: document.getElementById('national-headline-text'),\n", "")
code = code.replace("    metricTemp: document.getElementById('metric-temp'),\n", "")
code = code.replace("    metricPrecip: document.getElementById('metric-precip'),\n", "")
code = code.replace("    metricHumidity: document.getElementById('metric-humidity'),\n", "")

with open('app.js', 'w') as f:
    f.write(code)

print('Cleaned and patched app.js successfully!')
