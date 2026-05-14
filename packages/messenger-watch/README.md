# messenger-watch

Headless Chromium watcher that detects new conversations in the **business Facebook Page** inbox (via Meta Business Suite) and POSTs them to the POS sync API.

Used because the official Page webhook (already coded in [`api/messenger.js`](../../../var/www/3ks.afkcube.com/api/messenger.js) on the server) requires `pages_messaging` app review, which is not currently achievable for this account. When the official webhook does become available, scraped messages live in the same `messenger_messages` SQLite table — **the desktop UI does not need to change**.

## Architecture

```
Kali server (pm2)                        POS sync API (pm2, port 3001)
+---------------------------+            +--------------------------------+
| messenger-watch (Node)    |  POST      | POST /api/messenger/           |
|   chromium headless       | --------> |   scrape-ingest                |
|   business.facebook.com   |  X-Scrape  |   (auth via X-Scrape-Token)    |
|   inject.js MutationObs.  |   -Token   |   inserts into                 |
|   rate caps + restart     |            |   messenger_messages table     |
+---------------------------+            +--------------------------------+
                                                       |
                                                       v
                                  Desktop POS polls /api/messenger/messages/recent
                                  (existing endpoint, unchanged)
```

## One-time setup

### 1. Bootstrap the FB login on your Windows machine

The Kali server has no display, so logging in there is awkward. Instead, log in **once** locally with a visible Chrome window:

```powershell
pnpm --filter messenger-watch install
node .\packages\messenger-watch\src\bootstrap-login.js
```

A real Chrome window opens. Log into Facebook as the Page admin, approve 2FA / "Is this you?" if prompted, navigate to **Business Suite > Inbox** so the cookies for that surface are set, then close the window.

### 2. Extract auth state to a portable JSON

Full Chrome profiles are **not** portable from Windows to Linux — Chromium SIGTRAPs on the Windows-format disk cache and DPAPI-encrypted blobs. We ship only the cookies + localStorage as a portable JSON:

```powershell
node .\packages\messenger-watch\src\extract-state.js
```

This produces `packages\messenger-watch\auth-state.json` (a few KB).

### 3. Ship JSON + source to Kali

```powershell
REM Source files + auth-state.json + npm install + pm2 start:
.\packages\messenger-watch\deploy.bat
```

### 3. Configure server-side env + token

On the server:

```bash
ssh -i ~/kali_openclaw root@76.13.215.54
cd /var/www/3ks.afkcube.com/messenger-watch

# Generate a shared secret and store it in BOTH the watcher env AND the API config.
TOKEN=$(openssl rand -hex 32)
cp .env.example .env
sed -i "s|INGEST_TOKEN=.*|INGEST_TOKEN=$TOKEN|" .env

# Tell the sync API the same token (added to messenger-config.json):
python3 -c "import json; p='/var/www/3ks.afkcube.com/api/messenger-config.json'; d=json.load(open(p)); d['scrapeToken']='$TOKEN'; json.dump(d, open(p,'w'), indent=2)"

pm2 restart pos-sync-api
pm2 start ecosystem.config.js
pm2 save
```

## Safety / rate caps

Reasoning: scraping a Page inbox at unbounded frequency is exactly the kind of activity Meta's behavioral systems flag. The watcher is **event-driven** (MutationObserver) rather than active-polling, but we layer hard caps on top so the network footprint is always bounded.

| Cap | Default | What happens at the cap |
|---|---|---|
| `MAX_EVENTS_PER_HOUR` | 30 | Events dropped (not sent to API) until the hour bucket rolls over. |
| `MAX_EVENTS_PER_SESSION` | 500 | Watcher exits; pm2 restarts it with a fresh budget after `restart_delay` (60s). |
| `RESTART_AFTER_HOURS` | 6 | Watcher exits cleanly to refresh state; pm2 restarts. |
| `max_memory_restart` (pm2) | 1500M | pm2 restarts if RSS exceeds 1.5 GB. |

All caps can be tuned in `.env` without code changes.

## Operations

```bash
# tail logs
pm2 logs messenger-watch

# restart after editing inject.js / index.js (deploy.bat handles this)
pm2 restart messenger-watch

# stop entirely
pm2 stop messenger-watch

# inspect what the page sees right now (run on the server)
pm2 logs messenger-watch --lines 200 | grep -i 'page:'
```

If the watcher exits with code 3, the login expired — re-run `bootstrap-login.js` and `extract-state.js` on Windows, then redeploy with `deploy.bat`.

The watcher re-saves `auth-state.json` every `STATE_SAVE_INTERVAL_MIN` (default 15 min) so FB's cookie rotations persist across restarts. A graceful shutdown also saves state before exit.

## Known fragility

- Meta obfuscates CSS class names and rotates the inbox markup periodically. The selectors in [src/inject.js](src/inject.js) target `aria-label` and `role` (more stable than classes) but **will eventually break**. When that happens, the health logs will show `seen=0` for hours despite real messages — that's the signal to update `findInboxRows()`.
- Long-running headless Chrome on a datacenter IP can still trigger account checkpoints. Approve them from the Page admin's phone; the persistent profile keeps cookies between restarts.
- This is an unofficial workaround. If you ever get `pages_messaging` approved, finish wiring Meta's webhook and turn this off — `pm2 stop messenger-watch && pm2 delete messenger-watch`.
