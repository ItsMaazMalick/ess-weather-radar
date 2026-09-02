/**
 * Location intelligence composer (spec §25).
 *
 * Assembles the full decision object for one coordinate:
 *   weather -> rainfall analytics -> wetness -> risk -> advisory
 *
 * Phase 2 adds three genuinely real modules, each from a different open,
 * no-registration data source:
 *   catchment.delineation  <- HydroBASINS (real basin polygons + flow routing)
 *   river                  <- Copernicus GloFAS (real global discharge-alert model)
 *   exposure.population/roads <- WorldPop + OpenStreetMap/Overpass (real, live)
 *
 * What remains genuinely unavailable (reservoir telemetry, SAR inundation,
 * settlements/schools/health facilities, crop-TYPE maps) is still returned as
 * an explicit INTEGRATION_PENDING block naming the source required to complete
 * it. They never return placeholder numbers: a fabricated exposure figure in a
 * public-safety product is worse than an honest gap.
 */

'use strict';

const { getPointSeries } = require('./openMeteo');
const { getTerrainBatch, SOURCE: TERRAIN_SOURCE } = require('./terrain');
const { analyseRainfall } = require('./rainfall');
const { assessWetness } = require('./wetness');
const { assessRisk } = require('./riskEngine');
const { generateAdvisories } = require('./advisory');
const { getCatchment } = require('./catchment');
const { getRiverAlert } = require('./glofas');
const { getExposure } = require('./exposure');
const { getHistoricalComparison } = require('./historical');
const { nearestDistrict } = require('../config/districts');
const { RUNOFF, FACTOR_CURVES } = require('../config/thresholds');
const { interpolate, clamp01 } = require('../lib/curve');
const { ATTRIBUTION } = require('./openMeteo');

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
};

/** Data sources this build genuinely uses, for the §22 source line. */
const CORE_SOURCES = [
  { id: 'open-meteo', name: 'Open-Meteo', role: 'Rainfall observation & forecast, soil moisture, current conditions', data_type: 'OBSERVED/FORECAST' },
  { id: 'copernicus-dem', name: 'Copernicus DEM GLO-90', role: 'Terrain elevation & gradient', data_type: 'OBSERVED' },
  { id: 'ess-model', name: 'ESS Flood Risk Engine v1.0', role: 'Hazard classification & advisory', data_type: 'MODELLED' },
  { id: 'ess-reference', name: 'ESS District Reference Dataset', role: 'Urban density, drainage and floodplain classification', data_type: 'MODELLED' }
];

const PHASE2_SOURCES = [
  { id: 'hydrobasins', name: 'HydroBASINS / HydroSHEDS (WWF)', role: 'Real catchment delineation & downstream flow routing', data_type: 'OBSERVED' },
  { id: 'glofas', name: 'Copernicus GloFAS', role: 'Global river discharge exceedance alerts', data_type: 'OBSERVED' },
  { id: 'worldpop', name: 'WorldPop', role: 'Gridded population exposure', data_type: 'MODELLED' },
  { id: 'osm-overpass', name: 'OpenStreetMap (Overpass API)', role: 'Live road network exposure', data_type: 'OBSERVED' }
];

// Kept for compatibility with anything importing the old Phase-1-only name.
const PHASE1_SOURCES = CORE_SOURCES;

/**
 * A module that cannot be honestly computed yet.
 * Carries the reason and the exact source needed so the gap is actionable.
 */
function pending(module, requiredSources, note) {
  return {
    status: 'INTEGRATION_PENDING',
    available: false,
    module,
    required_sources: requiredSources,
    note,
    data_type: null,
    values: null
  };
}

function classifyRunoff(index) {
  const t = RUNOFF.thresholds;
  if (index >= t.VERY_HIGH) return 'VERY_HIGH';
  if (index >= t.HIGH) return 'HIGH';
  if (index >= t.MODERATE) return 'MODERATE';
  return 'LOW';
}

/**
 * Point-scale runoff potential (spec §12 precursor).
 * Real catchment routing arrives in Phase 2; this is explicitly point-scoped.
 */
