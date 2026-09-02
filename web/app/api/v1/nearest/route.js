const { NextResponse } = require('next/server');
const { parseCoordinates, withErrorHandling } = require('../../../../backend/http-helpers');
const { nearestDistrict } = require('../../../../backend/config/districts');

export const GET = withErrorHandling(async (req) => {
  const { lat, lon } = parseCoordinates(req.nextUrl.searchParams);
  const { district, distanceKm } = nearestDistrict(lat, lon);
  return NextResponse.json({ district, distance_km: distanceKm });
});
