/**
 * ESS Flood Risk Engine — behavioural tests.
 *
 * Run: npm test
 *
 * These assert the engine's decision behaviour, not its exact numbers, so
 * thresholds can be recalibrated without rewriting the suite. They exist because
 * live conditions are usually quiet: without synthetic events there is no way to
 * confirm the engine actually escalates when it should.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { assessRisk } = require('../services/riskEngine');
const { generateAdvisories } = require('../services/advisory');
const { analyseRainfall, classify } = require('../services/rainfall');
const { assessWetness } = require('../services/wetness');
const { RISK_LEVELS } = require('../config/thresholds');

const codeOf = level => RISK_LEVELS.find(l => l.key === level)?.code ?? -1;

/** Build a rainfall analysis object without going near the network. */
function rainfall({ obs = {}, fc = {} } = {}) {
  const mk = (mm, key) => ({ mm, class: classify(mm, key), hours_covered: 99, complete: true });
  return {
    current: { rate_mm_h: obs['1h'] ?? 0, class: 'NORMAL', observed_at: Date.now() },
    observed: {
      '1h': mk(obs['1h'] ?? 0, '1h'), '3h': mk(obs['3h'] ?? 0, '3h'),
      '6h': mk(obs['6h'] ?? 0, '6h'), '12h': mk(obs['12h'] ?? 0, '12h'),
      '24h': mk(obs['24h'] ?? 0, '24h'), '72h': mk(obs['72h'] ?? 0, '72h')
    },
    forecast: {
      '3h': mk(fc['3h'] ?? 0, '3h'), '6h': mk(fc['6h'] ?? 0, '6h'),
      '12h': mk(fc['12h'] ?? 0, '12h'), '24h': mk(fc['24h'] ?? 0, '24h'),
      '48h': mk(fc['48h'] ?? 0, '48h')
    },
    trend: { direction: 'STEADY', delta_mm: 0, label: 'Steady', symbol: '→' },
    impact_windows: [],
    peak_window: null
  };
}

const DENSE_CITY = { urban_density: 0.95, drainage_deficit: 0.8, river_exposure: 0.4 };
const RURAL_PLAIN = { urban_density: 0.15, drainage_deficit: 0.3, river_exposure: 0.2 };
const FLOODPLAIN = { urban_density: 0.3, drainage_deficit: 0.45, river_exposure: 0.85 };

const FLAT = { slope_deg: 0.1, elevation_m: 200, terrain_class: 'PLAIN', available: true };
const STEEP = { slope_deg: 6.5, elevation_m: 2100, terrain_class: 'MOUNTAINOUS', available: true };

const DRY = { index: 0.15, class: 'DRY', complete: true };
const SATURATED = { index: 0.92, class: 'SATURATED', complete: true };

/* ------------------------------------------------------------------------ */

test('quiet conditions produce no hazard, however vulnerable the location', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '1h': 0, '3h': 0.2, '24h': 1 } }),
    wetness: DRY, terrain: FLAT, reference: DENSE_CITY
  });

  assert.equal(risk.overall.level, 'NORMAL',
    'a dense, poorly-drained city must not sit at an elevated level with no rain');
  assert.equal(risk.hazards.urban_flood.level, 'NORMAL');
  // Susceptibility is still correctly recognised as high — it just is not a trigger.
  assert.ok(risk.hazards.urban_flood.susceptibility_score > 0.8);
});

test('cloudburst over a dense city escalates urban flood risk', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '1h': 28, '3h': 62, '6h': 75, '24h': 90 }, fc: { '6h': 30, '24h': 45 } }),
    wetness: SATURATED, terrain: FLAT, reference: DENSE_CITY
  });

  assert.ok(codeOf(risk.hazards.urban_flood.level) >= 3,
    `urban flood should reach HIGH+, got ${risk.hazards.urban_flood.level}`);
  assert.ok(codeOf(risk.overall.level) >= 3);
  assert.equal(risk.overall.primary_hazard, 'urban_flood');
});