function assessRunoff({ wetness, terrain, rainfall }) {
  const parts = [];
  let sum = 0;
  let weight = 0;

  const add = (key, value) => {
    if (value == null) return;
    sum += RUNOFF.weights[key] * value;
    weight += RUNOFF.weights[key];
    parts.push(key);
  };

  add('wetness', wetness?.index ?? null);
  add('slope', terrain?.slope_deg != null ? clamp01(interpolate(FACTOR_CURVES.slope, terrain.slope_deg)) : null);
  add('rainfall_6h', rainfall?.observed?.['6h']?.mm != null ? clamp01(interpolate(FACTOR_CURVES.accum_6h, rainfall.observed['6h'].mm)) : null);

  if (weight === 0) return { index: null, class: 'UNKNOWN', scope: 'POINT', data_type: 'MODELLED' };

  const index = clamp01(sum / weight);
  return {
    index: Math.round(index * 1000) / 1000,
    class: classifyRunoff(index),
    inputs_used: parts,
    scope: 'POINT',
    data_type: 'MODELLED',
    note: 'Point-scale runoff potential. Catchment delineation and routing are Phase 2.'
  };
}

function describeWeather(current) {
  if (!current) return null;
  return {
    temperature_c: current.temperature_2m ?? null,
    humidity_pct: current.relative_humidity_2m ?? null,
    cloud_cover_pct: current.cloud_cover ?? null,
    wind_speed_kmh: current.wind_speed_10m ?? null,
    wind_direction_deg: current.wind_direction_10m ?? null,
    pressure_hpa: current.surface_pressure ?? null,
    weather_code: current.weather_code ?? null,
    condition: WEATHER_CODES[current.weather_code] ?? 'Unknown',
    observed_at: current.time ? current.time * 1000 : null,
    data_type: 'OBSERVED'
  };
}

/**
 * Overall report confidence: the weakest link among what the answer rests on.
 */
function deriveReportConfidence({ risk, wetness, terrain }) {
  const reasons = [];
  let confidence = risk?.overall?.confidence || 'MODERATE';

  if (!terrain?.available) {
    confidence = 'LOW';
    reasons.push('terrain gradient unavailable');
  }
  if (!wetness?.complete) {
    confidence = confidence === 'HIGH' ? 'MODERATE' : confidence;
    reasons.push('soil moisture unavailable; wetness from prior rainfall only');
  }
  reasons.push('no river gauge, discharge or satellite inundation input in Phase 1');

  return { confidence, reasons };
}

/**
 * Full location report.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {object} [opts] { label }
 */
