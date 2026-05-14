// messenger-watch: headless watcher for the business Page inbox.
//
// Architecture:
//   1. Load auth state (cookies + localStorage) from auth-state.json, which is
//      produced on a desktop machine by extract-state.js after bootstrap-login.
//      Full Chrome profiles are not portable Windows->Linux; storageState is.
//   2. Launch system Chromium (non-persistent), create a new context with that
//      auth state, and save state back to disk periodically so cookie rotations
//      survive restarts.
//   3. Navigate to business.facebook.com inbox.
//   4. Inject inject.js which installs a MutationObserver on the conversation
//      list and calls window.__notifyMessage(payload) for each NEW unread row.
//   5. Bridge those callbacks to Node via page.exposeFunction, apply the
//      rate caps, and POST surviving events to the POS sync API.
//   6. Restart the browser every RESTART_AFTER_HOURS to look human and refresh
//      any stale state.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { createCaps } = require('./lib/caps');
const { postIngest } = require('./lib/ingest');

const cfg = {
  ingestUrl: process.env.INGEST_URL,
  ingestToken: process.env.INGEST_TOKEN,
  chromiumExecutable: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
  authStatePath: process.env.AUTH_STATE_PATH || path.join(__dirname, '..', 'auth-state.json'),
  headless: (process.env.HEADLESS || 'true').toLowerCase() !== 'false',
  startUrl: process.env.START_URL || 'https://business.facebook.com/latest/inbox/',
  maxPerHour: parseInt(process.env.MAX_EVENTS_PER_HOUR || '30', 10),
  maxPerSession: parseInt(process.env.MAX_EVENTS_PER_SESSION || '500', 10),
  restartAfterHours: parseFloat(process.env.RESTART_AFTER_HOURS || '6'),
  stateSaveIntervalMin: parseFloat(process.env.STATE_SAVE_INTERVAL_MIN || '15'),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
};

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, ...args) {
  if ((LEVELS[level] ?? 2) > (LEVELS[cfg.logLevel] ?? 2)) return;
  const ts = new Date().toISOString();
  console.log(`${ts} [${level}]`, ...args);
}

function validateConfig() {
  const missing = [];
  if (!cfg.ingestUrl) missing.push('INGEST_URL');
  if (!cfg.ingestToken) missing.push('INGEST_TOKEN');
  if (missing.length) {
    log('error', 'missing required env vars:', missing.join(', '));
    process.exit(2);
  }
  if (!fs.existsSync(cfg.chromiumExecutable)) {
    log('error', `chromium executable not found: ${cfg.chromiumExecutable}`);
    process.exit(2);
  }
  if (!fs.existsSync(cfg.authStatePath)) {
    log('error', `auth-state.json not found at ${cfg.authStatePath}. Run bootstrap-login.js and extract-state.js on a desktop, then scp the JSON here.`);
    process.exit(2);
  }
}

async function runSession() {
  log('info', 'launching chromium');
  const browser = await chromium.launch({
    executablePath: cfg.chromiumExecutable,
    headless: cfg.headless,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=site-per-process,IsolateOrigins',
    ],
    chromiumSandbox: false,
  });
  const context = await browser.newContext({
    storageState: cfg.authStatePath,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Forward page console to our log at debug level so selector breakage is visible
  page.on('console', (msg) => {
    const txt = msg.text();
    if (txt.startsWith('[messenger-watch]')) log('debug', 'page:', txt);
  });
  page.on('pageerror', (err) => log('warn', 'page error:', err.message));

  const caps = createCaps({
    maxPerHour: cfg.maxPerHour,
    maxPerSession: cfg.maxPerSession,
    log,
  });

  await page.exposeFunction('__notifyMessage', async (payload) => {
    const decision = caps.tryConsume();
    if (!decision.ok) {
      log('warn', `cap hit (${decision.reason}); dropping event from "${payload.sender}". counts=`, decision.counts);
      return;
    }
    log('info', `event accepted (${decision.counts.eventsThisHour}/${cfg.maxPerHour} hr, ${decision.counts.eventsThisSession}/${cfg.maxPerSession} sess)`);
    const id = `scrape-${payload.ts}-${payload.key}`;
    await postIngest({
      url: cfg.ingestUrl,
      token: cfg.ingestToken,
      payload: {
        id,
        sender: payload.sender,
        text: payload.preview,
        timestamp: new Date(payload.ts).toISOString(),
        raw: payload.raw,
        source: 'scrape',
      },
      log,
    });
  });

  log('info', `navigating to ${cfg.startUrl}`);
  await page.goto(cfg.startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Detect login redirect — bootstrap is required
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('login.php')) {
    log('error', `redirected to login: ${currentUrl}. Cookies expired — re-run bootstrap-login.js and extract-state.js on a desktop, scp the new auth-state.json here.`);
    await browser.close();
    process.exit(3);
  }

  // Give the SPA a moment to render the inbox list before injecting.
  await page.waitForTimeout(5000);

  const injectSrc = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');
  // page.evaluate runs via CDP Runtime.evaluate which is NOT subject to the page's
  // Content-Security-Policy. Facebook's CSP blocks page.addScriptTag().
  await page.evaluate(injectSrc);
  log('info', 'inject.js installed');

  // Health probe every 5 min
  const healthTimer = setInterval(async () => {
    try {
      const status = await page.evaluate(() => (window.__messengerWatchStatus && window.__messengerWatchStatus()) || null);
      const snap = caps.snapshot();
      log('info', 'health:', { status, caps: snap });
      if (!status) {
        log('warn', 'watcher gone from page — reinjecting');
        await page.evaluate(injectSrc);
      }
    } catch (e) {
      log('warn', 'health probe failed:', e.message);
    }
  }, 5 * 60 * 1000);

  // Scheduled session restart
  const restartTimer = setTimeout(() => {
    log('info', `RESTART_AFTER_HOURS (${cfg.restartAfterHours}) elapsed — closing browser, pm2 will restart us`);
    cleanup(0);
  }, cfg.restartAfterHours * 60 * 60 * 1000);

  // Periodically save storageState back to disk so cookie rotations survive restarts
  async function saveState() {
    try {
      await context.storageState({ path: cfg.authStatePath });
      log('debug', 'saved auth state to', cfg.authStatePath);
    } catch (e) {
      log('warn', 'saveState failed:', e.message);
    }
  }
  const stateSaveTimer = setInterval(saveState, cfg.stateSaveIntervalMin * 60 * 1000);

  let cleanupCalled = false;
  async function cleanup(code) {
    if (cleanupCalled) return;
    cleanupCalled = true;
    clearInterval(healthTimer);
    clearTimeout(restartTimer);
    clearInterval(stateSaveTimer);
    try { await saveState(); } catch {}
    try { await browser.close(); } catch {}
    process.exit(code);
  }

  process.on('SIGTERM', () => { log('info', 'SIGTERM'); cleanup(0); });
  process.on('SIGINT', () => { log('info', 'SIGINT'); cleanup(0); });

  // Watch for session-cap exhaustion: shut down so pm2 restarts with a fresh budget
  setInterval(() => {
    if (caps.sessionExhausted()) {
      log('warn', 'session cap exhausted — shutting down, pm2 will restart');
      cleanup(0);
    }
  }, 60_000);
}

validateConfig();
runSession().catch((e) => {
  log('error', 'fatal:', e && e.stack || e);
  process.exit(1);
});
