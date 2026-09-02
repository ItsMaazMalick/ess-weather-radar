const { parseCoordinates, withErrorHandling, jsonWithCache } = require('../../../../backend/http-helpers');
const { getRiverAlert } = require('../../../../backend/services/glofas');

export const GET = withErrorHandling(async (req) => {
  const { lat, lon } = parseCoordinates(req.nextUrl.searchParams);
  const alert = await getRiverAlert(lat, lon);
  return jsonWithCache(alert, 'public, max-age=1800');
});
