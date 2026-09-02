const { parseCoordinates, withErrorHandling, jsonWithCache } = require('../../../../backend/http-helpers');
const { buildLocationReport } = require('../../../../backend/services/locationReport');

export const GET = withErrorHandling(async (req) => {
  const { searchParams } = req.nextUrl;
  const { lat, lon } = parseCoordinates(searchParams);
  const rawLabel = searchParams.get('label');
  const label = typeof rawLabel === 'string' ? rawLabel.slice(0, 120) : undefined;

  const report = await buildLocationReport(lat, lon, { label });
  return jsonWithCache(report, 'public, max-age=120');
});
