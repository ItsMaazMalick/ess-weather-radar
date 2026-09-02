const { jsonWithCache } = require('../../../../backend/http-helpers');
const { DISTRICTS, PROVINCES } = require('../../../../backend/config/districts');

export async function GET() {
  return jsonWithCache(
    {
      count: DISTRICTS.length,
      provinces: PROVINCES,
      districts: DISTRICTS,
      note:
        'urban_density, drainage_deficit and river_exposure are static ESS reference classifications (0..1), not live measurements.'
    },
    'public, max-age=3600'
  );
}
