// Dumps Playwright `storageState` (cookies + localStorage) from the local
// Windows user-data dir to a portable JSON file. This JSON is the ONLY thing
// shipped to the Kali server — full profiles are not portable (Windows-format
// disk cache and DPAPI-encrypted blobs crash Chromium on Linux).
//
// Usage (after a successful bootstrap-login.js):
//   node packages/messenger-watch/src/extract-state.js
//
// Output: packages/messenger-watch/auth-state.json

const path = require('path');
const { chromium } = require('playwright-core');

const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'user-data');
const OUT_PATH = process.env.STATE_OUT || path.join(__dirname, '..', 'auth-state.json');
const CHANNEL = process.env.PW_CHANNEL || 'chrome';

(async () => {
  console.log('Opening persistent context to extract storage state.');
  console.log('user-data-dir =', USER_DATA_DIR);
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: CHANNEL,
    headless: true,
    viewport: { width: 1366, height: 768 },
  });
  // Hit facebook.com once so any session cookies that load lazily are present.
  const page = ctx.pages()[0] || (await ctx.newPage());
  try {
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (e) {
    console.warn('facebook.com warm-up failed (continuing):', e.message);
  }
  const state = await ctx.storageState();
  await ctx.close();

  const fs = require('fs');
  fs.writeFileSync(OUT_PATH, JSON.stringify(state, null, 2));
  console.log(`Wrote ${state.cookies.length} cookies and ${state.origins.length} origins to ${OUT_PATH}`);
  console.log('Next: scp this file to the server.');
})().catch((e) => {
  console.error('extract failed:', e);
  process.exit(1);
});
