with open('app.js', 'r') as f:
    code = f.read()

old_render = """  function renderHazardLayers(activeLayer) {
    if (state.hazardLayerGroup && state.map.hasLayer(state.hazardLayerGroup)) {
      state.map.removeLayer(state.hazardLayerGroup);
    }

    state.hazardLayerGroup = L.layerGroup();

    const isBlockageMode = activeLayer === 'blockages';
    const isFloodMode = activeLayer === 'floods';

    // In default radar mode, keep map clean
    if (!isBlockageMode && !isFloodMode) {
      return;
    }"""

new_render = """  function renderHazardLayers(activeLayer) {
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
    }"""

if old_render in code:
    code = code.replace(old_render, new_render)
    with open('app.js', 'w') as f:
        f.write(code)
    print("Patched renderHazardLayers successfully!")
else:
    print("Could not find old_render snippet")
