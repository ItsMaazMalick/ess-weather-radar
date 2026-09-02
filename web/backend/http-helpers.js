/**
 * Shared helpers for Next.js API routes — mirrors the error-shape and
 * coordinate validation that server/routes/api.js used under Express, so
 * every response contract stays identical between the two deployments.
 */

'use strict';

const { NextResponse } = require('next/server');
const { UpstreamError } = require('./lib/http');

function parseCoordinates(searchParams) {
  const lat = Number.parseFloat(searchParams.get('lat'));
  const lon = Number.parseFloat(searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const err = new Error('Query parameters "lat" and "lon" are required and must be numbers.');
    err.status = 400;
    throw err;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const err = new Error('Coordinates out of range: lat must be -90..90 and lon -180..180.');
    err.status = 400;
    throw err;
  }
  return { lat, lon };
}

/** Wrap a handler so a thrown error becomes the same JSON error shape the Express API used. */
function withErrorHandling(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      const isUpstream = err instanceof UpstreamError;
      const status = err.status || (isUpstream ? 503 : 500);

      if (status >= 500) {
        console.error(`[api] ${req.method} ${req.nextUrl?.pathname} -> ${status}:`, err.message);
      }

      return NextResponse.json(
        {
          error: {
            message: status >= 500 && !isUpstream ? 'Internal server error' : err.message,
            type: isUpstream ? 'UPSTREAM_UNAVAILABLE' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL',
            retryable: status >= 500
          },
          timestamp: new Date().toISOString()
        },
        { status }
      );
    }
  };
}

function jsonWithCache(data, cacheControl) {
  return NextResponse.json(data, { headers: { 'Cache-Control': cacheControl } });
}

module.exports = { parseCoordinates, withErrorHandling, jsonWithCache };
