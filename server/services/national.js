/**
 * National situation & risk surface (spec §8, §9).
 *
 * Sweeps every reference district, scores it through the same engine used for a
 * single location, and rolls the results up into the counts shown on the
 * national panel. Every number on that panel is computed from this sweep — none
 * of them are written into the UI.
 *
 * The "next 24 hours" narrative is assembled deterministically from the same
 * aggregates. No language model is involved in deciding what it says.
 */

'use strict';

const { getPointSeries } = require('./openMeteo');
const { getTerrainBatch } = require('./terrain');
const { analyseRainfall } = require('./rainfall');
const { assessWetness } = require('./wetness');
const { assessRisk } = require('./riskEngine');
const { DISTRICTS, PROVINCES } = require('../config/districts');
const { DATA_POLICY, IMPACT_WINDOWS } = require('../config/thresholds');
const { TtlCache } = require('../lib/cache');
const { pending, PHASE1_SOURCES } = require('./locationReport');

const nationalCache = new TtlCache({ name: 'national-sweep' });
const timelineCache = new TtlCache({ name: 'national-timeline' });

const HEAVY_CLASSES = new Set(['HEAVY', 'VERY_HEAVY', 'EXTREME']);

/**
 * Fetch each district's hourly series + terrain ONCE. Every hourly point
 * already spans real observed history (-96h) through real forecast (+72h) —
 * see openMeteo.js's PAST_DAYS/FORECAST_DAYS — so re-scoring risk at a
 * different evaluation instant (spec §21's timeline) is pure CPU-side
 * recomputation on data already in hand, not a new network round trip.
 */
async function fetchDistrictSeries() {
  const points = DISTRICTS.map(d => ({ lat: d.lat, lon: d.lon }));
  const [seriesList, terrainList] = await Promise.all([
    getPointSeries(points),
    getTerrainBatch(points)
  ]);
  return { seriesList, terrainList };
}

/** Score one district's already-fetched series as of `atMs`. */
function scoreDistrictAt(district, series, terrain, atMs) {
  if (!series) return { district, available: false };

  const rainfall = analyseRainfall(series, atMs);
  const wetness = assessWetness(series, rainfall, atMs);
  const risk = assessRisk({ rainfall, wetness, terrain, reference: district });

  return { district, terrain, rainfall, wetness, risk, current: series.current, available: true };
}

/** Score every reference district as of `nowMs`. */
async function sweepDistricts(nowMs) {
  const { seriesList, terrainList } = await fetchDistrictSeries();
  return DISTRICTS.map((district, i) => scoreDistrictAt(district, seriesList[i], terrainList[i], nowMs));
}

/** Compact per-district payload for the map layer and the drill-down card. */
function toDistrictSummary(entry) {
  const { district, rainfall, wetness, risk, terrain, current } = entry;

  return {
    id: district.id,
    name: district.name,
    province: district.province,
    basin: district.basin,
    lat: district.lat,
    lon: district.lon,
    elevation_m: terrain?.elevation_m ?? null,
    terrain_class: terrain?.terrain_class ?? 'UNKNOWN',

    overall: {
      level: risk.overall.level,
      code: risk.overall.code,
      color: risk.overall.color,
      primary_hazard: risk.overall.primary_hazard,
      primary_hazard_label: risk.overall.primary_hazard_label,
      compounding: risk.overall.compounding,
      confidence: risk.overall.confidence
    },

    hazards: {
      river_flood: pick(risk.hazards.river_flood),
      flash_flood: pick(risk.hazards.flash_flood),
      urban_flood: pick(risk.hazards.urban_flood),
      landslide: pick(risk.hazards.landslide)
    },

    rainfall: {
      current_mm_h: rainfall.current.rate_mm_h,
      current_class: rainfall.current.class,
      accum_6h: rainfall.observed['6h'].mm,
      accum_24h: rainfall.observed['24h'].mm,
      accum_24h_class: rainfall.observed['24h'].class,
      accum_72h: rainfall.observed['72h'].mm,
      forecast_6h: rainfall.forecast['6h'].mm,
      forecast_24h: rainfall.forecast['24h'].mm,
      forecast_24h_class: rainfall.forecast['24h'].class,
      trend: rainfall.trend,
      peak_window: rainfall.peak_window
    },

    wetness: { class: wetness.class, index: wetness.index },

    weather: current
      ? {
          temperature_c: current.temperature_2m ?? null,
          humidity_pct: current.relative_humidity_2m ?? null,
          cloud_cover_pct: current.cloud_cover ?? null,
          wind_speed_kmh: current.wind_speed_10m ?? null,
          weather_code: current.weather_code ?? null
        }
      : null
  };
}

const pick = h => ({
  level: h.level,
  code: h.code,
  color: h.color,
  confidence: h.confidence,
  drivers: h.drivers
});

