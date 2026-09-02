/**
 * TTL cache with in-flight request coalescing.
 *
 * Coalescing matters more than the caching here: without it, N simultaneous
 * viewers asking for the same district each trigger their own upstream call.
 * With it, the first caller performs the fetch and everyone else awaits that
 * same promise, so upstream load is bounded by distinct keys, not by traffic.
 */

'use strict';

class TtlCache {
  constructor({ name = 'cache', sweepIntervalMs = 60_000 } = {}) {
    this.name = name;
    this.store = new Map();   // key -> { value, expiresAt }
    this.inflight = new Map(); // key -> Promise
    this.stats = { hits: 0, misses: 0, coalesced: 0, errors: 0 };

    // unref so an idle timer never holds the process open
    this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
    if (typeof this.sweeper.unref === 'function') this.sweeper.unref();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /**
   * Return the cached value for `key`, otherwise run `producer()` — collapsing
   * concurrent misses for the same key into a single execution.
   */
  async resolve(key, ttlMs, producer) {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.stats.hits++;
      return cached;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      this.stats.coalesced++;
      return pending;
    }

    this.stats.misses++;
    const promise = (async () => {
      try {
        const value = await producer();
        this.set(key, value, ttlMs);
        return value;
      } catch (err) {
        this.stats.errors++;
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  /** Drop expired entries so the map does not grow without bound. */
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  snapshot() {
    return { name: this.name, size: this.store.size, inflight: this.inflight.size, ...this.stats };
  }

  clear() {
    this.store.clear();
  }
}

module.exports = { TtlCache };
