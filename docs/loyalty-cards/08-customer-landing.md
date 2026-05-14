# Step 08 — Customer-facing landing page

> When a customer scans their QR card with any external scanner (phone camera, generic QR app), they land on `https://3ks.afkcube.com/?card=<CODE>`. The site should detect the `card` param, look up that specific card publicly, and render a personalized view: **their name, their QR code, and their current stamp progress**. No login.

---

## Customer flow

1. Customer scans printed QR with their phone's stock camera.
2. Phone offers a link → tapping opens default browser at `https://3ks.afkcube.com/?card=47391`.
3. The homepage's JS reads the `card` param, fetches `/api/loyalty/public-card?code=47391`.
4. Page renders:
   - Friendly greeting: "Hi Cheng!" (or "Hello!" if the card has no name yet)
   - The QR image (so they can show it back to the cashier next visit without unfolding a paper card)
   - The 4×3 reward grid mirroring the POS modal, with their current stamps + claimed rewards
   - A "What's next?" line: "1 more stamp to unlock Medium Fries!"
5. **No `?card=` param** (someone visits the bare homepage) → show the existing static landing page content unchanged.

---

## Privacy considerations

- 5-digit codes have only **90,000** possibilities. An attacker could enumerate them in ~30 seconds at typical rate limits.
- Risk surface: the only data exposed is **first name + stamp progress + reward state**. No phone, no email, no last visit, no order history.
- **Mitigation**: rate-limit the public lookup endpoint to **~30 requests per minute per IP** at the nginx layer (or in Express middleware). Honest customers never hit this; enumeration attackers get throttled into infeasibility.
- If/when the schema adds phone/email fields, **never include them in the public endpoint's response.**
- Document this in `messenger-config.json` style — keep the public endpoint as a separate, audited surface.

---

## Server: new public endpoint

### `GET /api/loyalty/public-card?code=<5-digit>`

```js
// In api/loyalty-public.js (NEW file, registered from server.js)
const RATE_LIMIT = { windowMs: 60_000, max: 30 }; // 30/min/IP

function registerPublic(app, getDatabase) {
  // Simple in-memory rate limiter keyed by req.ip
  const buckets = new Map();
  function rateLimit(req, res) {
    const now = Date.now();
    const bucket = buckets.get(req.ip) || { count: 0, windowStart: now };
    if (now - bucket.windowStart > RATE_LIMIT.windowMs) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count++;
    buckets.set(req.ip, bucket);
    if (bucket.count > RATE_LIMIT.max) {
      res.status(429).json({ error: "too many requests" });
      return false;
    }
    return true;
  }

  app.get("/api/loyalty/public-card", (req, res) => {
    if (!rateLimit(req, res)) return;
    const code = String(req.query.code || "");
    if (!/^\d{5}$/.test(code)) {
      return res.status(400).json({ error: "invalid code" });
    }
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `SELECT customer_name, stamps, rewards_claimed_mask
             FROM loyalty_cards
            WHERE code = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .get(code);
      if (!row) {
        // Return 200 with `exists: false` instead of 404 so the response
        // doesn't differentiate "card exists but no name yet" from
        // "card doesn't exist" too sharply for enumeration.
        return res.json({ exists: false });
      }
      // Return ONLY public-safe fields. Per Q3 we don't store phone, but if
      // future columns are added they must NEVER appear here. Also exclude
      // id, device_id, exact created_at, full claim history, last_seen_at.
      return res.json({
        exists: true,
        code,
        name: row.customer_name || null,
        stamps: row.stamps,
        rewards: {
          tier1_claimed: !!(row.rewards_claimed_mask & 1),
          tier2_claimed: !!(row.rewards_claimed_mask & 2),
          tier3_claimed: !!(row.rewards_claimed_mask & 4),
        },
      });
    } catch (e) {
      console.error("[loyalty-public] error:", e.message);
      return res.status(500).json({ error: "server error" });
    }
  });
}

module.exports = { registerPublic };
```

### Register in `api/server.js`

```js
require("./loyalty-public").registerPublic(app, getDatabase);
```

(Mirror in `packages/messenger-watch/server-files/` — same source-of-truth pattern as `api-messenger.js` from prior work.)

---

## Homepage rewrite

### Location

Move the existing static `/var/www/3ks.afkcube.com/index.html` (1 kB, hand-written) into the repo at:

```
packages/site-homepage/index.html
packages/site-homepage/styles.css
packages/site-homepage/loyalty-view.js
packages/site-homepage/deploy.bat
```

Tiny package, no React, no build step. Just static HTML + a single `loyalty-view.js` (~3 kB) that detects the URL param and rerenders the body if needed.

### `index.html` skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>3Ks Tambayan</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Default landing content (shown when no ?card=) -->
  <div id="default-view">
    <h1>3Ks Tambayan</h1>
    <p>Welcome! …existing copy…</p>
    <p><a href="/download">Download the app</a></p>
  </div>

  <!-- Loyalty view container (hidden until JS shows it) -->
  <div id="loyalty-view" hidden></div>

  <script src="loyalty-view.js" defer></script>
</body>
</html>
```

