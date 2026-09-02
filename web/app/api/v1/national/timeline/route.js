const { jsonWithCache, withErrorHandling } = require('../../../../../backend/http-helpers');
const { buildNationalTimeline } = require('../../../../../backend/services/national');

export const maxDuration = 30;

export const GET = withErrorHandling(async () => {
  const timeline = await buildNationalTimeline();
  return jsonWithCache(timeline, 'public, max-age=300');
});
