/**
 * Concurrency limiter — a simple semaphore for capping simultaneous calls to
 * an upstream that enforces its own concurrency limit (Open-Meteo returns
 * "Too many concurrent requests" well before it returns a rate-limit error).
 *
 * Without this, a single page load that triggers several independent report
 * builds at once (national sweep + a location report + several road-corridor
 * risk checks) can each open their own Open-Meteo connections simultaneously
 * and get rejected — a self-inflicted outage, not an upstream failure.
 */

'use strict';

class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.queue = [];
  }

  /** Run `fn` once a slot is free; queues in call order otherwise. */
  run(fn) {
    return new Promise((resolve, reject) => {
      const task = () => {
        this.active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this._next();
          });
      };

      if (this.active < this.maxConcurrent) task();
      else this.queue.push(task);
    });
  }

  _next() {
    if (this.queue.length === 0 || this.active >= this.maxConcurrent) return;
    const task = this.queue.shift();
    task();
  }

  snapshot() {
    return { maxConcurrent: this.maxConcurrent, active: this.active, queued: this.queue.length };
  }
}

module.exports = { ConcurrencyLimiter };
