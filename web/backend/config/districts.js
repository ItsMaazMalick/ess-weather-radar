/**
 * ESS Weather & Flood Intelligence — Pakistan district reference dataset
 *
 * Coordinates are real district centroids. The three modifier fields are ESS
 * STATIC REFERENCE CLASSIFICATIONS on a 0..1 scale — they are expert-assigned
 * characteristics, not live measurements, and every API response that leans on
 * them says so via `data_type: "MODELLED"` and a reduced confidence rating.
 *
 *   urban_density    1 = dense impervious built-up, 0 = open rural land
 *   drainage_deficit 1 = drainage known to surcharge quickly, 0 = free-draining
 *   river_exposure   1 = sits on a major floodplain / confluence, 0 = away from
 *                        any significant channel
 *
 * Terrain slope is NOT stored here: it is measured at runtime from the
 * Copernicus DEM GLO-90 via the elevation service, so it is real data.
 *
 * Phase 2 replaces these classifications with catchment polygons, DEM-derived
 * drainage networks and gauge-linked river exposure.
 */

'use strict';

const DISTRICTS = [
  // ---------------------------------------------------------------- Punjab
  { id: 'lahore', name: 'Lahore', province: 'Punjab', lat: 31.5204, lon: 74.3587, urban_density: 0.95, drainage_deficit: 0.75, river_exposure: 0.45, basin: 'Ravi' },
  { id: 'rawalpindi', name: 'Rawalpindi', province: 'Punjab', lat: 33.5651, lon: 73.0169, urban_density: 0.88, drainage_deficit: 0.82, river_exposure: 0.55, basin: 'Soan' },
  { id: 'faisalabad', name: 'Faisalabad', province: 'Punjab', lat: 31.4180, lon: 73.0790, urban_density: 0.85, drainage_deficit: 0.65, river_exposure: 0.25, basin: 'Chenab' },
  { id: 'multan', name: 'Multan', province: 'Punjab', lat: 30.1575, lon: 71.5249, urban_density: 0.75, drainage_deficit: 0.60, river_exposure: 0.65, basin: 'Chenab' },
  { id: 'gujranwala', name: 'Gujranwala', province: 'Punjab', lat: 32.1877, lon: 74.1945, urban_density: 0.80, drainage_deficit: 0.65, river_exposure: 0.40, basin: 'Chenab' },
  { id: 'sialkot', name: 'Sialkot', province: 'Punjab', lat: 32.4945, lon: 74.5229, urban_density: 0.70, drainage_deficit: 0.60, river_exposure: 0.55, basin: 'Chenab' },
  { id: 'bahawalpur', name: 'Bahawalpur', province: 'Punjab', lat: 29.3956, lon: 71.6836, urban_density: 0.55, drainage_deficit: 0.45, river_exposure: 0.50, basin: 'Sutlej' },
  { id: 'sargodha', name: 'Sargodha', province: 'Punjab', lat: 32.0836, lon: 72.6711, urban_density: 0.60, drainage_deficit: 0.50, river_exposure: 0.50, basin: 'Jhelum' },
  { id: 'dera_ghazi_khan', name: 'Dera Ghazi Khan', province: 'Punjab', lat: 30.0489, lon: 70.6455, urban_density: 0.45, drainage_deficit: 0.50, river_exposure: 0.75, basin: 'Indus' },
  { id: 'sahiwal', name: 'Sahiwal', province: 'Punjab', lat: 30.6682, lon: 73.1114, urban_density: 0.50, drainage_deficit: 0.45, river_exposure: 0.35, basin: 'Ravi' },
  { id: 'jhelum', name: 'Jhelum', province: 'Punjab', lat: 32.9425, lon: 73.7257, urban_density: 0.45, drainage_deficit: 0.40, river_exposure: 0.70, basin: 'Jhelum' },
  { id: 'rajanpur', name: 'Rajanpur', province: 'Punjab', lat: 29.1044, lon: 70.3301, urban_density: 0.30, drainage_deficit: 0.45, river_exposure: 0.80, basin: 'Indus' },
  { id: 'layyah', name: 'Layyah', province: 'Punjab', lat: 30.9693, lon: 70.9428, urban_density: 0.30, drainage_deficit: 0.40, river_exposure: 0.70, basin: 'Indus' },
  { id: 'muzaffargarh', name: 'Muzaffargarh', province: 'Punjab', lat: 30.0736, lon: 71.1805, urban_density: 0.35, drainage_deficit: 0.50, river_exposure: 0.80, basin: 'Indus' },

  // ------------------------------------------------------------------ Sindh
  { id: 'karachi', name: 'Karachi', province: 'Sindh', lat: 24.8607, lon: 67.0011, urban_density: 0.97, drainage_deficit: 0.85, river_exposure: 0.25, basin: 'Coastal (Malir/Lyari)' },
  { id: 'hyderabad', name: 'Hyderabad', province: 'Sindh', lat: 25.3960, lon: 68.3578, urban_density: 0.80, drainage_deficit: 0.70, river_exposure: 0.60, basin: 'Indus' },
  { id: 'sukkur', name: 'Sukkur', province: 'Sindh', lat: 27.7052, lon: 68.8574, urban_density: 0.60, drainage_deficit: 0.55, river_exposure: 0.85, basin: 'Indus' },
  { id: 'larkana', name: 'Larkana', province: 'Sindh', lat: 27.5590, lon: 68.2120, urban_density: 0.50, drainage_deficit: 0.60, river_exposure: 0.70, basin: 'Indus' },
  { id: 'dadu', name: 'Dadu', province: 'Sindh', lat: 26.7300, lon: 67.7770, urban_density: 0.35, drainage_deficit: 0.65, river_exposure: 0.80, basin: 'Indus' },
  { id: 'nawabshah', name: 'Shaheed Benazirabad', province: 'Sindh', lat: 26.2442, lon: 68.4100, urban_density: 0.45, drainage_deficit: 0.60, river_exposure: 0.70, basin: 'Indus' },
  { id: 'thatta', name: 'Thatta', province: 'Sindh', lat: 24.7461, lon: 67.9243, urban_density: 0.30, drainage_deficit: 0.55, river_exposure: 0.75, basin: 'Indus Delta' },
  { id: 'badin', name: 'Badin', province: 'Sindh', lat: 24.6558, lon: 68.8370, urban_density: 0.30, drainage_deficit: 0.70, river_exposure: 0.60, basin: 'Indus Delta' },
  { id: 'jacobabad', name: 'Jacobabad', province: 'Sindh', lat: 28.2769, lon: 68.4514, urban_density: 0.40, drainage_deficit: 0.70, river_exposure: 0.60, basin: 'Indus' },

  // ------------------------------------------------------ Khyber Pakhtunkhwa
  { id: 'peshawar', name: 'Peshawar', province: 'Khyber Pakhtunkhwa', lat: 34.0151, lon: 71.5249, urban_density: 0.85, drainage_deficit: 0.65, river_exposure: 0.50, basin: 'Kabul' },
  { id: 'nowshera', name: 'Nowshera', province: 'Khyber Pakhtunkhwa', lat: 34.0153, lon: 71.9747, urban_density: 0.50, drainage_deficit: 0.55, river_exposure: 0.85, basin: 'Kabul' },
  { id: 'mardan', name: 'Mardan', province: 'Khyber Pakhtunkhwa', lat: 34.1989, lon: 72.0231, urban_density: 0.55, drainage_deficit: 0.55, river_exposure: 0.50, basin: 'Kabul' },
  { id: 'swat', name: 'Swat', province: 'Khyber Pakhtunkhwa', lat: 34.7717, lon: 72.3600, urban_density: 0.40, drainage_deficit: 0.40, river_exposure: 0.80, basin: 'Swat' },
  { id: 'chitral', name: 'Chitral', province: 'Khyber Pakhtunkhwa', lat: 35.8518, lon: 71.7864, urban_density: 0.20, drainage_deficit: 0.30, river_exposure: 0.70, basin: 'Chitral / Kunar' },
  { id: 'upper_dir', name: 'Upper Dir', province: 'Khyber Pakhtunkhwa', lat: 35.2077, lon: 71.8747, urban_density: 0.15, drainage_deficit: 0.30, river_exposure: 0.70, basin: 'Panjkora' },
  { id: 'abbottabad', name: 'Abbottabad', province: 'Khyber Pakhtunkhwa', lat: 34.1558, lon: 73.2194, urban_density: 0.50, drainage_deficit: 0.45, river_exposure: 0.35, basin: 'Haro / Indus' },
  { id: 'mansehra', name: 'Mansehra', province: 'Khyber Pakhtunkhwa', lat: 34.3300, lon: 73.2000, urban_density: 0.30, drainage_deficit: 0.35, river_exposure: 0.50, basin: 'Indus' },
  { id: 'kohat', name: 'Kohat', province: 'Khyber Pakhtunkhwa', lat: 33.5869, lon: 71.4414, urban_density: 0.45, drainage_deficit: 0.45, river_exposure: 0.40, basin: 'Kohat Toi' },
  { id: 'dera_ismail_khan', name: 'Dera Ismail Khan', province: 'Khyber Pakhtunkhwa', lat: 31.8313, lon: 70.9019, urban_density: 0.40, drainage_deficit: 0.50, river_exposure: 0.75, basin: 'Indus' },

  // ------------------------------------------------------------ Balochistan
  { id: 'quetta', name: 'Quetta', province: 'Balochistan', lat: 30.1798, lon: 66.9750, urban_density: 0.65, drainage_deficit: 0.60, river_exposure: 0.30, basin: 'Pishin Lora' },
  { id: 'gwadar', name: 'Gwadar', province: 'Balochistan', lat: 25.1264, lon: 62.3225, urban_density: 0.40, drainage_deficit: 0.55, river_exposure: 0.30, basin: 'Coastal Makran' },
  { id: 'kech', name: 'Kech (Turbat)', province: 'Balochistan', lat: 26.0031, lon: 63.0544, urban_density: 0.30, drainage_deficit: 0.45, river_exposure: 0.60, basin: 'Kech' },
  { id: 'sibi', name: 'Sibi', province: 'Balochistan', lat: 29.5430, lon: 67.8773, urban_density: 0.30, drainage_deficit: 0.50, river_exposure: 0.60, basin: 'Nari' },
  { id: 'lasbela', name: 'Lasbela', province: 'Balochistan', lat: 25.8700, lon: 66.6200, urban_density: 0.25, drainage_deficit: 0.45, river_exposure: 0.75, basin: 'Porali' },
  { id: 'khuzdar', name: 'Khuzdar', province: 'Balochistan', lat: 27.8120, lon: 66.6100, urban_density: 0.25, drainage_deficit: 0.40, river_exposure: 0.55, basin: 'Mula' },
  { id: 'zhob', name: 'Zhob', province: 'Balochistan', lat: 31.3417, lon: 69.4486, urban_density: 0.20, drainage_deficit: 0.35, river_exposure: 0.50, basin: 'Zhob' },
  { id: 'naseerabad', name: 'Naseerabad', province: 'Balochistan', lat: 28.4000, lon: 68.1000, urban_density: 0.25, drainage_deficit: 0.70, river_exposure: 0.75, basin: 'Indus' },

  // -------------------------------------------------------- Gilgit-Baltistan
  { id: 'gilgit', name: 'Gilgit', province: 'Gilgit-Baltistan', lat: 35.9208, lon: 74.3080, urban_density: 0.30, drainage_deficit: 0.30, river_exposure: 0.60, basin: 'Gilgit' },
  { id: 'skardu', name: 'Skardu', province: 'Gilgit-Baltistan', lat: 35.2971, lon: 75.6333, urban_density: 0.25, drainage_deficit: 0.25, river_exposure: 0.55, basin: 'Upper Indus' },
  { id: 'hunza', name: 'Hunza', province: 'Gilgit-Baltistan', lat: 36.3167, lon: 74.6500, urban_density: 0.15, drainage_deficit: 0.25, river_exposure: 0.60, basin: 'Hunza' },
  { id: 'diamer', name: 'Diamer (Chilas)', province: 'Gilgit-Baltistan', lat: 35.4200, lon: 74.0940, urban_density: 0.15, drainage_deficit: 0.25, river_exposure: 0.60, basin: 'Upper Indus' },
  { id: 'ghizer', name: 'Ghizer', province: 'Gilgit-Baltistan', lat: 36.1700, lon: 73.4500, urban_density: 0.12, drainage_deficit: 0.25, river_exposure: 0.55, basin: 'Ghizer' },

  // --------------------------------------------------------------- AJK & ICT
  { id: 'islamabad', name: 'Islamabad (ICT)', province: 'Islamabad Capital Territory', lat: 33.6844, lon: 73.0479, urban_density: 0.72, drainage_deficit: 0.55, river_exposure: 0.35, basin: 'Soan' },
  { id: 'muzaffarabad', name: 'Muzaffarabad', province: 'Azad Jammu & Kashmir', lat: 34.3700, lon: 73.4711, urban_density: 0.40, drainage_deficit: 0.40, river_exposure: 0.70, basin: 'Jhelum / Neelum' },
  { id: 'mirpur', name: 'Mirpur', province: 'Azad Jammu & Kashmir', lat: 33.1478, lon: 73.7519, urban_density: 0.45, drainage_deficit: 0.40, river_exposure: 0.50, basin: 'Jhelum (Mangla)' },
  { id: 'poonch', name: 'Poonch (Rawalakot)', province: 'Azad Jammu & Kashmir', lat: 33.8578, lon: 73.7601, urban_density: 0.25, drainage_deficit: 0.35, river_exposure: 0.40, basin: 'Poonch' },
  { id: 'neelum', name: 'Neelum', province: 'Azad Jammu & Kashmir', lat: 34.5880, lon: 73.9080, urban_density: 0.10, drainage_deficit: 0.25, river_exposure: 0.65, basin: 'Neelum' }
];

