# Step 03 — Generate 50 QR codes + bulk-seed the DB

> One-shot CLI script. Run it once on the dev machine to (a) write 50 PNGs to disk for printing and (b) insert 50 rows into the local SQLite + cloud-sync table. NOT a runtime feature — never called from the UI.

---

## File: `packages/desktop/scripts/generate-loyalty-cards.js`

```js
#!/usr/bin/env node
// Bulk-generate 50 loyalty cards.
//
// What it does:
//   1. Picks 50 unique random 5-digit codes (no leading 0 → cards always
//      look like "47391", not "00012" — leading zeros are allowed but
//      a bit awkward on stickers).
//   2. For each code, renders a QR PNG at 600×600 with brand colors
//      (#6b2e00 on #f6c057, same as qr-3ks-brand.png) encoding
//      https://3ks.afkcube.com/?card=<CODE>.
//   3. Writes the PNGs to packages/desktop/dist-web/loyalty-cards/<CODE>.png
//   4. Bundles them into loyalty-cards.zip in the same dir.
//   5. Inserts rows into the cloud DB via the existing sync API
//      (POST /api/db/exec with the Bearer token) so all devices receive
//      them on next sync.
//
// Idempotency:
//   - Reads existing card codes from the cloud first; skips any duplicates.
//   - Safe to re-run if interrupted; will fill in missing PNGs only.

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const archiver = require("archiver");
const { ulid } = require("ulidx");

const COUNT = 50;
const COLORS = { dark: "#6b2e00", light: "#f6c057" };
const OUTPUT_DIR = path.resolve(__dirname, "../dist-web/loyalty-cards");
const ZIP_PATH = path.resolve(OUTPUT_DIR, "../loyalty-cards.zip");
const API_BASE = "https://3ks.afkcube.com/api";
const API_TOKEN = "afkcube_2017";
const DEVICE_ID = "seed-script";

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Pick codes (10000..99999) avoiding duplicates already in DB
  const existing = await fetchExistingCodes();
  const codes = new Set(existing);
  const newCodes = [];
  while (newCodes.length < COUNT) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (codes.has(code)) continue;
    codes.add(code);
    newCodes.push(code);
  }

  console.log(`Generating ${newCodes.length} cards…`);

  // 2 + 3. Render + write PNGs
  for (const code of newCodes) {
    const url = `https://3ks.afkcube.com/?card=${code}`;
    await QRCode.toFile(path.join(OUTPUT_DIR, `${code}.png`), url, {
      color: COLORS,
      errorCorrectionLevel: "H",
      margin: 4,
      width: 600,
    });
  }

  // 4. Zip them
  await zipDir(OUTPUT_DIR, ZIP_PATH);
  console.log(`Wrote zip to ${ZIP_PATH}`);

  // 5. Insert rows
  await bulkInsert(newCodes);
  console.log(`Inserted ${newCodes.length} rows`);
}

async function fetchExistingCodes() {
  const res = await fetch(`${API_BASE}/db/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: `SELECT code FROM loyalty_cards WHERE deleted_at IS NULL` }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.rows || []).map((r) => r.code);
}

async function bulkInsert(codes) {
  const now = new Date().toISOString();
  // One INSERT-multi-VALUES for the whole batch.
  // Columns: id, device_id, code, customer_name, stamps, rewards_claimed_mask,
  //          last_seen_at, created_at, updated_at, deleted_at
  const values = codes.map(() => `(?, ?, ?, NULL, 0, 0, NULL, ?, ?, NULL)`).join(", ");
  const params = codes.flatMap((code) => [ulid(), DEVICE_ID, code, now, now]);
  const sql = `
    INSERT INTO loyalty_cards
      (id, device_id, code, customer_name, stamps,
       rewards_claimed_mask, last_seen_at, created_at, updated_at, deleted_at)
    VALUES ${values}
  `;
  const res = await fetch(`${API_BASE}/db/exec`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) throw new Error(`bulk insert failed: ${res.status} ${await res.text()}`);
}

function zipDir(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(srcDir, false, (entry) =>
      entry.name.endsWith(".png") ? entry : false
    );
    archive.finalize();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## New deps

```bash
pnpm --filter @pos/desktop add -D qrcode archiver ulidx
```

(`qrcode` is already used at the repo root for `qr-3ks-brand.png`. The other two are small.)

---

## Run from repo root

```powershell
node .\packages\desktop\scripts\generate-loyalty-cards.js
```

Or wire it as a script in `packages/desktop/package.json`:

```json
"scripts": {
  "generate-loyalty-cards": "node scripts/generate-loyalty-cards.js"
}
```

---

## Where do the files end up?

After running once:

```
packages/desktop/dist-web/loyalty-cards/
  47391.png
  82610.png
  ... 48 more
packages/desktop/dist-web/loyalty-cards.zip
```

On the next `deploy-web.bat`, these get uploaded to the server. The user can fetch any single card from:

```
https://3ks.afkcube.com/app/loyalty-cards/47391.png
```

…or download the whole batch from:

```
https://3ks.afkcube.com/app/loyalty-cards.zip
```

(No password — the only secret is the card code itself, and codes are visible in the printed QRs anyway.)

---

## Idempotency / re-running

- Script reads existing codes from the cloud DB before picking new ones, so re-running won't create duplicates.
- If you want a **specific count** of cards (e.g., 100 total instead of 50), edit `COUNT` and re-run; it fills in the difference.

---

## What customers see when they scan externally

A customer who scans the QR with their phone's stock camera app sees:

> **Open in browser**
> `https://3ks.afkcube.com/?card=47391`

Tapping → loads the 3ks.afkcube.com homepage. The `?card=47391` is in the URL bar but the homepage doesn't act on it. *(Future enhancement: an opt-in landing page that shows "Your loyalty card 47391" and a "show progress" button. Out of scope for this initial build.)*

---

## Acceptance check for this step

- [ ] After running the script: 50 PNG files exist in `dist-web/loyalty-cards/`
- [ ] `dist-web/loyalty-cards.zip` exists and unzips to those 50 PNGs
- [ ] `SELECT COUNT(*) FROM loyalty_cards WHERE deleted_at IS NULL` returns ≥ 50
- [ ] All codes are unique and in `[10000, 99999]`
- [ ] Re-running the script does NOT create duplicates (count stays the same)
- [ ] One sample PNG opens; scanning it with the phone camera opens `https://3ks.afkcube.com/?card=<that-code>`