async function buildLocationReport(lat, lon, opts = {}) {
  const nowMs = Date.now();

  const [[series], [terrain]] = await Promise.all([
    getPointSeries([{ lat, lon }]),
    getTerrainBatch([{ lat, lon }])
  ]);

  if (!series) throw new Error('No meteorological series returned for this location');

  const { district, distanceKm } = nearestDistrict(lat, lon);

  const rainfall = analyseRainfall(series, nowMs);
  const wetness = assessWetness(series, rainfall, nowMs);
  const runoff = assessRunoff({ wetness, terrain, rainfall });
  const catchment = getCatchment(lat, lon); // in-memory, no network cost
  const risk = assessRisk({ rainfall, wetness, terrain, reference: district });
  const advisory = generateAdvisories({ risk, rainfall, wetness });
  const { confidence, reasons } = deriveReportConfidence({ risk, wetness, terrain });

  return {
    location: {
      label: opts.label || district?.name || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
      latitude: Number(lat.toFixed(4)),
      longitude: Number(lon.toFixed(4)),
      elevation_m: terrain?.elevation_m ?? series.elevation ?? null,
      terrain_class: terrain?.terrain_class ?? 'UNKNOWN',
      slope_deg: terrain?.slope_deg ?? null,
      // Stated plainly: administrative context comes from the nearest reference
      // point, not from a boundary lookup.
      reference_district: district
        ? {
            id: district.id,
            name: district.name,
            province: district.province,
            basin: district.basin,
            distance_km: distanceKm,
            match_type: distanceKm <= 25 ? 'WITHIN_DISTRICT_AREA' : 'NEAREST_REFERENCE_POINT'
          }
        : null
    },

    timestamp: new Date(nowMs).toISOString(),
    timezone: 'Asia/Karachi (PKT, UTC+5)',

    weather: describeWeather(series.current),

    rainfall,

    catchment: {
      // Real HydroBASINS delineation — in-memory point-in-polygon, so this is
      // fast enough to include in the core response (unlike river/exposure below).
      id: catchment.available ? catchment.hybas_id : null,
      name: district?.basin ? `${district.basin} basin (reference)` : null,
      delineation: catchment,
      wetness_class: wetness.class,
      wetness_index: wetness.index,
      wetness_detail: wetness,
      runoff_risk: runoff.class,
      runoff_detail: runoff
    },

    // River discharge alerts (GloFAS) and exposure (WorldPop/OSM) are real but
    // are live network calls too slow to block this endpoint on — fetch them
    // from GET /api/v1/location/enrichment?lat=&lon= once the core report is
    // showing, and merge the result in.
    river: {
      status: 'FETCH_SEPARATELY',
      endpoint: '/api/v1/location/enrichment',
      note: 'Real GloFAS river discharge-alert data is available from the enrichment endpoint, fetched asynchronously so it does not delay this response.'
    },

    reservoir: pending('reservoir_situation',
      ['WAPDA / IRSA reservoir levels'],
      'Tarbela/Mangla level, storage and trend require WAPDA or IRSA data access (spec §11). No open source was found for real-time reservoir levels.'),

    risk: {
      river_flood: risk.hazards.river_flood.level,
      flash_flood: risk.hazards.flash_flood.level,
      urban_flood: risk.hazards.urban_flood.level,
      landslide: risk.hazards.landslide.level,
      overall: risk.overall.level,
      detail: risk
    },

    exposure: {
      status: 'FETCH_SEPARATELY',
      endpoint: '/api/v1/location/enrichment',
      note: 'Real population (WorldPop) and road-network (OpenStreetMap) exposure are available from the enrichment endpoint.'
    },

    historical_comparison: {
      status: 'FETCH_SEPARATELY',
      endpoint: '/api/v1/location/enrichment',
      note: 'A real 20-year ERA5-based seasonal rainfall comparison is available from the enrichment endpoint (it takes a large historical query, so it is not on the fast path).'
    },

    satellite_flood: pending('sar_inundation',
      ['Sentinel-1 SAR via Copernicus Data Space or Google Earth Engine'],
      'Observed flood extent requires Sentinel-1 SAR processing with a permanent-water mask (spec §14). No credentials for this are available.'),

    advisory,

    source: [...CORE_SOURCES, ...(catchment.available ? [PHASE2_SOURCES[0]] : [])],
    attribution: [ATTRIBUTION, TERRAIN_SOURCE],
    confidence,
    confidence_reasons: reasons,
    data_type: 'MIXED',
    data_type_legend: {
      OBSERVED: 'Measured or analysed observation',
      FORECAST: 'Numerical weather prediction',
      MODELLED: 'ESS analytics output derived from observed and forecast inputs',
      VERIFIED: 'Confirmed by a field or official report (not yet integrated)',
      SATELLITE_OBSERVED: 'Derived from satellite imagery (SAR inundation not yet integrated)'
    },
    phase: 'PHASE_2',
    model_version: risk.model_version
  };
}

/**
 * The slower real-data modules (spec §10, §15, §16, §20), fetched separately so
 * they never delay the core report above. Real GloFAS discharge-alert status,
 * WorldPop/OSM exposure, and a 20-year ERA5 historical rainfall comparison.
 *
 * @param {number} current24hMm  live observed 24h rainfall, for the percentile comparison
 */
async function buildLocationEnrichment(lat, lon, current24hMm) {
  const [riverAlert, exposure, historical] = await Promise.all([
    getRiverAlert(lat, lon),
    getExposure(lat, lon),
    getHistoricalComparison(lat, lon, current24hMm).catch(err => ({
      available: false,
      reason: err.message
    }))
  ]);

  return {
    location: { latitude: Number(lat.toFixed(4)), longitude: Number(lon.toFixed(4)) },
    timestamp: new Date().toISOString(),
    river: {
      ...riverAlert,
      scope: 'GloFAS global hydrological model — not official Pakistan FFD/WAPDA gauge telemetry.'
    },
    exposure,
    historical_comparison: historical,
    source: [...PHASE2_SOURCES.slice(1), { id: 'open-meteo-archive', name: 'Open-Meteo Historical Archive (ERA5)', role: '20-year seasonal rainfall climatology', data_type: 'OBSERVED' }],
    phase: 'PHASE_2'
  };
}

module.exports = {
  buildLocationReport,
  buildLocationEnrichment,
  PHASE1_SOURCES,
  CORE_SOURCES,
  PHASE2_SOURCES,
  pending,
  WEATHER_CODES
};