/** Province-level rollup for the provincial summary table. */
function rollUpProvinces(summaries) {
  return PROVINCES.map(p => {
    const members = summaries.filter(s => s.province === p.match);
    if (!members.length) return null;

    const worst = members.reduce((a, b) => (b.overall.code > a.overall.code ? b : a));
    const avgTemp = average(members.map(m => m.weather?.temperature_c).filter(v => v != null));
    const totalRain24h = average(members.map(m => m.rainfall.accum_24h));
    const maxRain24h = Math.max(...members.map(m => m.rainfall.accum_24h));

    return {
      key: p.key,
      name: p.name,
      districts: members.length,
      worst_district: worst.name,
      overall: worst.overall,
      temperature_c: avgTemp != null ? Math.round(avgTemp * 10) / 10 : null,
      rainfall_24h_avg_mm: totalRain24h != null ? Math.round(totalRain24h * 10) / 10 : null,
      rainfall_24h_max_mm: Math.round(maxRain24h * 10) / 10,
      high_risk_districts: members.filter(m => m.overall.code >= 3).length,
      cloud_cover_pct: Math.round(average(members.map(m => m.weather?.cloud_cover_pct).filter(v => v != null)) ?? 0)
    };
  }).filter(Boolean);
}

function average(list) {
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/**
 * Deterministic national narrative (spec §9).
 * Built by rule from the aggregates — no generative model decides the wording.
 */
function buildNarrative(summaries, counts) {
  const highRisk = summaries.filter(s => s.overall.code >= 3)
    .sort((a, b) => b.overall.code - a.overall.code);
  const heavyRain = summaries.filter(s => HEAVY_CLASSES.has(s.rainfall.forecast_24h_class))
    .sort((a, b) => b.rainfall.forecast_24h - a.rainfall.forecast_24h);

  let primaryConcern;
  if (highRisk.length) {
    const hazardTally = {};
    highRisk.forEach(s => {
      const h = s.overall.primary_hazard_label || 'Flood';
      hazardTally[h] = (hazardTally[h] || 0) + 1;
    });
    const dominant = Object.entries(hazardTally).sort((a, b) => b[1] - a[1])[0][0];
    const regions = [...new Set(highRisk.slice(0, 4).map(s => s.province))].join(' and ');
    primaryConcern = `${dominant.toLowerCase()} risk across ${highRisk.length} district${highRisk.length > 1 ? 's' : ''} in ${regions}, led by ${highRisk[0].name}.`;
    primaryConcern = primaryConcern.charAt(0).toUpperCase() + primaryConcern.slice(1);
  } else if (heavyRain.length) {
    primaryConcern = `Heavy rainfall expected across ${heavyRain.length} district${heavyRain.length > 1 ? 's' : ''}, heaviest over ${heavyRain[0].name} (${heavyRain[0].rainfall.forecast_24h} mm forecast in 24 h). No district currently reaches high flood risk.`;
  } else if (counts.watch_areas > 0) {
    primaryConcern = `${counts.watch_areas} district${counts.watch_areas > 1 ? 's are' : ' is'} under watch-level conditions. No high-risk area at present.`;
  } else {
    primaryConcern = 'No significant flood or landslide concern indicated nationally at present.';
  }

  // Highest-risk window: the impact window carrying the most rainfall across all
  // districts that actually reported one.
  const windowTally = new Map();
  summaries.forEach(s => {
    const w = s.rainfall.peak_window;
    if (!w) return;
    const existing = windowTally.get(w.key) || { key: w.key, label: w.label, total: 0, districts: 0 };
    existing.total += w.rainfall_mm;
    existing.districts += 1;
    windowTally.set(w.key, existing);
  });

  const orderedWindows = [...windowTally.values()].sort((a, b) => b.total - a.total);
  const highestRiskWindow = orderedWindows.length
    ? { ...orderedWindows[0], total: Math.round(orderedWindows[0].total) }
    : null;

  // Most affected region by combined risk and rainfall weight
  const provinceScore = {};
  summaries.forEach(s => {
    provinceScore[s.province] = (provinceScore[s.province] || 0) + s.overall.code * 10 + s.rainfall.forecast_24h;
  });
  const mostAffected = Object.entries(provinceScore).sort((a, b) => b[1] - a[1])[0];

  return {
    primary_concern: primaryConcern,
    highest_risk_window: highestRiskWindow
      ? { label: highestRiskWindow.label, districts: highestRiskWindow.districts }
      : null,
    most_affected_region: mostAffected && mostAffected[1] > 0 ? mostAffected[0] : null,
    generated_by: 'DETERMINISTIC_AGGREGATION'
  };
}

/** Full national picture. */
async function buildNationalSituation() {
  const nowMs = Date.now();
  const cacheKey = `national:${Math.floor(nowMs / DATA_POLICY.cacheTtlMs.nationalSweep)}`;

  return nationalCache.resolve(cacheKey, DATA_POLICY.cacheTtlMs.nationalSweep, async () => {
    const swept = await sweepDistricts(nowMs);
    const usable = swept.filter(s => s.available);
    const summaries = usable.map(toDistrictSummary);

    const counts = {
      high_risk_zones: summaries.filter(s => s.overall.code >= 3).length,
      watch_areas: summaries.filter(s => s.overall.code >= 1 && s.overall.code < 3).length,
      heavy_rain_districts: summaries.filter(
        s => HEAVY_CLASSES.has(s.rainfall.accum_24h_class) || HEAVY_CLASSES.has(s.rainfall.forecast_24h_class)
      ).length,
      landslide_watch_districts: summaries.filter(s => s.hazards.landslide.code >= 2).length,
      river_flood_watch_districts: summaries.filter(s => s.hazards.river_flood.code >= 2).length,
      urban_flood_watch_districts: summaries.filter(s => s.hazards.urban_flood.code >= 2).length,
      districts_assessed: summaries.length
    };

    return {
      timestamp: new Date(nowMs).toISOString(),
      timezone: 'Asia/Karachi (PKT, UTC+5)',
      counts,
      // The spec asks for a "rivers rising" count; that is a gauge observation,
      // not something rainfall analytics can honestly infer, so it is reported
      // as pending alongside the modelled river-flood watch count above.
      rivers_rising: pending('river_gauge_trends',
        ['Pakistan Flood Forecasting Division (FFD)', 'WAPDA gauge telemetry'],
        'Counting rising rivers requires gauge observations. The river_flood_watch_districts count above is a modelled proxy, not a gauge reading.'),
      next_24_hours: buildNarrative(summaries, counts),
      districts: summaries,
      provinces: rollUpProvinces(summaries),
      impact_window_definitions: IMPACT_WINDOWS,
      source: PHASE1_SOURCES,
      phase: 'PHASE_1',
      coverage_note: `Assessed at ${summaries.length} reference district points. District boundary polygons are a Phase 2 GIS integration; the map renders a point-based risk surface.`
    };
  });
}

/* --------------------------------------------------------------------------
 * Risk-evolution timeline (spec §21).
 *
 * The spec's own anchors are "-72h | -48h | -24h | NOW | +6h | +12h | +24h |
 * +48h". Six are exposed (matching the six existing, previously-unwired date-
 * strip buttons in the UI) spanning that same range: real past risk (from
 * observed rainfall) through real forecast risk (from forecast rainfall) —
 * never an interpolation or a guess at what happens between them.
 * ------------------------------------------------------------------------ */
const TIMELINE_OFFSETS_HOURS = [-48, -24, 0, 12, 24, 48];

function offsetLabel(hours) {
  if (hours === 0) return 'NOW';
  return hours > 0 ? `+${hours}h` : `${hours}h`;
}

/** Compact per-district risk, per timeline offset — full detail lives in /national at offset 0. */
function toTimelineDistrict(entry) {
  return {
    id: entry.district.id,
    overall_code: entry.risk.overall.code,
    overall_level: entry.risk.overall.level,
    color: entry.risk.overall.color,
    primary_hazard_label: entry.risk.overall.primary_hazard_label
  };
}

async function buildNationalTimeline() {
  const nowMs = Date.now();
  const cacheKey = `national-timeline:${Math.floor(nowMs / DATA_POLICY.cacheTtlMs.nationalSweep)}`;

  return timelineCache.resolve(cacheKey, DATA_POLICY.cacheTtlMs.nationalSweep, async () => {
    const { seriesList, terrainList } = await fetchDistrictSeries();

    const offsets = TIMELINE_OFFSETS_HOURS.map(hours => {
      const atMs = nowMs + hours * 3600 * 1000;
      const swept = DISTRICTS.map((d, i) => scoreDistrictAt(d, seriesList[i], terrainList[i], atMs));
      const usable = swept.filter(s => s.available);

      return {
        hours,
        label: offsetLabel(hours),
        timestamp: new Date(atMs).toISOString(),
        data_type: hours <= 0 ? 'OBSERVED' : 'FORECAST',
        counts: {
          high_risk_zones: usable.filter(s => s.risk.overall.code >= 3).length,
          watch_areas: usable.filter(s => s.risk.overall.code >= 1 && s.risk.overall.code < 3).length,
          districts_assessed: usable.length
        },
        districts: usable.map(toTimelineDistrict)
      };
    });

    return {
      generated_at: new Date(nowMs).toISOString(),
      timezone: 'Asia/Karachi (PKT, UTC+5)',
      offsets,
      note:
        'Each offset re-scores risk from the SAME hourly rainfall series already fetched for "now" — ' +
        'negative offsets use real observed rainfall history, positive offsets use real forecast ' +
        'rainfall. Nothing is interpolated between points; each is independently computed.',
      phase: 'PHASE_2'
    };
  });
}

module.exports = {
  buildNationalSituation,
  buildNationalTimeline,
  scoreDistrictAt, // exported for direct testing of the time-shift mechanism
  nationalCacheStats: () => nationalCache.snapshot()
};
