// POST detected messages to the POS sync API.
// Uses the global fetch available in Node 18+.

async function postIngest({ url, token, payload, log }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scrape-Token': token,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (res.status >= 200 && res.status < 300) {
      log('info', `ingest ok status=${res.status} sender="${payload.sender}"`);
      return true;
    }
    log('error', `ingest non-2xx status=${res.status} body=${text.slice(0, 200)}`);
    return false;
  } catch (e) {
    log('error', `ingest threw: ${e.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { postIngest };
