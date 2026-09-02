const { parseCoordinates, withErrorHandling, jsonWithCache } = require('../../../../../backend/http-helpers');
const { buildLocationEnrichment } = require('../../../../../backend/services/locationReport');

// This endpoint chains WorldPop + Overpass + a 20-year historical archive
// query and has been measured at 7-12s uncached. Vercel's Hobby-plan default
// function timeout (10s) would cut that off mid-request; this raises the cap
// (max allowed on Hobby is 60s) so a slow-but-real response isn't truncated
// into a false failure.
export const maxDuration = 30;

export const GET = withErrorHandling(async (req) => {
  const { searchParams } = req.nextUrl;
  const { lat, lon } = parseCoordinates(searchParams);
  const raw = searchParams.get('current_24h_mm');
  const current24hMm = raw != null ? Number.parseFloat(raw) : 0;

  const enrichment = await buildLocationEnrichment(lat, lon, Number.isFinite(current24hMm) ? current24hMm : 0);
  return jsonWithCache(enrichment, 'public, max-age=1800');
});
