/**
 * ESS Weather & Flood Intelligence — Configurable Analytics Configuration
 *
 * Every threshold, weight and band cut used by the risk engine lives here so that
 * calibration can change without touching the UI or the engine code (spec §5, §7).
 *
 * Editing this file changes analytics behaviour on the next request; the frontend
 * reads the published subset from GET /api/v1/config so legends stay in sync.
 */

'use strict';

/* --------------------------------------------------------------------------
 * 1. Rainfall severity classification (spec §5)
 *
 * Thresholds are window-specific: 25 mm in one hour is a very different event
 * from 25 mm across 24 hours, so a single scale would be meteorologically wrong.
 * Values are the LOWER bound (mm) of each class, aligned with PMD-style
 * rainfall categories for the 24 h window.
 * ------------------------------------------------------------------------ */
const RAINFALL_CLASSES = ['NORMAL', 'MODERATE', 'HEAVY', 'VERY_HEAVY', 'EXTREME'];

const RAINFALL_THRESHOLDS = {
  // mm/h — instantaneous / current rate
  rate: { MODERATE: 2.5, HEAVY: 7.5, VERY_HEAVY: 15, EXTREME: 30 },
  // accumulation windows, mm
  '1h': { MODERATE: 5, HEAVY: 15, VERY_HEAVY: 25, EXTREME: 40 },
  '3h': { MODERATE: 10, HEAVY: 25, VERY_HEAVY: 45, EXTREME: 70 },
  '6h': { MODERATE: 15, HEAVY: 35, VERY_HEAVY: 60, EXTREME: 100 },
  '12h': { MODERATE: 20, HEAVY: 45, VERY_HEAVY: 80, EXTREME: 130 },
  '24h': { MODERATE: 25, HEAVY: 50, VERY_HEAVY: 100, EXTREME: 150 },
  '48h': { MODERATE: 40, HEAVY: 80, VERY_HEAVY: 140, EXTREME: 200 },
  '72h': { MODERATE: 50, HEAVY: 100, VERY_HEAVY: 175, EXTREME: 250 }
};

/* --------------------------------------------------------------------------
 * 2. Factor normalisation curves
 *
 * Each risk factor is mapped to a 0..1 contribution by piecewise-linear
 * interpolation across these breakpoints. This keeps the engine's response
 * shape explicit and tunable instead of hiding it in arithmetic.
 * ------------------------------------------------------------------------ */
const FACTOR_CURVES = {
  // Observed accumulation (mm) over the window
  accum_1h: [[0, 0], [5, 0.25], [15, 0.6], [25, 0.85], [40, 1]],
  accum_3h: [[0, 0], [10, 0.25], [25, 0.6], [45, 0.85], [70, 1]],
  accum_6h: [[0, 0], [15, 0.25], [35, 0.6], [60, 0.85], [100, 1]],
  accum_24h: [[0, 0], [25, 0.25], [50, 0.55], [100, 0.85], [150, 1]],
  accum_72h: [[0, 0], [50, 0.25], [100, 0.55], [175, 0.85], [250, 1]],

  // Forecast accumulation (mm)
  forecast_6h: [[0, 0], [15, 0.3], [35, 0.65], [60, 0.9], [100, 1]],
  forecast_24h: [[0, 0], [25, 0.3], [50, 0.6], [100, 0.9], [150, 1]],

  // Antecedent wetness index, already 0..1 from the wetness service
  wetness: [[0, 0], [0.35, 0.2], [0.6, 0.55], [0.8, 0.85], [1, 1]],

  // Regional terrain gradient in degrees (Copernicus DEM GLO-90, ~2 km baseline)
  slope: [[0, 0], [0.5, 0.15], [2, 0.5], [5, 0.85], [10, 1]],

  // Static reference classifications, already 0..1
  urban_density: [[0, 0], [0.3, 0.25], [0.6, 0.6], [0.85, 0.9], [1, 1]],
  drainage_deficit: [[0, 0], [0.3, 0.25], [0.6, 0.6], [0.85, 0.9], [1, 1]],
  river_exposure: [[0, 0], [0.3, 0.25], [0.6, 0.6], [0.85, 0.9], [1, 1]]
};

/* --------------------------------------------------------------------------
 * 3. Hazard models (spec §6, §7)
 *
 * Four independent hazards, each with its own two-part model. The spec requires
 * that these are not simply averaged, and they are not — each hazard separates:
 *
 *   TRIGGER        what is actually happening now / next (rainfall, forecast)
 *   SUSCEPTIBILITY what makes this place respond badly to that rainfall
 *                  (terrain, urban density, drainage, floodplain, wet ground)
 *
 *   index = trigger x (FLOOR + (1 - FLOOR) x susceptibility)
 *
 * Susceptibility MODULATES the trigger rather than adding to it. This matters:
 * if susceptibility were just another weighted term, a dense city with poor
 * drainage would sit permanently at an elevated level with no rain falling,
 * producing standing false alarms that erode trust in every real warning.
 * With no trigger there is no risk, however vulnerable the location.
 *
 * Each vector must sum to 1.0 (validated at load).
 * ------------------------------------------------------------------------ */

