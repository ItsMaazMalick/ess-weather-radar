/**
 * ESS Flood Risk Engine (spec §6, §7).
 *
 * Four hazards — river flood, flash flood, urban flood, landslide — are scored
 * INDEPENDENTLY, each by its own weighted factor model. The spec is explicit
 * that these must not be a simple average, and they are not: every hazard has
 * its own weight vector in config/thresholds.js, and overall risk is driven by
 * the worst hazard rather than the mean of the four.
 *
 * Output is categorical (0 NORMAL … 4 SEVERE). No probability is produced
 * anywhere in this module: the spec forbids showing percentages until the model
 * is calibrated against observed flood events, so none exists to be shown.
 *
 * Every hazard reports the factors that actually drove it, so an operator can
 * see why a level was raised instead of trusting an opaque number.
 */

'use strict';

const {
  HAZARD_MODELS,
  FACTOR_CURVES,
  RISK_LEVELS,
  OVERALL_RULES,
  CONFIDENCE,
  SUSCEPTIBILITY_FLOOR
} = require('../config/thresholds');
const { interpolate, clamp01 } = require('../lib/curve');

/** Factors that are expert classifications rather than live measurements. */
const STATIC_PROXY_FACTORS = new Set(['urban_density', 'drainage_deficit', 'river_exposure']);
/** Factors that describe the future rather than the observed past. */
const FORECAST_FACTORS = new Set(['forecast_6h', 'forecast_24h']);

const FACTOR_LABELS = {
  accum_1h: '1-hour rainfall',
  accum_3h: '3-hour rainfall',
  accum_6h: '6-hour rainfall',
  accum_24h: '24-hour rainfall',
  accum_72h: '72-hour rainfall',
  forecast_6h: 'Next 6-hour forecast',
  forecast_24h: 'Next 24-hour forecast',
  wetness: 'Antecedent wetness',
  slope: 'Terrain gradient',
  urban_density: 'Urban density',
  drainage_deficit: 'Drainage capacity',
  river_exposure: 'Floodplain exposure'
};

const HAZARD_LIMITATIONS = {
  river_flood: [
    'No river gauge, discharge or barrage data in Phase 1 — river response is inferred from rainfall, antecedent wetness and floodplain exposure classification only.',
    'Upstream catchment routing is not modelled, so rainfall falling outside this location’s immediate area is not yet accounted for.'
  ],
  flash_flood: [
    'Terrain gradient is a regional ~2 km DEM measure, not local channel slope.',
    'Stream network proximity and catchment response time are Phase 2 inputs.'
  ],
  urban_flood: [
    'Urban density and drainage capacity are static ESS reference classifications, not live drainage telemetry.'
  ],
  landslide: [
    'Terrain gradient is a regional ~2 km DEM measure; slope instability, lithology and land cover are not yet modelled.'
  ]
};

/** Highest risk band whose lower bound the index reaches. */
function levelFromIndex(index) {
  let match = RISK_LEVELS[0];
  for (const level of RISK_LEVELS) {
    if (index >= level.min) match = level;
  }
  return match;
}

const levelByCode = code => RISK_LEVELS.find(l => l.code === code) || RISK_LEVELS[0];

/**
 * Assemble the raw factor inputs the hazard models draw on.
 * A factor that could not be determined is `null` — never silently zero, which
 * would understate risk rather than admit the gap.
 */
function buildFactors({ rainfall, wetness, terrain, reference }) {
  return {
    accum_1h: rainfall?.observed?.['1h']?.mm ?? null,
    accum_3h: rainfall?.observed?.['3h']?.mm ?? null,
    accum_6h: rainfall?.observed?.['6h']?.mm ?? null,
    accum_24h: rainfall?.observed?.['24h']?.mm ?? null,
    accum_72h: rainfall?.observed?.['72h']?.mm ?? null,
    forecast_6h: rainfall?.forecast?.['6h']?.mm ?? null,
    forecast_24h: rainfall?.forecast?.['24h']?.mm ?? null,
    wetness: wetness?.index ?? null,
    slope: terrain?.slope_deg ?? null,
    urban_density: reference?.urban_density ?? null,
    drainage_deficit: reference?.drainage_deficit ?? null,
    river_exposure: reference?.river_exposure ?? null
  };
}

/**
 * Score one weight vector (trigger or susceptibility) over the available inputs.
 *
 * Missing factors are excluded and the remaining weights renormalised, so a gap
 * neither inflates nor deflates the result — it only reduces reported
 * confidence, which is the honest consequence.
 */
