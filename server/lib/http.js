/**
 * Upstream HTTP helper: bounded timeouts, bounded retries, normalised errors.
 *
 * Every outbound call in this service goes through here so that a slow or
 * flapping upstream can never hang a request thread indefinitely, and so that
 * failures arrive at the route layer as a consistent shape.
 */

'use strict';

class UpstreamError extends Error {
  constructor(message, { status = null, url = null, cause = null } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.url = url;
    this.cause = cause;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch JSON with a hard timeout and retry on transient failures.
 * 4xx responses are NOT retried — they indicate a request we built wrongly.
 */
async function fetchJson(url, { timeoutMs = 15_000, retries = 2, label = 'upstream' } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ESS-Weather-Flood-Intelligence/1.0 (+https://escan-systems.com)',
          Accept: 'application/json'
        }
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new UpstreamError(
          `${label} responded ${res.status}: ${body.slice(0, 200)}`,
          { status: res.status, url }
        );
        // Client-side errors are deterministic; retrying just wastes quota.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err;
        lastError = err;
      } else {
        return await res.json();
      }
    } catch (err) {
      if (err instanceof UpstreamError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      lastError =
        err.name === 'AbortError'
          ? new UpstreamError(`${label} timed out after ${timeoutMs}ms`, { url, cause: err })
          : new UpstreamError(`${label} request failed: ${err.message}`, { url, cause: err });
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) {
      await sleep(250 * Math.pow(2, attempt)); // 250ms, 500ms
    }
  }

  throw lastError || new UpstreamError(`${label} failed`, { url });
}

module.exports = { fetchJson, UpstreamError };