/**
 * Even a location with minimal susceptibility can flood given enough rain, so
 * the modulator never collapses to zero. 0.35 means a highly susceptible place
 * scores roughly 2.9x a minimally susceptible one for identical rainfall.
 */
const SUSCEPTIBILITY_FLOOR = 0.35;

const HAZARD_MODELS = {
  flash_flood: {
    label: 'Flash Flood',
    // Short, intense bursts are what generate flash floods.
    trigger: { accum_1h: 0.28, accum_3h: 0.30, accum_6h: 0.14, forecast_6h: 0.28 },
    // Steep ground sheds water fast; already-wet ground sheds more of it.
    susceptibility: { slope: 0.62, wetness: 0.38 }
  },
  urban_flood: {
    label: 'Urban Flood',
    trigger: { accum_1h: 0.30, accum_3h: 0.28, accum_6h: 0.14, forecast_6h: 0.28 },
    // Impervious ground plus drainage that surcharges quickly.
    susceptibility: { urban_density: 0.58, drainage_deficit: 0.42 }
  },
  river_flood: {
    label: 'River Flood',
    // River response is driven by multi-day basin-scale totals, not one burst.
    trigger: { accum_24h: 0.34, accum_72h: 0.34, forecast_24h: 0.32 },
    susceptibility: { river_exposure: 0.62, wetness: 0.38 }
  },
  landslide: {
    label: 'Landslide',
    // Slope failure follows prolonged saturation rather than a single shower.
    trigger: { accum_24h: 0.34, accum_72h: 0.40, forecast_24h: 0.26 },
    susceptibility: { slope: 0.60, wetness: 0.40 }
  }
};

/* --------------------------------------------------------------------------
 * 4. Risk banding (spec §7)
 *
 * Model index (0..1) -> categorical level. Categorical only by design: the spec
 * forbids displaying artificial probabilities before calibration, so no part of
 * the system converts these into a percentage.
 * ------------------------------------------------------------------------ */
const RISK_LEVELS = [
  { code: 0, key: 'NORMAL', label: 'Normal', color: '#22c55e', min: 0.00 },
  { code: 1, key: 'WATCH', label: 'Watch', color: '#eab308', min: 0.30 },
  { code: 2, key: 'MODERATE', label: 'Moderate', color: '#f59e0b', min: 0.45 },
  { code: 3, key: 'HIGH', label: 'High', color: '#f97316', min: 0.60 },
  { code: 4, key: 'SEVERE', label: 'Severe', color: '#ef4444', min: 0.78 }
];

/**
 * Overall risk is the worst hazard, not an average — averaging would let a single
 * severe hazard be diluted by three quiet ones. A compounding bump is applied when
 * multiple hazards are simultaneously elevated.
 */
const OVERALL_RULES = {
  compoundingBumpAtLevel: 2, // hazards at MODERATE or worse count toward compounding
  compoundingBumpCount: 2,   // this many elevated hazards ...
  compoundingBumpAmount: 1,  // ... raises overall by one level (capped at SEVERE)
  maxLevel: 4
};

/* --------------------------------------------------------------------------
 * 5. Antecedent wetness (spec §13)
 * ------------------------------------------------------------------------ */
const WETNESS = {
  classes: ['DRY', 'NORMAL', 'WET', 'VERY_WET', 'SATURATED'],
  // Lower bound of each class on the 0..1 index
  thresholds: { NORMAL: 0.30, WET: 0.50, VERY_WET: 0.70, SATURATED: 0.85 },
  // Blend of the two evidence streams that are genuinely available from open data
  weights: { soilMoisture: 0.6, priorRainfall: 0.4 },
  // Volumetric soil moisture (m3/m3) mapped to 0..1 saturation for the region
  soilMoistureCurve: [[0.05, 0], [0.15, 0.25], [0.25, 0.55], [0.35, 0.85], [0.45, 1]],
  // Prior 72 h rainfall (mm) as a wetness proxy
  priorRainfallCurve: [[0, 0], [20, 0.3], [50, 0.6], [100, 0.85], [175, 1]]
};

/* --------------------------------------------------------------------------
 * 5b. Runoff potential (spec §12)
 *
 * A point-scale stand-in for catchment runoff response: saturated ground on a
 * steep gradient receiving intense rain sheds water fast. Phase 2 replaces this
 * with real catchment delineation and routing.
 * ------------------------------------------------------------------------ */
const RUNOFF = {
  weights: { wetness: 0.40, slope: 0.30, rainfall_6h: 0.30 },
  classes: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'],
  thresholds: { MODERATE: 0.35, HIGH: 0.55, VERY_HIGH: 0.75 }
};

/* --------------------------------------------------------------------------
 * 6. Rainfall trend detection (spec §4)
 * ------------------------------------------------------------------------ */