function scoreVector(vector, factors) {
  const contributions = [];
  const missing = [];
  let weightedSum = 0;
  let availableWeight = 0;

  for (const [factor, weight] of Object.entries(vector)) {
    const raw = factors[factor];
    const normalised = raw == null ? null : clamp01(interpolate(FACTOR_CURVES[factor], raw));

    if (normalised == null) {
      missing.push(factor);
      continue;
    }

    weightedSum += weight * normalised;
    availableWeight += weight;
    contributions.push({
      factor,
      label: FACTOR_LABELS[factor] || factor,
      raw_value: raw,
      normalised: Math.round(normalised * 1000) / 1000,
      weight,
      contribution: weight * normalised
    });
  }

  return {
    score: availableWeight > 0 ? clamp01(weightedSum / availableWeight) : null,
    contributions,
    missing
  };
}

/**
 * Score one hazard as trigger modulated by susceptibility.
 *
 *   index = trigger x (FLOOR + (1 - FLOOR) x susceptibility)
 *
 * With no rainfall trigger the index is zero regardless of how vulnerable the
 * location is, which is what stops dense cities sitting permanently at an
 * elevated level and turning every genuine warning into background noise.
 */
function scoreHazard(hazardKey, model, factors) {
  const trigger = scoreVector(model.trigger, factors);
  const susceptibility = scoreVector(model.susceptibility, factors);
  const missing = [...trigger.missing, ...susceptibility.missing];

  // No usable trigger input: report unknown rather than a fabricated NORMAL.
  if (trigger.score === null) {
    return {
      key: hazardKey,
      label: model.label,
      level: null,
      code: null,
      index: null,
      available: false,
      confidence: 'LOW',
      data_type: 'MODELLED',
      drivers: [],
      missing_factors: missing,
      limitations: HAZARD_LIMITATIONS[hazardKey] || []
    };
  }

  // Susceptibility unknown: fall back to the neutral midpoint and say so via
  // the missing-factor list rather than assuming the best or worst case.
  const susceptibilityScore = susceptibility.score === null ? 0.5 : susceptibility.score;
  const modulator = SUSCEPTIBILITY_FLOOR + (1 - SUSCEPTIBILITY_FLOOR) * susceptibilityScore;
  const index = clamp01(trigger.score * modulator);
  const level = levelFromIndex(index);

  // Confidence reflects what the answer actually rests on.
  const triggerTotal = trigger.contributions.reduce((a, c) => a + c.contribution, 0) || 1e-9;
  const forecastShare = trigger.contributions
    .filter(c => FORECAST_FACTORS.has(c.factor))
    .reduce((a, c) => a + c.contribution, 0) / triggerTotal;

  const susceptibilityTotal = susceptibility.contributions.reduce((a, c) => a + c.contribution, 0) || 1e-9;
  const staticShare = susceptibility.contributions
    .filter(c => STATIC_PROXY_FACTORS.has(c.factor))
    .reduce((a, c) => a + c.contribution, 0) / susceptibilityTotal;

  let confidence = 'HIGH';
  const confidenceReasons = [];

  if (missing.length) {
    confidence = missing.length > 1 ? 'LOW' : 'MODERATE';
    confidenceReasons.push(`${missing.length} model input(s) unavailable`);
  }
  if (forecastShare > CONFIDENCE.forecastDominantShare) {
    confidence = confidence === 'LOW' ? 'LOW' : 'MODERATE';
    confidenceReasons.push('trigger dominated by forecast rather than observed rainfall');
  }
  // Susceptibility built from static classifications only caps confidence once
  // the hazard is actually elevated — it does not matter while nothing is happening.
  if (staticShare > CONFIDENCE.staticProxyDominantShare && level.code >= 2) {
    confidence = confidence === 'LOW' ? 'LOW' : 'MODERATE';
    confidenceReasons.push('susceptibility based on static reference classifications');
  }
  if (hazardKey === 'river_flood' && confidence === 'HIGH') {
    confidence = 'MODERATE';
    confidenceReasons.push('no river gauge or discharge observation available');
  }

  // Drivers are reported from the trigger side (what is driving this now), with
  // the dominant susceptibility factor named separately as an amplifier.
  const drivers = trigger.contributions
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map(c => ({
      factor: c.factor,
      label: c.label,
      raw_value: c.raw_value,
      share: Math.round((c.contribution / triggerTotal) * 100)
    }));

  const topSusceptibility = susceptibility.contributions
    .sort((a, b) => b.contribution - a.contribution)[0] || null;

  return {
    key: hazardKey,
    label: model.label,
    level: level.key,
    code: level.code,
    level_label: level.label,
    color: level.color,
    index: Math.round(index * 1000) / 1000,
    trigger_score: Math.round(trigger.score * 1000) / 1000,
    susceptibility_score: Math.round(susceptibilityScore * 1000) / 1000,
    available: true,
    confidence,
    confidence_reasons: confidenceReasons,
    data_type: 'MODELLED',
    drivers,
    amplifier: topSusceptibility
      ? {
          factor: topSusceptibility.factor,
          label: topSusceptibility.label,
          raw_value: topSusceptibility.raw_value,
          normalised: topSusceptibility.normalised
        }
      : null,
    missing_factors: missing,
    limitations: HAZARD_LIMITATIONS[hazardKey] || []
  };
}