### `loyalty-view.js`

```js
(function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("card");
  if (!code) return; // bare homepage — leave default view as-is

  const defaultView = document.getElementById("default-view");
  const loyaltyView = document.getElementById("loyalty-view");
  defaultView.hidden = true;
  loyaltyView.hidden = false;
  loyaltyView.innerHTML = `<p class="loading">Loading your card…</p>`;

  fetch(`/api/loyalty/public-card?code=${encodeURIComponent(code)}`)
    .then((r) => r.json())
    .then((data) => {
      if (!data.exists) {
        loyaltyView.innerHTML = `
          <h1>Card not found</h1>
          <p>The card number <code>${escapeHtml(code)}</code> isn't in our system.
             Ask a staff member to set it up next visit!</p>`;
        return;
      }
      render(loyaltyView, code, data);
    })
    .catch((e) => {
      loyaltyView.innerHTML = `
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>`;
    });

  function render(root, code, data) {
    const greeting = data.name
      ? `Hi <strong>${escapeHtml(data.name)}</strong>!`
      : `Hello!`;
    const filledInRow = (tier) => Math.min(Math.max(data.stamps - (tier - 1) * 3, 0), 3);
    const rewardLabel = ["Medium Fries", "Large Powder Shake", "Empanada Special"];
    // Per Q4 — same files Kyle dropped into `User-made Resources/Loyalty Card pngs/`.
    // The homepage deploy script (below) copies them to /var/www/3ks.afkcube.com/loyalty/
    // with URL-safe kebab-case names.
    const rewardIcon = [
      "/loyalty/medium-fries.png",
      "/loyalty/large-shake.png",
      "/loyalty/empanada-special.png",
    ];
    const stampIcon = "/loyalty/stamp.png";
    const claimedBits = [
      data.rewards.tier1_claimed,
      data.rewards.tier2_claimed,
      data.rewards.tier3_claimed,
    ];
    const nextTier = [1, 2, 3].find((t) => filledInRow(t) < 3);
    const nextMsg = nextTier
      ? `${3 - filledInRow(nextTier)} more stamp${
          3 - filledInRow(nextTier) === 1 ? "" : "s"
        } to unlock ${rewardLabel[nextTier - 1]}!`
      : `You've claimed every reward on this card — show it next visit for a new one!`;

    root.innerHTML = `
      <header class="hero">
        <h1>${greeting}</h1>
        <p class="subtitle">Your 3Ks loyalty card</p>
      </header>

      <section class="qr-block">
        <img class="qr" src="/app/loyalty-cards/${encodeURIComponent(code)}.png"
             alt="Your loyalty QR code">
        <p class="code">Card no. <strong>${escapeHtml(code)}</strong></p>
      </section>

      <section class="grid">
        ${[1, 2, 3]
          .map((tier) => {
            const filled = filledInRow(tier);
            const claimed = claimedBits[tier - 1];
            const cells = [0, 1, 2]
              .map((i) =>
                i < filled
                  ? `<div class="stamp filled"><img src="${stampIcon}" alt=""></div>`
                  : `<div class="stamp"></div>`,
              )
              .join("");
            return `
              <div class="row">
                ${cells}
                <div class="reward ${
                  claimed ? "claimed" : filled === 3 ? "ready" : "locked"
                }">
                  <img class="reward-icon" src="${rewardIcon[tier - 1]}" alt="">
                  <span class="reward-label">${rewardLabel[tier - 1]}</span>
                  <span class="reward-state">${
                    claimed ? "✓ Claimed" : filled === 3 ? "Claim next visit!" : "Locked"
                  }</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </section>

      <p class="next">${nextMsg}</p>
      <p class="hint">Show this page (or the printed card) at the counter to earn stamps.</p>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