const TREND = {
  // Compares next-6 h forecast against last-6 h observed, in mm
  risingDeltaMm: 5,
  fallingDeltaMm: -5,
  // Below this total across both windows the situation is reported as DRY, not a trend
  dryFloorMm: 1
};

/* --------------------------------------------------------------------------
 * 7. Time-to-impact windows (spec §19)
 *
 * Reported only when the forecast actually concentrates rainfall in a window;
 * never emitted as false precision for quiet conditions.
 * ------------------------------------------------------------------------ */
const IMPACT_WINDOWS = [
  { key: '0-2h', label: 'Next 0–2 hours', fromHour: 0, toHour: 2 },
  { key: '2-4h', label: 'Next 2–4 hours', fromHour: 2, toHour: 4 },
  { key: '4-8h', label: 'Next 4–8 hours', fromHour: 4, toHour: 8 },
  { key: '8-12h', label: 'Next 8–12 hours', fromHour: 8, toHour: 12 },
  { key: '12-24h', label: 'Next 12–24 hours', fromHour: 12, toHour: 24 },
  { key: '24-48h', label: 'Next 24–48 hours', fromHour: 24, toHour: 48 }
];

// A window must carry at least this much rainfall to be named as an impact window.
const IMPACT_WINDOW_MIN_MM = 8;

/* --------------------------------------------------------------------------
 * 8. Confidence rules (spec §22)
 *
 * Confidence is derived from what the answer actually rests on, never asserted.
 * ------------------------------------------------------------------------ */
const CONFIDENCE = {
  // Fraction of the hazard score contributed by static reference proxies
  // (urban density, drainage, river exposure) above which confidence is reduced,
  // because those inputs are classifications rather than live measurements.
  staticProxyDominantShare: 0.45,
  // Fraction contributed by forecast factors above which confidence drops to MODERATE
  forecastDominantShare: 0.40
};

/* --------------------------------------------------------------------------
 * 9. Upstream data & cache policy
 * ------------------------------------------------------------------------ */
const DATA_POLICY = {
  cacheTtlMs: {
    pointForecast: 5 * 60 * 1000,   // rainfall analytics per location
    nationalSweep: 10 * 60 * 1000,  // national district sweep
    elevation: 30 * 24 * 60 * 60 * 1000, // terrain is static; cache aggressively
    geocode: 24 * 60 * 60 * 1000
  },
  upstreamTimeoutMs: 15000,
  upstreamRetries: 2,
  // Open-Meteo accepts multi-point queries; keep batches modest to stay well
  // inside fair-use limits and to bound the blast radius of a failed request.
  batchSize: 25,
  // Regional terrain gradient sampling baseline, in degrees (~2.2 km)
  slopeSampleOffsetDeg: 0.02
};

/* --------------------------------------------------------------------------
 * Validation — a mis-summed weight vector silently distorts every score, so it
 * is caught at process start rather than in production output.
 * ------------------------------------------------------------------------ */
function validateConfig() {
  const problems = [];

  for (const [hazard, model] of Object.entries(HAZARD_MODELS)) {
    for (const part of ['trigger', 'susceptibility']) {
      const vector = model[part];
      if (!vector || !Object.keys(vector).length) {
        problems.push(`Hazard "${hazard}" is missing its "${part}" weights`);
        continue;
      }
      const sum = Object.values(vector).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-6) {
        problems.push(`Hazard "${hazard}" ${part} weights sum to ${sum.toFixed(4)}, expected 1.0`);
      }
      for (const factor of Object.keys(vector)) {
        if (!FACTOR_CURVES[factor]) {
          problems.push(`Hazard "${hazard}" ${part} references unknown factor "${factor}"`);
        }
      }
    }
  }

  if (SUSCEPTIBILITY_FLOOR < 0 || SUSCEPTIBILITY_FLOOR > 1) {
    problems.push(`SUSCEPTIBILITY_FLOOR must be within 0..1, got ${SUSCEPTIBILITY_FLOOR}`);
  }

  const wSum = WETNESS.weights.soilMoisture + WETNESS.weights.priorRainfall;
  if (Math.abs(wSum - 1) > 1e-6) {
    problems.push(`Wetness weights sum to ${wSum.toFixed(4)}, expected 1.0`);
  }

  if (problems.length) {
    throw new Error('Invalid analytics configuration:\n  - ' + problems.join('\n  - '));
  }
}

validateConfig();

module.exports = {
  RAINFALL_CLASSES,
  RAINFALL_THRESHOLDS,
  RUNOFF,
  FACTOR_CURVES,
  HAZARD_MODELS,
  SUSCEPTIBILITY_FLOOR,
  RISK_LEVELS,
  OVERALL_RULES,
  WETNESS,
  TREND,
  IMPACT_WINDOWS,
  IMPACT_WINDOW_MIN_MM,
  CONFIDENCE,
  DATA_POLICY,
  validateConfig
};