/**
 * Combine hazard levels into an overall level.
 *
 * The worst hazard sets the baseline — averaging would let one severe hazard be
 * washed out by three quiet ones, which is exactly the wrong behaviour for a
 * public-safety product. Simultaneous elevated hazards then add a compounding
 * step, because a city facing both urban and flash flooding is in more trouble
 * than one facing either alone.
 */
function combineOverall(hazards) {
  const scored = Object.values(hazards).filter(h => h.available);
  if (!scored.length) {
    return { level: null, code: null, primary_hazard: null, compounding: false, available: false };
  }

  const worst = scored.reduce((a, b) => (b.code > a.code ? b : a));
  const elevated = scored.filter(h => h.code >= OVERALL_RULES.compoundingBumpAtLevel);

  let code = worst.code;
  let compounding = false;
  if (elevated.length >= OVERALL_RULES.compoundingBumpCount) {
    code = Math.min(OVERALL_RULES.maxLevel, code + OVERALL_RULES.compoundingBumpAmount);
    compounding = true;
  }

  const level = levelByCode(code);

  return {
    level: level.key,
    code: level.code,
    level_label: level.label,
    color: level.color,
    primary_hazard: worst.key,
    primary_hazard_label: worst.label,
    compounding,
    compounding_hazards: compounding ? elevated.map(h => h.key) : [],
    available: true,
    // Overall inherits the weakest confidence among the hazards that set it.
    confidence: elevated.length
      ? worstConfidence(elevated.map(h => h.confidence))
      : worst.confidence,
    data_type: 'MODELLED'
  };
}

const CONFIDENCE_ORDER = { HIGH: 3, MODERATE: 2, LOW: 1 };
function worstConfidence(list) {
  return list.reduce((a, b) => (CONFIDENCE_ORDER[b] < CONFIDENCE_ORDER[a] ? b : a), 'HIGH');
}

/**
 * Full four-hazard assessment for one location.
 *
 * @param {object} input { rainfall, wetness, terrain, reference }
 */
function assessRisk(input) {
  const factors = buildFactors(input);

  const hazards = {};
  for (const [key, model] of Object.entries(HAZARD_MODELS)) {
    hazards[key] = scoreHazard(key, model, factors);
  }

  return {
    hazards,
    overall: combineOverall(hazards),
    factors,
    model_version: 'ess-flood-risk-1.0-phase1',
    scale: RISK_LEVELS.map(l => ({ code: l.code, key: l.key, label: l.label, color: l.color })),
    calibration_status: 'UNCALIBRATED — categorical output only; no probability is derived.'
  };
}

/* --------------------------------------------------------------------------
 * Road status categories (spec §17).
 *
 * A pure re-labelling of the existing 0..4 risk scale into the four public-
 * facing road categories — no new model, and explicitly PREDICTED, never
 * VERIFIED, because no NHA/NDMA closure feed exists to confirm actual road
 * state. The spec is explicit that these must never be conflated.
 * ------------------------------------------------------------------------ */
const ROAD_STATUS_BY_CODE = [
  { min: 0, key: 'OPEN', emoji: '🟢', label: 'Open' },
  { min: 1, key: 'CAUTION', emoji: '🟡', label: 'Caution' },
  { min: 3, key: 'FLOOD_AFFECTED', emoji: '🔵', label: 'Flood Affected' },
  { min: 4, key: 'BLOCKED', emoji: '🔴', label: 'Blocked' }
];

/**
 * @param {number[]} hazardCodes  0..4 codes for the hazards relevant to this
 *                                corridor (e.g. river+flash+urban for a flood
 *                                corridor, landslide+flash for a hill corridor)
 */
function predictedRoadStatus(hazardCodes) {
  const usable = hazardCodes.filter(c => Number.isFinite(c));
  if (!usable.length) {
    return { key: 'UNKNOWN', emoji: '⚪', label: 'Unknown', status_type: 'PREDICTED', worst_code: null };
  }
  const worst = Math.max(...usable);
  let match = ROAD_STATUS_BY_CODE[0];
  for (const tier of ROAD_STATUS_BY_CODE) {
    if (worst >= tier.min) match = tier;
  }
  return { ...match, status_type: 'PREDICTED', worst_code: worst };
}

module.exports = {
  assessRisk,
  levelFromIndex,
  levelByCode,
  worstConfidence,
  predictedRoadStatus,
  RISK_LEVELS
};
