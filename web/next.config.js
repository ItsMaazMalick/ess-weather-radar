/**
 * The frontend (index.html/app.js/style.css) is the original vanilla-JS
 * Leaflet SPA, served unchanged from public/ — this rewrite makes it the
 * site's root instead of writing it as a full React rewrite.
 *
 * Headers replace Express's X-Frame-Options: SAMEORIGIN (which would block
 * the WordPress iframe embedding this deployment exists for) with a
 * Content-Security-Policy frame-ancestors directive instead. '*' is a
 * placeholder — tighten this to the exact WordPress domain once known,
 * e.g. "frame-ancestors 'self' https://your-wordpress-site.com".
 */
const path = require('path');

const nextConfig = {
  // This app lives in a subdirectory of a larger (non-Next.js) project that
  // has its own lockfile; pin the workspace root explicitly so Next's file
  // tracing (which the GeoJSON include below depends on) is unambiguous.
  turbopack: { root: __dirname },
  outputFileTracingRoot: path.join(__dirname),

  async rewrites() {
    return [{ source: '/', destination: '/index.html' }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
