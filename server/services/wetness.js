/**
 * Antecedent wetness index (spec §13).
 *
 * The premise the spec states directly: 50 mm falling on a dry catchment is not
 * the same event as 50 mm falling on a saturated one. This module produces the
 * 0..1 index and DRY..SATURATED class that the risk engine consumes.
 *
 * Phase 1 evidence (both real):
 *   - modelled volumetric soil moisture, depth-weighted over the top 9 cm
 *   - prior 72 h observed rainfall
 *
 * Phase 2 adds catchment-averaged wetness and satellite-derived surface wetness;
 * until then the index describes the point, not the whole catchment, and the
 * returned `basis` says which evidence actually contributed.
 */

'use strict';

const { WETNESS } = require('../config/thresholds');
const { interpolate, clamp01 } = require('../lib/curve');

/** Latest soil-moisture sample at or before `nowSec`. */
function latestSoilMoisture(series, nowSec) {
  const times = series.hourly.time || [];
  const soil = series.hourly.soilMoisture;
  if (!Array.isArray(soil)) return null;

  let bestIdx = -1;
  for (let i = 0; i < times.length; i++) {
    const v = soil[i];
    if (times[i] <= nowSec && typeof v === 'number' && Number.isFinite(v)) {
      if (bestIdx === -1 || times[i] > times[bestIdx]) bestIdx = i;
    }
  }
  return bestIdx === -1 ? null : soil[bestIdx];
}

function classifyWetness(index) {
  const t = WETNESS.thresholds;
  if (index >= t.SATURATED) return 'SATURATED';
  if (index >= t.VERY_WET) return 'VERY_WET';
  if (index >= t.WET) return 'WET';
  if (index >= t.NORMAL) return 'NORMAL';
  return 'DRY';
}

/**
 * @param {object} series        normalised Open-Meteo point series
 * @param {object} rainfall      output of analyseRainfall
 * @param {number} nowMs
 */
function assessWetness(series, rainfall, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);

  const soilRaw = latestSoilMoisture(series, nowSec);
  const soilIndex = soilRaw != null ? clamp01(interpolate(WETNESS.soilMoistureCurve, soilRaw)) : null;

  const prior72h = rainfall?.observed?.['72h']?.mm ?? 0;
  const rainIndex = clamp01(interpolate(WETNESS.priorRainfallCurve, prior72h));

  const basis = [];
  let index;

  if (soilIndex != null) {
    index =
      soilIndex * WETNESS.weights.soilMoisture + rainIndex * WETNESS.weights.priorRainfall;
    basis.push('modelled_soil_moisture', 'observed_prior_rainfall');
  } else {
    // Soil moisture unavailable for this model/point — fall back to rainfall
    // alone and say so, rather than silently pretending to full evidence.
    index = rainIndex;
    basis.push('observed_prior_rainfall');
  }

  index = clamp01(index);

  return {
    index: Math.round(index * 1000) / 1000,
    class: classifyWetness(index),
    soil_moisture_m3m3: soilRaw != null ? Math.round(soilRaw * 1000) / 1000 : null,
    prior_rainfall_72h_mm: prior72h,
    basis,
    complete: soilIndex != null,
    scope: 'POINT',
    data_type: 'MODELLED'
  };
}

module.exports = { assessWetness, classifyWetness };
