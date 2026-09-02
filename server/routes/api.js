/**
 * ESS Weather & Flood Intelligence — HTTP API (v1)
 *
 * Every response carries the timestamp, sources, confidence and data_type
 * fields required by spec §22 and §23; the frontend renders those directly
 * rather than asserting provenance of its own.
 */

'use strict';

const express = require('express');
const { buildLocationReport, buildLocationEnrichment } = require('../services/locationReport');
const { getRiverAlert } = require('../services/glofas');
const { buildNationalSituation, buildNationalTimeline, nationalCacheStats } = require('../services/national');
const { DISTRICTS, PROVINCES, nearestDistrict } = require('../config/districts');
const { cacheStats } = require('../services/openMeteo');
const { UpstreamError } = require('../lib/http');
const {
  RAINFALL_THRESHOLDS,
  RAINFALL_CLASSES,
  RISK_LEVELS,
  HAZARD_MODELS,
  SUSCEPTIBILITY_FLOOR,
  WETNESS,
  IMPACT_WINDOWS,
  RUNOFF
} = require('../config/thresholds');

const router = express.Router();

/** Wrap an async handler so a rejected promise reaches the error middleware. */
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/** Reject nonsense coordinates before they reach an upstream call. */
function parseCoordinates(req) {
  const lat = Number.parseFloat(req.query.lat);
  const lon = Number.parseFloat(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const err = new Error('Query parameters "lat" and "lon" are required and must be numbers.');
    err.status = 400;
    throw err;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const err = new Error('Coordinates out of range: lat must be -90..90 and lon -180..180.');
    err.status = 400;
    throw err;
  }
  return { lat, lon };
}

/* ------------------------------------------------------------------ health */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ess-weather-flood-intelligence',
    phase: 'PHASE_1',
    uptime_s: Math.round(process.uptime()),
    caches: [...cacheStats(), nationalCacheStats()],
    timestamp: new Date().toISOString()
  });
});

/* ------------------------------------------------------------------ config
 * Published so the UI legends, thresholds and colour scales are driven by the
 * same configuration the engine scores with — changing a threshold server-side
 * updates the interface without a frontend edit (spec §5).
 */
router.get('/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    rainfall: { classes: RAINFALL_CLASSES, thresholds: RAINFALL_THRESHOLDS },
    risk_levels: RISK_LEVELS,
    hazards: Object.entries(HAZARD_MODELS).map(([key, m]) => ({
      key,
      label: m.label,
      trigger: m.trigger,
      susceptibility: m.susceptibility
    })),
    susceptibility_floor: SUSCEPTIBILITY_FLOOR,
    model_note:
      'index = trigger x (floor + (1 - floor) x susceptibility). Susceptibility modulates ' +
      'the rainfall trigger rather than adding to it, so a vulnerable location does not ' +
      'carry an elevated level while no rain is falling.',
    wetness: { classes: WETNESS.classes, thresholds: WETNESS.thresholds },
    runoff: { classes: RUNOFF.classes, thresholds: RUNOFF.thresholds },
    impact_windows: IMPACT_WINDOWS,
    data_types: ['OBSERVED', 'FORECAST', 'MODELLED', 'VERIFIED', 'SATELLITE_OBSERVED'],
    phase: 'PHASE_1',
    calibration_status: 'UNCALIBRATED — categorical risk only, no probability output.'
  });
});

/* --------------------------------------------------------------- districts */
router.get('/districts', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    count: DISTRICTS.length,
    provinces: PROVINCES,
    districts: DISTRICTS,
    note:
      'urban_density, drainage_deficit and river_exposure are static ESS reference classifications (0..1), not live measurements.'
  });
});

/* ---------------------------------------------------------------- location
 * The full spec §25 decision object for one coordinate.
 */
router.get('/location', asyncRoute(async (req, res) => {
  const { lat, lon } = parseCoordinates(req);
  const label = typeof req.query.label === 'string' ? req.query.label.slice(0, 120) : undefined;

  const report = await buildLocationReport(lat, lon, { label });

  res.set('Cache-Control', 'public, max-age=120');
  res.json(report);
}));

/* ------------------------------------------------------------- enrichment
 * Real GloFAS river-alert + WorldPop/OSM exposure data. Split from /location
 * because these are live network calls (WorldPop, Overpass) slow enough that
 * blocking the main report on them would make the UI feel broken. The
 * frontend fetches this once the core report is already showing.
 */
router.get('/location/enrichment', asyncRoute(async (req, res) => {
  const { lat, lon } = parseCoordinates(req);
  const current24hMm = req.query.current_24h_mm != null ? Number.parseFloat(req.query.current_24h_mm) : 0;
  const enrichment = await buildLocationEnrichment(lat, lon, Number.isFinite(current24hMm) ? current24hMm : 0);

  res.set('Cache-Control', 'public, max-age=1800');
  res.json(enrichment);
}));

/* ----------------------------------------------------------- river alert
 * GloFAS status alone — lighter than /location/enrichment (skips WorldPop and
 * Overpass), so the Rivers map layer can check many gauge stations at once
 * without paying for exposure data it does not need.
 */
router.get('/river-alert', asyncRoute(async (req, res) => {
  const { lat, lon } = parseCoordinates(req);
  const alert = await getRiverAlert(lat, lon);

  res.set('Cache-Control', 'public, max-age=1800');
  res.json(alert);
}));

/* ---------------------------------------------------------------- national
 * National situation panel + district risk surface.
 */
router.get('/national', asyncRoute(async (req, res) => {
  const situation = await buildNationalSituation();
  res.set('Cache-Control', 'public, max-age=300');
  res.json(situation);
}));

/* -------------------------------------------------------- risk timeline
 * Spec §21: real past (-48h/-24h) and forecast (+12h/+24h/+48h) risk, computed
 * from the same hourly series already fetched for /national — no extra
 * upstream cost, so this is cheap to poll alongside it.
 */
router.get('/national/timeline', asyncRoute(async (req, res) => {
  const timeline = await buildNationalTimeline();
  res.set('Cache-Control', 'public, max-age=300');
  res.json(timeline);
}));

/* ------------------------------------------------------- nearest reference */
router.get('/nearest', (req, res) => {
  const { lat, lon } = parseCoordinates(req);
  const { district, distanceKm } = nearestDistrict(lat, lon);
  res.json({ district, distance_km: distanceKm });
});

/* ------------------------------------------------------------ error handler */
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const isUpstream = err instanceof UpstreamError;
  const status = err.status || (isUpstream ? 503 : 500);

  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.originalUrl} -> ${status}:`, err.message);
  }

  res.status(status).json({
    error: {
      message: status >= 500 && !isUpstream ? 'Internal server error' : err.message,
      type: isUpstream ? 'UPSTREAM_UNAVAILABLE' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL',
      // A failed upstream is a data-availability problem, and the UI must say so
      // rather than presenting stale or invented values as current.
      retryable: status >= 500
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