/** Province groupings used by the national summary and the province quick-jump. */
const PROVINCES = [
  { key: 'punjab', name: 'Punjab', match: 'Punjab' },
  { key: 'sindh', name: 'Sindh', match: 'Sindh' },
  { key: 'kp', name: 'Khyber Pakhtunkhwa', match: 'Khyber Pakhtunkhwa' },
  { key: 'balochistan', name: 'Balochistan', match: 'Balochistan' },
  { key: 'gb', name: 'Gilgit-Baltistan', match: 'Gilgit-Baltistan' },
  { key: 'ajk', name: 'Azad Jammu & Kashmir', match: 'Azad Jammu & Kashmir' },
  { key: 'ict', name: 'Islamabad Capital Territory', match: 'Islamabad Capital Territory' }
];

const byId = new Map(DISTRICTS.map(d => [d.id, d]));

/** Great-circle distance in kilometres. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Nearest reference district to an arbitrary coordinate.
 * Returns the district plus the distance, so callers can tell the user how far
 * away the reference characteristics were sourced from rather than implying the
 * classification was measured at their exact position.
 */
function nearestDistrict(lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const d of DISTRICTS) {
    const km = haversineKm(lat, lon, d.lat, d.lon);
    if (km < bestKm) {
      bestKm = km;
      best = d;
    }
  }
  return { district: best, distanceKm: Math.round(bestKm * 10) / 10 };
}

module.exports = {
  DISTRICTS,
  PROVINCES,
  getDistrict: id => byId.get(id) || null,
  nearestDistrict,
  haversineKm
};
