/**
 * Piecewise-linear interpolation over [x, y] breakpoints.
 *
 * Every factor normalisation in the risk engine runs through this, so the
 * response shape of each input is visible in configuration rather than buried
 * in arithmetic. Values outside the defined range clamp to the end points.
 */

'use strict';

function interpolate(curve, x) {
  if (x == null || !Number.isFinite(x)) return null;
  if (!Array.isArray(curve) || curve.length === 0) return null;

  if (x <= curve[0][0]) return curve[0][1];
  if (x >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];

  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i];
    const [x1, y1] = curve[i + 1];
    if (x >= x0 && x <= x1) {
      if (x1 === x0) return y1;
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

const clamp01 = v => Math.max(0, Math.min(1, v));

module.exports = { interpolate, clamp01 };
