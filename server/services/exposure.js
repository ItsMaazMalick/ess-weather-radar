/**
 * Exposure analytics (spec §15, §16) — the parts genuinely computable from open
 * data. Population comes from WorldPop (free, no key). Road length comes from
 * OpenStreetMap via the Overpass API (free, no key). Both are real, live queries
 * against a small area around the point, not static or invented figures.
 *
 * Deliberately NOT included, because no open source exists for them:
 *   - settlements, schools, health facilities: needs a maintained facility
 *     registry (OSM tagging for these is too incomplete in Pakistan to trust
 *     for a safety product)
 *   - cropland by crop TYPE (rice/cotton/maize): needs a crop-type map, not
 *     just a land-cover class
 * Those stay under locationReport's INTEGRATION_PENDING block.
 */

'use strict';

const { fetchJson } = require('../lib/http');
const { TtlCache } = require('../lib/cache');

const cache = new TtlCache({ name: 'exposure' });
const CACHE_TTL_MS = 60 * 60 * 1000; // population/road networks change slowly

/** Roughly `km` kilometres of longitude/latitude padding around a point. */
function bufferBox(lat, lon, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

/**
 * Population within a square buffer around the point (WorldPop 2020, ~100 m
 * gridded population, aggregated server-side by WorldPop itself).
 */
async function getPopulationExposure(lat, lon, bufferKm = 5) {
  const key = `pop:${lat.toFixed(3)},${lon.toFixed(3)},${bufferKm}`;

  return cache.resolve(key, CACHE_TTL_MS, async () => {
    const b = bufferBox(lat, lon, bufferKm);
    const polygon = {
      type: 'Polygon',
      coordinates: [[
        [b.minLon, b.minLat], [b.maxLon, b.minLat],
        [b.maxLon, b.maxLat], [b.minLon, b.maxLat], [b.minLon, b.minLat]
      ]]
    };
    const url =
      `https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&runasync=false` +
      `&geojson=${encodeURIComponent(JSON.stringify(polygon))}`;

    try {
      const body = await fetchJson(url, { timeoutMs: 18000, retries: 1, label: 'WorldPop' });
      const pop = body?.data?.total_population;
      if (typeof pop !== 'number') throw new Error('WorldPop returned no population figure');

      return {
        available: true,
        population: Math.round(pop),
        buffer_km: bufferKm,
        area_km2: Math.round((2 * bufferKm) ** 2),
        dataset_year: 2020,
        source: 'WorldPop Global Population (100 m gridded)',
        data_type: 'MODELLED',
        note:
          `Population within a ${2 * bufferKm} km x ${2 * bufferKm} km box centred on this point, ` +
          'from WorldPop\'s 2020 gridded estimate — the freshest year WorldPop publishes for this ' +
          'product. It is a scaled population surface, not a census count, and is not itself ' +
          'intersected with a flood extent (that step needs a flood polygon, e.g. Phase 3 SAR ' +
          'inundation, to become a true exposure figure).'
      };
    } catch (err) {
      return { available: false, reason: err.message, source: 'WorldPop' };
    }
  });
}

/** Sum great-circle length (km) of an OSM way's node geometry. */
function wayLengthKm(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return 0;
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(h));
  }
  return total;
}

/**
 * Road network length within a buffer around the point, from live OpenStreetMap
 * data via the Overpass API. Classified into major (motorway/trunk/primary) vs
 * all-classes so a users sees both the arterial network and the full picture.
 */
async function getRoadExposure(lat, lon, bufferKm = 5) {
  const key = `road:${lat.toFixed(3)},${lon.toFixed(3)},${bufferKm}`;

  return cache.resolve(key, CACHE_TTL_MS, async () => {
    const b = bufferBox(lat, lon, bufferKm);
    const bbox = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`;
    const query =
      `[out:json][timeout:10];` +
      `way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox});` +
      `out geom;`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let res;
      try {
        res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Overpass's Apache front-end 406s Node's default fetch UA/Accept.
            'User-Agent': 'ESS-Weather-Flood-Intelligence/1.0 (+https://escan-systems.com)',
            Accept: '*/*'
          },
          body: `data=${encodeURIComponent(query)}`
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
      const body = await res.json();

      let majorKm = 0;
      let totalKm = 0;
      const MAJOR = new Set(['motorway', 'trunk', 'primary']);

      for (const el of body.elements || []) {
        if (el.type !== 'way' || !el.geometry) continue;
        const len = wayLengthKm(el.geometry);
        totalKm += len;
        if (MAJOR.has(el.tags?.highway)) majorKm += len;
      }

      return {
        available: true,
        total_road_km: Math.round(totalKm * 10) / 10,
        major_road_km: Math.round(majorKm * 10) / 10,
        way_count: (body.elements || []).length,
        buffer_km: bufferKm,
        source: 'OpenStreetMap (via Overpass API)',
        data_type: 'OBSERVED',
        note:
          `Live road network within a ${2 * bufferKm} km x ${2 * bufferKm} km box. This is road ` +
          'presence, not exposure to a specific flood extent — that intersection needs a flood ' +
          'polygon (Phase 3).'
      };
    } catch (err) {
      return { available: false, reason: err.message, source: 'OpenStreetMap / Overpass' };
    }
  });
}

/**
 * Combine what is real. Settlements/schools/health facilities/crop-type
 * cropland remain explicitly unavailable — see module docstring.
 */
async function getExposure(lat, lon) {
  const [population, roads] = await Promise.all([
    getPopulationExposure(lat, lon),
    getRoadExposure(lat, lon)
  ]);

  return {
    population,
    roads,
    settlements: { available: false, reason: 'No reliable open settlement registry for Pakistan' },
    schools: { available: false, reason: 'No open school-location dataset integrated' },
    health_facilities: { available: false, reason: 'No open health-facility dataset integrated' },
    cropland_by_type: {
      available: false,
      reason: 'Requires a crop-TYPE map (rice/cotton/maize), not just land-cover class; not yet integrated'
    },
    scope: 'This is presence/population near the point, not intersection with an actual flood extent.',
    phase: 'PHASE_2'
  };
}

module.exports = { getExposure, getPopulationExposure, getRoadExposure };