```

---

## Styling (palette matches brand QR)

```css
/* styles.css */
:root {
  --bg: #f6c057;
  --fg-dark: #6b2e00;
  --fg-mid: #a04500;
  --accent: #fcad1d;
  --surface: #fffdf6;
}
body { background: var(--bg); color: var(--fg-dark); font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
.hero h1 { font-size: 2rem; margin: 0 0 4px; }
.subtitle { color: var(--fg-mid); }
.qr-block { background: var(--surface); padding: 16px; border-radius: 12px; text-align: center; max-width: 320px; margin: 24px auto; }
.qr { width: 100%; max-width: 240px; }
.code { font-family: monospace; }
.grid { max-width: 480px; margin: 24px auto; display: flex; flex-direction: column; gap: 12px; }
.row { display: grid; grid-template-columns: repeat(3, 56px) 1fr; gap: 8px; align-items: center; }
.stamp { width: 56px; height: 56px; border-radius: 50%; border: 2px dashed var(--fg-mid); background: transparent; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.stamp.filled { background: var(--surface); border-style: solid; border-color: var(--fg-dark); }
.stamp.filled img { width: 100%; height: 100%; object-fit: contain; }
.reward { padding: 8px 12px; border-radius: 8px; background: var(--surface); display: flex; flex-direction: column; gap: 2px; }
.reward.ready { background: var(--accent); color: var(--fg-dark); font-weight: 600; }
.reward.claimed { background: #d9d9d9; color: #555; text-decoration: line-through; }
.reward-label { font-weight: 600; }
.reward-state { font-size: 0.8em; }
.next { text-align: center; font-size: 1.1em; font-weight: 600; max-width: 480px; margin: 24px auto; }
.hint { text-align: center; color: var(--fg-mid); }
@media (max-width: 420px) {
  .row { grid-template-columns: repeat(3, 1fr) 1fr; }
  .stamp { width: 100%; aspect-ratio: 1; }
}
```

---

## Deploy

### `packages/site-homepage/deploy.bat`

```bat
@echo off
setlocal
cd /d "%~dp0"
set "SSH_KEY=%USERPROFILE%\kali_openclaw"
set "REMOTE=root@76.13.215.54"
set "SRC_ICONS=%~dp0..\..\User-made Resources\Loyalty Card pngs"

echo Uploading homepage files…
scp -i "%SSH_KEY%" index.html styles.css loyalty-view.js %REMOTE%:/var/www/3ks.afkcube.com/ || goto :fail

echo Ensuring /loyalty/ dir on server…
ssh -i "%SSH_KEY%" %REMOTE% "mkdir -p /var/www/3ks.afkcube.com/loyalty"

echo Uploading reward + stamp PNGs with URL-safe names…
scp -i "%SSH_KEY%" "%SRC_ICONS%\Medium Fries.png"     %REMOTE%:/var/www/3ks.afkcube.com/loyalty/medium-fries.png    || goto :fail
scp -i "%SSH_KEY%" "%SRC_ICONS%\Large Shake.png"      %REMOTE%:/var/www/3ks.afkcube.com/loyalty/large-shake.png     || goto :fail
scp -i "%SSH_KEY%" "%SRC_ICONS%\Empanada Special.png" %REMOTE%:/var/www/3ks.afkcube.com/loyalty/empanada-special.png || goto :fail
scp -i "%SSH_KEY%" "%SRC_ICONS%\Stamp.png"            %REMOTE%:/var/www/3ks.afkcube.com/loyalty/stamp.png            || goto :fail

echo Done.
exit /b 0
:fail
echo DEPLOY FAILED
exit /b 1
```

Result: PNGs are reachable at:
- `https://3ks.afkcube.com/loyalty/medium-fries.png`
- `https://3ks.afkcube.com/loyalty/large-shake.png`
- `https://3ks.afkcube.com/loyalty/empanada-special.png`
- `https://3ks.afkcube.com/loyalty/stamp.png`

For the **server-side** loyalty-public endpoint, the existing pattern from `packages/messenger-watch/deploy.bat` applies — backup the existing server.js / messenger.js, scp the new `loyalty-public.js`, restart pos-sync-api.

---

## Edge cases

| Case | Behavior |
|---|---|
| `?card=12` (too short) | API returns 400; UI shows "invalid card number" |
| `?card=99999` (valid format, no row) | API returns `{exists:false}`; UI shows "Card not found — ask a staff member to set it up" |
| Card exists but `customer_name` is NULL | UI greets with "Hello!" instead of "Hi <name>" |
| 0 stamps, 0 rewards claimed | "3 more stamps to unlock Medium Fries!" |
| All 9 stamps + all 3 rewards claimed | "You've claimed every reward on this card — show it next visit for a new one!" |
| Rate limit exceeded | API returns 429; UI shows "Too many requests, try again in a minute" |
| Network failure | UI shows generic retry message |
| Hash router conflict with `?card=` param | Verify: pure homepage has no hash router. The `/app/` (POS app) IS hash-routed, but `?card=` is a search param applied before any hash. They don't conflict. |

---

## Acceptance check for this step

- [ ] `https://3ks.afkcube.com/` (bare) shows the original static landing page
- [ ] `https://3ks.afkcube.com/?card=47391` shows the personalized loyalty view
- [ ] The QR image (`/app/loyalty-cards/47391.png`) loads inside the page
- [ ] Greeting respects the name set by the admin in the POS
- [ ] Stamp grid matches the POS modal exactly (filled / empty / claimed states)
- [ ] Filled stamps render `stamp.png` inside the circle (not a plain fill color)
- [ ] "What's next?" line correctly reports stamps remaining to next tier
- [ ] After admin changes the name in the POS, refresh of the customer URL reflects new name (cloud DB is the source of truth)
- [ ] Rate-limiting: 31st request from same IP in 60 s returns 429
- [ ] API never returns `phone`, `email`, internal `id`, or any field beyond name/stamps/reward booleans
- [ ] Looks acceptable on a 360 px-wide Android browser
