// Run this ONCE on a desktop machine to log into Facebook Business Suite.
// It opens a real visible browser using a persistent user-data-dir; you log in
// manually, handle 2FA / device-approval, then close the window. The resulting
// user-data-dir can be copied to the Kali server so the headless watcher
// inherits the session.
//
// Usage:
//   pnpm --filter messenger-watch install
//   node packages/messenger-watch/src/bootstrap-login.js
//
// After login, scp the user-data dir to the server:
//   scp -r -i %USERPROFILE%\kali_openclaw .\packages\messenger-watch\user-data ^
//     root@76.13.215.54:/var/www/3ks.afkcube.com/messenger-watch/

const path = require('path');
const { chromium } = require('playwright-core');

const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'user-data');
const START_URL = process.env.START_URL || 'https://business.facebook.com/latest/inbox/';
// Use the OS Chrome/Edge install if available; otherwise let Playwright look for system chromium.
const CHANNEL = process.env.PW_CHANNEL || 'chrome';

(async () => {
  console.log('Opening headful Chrome for FB login.');
  console.log('user-data-dir =', USER_DATA_DIR);
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: CHANNEL,
    headless: false,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(START_URL);
  console.log('\n>>> Log in manually in the opened window. Approve 2FA if prompted.');
  console.log('>>> When you can see the inbox conversation list, close the browser window.');
  // Wait for window close
  await new Promise((resolve) => {
    ctx.on('close', resolve);
    page.on('close', resolve);
  });
  console.log('Browser closed. user-data-dir is ready at:', USER_DATA_DIR);
  console.log('Next step: scp -r this directory to the Kali server.');
})().catch((e) => {
  console.error('bootstrap failed:', e);
  process.exit(1);
});
