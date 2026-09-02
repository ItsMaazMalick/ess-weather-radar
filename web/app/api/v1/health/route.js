const { NextResponse } = require('next/server');
const { cacheStats } = require('../../../../backend/services/openMeteo');
const { nationalCacheStats } = require('../../../../backend/services/national');

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'ess-weather-flood-intelligence',
    runtime: 'nextjs-vercel',
    phase: 'PHASE_2',
    uptime_s: Math.round(process.uptime()),
    caches: [...cacheStats(), nationalCacheStats()],
    timestamp: new Date().toISOString()
  });
}
