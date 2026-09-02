/**
 * River flood alert intelligence via the Copernicus Global Flood Awareness
 * System (GloFAS) — real, free, no-registration river discharge modelling.
 *
 * This is NOT Pakistan FFD/WAPDA gauge telemetry — no public API for that
 * exists. GloFAS is a genuinely different, legitimate thing: an operational
 * global hydrological model, run by the EU's Copernicus Emergency Management
 * Service, used by national flood-forecasting agencies worldwide (including as
 * an input alongside local data). Its "Reporting Points" layer flags river
 * points where the modelled ensemble forecasts >20% probability of exceeding
 * the 2/5/20-year return-period discharge, with a rising/falling/stagnant trend.
 *
 * Important limitation, stated everywhere this is surfaced: the layer only
 * renders a point when it is under an active exceedance alert. Silence is the
 * normal, expected state for the vast majority of requests — it means GloFAS
 * currently has no alert there, not that the location has no river.
 */

'use strict';

const { fetchJson } = require('../lib/http');
const { TtlCache } = require('../lib/cache');

const WMS_BASE = 'https://ows.globalfloods.eu/glofas-ows/ows.py';
const cache = new TtlCache({ name: 'glofas-reporting-points' });
const capabilitiesCache = new TtlCache({ name: 'glofas-capabilities' });
// GloFAS reporting points update once daily (PT24H per its own WMS capabilities).
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const CAPABILITIES_TTL_MS = 3 * 60 * 60 * 1000;

const REQUEST_HEADERS = {
  'User-Agent': 'ESS-Weather-Flood-Intelligence/1.0 (+https://escan-systems.com)',
  Accept: '*/*'
};

/**
 * The reportingPoints layer's GetFeatureInfo rejects any TIME value that is
 * not exactly its currently published default — "today" is usually wrong,
 * since GloFAS forecast cycles publish with roughly a day's lag. Read the
 * live default straight from GetCapabilities rather than guessing a date.
 */
async function getDefaultTime() {
  return capabilitiesCache.resolve('default-time', CAPABILITIES_TTL_MS, async () => {
    const url = `${WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;
    const res = await fetch(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`GloFAS GetCapabilities responded ${res.status}`);
    const xml = await res.text();

    // <Dimension name="time" ... default="2026-09-01T00:00Z">...</Dimension> on
    // the reportingPoints layer specifically (the document has one per layer).
    const layerIdx = xml.indexOf('<Name>reportingPoints</Name>');
    if (layerIdx === -1) throw new Error('reportingPoints layer not found in GloFAS capabilities');
    const dimensionMatch = xml.slice(layerIdx, layerIdx + 4000).match(/<Dimension[^>]*default="([^"]+)"/);
    if (!dimensionMatch) throw new Error('No time dimension default found for reportingPoints');
    return dimensionMatch[1];
  });
}

/**
 * MapServer's text/plain GetFeatureInfo output is simple "key = 'value'" lines
 * per feature, separated by blank lines. No JSON/GML dependency needed.
 */
function parsePlainFeatureInfo(text) {
  if (!text || /no feature selected/i.test(text.trim())) return [];

  const features = [];
  let current = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (/^Feature \d+/i.test(trimmed)) {
      current = {};
      features.push(current);
      continue;
    }
    const m = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*'?(.*?)'?$/);
    if (m && current) current[m[1]] = m[2];
  }
  return features;
}

/** GET text via fetchJson's underlying fetch, but returning raw text. */
async function fetchText(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: REQUEST_HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GloFAS WMS responded ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const TREND_LABEL = { rising: 'RISING', falling: 'FALLING', stagnant: 'STABLE' };

/**
 * Query the GloFAS reporting-points layer in a small window around one
 * coordinate. Returns the nearest active alert feature, or an explicit
 * "no active alert" result — never a fabricated NORMAL reading, since GloFAS
 * genuinely did not report a number here.
 */
async function getRiverAlert(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  return cache.resolve(key, CACHE_TTL_MS, async () => {
    // ~0.5 deg window (~55 km) — wide enough to catch the nearest reporting
    // point without pulling in a neighbouring, unrelated river.
    const half = 0.5;
    const bbox = [lon - half, lat - half, lon + half, lat + half].join(',');

    let text;
    try {
      const time = await getDefaultTime();
      const params = new URLSearchParams({
        SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
        LAYERS: 'reportingPoints', QUERY_LAYERS: 'reportingPoints', STYLES: '',
        CRS: 'EPSG:4326', BBOX: bbox, WIDTH: '256', HEIGHT: '256',
        I: '128', J: '128', INFO_FORMAT: 'text/plain', FEATURE_COUNT: '5',
        TIME: time
      });
      text = await fetchText(`${WMS_BASE}?${params.toString()}`);
    } catch (err) {
      return { status: 'UNAVAILABLE', reason: err.message, source: 'GloFAS' };
    }

    const features = parsePlainFeatureInfo(text);
    if (!features.length) {
      return {
        status: 'NO_ACTIVE_ALERT',
        note: 'GloFAS reports no active return-period exceedance alert near this location right now.',
        source: 'Copernicus GloFAS',
        data_type: 'OBSERVED',
        checked_at: new Date().toISOString()
      };
    }

    // Field names come from GloFAS's own schema; surface whatever is present
    // rather than assuming an exact set, since MapServer templates vary by layer version.
    const f = features[0];
    return {
      status: 'ACTIVE_ALERT',
      raw: f,
      trend: TREND_LABEL[(f.trend || '').toLowerCase()] || f.trend || null,
      source: 'Copernicus GloFAS',
      data_type: 'OBSERVED',
      checked_at: new Date().toISOString(),
      note: 'GloFAS-modelled river discharge exceedance alert (not an official Pakistan FFD/WAPDA reading).'
    };
  });
}

module.exports = { getRiverAlert, parsePlainFeatureInfo };
