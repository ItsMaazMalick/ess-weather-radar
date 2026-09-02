/**
 * Open-Meteo integration — the single upstream source of real meteorological
 * data for Phase 1.
 *
 * Provides:
 *   - hourly observed + forecast precipitation (the basis of all accumulation)
 *   - hourly volumetric soil moisture (the basis of antecedent wetness)
 *   - current conditions
 *   - Copernicus DEM GLO-90 elevation (the basis of measured terrain slope)
 *
 * Times are requested as unix epoch seconds so that accumulation windows are
 * computed without any timezone parsing ambiguity; the local UTC offset is
 * carried alongside purely for presentation.
 */

'use strict';

const { fetchJson } = require('../lib/http');
const { TtlCache } = require('../lib/cache');
const { ConcurrencyLimiter } = require('../lib/limiter');
const { DATA_POLICY } = require('../config/thresholds');

// Open-Meteo rejects with "Too many concurrent requests" well before any
// rate-limit kicks in. A page load can trigger several independent report
// builds at once (national sweep, a location report, several road-corridor
// checks) — without this cap they collide and each other's requests fail.
const limiter = new ConcurrencyLimiter(3);

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

const forecastCache = new TtlCache({ name: 'open-meteo:forecast' });
const elevationCache = new TtlCache({ name: 'open-meteo:elevation' });

const HOURLY_FIELDS = [
  'precipitation',
  'soil_moisture_0_to_1cm',
  'soil_moisture_1_to_3cm',
  'soil_moisture_3_to_9cm'
];

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'weather_code',
  'surface_pressure'
];

// Enough history for a rolling 72 h window (past_days counts whole local days)
// and enough lead time for a 48 h forecast window.
const PAST_DAYS = 4;
const FORECAST_DAYS = 3;

const round = (n, dp = 3) => Number(n.toFixed(dp));
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** Open-Meteo returns a bare object for one coordinate and an array for many. */
const asArray = payload => (Array.isArray(payload) ? payload : [payload]);

function normalisePoint(raw) {
  const hourly = raw.hourly || {};
  const soilLayers = [
    hourly.soil_moisture_0_to_1cm,
    hourly.soil_moisture_1_to_3cm,
    hourly.soil_moisture_3_to_9cm
  ].filter(Array.isArray);

  // Depth-weighted near-surface soil moisture; falls back to whatever layers the
  // selected model actually published, and to null when none are available.
  let soilMoisture = null;
  if (soilLayers.length) {
    const weights = [0.2, 0.3, 0.5].slice(0, soilLayers.length);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    soilMoisture = (hourly.time || []).map((_, i) => {
      let sum = 0;
      let used = 0;
      soilLayers.forEach((layer, li) => {
        const v = layer[i];
        if (typeof v === 'number' && Number.isFinite(v)) {
          sum += v * weights[li];
          used += weights[li];
        }
      });
      return used > 0 ? sum / (used || weightSum) : null;
    });
  }

  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: typeof raw.elevation === 'number' ? raw.elevation : null,
    utcOffsetSeconds: raw.utc_offset_seconds ?? 5 * 3600,
    current: raw.current || null,
    hourly: {
      time: hourly.time || [],
      precipitation: hourly.precipitation || [],
      soilMoisture
    }
  };
}

/**
 * Hourly precipitation/soil-moisture series plus current conditions for one or
 * many coordinates. Points are batched to stay well inside fair-use limits.
 *
 * @param {Array<{lat:number, lon:number}>} points
 * @returns {Promise<Array>} one normalised series per input point, in input order
 */
async function getPointSeries(points) {
  if (!points.length) return [];

  const batches = chunk(points, DATA_POLICY.batchSize);

  const results = await Promise.all(
    batches.map(batch => {
      const lats = batch.map(p => round(p.lat)).join(',');
      const lons = batch.map(p => round(p.lon)).join(',');
      const url =
        `${FORECAST_URL}?latitude=${lats}&longitude=${lons}` +
        `&hourly=${HOURLY_FIELDS.join(',')}` +
        `&current=${CURRENT_FIELDS.join(',')}` +
        `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
        `&timezone=Asia%2FKarachi&timeformat=unixtime`;

      return forecastCache.resolve(url, DATA_POLICY.cacheTtlMs.pointForecast, () =>
        limiter.run(() =>
          fetchJson(url, {
            timeoutMs: DATA_POLICY.upstreamTimeoutMs,
            retries: DATA_POLICY.upstreamRetries,
            label: 'Open-Meteo forecast'
          })
        )
      );
    })
  );

  return results.flatMap(payload => asArray(payload).map(normalisePoint));
}

/**
 * Copernicus DEM GLO-90 elevations. Terrain does not change, so these are
 * cached for a month.
 */
async function getElevations(points) {
  if (!points.length) return [];

  const batches = chunk(points, DATA_POLICY.batchSize * 2);

  const results = await Promise.all(
    batches.map(batch => {
      const lats = batch.map(p => round(p.lat, 4)).join(',');
      const lons = batch.map(p => round(p.lon, 4)).join(',');
      const url = `${ELEVATION_URL}?latitude=${lats}&longitude=${lons}`;

      return elevationCache.resolve(url, DATA_POLICY.cacheTtlMs.elevation, () =>
        limiter.run(() =>
          fetchJson(url, {
            timeoutMs: DATA_POLICY.upstreamTimeoutMs,
            retries: DATA_POLICY.upstreamRetries,
            label: 'Open-Meteo elevation'
          })
        )
      );
    })
  );

  return results.flatMap(payload => payload.elevation || []);
}

function cacheStats() {
  return [forecastCache.snapshot(), elevationCache.snapshot()];
}

module.exports = {
  getPointSeries,
  getElevations,
  cacheStats,
  ATTRIBUTION: 'Open-Meteo (ECMWF/DWD/NOAA models, Copernicus DEM GLO-90)'
};
