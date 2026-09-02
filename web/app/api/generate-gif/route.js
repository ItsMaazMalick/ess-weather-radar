const { NextResponse } = require('next/server');

/**
 * Animated GIF export depends on the separate Python/Pillow compositing
 * service (server.py in the Express deployment). Vercel is serverless-only —
 * it cannot run that persistent companion process — so this deployment
 * reports the feature as unavailable rather than hanging or crashing. The
 * frontend already handles this response and shows a clear message instead
 * of a broken export button.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: {
        message:
          'GIF export is not available on this deployment (Vercel is serverless-only and cannot run the Python compositing service). Everything else — map, analytics, risk engine — works normally.',
        type: 'GIF_SERVICE_UNAVAILABLE',
        retryable: false
      },
      timestamp: new Date().toISOString()
    },
    { status: 501 }
  );
}