test('identical rainfall scores lower on rural ground than in a dense city', () => {
  const heavy = rainfall({ obs: { '1h': 20, '3h': 45, '6h': 55, '24h': 70 }, fc: { '6h': 25, '24h': 40 } });

  const city = assessRisk({ rainfall: heavy, wetness: DRY, terrain: FLAT, reference: DENSE_CITY });
  const rural = assessRisk({ rainfall: heavy, wetness: DRY, terrain: FLAT, reference: RURAL_PLAIN });

  assert.ok(city.hazards.urban_flood.index > rural.hazards.urban_flood.index,
    'susceptibility must differentiate outcomes for the same rainfall');
});

test('prolonged rain on steep saturated ground escalates landslide risk', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '24h': 110, '72h': 210 }, fc: { '24h': 50 } }),
    wetness: SATURATED, terrain: STEEP, reference: RURAL_PLAIN
  });

  assert.ok(codeOf(risk.hazards.landslide.level) >= 3,
    `landslide should reach HIGH+, got ${risk.hazards.landslide.level}`);
  // The same rainfall on flat ground must not produce a landslide warning.
  const flat = assessRisk({
    rainfall: rainfall({ obs: { '24h': 110, '72h': 210 }, fc: { '24h': 50 } }),
    wetness: SATURATED, terrain: FLAT, reference: RURAL_PLAIN
  });
  assert.ok(codeOf(flat.hazards.landslide.level) < codeOf(risk.hazards.landslide.level));
});

test('multi-day basin rainfall on a floodplain escalates river flood risk', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '24h': 95, '72h': 230 }, fc: { '24h': 70 } }),
    wetness: SATURATED, terrain: FLAT, reference: FLOODPLAIN
  });

  assert.ok(codeOf(risk.hazards.river_flood.level) >= 2,
    `river flood should be MODERATE+, got ${risk.hazards.river_flood.level}`);
  // River flood can never claim high confidence without gauge data.
  assert.notEqual(risk.hazards.river_flood.confidence, 'HIGH');
});

test('a short burst does not by itself raise river flood risk', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '1h': 30, '3h': 40, '6h': 42, '24h': 45, '72h': 45 } }),
    wetness: DRY, terrain: FLAT, reference: FLOODPLAIN
  });

  assert.ok(codeOf(risk.hazards.river_flood.level) < codeOf(risk.hazards.urban_flood.level),
    'a one-hour burst is an urban/flash signal, not a river-response signal');
});

test('overall risk takes the worst hazard, never the average', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '24h': 120, '72h': 240 }, fc: { '24h': 60 } }),
    wetness: SATURATED, terrain: STEEP, reference: RURAL_PLAIN
  });

  const worst = Math.max(...Object.values(risk.hazards).map(h => h.code ?? 0));
  assert.ok(risk.overall.code >= worst,
    'overall must not be diluted below the most severe individual hazard');
});

test('simultaneously elevated hazards compound the overall level', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '1h': 26, '3h': 58, '6h': 80, '24h': 130, '72h': 240 }, fc: { '6h': 35, '24h': 70 } }),
    wetness: SATURATED, terrain: STEEP, reference: { urban_density: 0.8, drainage_deficit: 0.75, river_exposure: 0.8 }
  });

  const elevated = Object.values(risk.hazards).filter(h => (h.code ?? 0) >= 2);
  assert.ok(elevated.length >= 2, 'test setup should elevate multiple hazards');
  assert.equal(risk.overall.compounding, true);
});

test('missing terrain degrades confidence but still returns a usable score', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '1h': 20, '3h': 40, '24h': 60 } }),
    wetness: DRY,
    terrain: { slope_deg: null, elevation_m: null, terrain_class: 'UNKNOWN', available: false },
    reference: DENSE_CITY
  });

  assert.equal(risk.hazards.flash_flood.available, true);
  assert.notEqual(risk.hazards.flash_flood.confidence, 'HIGH');
  assert.ok(risk.hazards.flash_flood.missing_factors.includes('slope'));
});

test('no probability is emitted anywhere in the risk output', () => {
  const risk = assessRisk({
    rainfall: rainfall({ obs: { '24h': 150 } }), wetness: SATURATED, terrain: STEEP, reference: DENSE_CITY
  });
  // Look for a probability-like FIELD; the calibration disclaimer legitimately
  // contains the word itself.
  const probabilityFields = [];
  (function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (/probability|percent_chance|likelihood/i.test(key)) probabilityFields.push(`${path}.${key}`);
      walk(value, `${path}.${key}`);
    }
  })(risk, 'risk');

  assert.deepEqual(probabilityFields, [],
    'categorical output only until the model is calibrated');
  assert.match(risk.calibration_status, /UNCALIBRATED/);
});

