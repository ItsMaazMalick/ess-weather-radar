/**
 * ESS Weather & Flood Intelligence — application server.
 *
 * Serves the eScan & Radar frontend and the analytics API from one origin, so
 * the browser makes same-origin API calls with no CORS surface.
 */

'use strict';

const path = require('path');
const express = require('express');
const apiRouter = require('./routes/api');
const { validateConfig } = require('./config/thresholds');

// Fail fast on a bad weight vector rather than serving distorted scores.
validateConfig();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');

app.disable('x-powered-by');
app.set('trust proxy', true);

/* ----------------------------------------------------------- request context */
let requestSeq = 0;
app.use((req, res, next) => {
  const id = `${Date.now().toString(36)}-${(++requestSeq).toString(36)}`;
  const started = process.hrtime.bigint();
  res.setHeader('X-Request-Id', id);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (req.path.startsWith('/api/') || res.statusCode >= 400) {
      console.log(`[${id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`);
    }
  });
  next();
});

/* -------------------------------------------------------------- security */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/* ------------------------------------------------------------ rate limiting
 * A small in-process limiter: enough to stop one client from exhausting the
 * upstream data quota shared by every visitor. A multi-instance deployment
 * should move this to a shared store.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 240;
const hits = new Map();

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, list] of hits) {
    const recent = list.filter(t => t > cutoff);
    if (recent.length) hits.set(ip, recent);
    else hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

app.use('/api/', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => t > now - RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  res.setHeader('X-RateLimit-Limit', RATE_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_MAX - recent.length));

  if (recent.length > RATE_MAX) {
    return res.status(429).json({
      error: { message: 'Rate limit exceeded. Try again shortly.', type: 'RATE_LIMITED', retryable: true },
      timestamp: new Date().toISOString()
    });
  }
  next();
});

/* ------------------------------------------------------------------ routes */
app.use('/api/v1', apiRouter);

/* --------------------------------------------------- GIF export passthrough
 * Animated GIF compositing stays in the Python service (it has Pillow). Node is
 * the single public entry point and forwards that one route, so the browser
 * still talks to one origin.
 */
const GIF_SERVICE = process.env.GIF_SERVICE_URL || 'http://127.0.0.1:3001';

app.get('/api/generate-gif', async (req, res) => {
  const target = `${GIF_SERVICE}/api/generate-gif${req.url.slice(req.path.length)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const upstream = await fetch(target, { signal: controller.signal });
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: {
          message: `GIF service responded ${upstream.status}`,
          type: 'GIF_SERVICE_ERROR',
          retryable: true
        }
      });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/gif');
    res.setHeader('Cache-Control', 'no-store');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (err) {
    const offline = err.name === 'AbortError' ? 'timed out' : 'is not running';
    console.warn(`[gif] service ${offline}: ${err.message}`);
    res.status(503).json({
      error: {
        message: `GIF export service ${offline}. Start it with: npm run gif-service`,
        type: 'GIF_SERVICE_UNAVAILABLE',
        retryable: true
      }
    });
  } finally {
    clearTimeout(timer);
  }
});

app.use(
  express.static(ROOT, {
    index: 'index.html',
    extensions: ['html'],
    setHeaders(res, filePath) {
      // The app shell changes with every deploy; never let a stale copy stick.
      if (/\.(html|js|css)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: { message: `Unknown API route: ${req.path}`, type: 'NOT_FOUND', retryable: false },
      timestamp: new Date().toISOString()
    });
  }
  res.status(404).sendFile(path.join(ROOT, 'index.html'));
});

/* ------------------------------------------------------------- boot & stop */
const server = app.listen(PORT, HOST, () => {
  console.log(`ESS Weather & Flood Intelligence — Phase 1`);
  console.log(`  listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  API base     /api/v1`);
});

function shutdown(signal) {
  console.log(`\n${signal} received — closing server.`);
  server.close(() => process.exit(0));
  // Do not let a hung connection block shutdown indefinitely.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
