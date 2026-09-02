const { jsonWithCache, withErrorHandling } = require('../../../../backend/http-helpers');
const { buildNationalSituation } = require('../../../../backend/services/national');

export const maxDuration = 30; // 51-district sweep; cheap when cached, real work on a cold cache

export const GET = withErrorHandling(async () => {
  const situation = await buildNationalSituation();
  return jsonWithCache(situation, 'public, max-age=300');
});