/* ----------------------------------------------------------- advisories -- */

test('high urban flood risk produces the underpass advisory in both languages', () => {
  const rf = rainfall({ obs: { '1h': 28, '3h': 62, '6h': 75, '24h': 90 }, fc: { '6h': 30 } });
  const risk = assessRisk({ rainfall: rf, wetness: SATURATED, terrain: FLAT, reference: DENSE_CITY });
  const advisories = generateAdvisories({ risk, rainfall: rf, wetness: SATURATED });

  const urban = advisories.find(a => a.id === 'urban_flood_high');
  assert.ok(urban, 'urban flood advisory must fire at HIGH');
  assert.match(urban.text_en, /underpass/i);
  assert.ok(urban.text_ur.length > 10, 'Urdu text must be present');
  assert.equal(urban.generated_by, 'DETERMINISTIC_RULE');
});

test('every risk state yields at least one advisory', () => {
  const scenarios = [
    { rf: rainfall(), w: DRY, t: FLAT, r: RURAL_PLAIN },
    { rf: rainfall({ obs: { '1h': 6, '3h': 12, '24h': 26 }, fc: { '6h': 12 } }), w: DRY, t: FLAT, r: DENSE_CITY },
    { rf: rainfall({ obs: { '1h': 30, '3h': 70, '24h': 140 }, fc: { '6h': 50, '24h': 90 } }), w: SATURATED, t: STEEP, r: DENSE_CITY }
  ];

  for (const s of scenarios) {
    const risk = assessRisk({ rainfall: s.rf, wetness: s.w, terrain: s.t, reference: s.r });
    const advisories = generateAdvisories({ risk, rainfall: s.rf, wetness: s.w });
    assert.ok(advisories.length > 0,
      `no advisory produced for overall=${risk.overall.level} — the panel would render empty`);
  }
});

test('baseline advisories never appear alongside a real warning', () => {
  const rf = rainfall({ obs: { '1h': 30, '3h': 70, '24h': 140 }, fc: { '6h': 50 } });
  const risk = assessRisk({ rainfall: rf, wetness: SATURATED, terrain: STEEP, reference: DENSE_CITY });
  const advisories = generateAdvisories({ risk, rainfall: rf, wetness: SATURATED });

  assert.ok(advisories.some(a => a.severity === 'HIGH' || a.severity === 'CRITICAL'));
  assert.ok(!advisories.some(a => a.id === 'all_clear' || a.id === 'watch_baseline'));
});

/* ------------------------------------------------------ rainfall windows -- */

test('rainfall classification is window-specific', () => {
  // 25 mm is unremarkable across a day but extreme within an hour.
  assert.equal(classify(25, '24h'), 'MODERATE');
  assert.equal(classify(25, '1h'), 'VERY_HEAVY');
});

test('accumulation windows sum only their own time range', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const times = [];
  const precip = [];
  // 2 mm in each of the last 10 hours (the most recent stamped exactly at now),
  // then 5 mm in each of the next 6. Values are stamped at the END of the hour
  // they cover, so the sample at `now` belongs to the observed side.
  for (let i = 9; i >= 0; i--) { times.push(nowSec - i * 3600); precip.push(2); }
  for (let i = 1; i <= 6; i++) { times.push(nowSec + i * 3600); precip.push(5); }

  const series = { hourly: { time: times, precipitation: precip, soilMoisture: null }, current: null };
  const analysis = analyseRainfall(series, nowSec * 1000);

  assert.equal(analysis.observed['3h'].mm, 6, 'last 3 h = 3 x 2 mm');
  assert.equal(analysis.observed['6h'].mm, 12, 'last 6 h = 6 x 2 mm');
  assert.equal(analysis.forecast['3h'].mm, 15, 'next 3 h = 3 x 5 mm');
  assert.equal(analysis.trend.direction, 'RISING', '30 mm ahead vs 12 mm behind is rising');
});

/* --------------------------------------------------------- Phase 2 modules -- */

