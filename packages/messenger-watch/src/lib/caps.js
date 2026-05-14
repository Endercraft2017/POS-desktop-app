// Rate-limit / safety caps for the watcher.
// Guarantees a bounded number of webhook fires per hour and per session,
// so Meta sees activity that looks like a human admin reading an inbox,
// not an unbounded scraper.

function createCaps({ maxPerHour, maxPerSession, log }) {
  let hourBucketStart = Date.now();
  let eventsThisHour = 0;
  let eventsThisSession = 0;

  function rollHourIfNeeded() {
    const now = Date.now();
    if (now - hourBucketStart >= 60 * 60 * 1000) {
      hourBucketStart = now;
      eventsThisHour = 0;
      log('info', 'hourly cap bucket rolled over');
    }
  }

  return {
    tryConsume() {
      rollHourIfNeeded();
      if (eventsThisSession >= maxPerSession) {
        return { ok: false, reason: 'session-cap', counts: { eventsThisHour, eventsThisSession } };
      }
      if (eventsThisHour >= maxPerHour) {
        return { ok: false, reason: 'hour-cap', counts: { eventsThisHour, eventsThisSession } };
      }
      eventsThisHour++;
      eventsThisSession++;
      return { ok: true, counts: { eventsThisHour, eventsThisSession } };
    },
    sessionExhausted() {
      return eventsThisSession >= maxPerSession;
    },
    snapshot() {
      rollHourIfNeeded();
      return { eventsThisHour, eventsThisSession, maxPerHour, maxPerSession };
    },
  };
}

module.exports = { createCaps };
