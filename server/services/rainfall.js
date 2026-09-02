/**
 * Rainfall analytics (spec §4, §5, §19).
 *
 * Turns an hourly precipitation series into the accumulation windows, severity
 * classes, trend and impact windows that the rest of the platform reasons over.
 *
 * Convention: Open-Meteo publishes hourly precipitation as the total for the
 * PRECEDING hour, so the value stamped T covers (T-1h, T]. Backward windows
 * therefore include hours with T <= now, and forecast windows hours with T > now.
 */

'use strict';

const {
  RAINFALL_THRESHOLDS,
  RAINFALL_CLASSES,
  TREND,
  IMPACT_WINDOWS,
  IMPACT_WINDOW_MIN_MM
} = require('../config/thresholds');

const OBSERVED_WINDOWS = [1, 3, 6, 12, 24, 72];
const FORECAST_WINDOWS = [3, 6, 12, 24, 48];

const HOUR = 3600;

/**
 * Classify a rainfall amount against the threshold set for its window.
 * Returns the highest class whose lower bound the value reaches.
 */
function classify(valueMm, windowKey) {
  const thresholds = RAINFALL_THRESHOLDS[windowKey];
  if (!thresholds || valueMm == null) return 'NORMAL';

  let result = 'NORMAL';
  for (const cls of RAINFALL_CLASSES) {
    if (cls === 'NORMAL') continue;
    if (valueMm >= thresholds[cls]) result = cls;
  }
  return result;
}

/** Sum precipitation over a half-open time range (fromSec, toSec]. */
function sumRange(times, values, fromSec, toSec) {
  let total = 0;
  let hours = 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t > fromSec && t <= toSec) {
      const v = values[i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        total += v;
        hours++;
      }
    }
  }
  return { total: Math.round(total * 10) / 10, hours };
}

/** Most recent completed hourly value, i.e. mm accumulated in the last hour. */
function latestHourlyRate(times, values, nowSec) {
  let bestIdx = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= nowSec && (bestIdx === -1 || times[i] > times[bestIdx])) bestIdx = i;
  }
  if (bestIdx === -1) return { rate: null, at: null };
  const v = values[bestIdx];
  return {
    rate: typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null,
    at: times[bestIdx]
  };
}

/**
 * Rainfall trend (spec §4): compares what is coming in the next 6 hours against
 * what fell in the last 6. Reported as DRY rather than a spurious direction when
 * both windows are essentially empty.
 */
function deriveTrend(observed6h, forecast6h) {
  const delta = Math.round((forecast6h - observed6h) * 10) / 10;

  if (observed6h + forecast6h < TREND.dryFloorMm) {
    return { direction: 'DRY', delta_mm: delta, label: 'No significant rainfall', symbol: '—' };
  }
  if (delta >= TREND.risingDeltaMm) {
    return { direction: 'RISING', delta_mm: delta, label: 'Increasing', symbol: '↑' };
  }
  if (delta <= TREND.fallingDeltaMm) {
    return { direction: 'FALLING', delta_mm: delta, label: 'Decreasing', symbol: '↓' };
  }
  return { direction: 'STEADY', delta_mm: delta, label: 'Steady', symbol: '→' };
}

/**
 * Time-to-impact windows (spec §19). Only windows actually carrying meaningful
 * rainfall are returned — the spec explicitly forbids inventing precision, so a
 * quiet forecast yields an empty list and the UI shows nothing.
 */
function deriveImpactWindows(times, values, nowSec) {
  const windows = IMPACT_WINDOWS.map(w => {
    const { total } = sumRange(times, values, nowSec + w.fromHour * HOUR, nowSec + w.toHour * HOUR);
    return { ...w, rainfall_mm: total };
  }).filter(w => w.rainfall_mm >= IMPACT_WINDOW_MIN_MM);

  const peak = windows.reduce(
    (best, w) => (best === null || w.rainfall_mm > best.rainfall_mm ? w : best),
    null
  );

  return { windows, peak };
}

/**
 * Trimmed hourly time series for charting (spec §21's temporal-view intent,
 * and an honest replacement for a fabricated "hydrograph": this is real
 * observed + forecast RAINFALL over time, not river discharge, and is labelled
 * as such everywhere it is shown).
 */
function buildHourlyTimeline(times, values, nowSec, { pastHours = 72, forecastHours = 48 } = {}) {
  const from = nowSec - pastHours * HOUR;
  const to = nowSec + forecastHours * HOUR;
  const points = [];

  for (let i = 0; i < times.length; i++) {
    if (times[i] < from || times[i] > to) continue;
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    points.push({
      time: times[i] * 1000,
      mm: Math.round(v * 10) / 10,
      data_type: times[i] <= nowSec ? 'OBSERVED' : 'FORECAST'
    });
  }
  return points;
}

/**
 * Full rainfall analysis for one location.
 *
 * @param {object} series normalised Open-Meteo point series
 * @param {number} nowMs  evaluation time
 */
function analyseRainfall(series, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const { time: times, precipitation: values } = series.hourly;

  const observed = {};
  for (const hours of OBSERVED_WINDOWS) {
    const { total, hours: covered } = sumRange(times, values, nowSec - hours * HOUR, nowSec);
    observed[`${hours}h`] = {
      mm: total,
      class: classify(total, `${hours}h`),
      hours_covered: covered,
      complete: covered >= hours * 0.9
    };
  }

  const forecast = {};
  for (const hours of FORECAST_WINDOWS) {
    const { total, hours: covered } = sumRange(times, values, nowSec, nowSec + hours * HOUR);
    forecast[`${hours}h`] = {
      mm: total,
      class: classify(total, `${hours}h`),
      hours_covered: covered,
      complete: covered >= hours * 0.9
    };
  }

  const { rate, at } = latestHourlyRate(times, values, nowSec);
  const impact = deriveImpactWindows(times, values, nowSec);

  return {
    current: {
      rate_mm_h: rate,
      class: classify(rate, 'rate'),
      observed_at: at ? at * 1000 : null,
      // The instantaneous reading is a sub-hourly sample; kept distinct from the
      // hourly rate so neither is mistaken for the other.
      instantaneous_mm: series.current?.precipitation ?? null
    },
    observed,
    forecast,
    trend: deriveTrend(observed['6h'].mm, forecast['6h'].mm),
    impact_windows: impact.windows,
    peak_window: impact.peak,
    hourly_timeline: buildHourlyTimeline(times, values, nowSec),
    coverage: {
      observed_hours: observed['72h'].hours_covered,
      forecast_hours: forecast['48h'].hours_covered
    }
  };
}

module.exports = {
  analyseRainfall,
  classify,
  sumRange,
  OBSERVED_WINDOWS,
  FORECAST_WINDOWS
};
