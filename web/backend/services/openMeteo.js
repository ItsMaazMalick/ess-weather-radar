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

const FORECAST_URL = 'https://ess-weather-interpulation.vercel.app/api/v1/conditions';
const ELEVATION_URL = 'https://ess-weather-interpulation.vercel.app/api/v1/elevation';

const forecastCache = new TtlCache({ name: 'open-meteo:forecast' });
const elevationCache = new TtlCache({ name: 'open-meteo:elevation' });

// Enough history for a rolling 72 h window (past_days counts whole local days)
// and enough lead time for a 48 h forecast window.
const PAST_DAYS = 4;
const FORECAST_DAYS = 3;

const round = (n, dp = 3) => Number(n.toFixed(dp));

function normalisePoint(payload) {
  const current = payload.current || {};
  const hourly = payload.hourly || [];

  const soilMoisture = hourly.map(h => {
    const layers = [h.soilMoisture0to1cm, h.soilMoisture1to3cm, h.soilMoisture3to9cm].filter(v => typeof v === 'number');
    if (!layers.length) return null;
    const weights = [0.2, 0.3, 0.5].slice(0, layers.length);
    let sum = 0, used = 0;
    layers.forEach((v, i) => { sum += v * weights[i]; used += weights[i]; });
    return used > 0 ? sum / used : null;
  });

  return {
    latitude: payload.location?.lat,
    longitude: payload.location?.lon,
    elevation: null,
    utcOffsetSeconds: 5 * 3600,
    current: {
      temperature_2m: current.temperature,
      relative_humidity_2m: current.humidity,
      precipitation: current.precipitation,
      cloud_cover: current.cloudCover,
      wind_speed_10m: current.windSpeed,
      wind_direction_10m: current.windDirection,
      weather_code: current.weatherCode,
      surface_pressure: current.surfacePressure
    },
    hourly: {
      time: hourly.map(h => h.time),
      precipitation: hourly.map(h => h.precipitation),
      soilMoisture
    }
  };
}

/**
 * Hourly precipitation/soil-moisture series plus current conditions for coordinates.
 *
 * @param {Array<{lat:number, lon:number}>} points
 * @returns {Promise<Array>} one normalised series per input point, in input order
 */
async function getPointSeries(points) {
  if (!points.length) return [];

  const results = await Promise.all(
    points.map(p => {
      const lat = round(p.lat);
      const lon = round(p.lon);
      const url = `${FORECAST_URL}?lat=${lat}&lon=${lon}&pastDays=${PAST_DAYS}&forecastDays=${FORECAST_DAYS}`;

      return forecastCache.resolve(url, DATA_POLICY.cacheTtlMs.pointForecast, () =>
        limiter.run(() =>
          fetchJson(url, {
            timeoutMs: DATA_POLICY.upstreamTimeoutMs,
            retries: DATA_POLICY.upstreamRetries,
            label: 'Custom backend forecast'
          })
        )
      );
    })
  );

  return results.map(normalisePoint);
}

/**
 * Copernicus DEM GLO-90 elevations. Terrain does not change, so these are
 * cached for a month.
 */
async function getElevations(points) {
  if (!points.length) return [];

  const results = await Promise.all(
    points.map(p => {
      const lat = round(p.lat, 4);
      const lon = round(p.lon, 4);
      const url = `${ELEVATION_URL}?lat=${lat}&lon=${lon}`;

      return elevationCache.resolve(url, DATA_POLICY.cacheTtlMs.elevation, () =>
        limiter.run(() =>
          fetchJson(url, {
            timeoutMs: DATA_POLICY.upstreamTimeoutMs,
            retries: DATA_POLICY.upstreamRetries,
            label: 'Custom backend elevation'
          })
        )
      );
    })
  );

  return results.map(payload => payload.elevationMeters || null);
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
