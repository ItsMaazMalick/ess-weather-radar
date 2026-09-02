/**
 * Terrain analytics from real elevation data (Copernicus DEM GLO-90 via Open-Meteo).
 *
 * Slope is MEASURED, not assumed: five DEM samples (centre plus four cardinal
 * neighbours) give north-south and east-west gradients, combined into a regional
 * terrain gradient in degrees.
 *
 * Note on scale: the sampling baseline is ~2 km, so this is a REGIONAL gradient
 * suitable for regional hazard weighting — it is deliberately not presented as
 * local hillslope angle, which would need full-resolution DEM raster analysis
 * (Phase 2).
 */

'use strict';

const { getElevations } = require('./openMeteo');
const { DATA_POLICY } = require('../config/thresholds');

const METRES_PER_DEG_LAT = 111_320;
const OFFSET = DATA_POLICY.slopeSampleOffsetDeg;

function classifyTerrain(slopeDeg, elevationM) {
  if (slopeDeg == null) return 'UNKNOWN';
  if (slopeDeg >= 4) return 'MOUNTAINOUS';
  if (slopeDeg >= 1.5) return 'HILLY';
  if (slopeDeg >= 0.5) return 'UNDULATING';
  return elevationM != null && elevationM > 1000 ? 'ELEVATED_PLATEAU' : 'PLAIN';
}

/**
 * Measured terrain for a batch of coordinates.
 * Each location costs five DEM samples; they are issued as one batched,
 * month-cached upstream request.
 *
 * @param {Array<{lat:number, lon:number}>} points
 * @returns {Promise<Array<{elevation_m:number|null, slope_deg:number|null, terrain_class:string}>>}
 */
async function getTerrainBatch(points) {
  if (!points.length) return [];

  // Build the 5-point stencil for every location, preserving order.
  const samples = [];
  for (const p of points) {
    samples.push(
      { lat: p.lat, lon: p.lon },                 // centre
      { lat: p.lat + OFFSET, lon: p.lon },        // north
      { lat: p.lat - OFFSET, lon: p.lon },        // south
      { lat: p.lat, lon: p.lon + OFFSET },        // east
      { lat: p.lat, lon: p.lon - OFFSET }         // west
    );
  }

  let elevations;
  try {
    elevations = await getElevations(samples);
  } catch (err) {
    // Terrain is a contributing factor, not a hard dependency: degrade rather
    // than fail the whole report.
    return points.map(() => ({
      elevation_m: null,
      slope_deg: null,
      terrain_class: 'UNKNOWN',
      available: false
    }));
  }

  return points.map((p, i) => {
    const base = i * 5;
    const [centre, north, south, east, west] = elevations.slice(base, base + 5);

    if (![centre, north, south, east, west].every(v => typeof v === 'number' && Number.isFinite(v))) {
      return {
        elevation_m: typeof centre === 'number' ? centre : null,
        slope_deg: null,
        terrain_class: 'UNKNOWN',
        available: false
      };
    }

    const nsDistance = 2 * OFFSET * METRES_PER_DEG_LAT;
    const ewDistance = 2 * OFFSET * METRES_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180);

    const nsGradient = (north - south) / nsDistance;
    const ewGradient = ewDistance > 0 ? (east - west) / ewDistance : 0;
    const gradient = Math.sqrt(nsGradient ** 2 + ewGradient ** 2);
    const slopeDeg = Math.round(((Math.atan(gradient) * 180) / Math.PI) * 100) / 100;

    return {
      elevation_m: Math.round(centre),
      slope_deg: slopeDeg,
      relief_m: Math.round(Math.max(north, south, east, west) - Math.min(north, south, east, west)),
      terrain_class: classifyTerrain(slopeDeg, centre),
      available: true
    };
  });
}

async function getTerrain(lat, lon) {
  const [terrain] = await getTerrainBatch([{ lat, lon }]);
  return terrain;
}

module.exports = {
  getTerrain,
  getTerrainBatch,
  classifyTerrain,
  SOURCE: 'Copernicus DEM GLO-90 (via Open-Meteo elevation API)'
};
