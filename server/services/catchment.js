/**
 * Catchment intelligence (spec §12) — REAL hydrological basins, not a proxy.
 *
 * Data: HydroBASINS level 6 (WWF/HydroSHEDS, derived from the same 90 m DEM
 * family as our terrain service), clipped to the Pakistan region and shipped as
 * a static GeoJSON in server/data/. Each polygon carries:
 *   HYBAS_ID   unique basin id
 *   NEXT_DOWN  the id of the basin immediately downstream (0 = drains to sea/sink)
 *   MAIN_BAS   id of the basin at the root of this river system
 *   SUB_AREA   this basin's own area, km²
 *   UP_AREA    total area draining through this basin, km²
 *
 * NEXT_DOWN is a real flow-direction graph: walking it downstream from any
 * point traces the actual path water takes toward the sea, which is exactly
 * the "rainfall -> catchment -> ... -> river response" chain the spec asks for.
 * Sub-catchment delineation *within* a basin (needed for fine-grained runoff
 * routing) requires raster flow-accumulation analysis and stays Phase 2b.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'pakistan_basins_lev06.geojson');

let basins = null;       // Feature[]
let byId = null;         // Map<HYBAS_ID, Feature>
let loadError = null;

function load() {
  if (basins || loadError) return;
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const geojson = JSON.parse(raw);
    basins = geojson.features;
    byId = new Map(basins.map(f => [f.properties.HYBAS_ID, f]));
    console.log(`[catchment] loaded ${basins.length} HydroBASINS level-6 polygons for the Pakistan region`);
  } catch (err) {
    loadError = err;
    console.error('[catchment] failed to load HydroBASINS data:', err.message);
  }
}

/** Ray-casting point-in-ring test (planar; adequate at basin scale). */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Polygon = [outerRing, ...holeRings]. Point counts only if inside outer and outside every hole. */
function pointInPolygon(lon, lat, polygon) {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lon, lat, polygon[h])) return false;
  }
  return true;
}

function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygon(lon, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly => pointInPolygon(lon, lat, poly));
  }
  return false;
}

/** Rough planar bbox pre-filter so most polygons are skipped without a ring walk. */
function bboxOf(geometry) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const visit = ring => {
    for (const [x, y] of ring) {
      if (x < minLon) minLon = x;
      if (x > maxLon) maxLon = x;
      if (y < minLat) minLat = y;
      if (y > maxLat) maxLat = y;
    }
  };
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) visit(poly[0]);
  return [minLon, minLat, maxLon, maxLat];
}

/** Basin polygons rarely change shape between requests; cache each bbox once. */
const bboxCache = new WeakMap();
function cachedBbox(feature) {
  let b = bboxCache.get(feature);
  if (!b) {
    b = bboxOf(feature.geometry);
    bboxCache.set(feature, b);
  }
  return b;
}

/**
 * The basin containing (lat, lon), or null if outside the covered region
 * (basins are clipped to a Pakistan-region bounding box, so points well outside
 * South/Central Asia will not resolve).
 */
function findBasin(lat, lon) {
  load();
  if (!basins) return null;

  for (const f of basins) {
    const [minLon, minLat, maxLon, maxLat] = cachedBbox(f);
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (pointInGeometry(lon, lat, f.geometry)) return f;
  }
  return null;
}

/**
 * Walk NEXT_DOWN to trace the real downstream flow path, capped to avoid any
 * malformed cycle in the source data running away.
 */
function downstreamChain(feature, maxHops = 25) {
  const chain = [];
  let current = feature;
  let hops = 0;

  while (current && hops < maxHops) {
    chain.push({
      hybas_id: current.properties.HYBAS_ID,
      sub_area_km2: current.properties.SUB_AREA,
      upstream_area_km2: current.properties.UP_AREA
    });
    const nextId = current.properties.NEXT_DOWN;
    if (!nextId || nextId === 0) break;
    current = byId.get(nextId) || null;
    hops++;
  }
  return chain;
}

/**
 * Real catchment context for a point: which basin it drains through, how much
 * area is upstream of it, and the actual downstream flow path.
 */
function getCatchment(lat, lon) {
  load();
  if (loadError) {
    return {
      available: false,
      reason: 'HydroBASINS dataset failed to load on the server',
      data_type: null
    };
  }

  const basin = findBasin(lat, lon);
  if (!basin) {
    return {
      available: false,
      reason: 'Location falls outside the loaded HydroBASINS coverage region',
      data_type: null
    };
  }

  const p = basin.properties;
  const chain = downstreamChain(basin);

  return {
    available: true,
    hybas_id: p.HYBAS_ID,
    main_basin_id: p.MAIN_BAS,
    sub_area_km2: p.SUB_AREA,
    upstream_area_km2: p.UP_AREA,
    outlet: p.NEXT_DOWN === 0 || !p.NEXT_DOWN ? 'ENDORHEIC_OR_COASTAL_SINK' : null,
    downstream_flow_path: chain,
    resolution: 'HydroBASINS level 6 (~1,000+ km² typical sub-basin)',
    source: 'HydroSHEDS / HydroBASINS v1c (WWF)',
    data_type: 'OBSERVED',
    note:
      'Real basin delineation and downstream flow routing from 90 m DEM-derived hydrography. ' +
      'Sub-basin-level flow accumulation and drainage-network detail are a further refinement, not yet built.'
  };
}

module.exports = { getCatchment, findBasin, downstreamChain };