test('catchment lookup resolves real HydroBASINS polygons with sane topology', () => {
  const { getCatchment } = require('../services/catchment');

  const tarbela = getCatchment(34.0883, 72.6983);
  assert.equal(tarbela.available, true);
  assert.ok(tarbela.upstream_area_km2 > 100000,
    'Tarbela sits on the upper Indus; upstream area should be very large');
  assert.ok(tarbela.downstream_flow_path.length > 1);

  const karachi = getCatchment(24.8607, 67.0011);
  assert.equal(karachi.available, true);
  assert.ok(karachi.downstream_flow_path.length <= 2,
    'a coastal basin should reach its outlet in very few hops');
});

test('catchment lookup reports unavailable outside the loaded coverage region', () => {
  const { getCatchment } = require('../services/catchment');
  const tokyo = getCatchment(35.68, 139.65);
  assert.equal(tokyo.available, false);
});

test('GloFAS text/plain feature-info parser reads MapServer\'s standard template', () => {
  const { parsePlainFeatureInfo } = require('../services/glofas');

  const populated = `GetFeatureInfo results:\n\nLayer 'reportingPoints'\nFeature 0: \n  id = '123456'\n  trend = 'rising'\n  rp20 = '45'\n\n`;
  const parsed = parsePlainFeatureInfo(populated);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].trend, 'rising');
  assert.equal(parsed[0].rp20, '45');

  assert.deepEqual(parsePlainFeatureInfo('No feature selected.\n'), []);
  assert.deepEqual(parsePlainFeatureInfo(''), []);
});

test('national timeline mechanism: shifting the evaluation instant picks up real forecast rainfall', () => {
  const { scoreDistrictAt } = require('../services/national');
  const nowSec = Math.floor(Date.now() / 1000);

  // Dry now and dry in the past 48h, but a real storm sitting 24h in the future
  // within the ALREADY-FETCHED series — exactly what buildNationalTimeline
  // re-scores against, with no new network call.
  const times = [];
  const precip = [];
  for (let h = -48; h <= 48; h++) {
    times.push(nowSec + h * 3600);
    precip.push(h >= 22 && h <= 26 ? 15 : 0); // heavy burst centred on +24h
  }
  const series = {
    hourly: { time: times, precipitation: precip, soilMoisture: null },
    current: { precipitation: 0 }
  };

  const district = { id: 'test-district', name: 'Test', province: 'Punjab', urban_density: 0.9, drainage_deficit: 0.8, river_exposure: 0.3, basin: 'Test' };
  const terrain = { slope_deg: 0.2, elevation_m: 200, terrain_class: 'PLAIN', available: true };

  const atNow = scoreDistrictAt(district, series, terrain, nowSec * 1000);
  const at24h = scoreDistrictAt(district, series, terrain, (nowSec + 24 * 3600) * 1000);

  assert.equal(atNow.risk.overall.code, 0, 'no rain in view yet at NOW should read NORMAL');
  assert.ok(at24h.risk.overall.code > atNow.risk.overall.code,
    'scoring 24h later, when the storm is centred in the accumulation window, must show materially higher risk than scoring at NOW');
});

test('hourly timeline splits observed from forecast at the evaluation instant', () => {
  const HOUR = 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const times = [nowSec - 2 * HOUR, nowSec - HOUR, nowSec, nowSec + HOUR, nowSec + 2 * HOUR];
  const precip = [1, 2, 3, 4, 5];
  const series = { hourly: { time: times, precipitation: precip, soilMoisture: null }, current: null };

  const analysis = analyseRainfall(series, nowSec * 1000);
  const timeline = analysis.hourly_timeline;

  assert.equal(timeline.length, 5);
  assert.deepEqual(timeline.map(p => p.data_type), ['OBSERVED', 'OBSERVED', 'OBSERVED', 'FORECAST', 'FORECAST']);
  assert.equal(timeline[2].mm, 3);
});

test('wetness falls back to rainfall alone when soil moisture is absent', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const series = { hourly: { time: [nowSec - 3600], precipitation: [1], soilMoisture: null }, current: null };
  const rf = rainfall({ obs: { '72h': 160 } });

  const w = assessWetness(series, rf, nowSec * 1000);
  assert.equal(w.complete, false, 'must report incomplete evidence');
  assert.deepEqual(w.basis, ['observed_prior_rainfall']);
  assert.ok(w.index > 0.7, '160 mm over 72 h is a wet catchment');
});
