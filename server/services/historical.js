/**
 * Historical rainfall comparison (spec §20) — real climatology, not a guess.
 *
 * Source: Open-Meteo's historical archive, backed by ECMWF ERA5 reanalysis —
 * genuine daily precipitation going back decades, free, no registration.
 *
 * Method: pull the full daily series for this point over the last N years,
 * then keep only the days falling in a +/- WINDOW_DAYS band around today's
 * calendar date in each of those years. That keeps the comparison seasonally
 * honest — comparing today's monsoon rainfall against 20 Augusts, not against
 * a whole year that includes the dry season — while still giving a large
 * enough sample (roughly YEARS x (2 x WINDOW_DAYS + 1) days) for a percentile
 * to mean something.
 *
 * Important limitation stated in the output: the archive gives midnight-to-
 * midnight calendar-day totals, not a rolling trailing-24h window like the
 * live rainfall service uses. The two are compared as reasonable equivalents,
 * not claimed to be identical measurements.
 */

'use strict';

const { fetchJson } = require('../lib/http');
const { TtlCache } = require('../lib/cache');
const { ConcurrencyLimiter } = require('../lib/limiter');

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const cache = new TtlCache({ name: 'historical-climatology' });
// Same provider/IP concurrency ceiling as the forecast API — cap independently
// of it since these are large, slow queries best kept few at a time.
const limiter = new ConcurrencyLimiter(2);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // climatology does not shift day to day

const YEARS_OF_RECORD = 20;
const WINDOW_DAYS = 15; // +/- around today's calendar date, per year

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

/** True if `date`'s calendar day falls within +/-WINDOW_DAYS of `centerDoy`, wrapping year-end. */
function withinSeasonalWindow(date, centerDoy) {
  const doy = dayOfYear(date);
  const yearLen = (date.getUTCFullYear() % 4 === 0 && date.getUTCFullYear() % 100 !== 0) || date.getUTCFullYear() % 400 === 0 ? 366 : 365;
  let diff = Math.abs(doy - centerDoy);
  diff = Math.min(diff, yearLen - diff); // wrap around new year
  return diff <= WINDOW_DAYS;
}

function percentileRank(sample, value) {
  if (!sample.length) return null;
  const below = sample.filter(v => v <= value).length;
  return Math.round((below / sample.length) * 1000) / 10; // one decimal place
}

function formatIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Real historical comparison for one location's current 24 h rainfall.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} current24hMm  the live observed 24h accumulation to compare
 * @param {number} nowMs
 */
async function getHistoricalComparison(lat, lon, current24hMm, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${now.getUTCMonth()},${now.getUTCDate()}`;

  const climatology = await cache.resolve(key, CACHE_TTL_MS, async () => {
    const end = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31));
    const start = new Date(Date.UTC(end.getUTCFullYear() - YEARS_OF_RECORD + 1, 0, 1));

    const url =
      `${ARCHIVE_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&start_date=${formatIsoDate(start)}&end_date=${formatIsoDate(end)}` +
      `&daily=precipitation_sum&timezone=Asia%2FKarachi`;

    const body = await limiter.run(() =>
      fetchJson(url, { timeoutMs: 20000, retries: 1, label: 'Open-Meteo historical archive' })
    );
    const times = body?.daily?.time || [];
    const values = body?.daily?.precipitation_sum || [];
    if (!times.length) throw new Error('Historical archive returned no data for this location');

    const centerDoy = dayOfYear(now);
    const sample = [];
    for (let i = 0; i < times.length; i++) {
      const d = new Date(times[i] + 'T00:00:00Z');
      if (withinSeasonalWindow(d, centerDoy) && typeof values[i] === 'number') {
        sample.push({ date: times[i], mm: values[i] });
      }
    }

    return {
      sample,
      recordStart: formatIsoDate(start),
      recordEnd: formatIsoDate(end),
      years: YEARS_OF_RECORD
    };
  });

  const { sample, recordStart, recordEnd, years } = climatology;
  if (!sample.length) {
    return { available: false, reason: 'No historical sample could be built for this location' };
  }

  const values = sample.map(s => s.mm);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...sample].sort((a, b) => b.mm - a.mm);
  const previousMajorEvent = sorted[0];
  const percentile = percentileRank(values, current24hMm ?? 0);

  return {
    available: true,
    current_24h_mm: current24hMm ?? 0,
    historical_average_mm: Math.round(mean * 10) / 10,
    percentile,
    previous_major_event: {
      mm: previousMajorEvent.mm,
      date: previousMajorEvent.date
    },
    sample_size_days: values.length,
    record_span: `${recordStart} to ${recordEnd} (${years} years)`,
    seasonal_window_days: WINDOW_DAYS * 2 + 1,
    source: 'Open-Meteo Historical Archive (ECMWF ERA5 reanalysis)',
    data_type: 'OBSERVED',
    note:
      `Compares today's 24 h rainfall against ${values.length} calendar-day totals from the same ` +
      `+/-${WINDOW_DAYS}-day seasonal window across the last ${years} years — not the full year, ` +
      'so a wet monsoon day is judged against other monsoon days, not against the dry season. ' +
      'Archive values are midnight-to-midnight daily totals, compared here as a reasonable ' +
      'equivalent to a trailing 24 h reading rather than an identical measurement.'
  };
}

module.exports = { getHistoricalComparison };
