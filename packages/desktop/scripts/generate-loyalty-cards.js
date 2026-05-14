#!/usr/bin/env node
/**
 * Bulk-generate loyalty cards.
 *
 *  1. Pick N unique 5-digit codes (default 50; configurable via env COUNT).
 *  2. Render each as a brand-colored QR PNG into
 *     packages/desktop/dist-web/loyalty-cards/<CODE>.png
 *     The QR encodes `https://3ks.afkcube.com/?card=<CODE>` so external
 *     scanners just open the homepage (see docs/loyalty-cards/08-...).
 *  3. Zip all PNGs into packages/desktop/dist-web/loyalty-cards.zip
 *     (this is what the admin "Download all" button links to — step 06).
 *  4. Bulk-insert rows into the cloud DB via POST /api/db/exec.
 *     The desktop's sync layer pulls them down on next sync.
 *
 * Idempotent: re-reading existing codes from the cloud, skips dups.
 *
 * Usage:
 *   node packages/desktop/scripts/generate-loyalty-cards.js
 *   COUNT=10 node packages/desktop/scripts/generate-loyalty-cards.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const QRCode = require("qrcode");
const { ulid } = require("ulidx");

const COUNT = parseInt(process.env.COUNT || "50", 10);
const COLORS = { dark: "#6b2e00", light: "#f6c057" };
const OUTPUT_DIR = path.resolve(__dirname, "..", "dist-web", "loyalty-cards");
const ZIP_PATH = path.resolve(__dirname, "..", "dist-web", "loyalty-cards.zip");
const API_BASE = "https://3ks.afkcube.com/api";
const API_TOKEN = "afkcube_2017";
const DEVICE_ID = "seed-script";

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const existing = await fetchExistingCodes();
  console.log(`Found ${existing.length} existing cards in the cloud.`);

  // Pick N new unique codes (no leading zeros so they look clean on stickers).
  const taken = new Set(existing);
  const newCodes = [];
  let attempts = 0;
  while (newCodes.length < COUNT && attempts < COUNT * 20) {
    attempts++;
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (taken.has(code)) continue;
    taken.add(code);
    newCodes.push(code);
  }
  if (newCodes.length < COUNT) {
    console.warn(`Only generated ${newCodes.length}/${COUNT} unique codes — pool may be saturated`);
  }
  console.log(`Generating ${newCodes.length} cards…`);

  for (const code of newCodes) {
    const url = `https://3ks.afkcube.com/?card=${code}`;
    await QRCode.toFile(path.join(OUTPUT_DIR, `${code}.png`), url, {
      color: COLORS,
      errorCorrectionLevel: "H",
      margin: 4,
      width: 600,
    });
  }
  console.log(`Wrote ${newCodes.length} PNGs to ${OUTPUT_DIR}`);

  // Zip ALL pngs in the output dir (covers re-runs too).
  await zipDir(OUTPUT_DIR, ZIP_PATH);
  console.log(`Wrote zip to ${ZIP_PATH}`);

  if (newCodes.length > 0) {
    await bulkInsert(newCodes);
    console.log(`Inserted ${newCodes.length} rows into the cloud DB`);
  }

  console.log("Done. Run packages/desktop/deploy-web.bat to publish the PNGs + zip.");
}

async function fetchExistingCodes() {
  try {
    const res = await fetch(`${API_BASE}/db/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql: `SELECT code FROM loyalty_cards WHERE deleted_at IS NULL`, params: [] }),
    });
    if (!res.ok) {
      console.warn(`fetchExistingCodes: HTTP ${res.status} — treating as 0 existing`);
      return [];
    }
    const data = await res.json();
    // Server's /api/db/query returns rows under `data`, not `rows`.
    const rows = data.data || data.rows || [];
    return rows.map((r) => String(r.code));
  } catch (e) {
    console.warn(`fetchExistingCodes failed: ${e.message} — treating as 0 existing`);
    return [];
  }
}

// Insert via the sync push protocol so the rows replicate to all devices via
// the standard pull path. The /api/db/exec endpoint uses better-sqlite3 `.exec()`
// which does NOT accept parameters, so it's unsuitable for bulk-insert.
async function bulkInsert(codes) {
  const now = new Date().toISOString();
  const changes = codes.map((code) => {
    const id = ulid();
    return {
      id: ulid(), // sync_log id
      table_name: "loyalty_cards",
      record_id: id,
      operation: "insert",
      payload: JSON.stringify({
        id,
        device_id: DEVICE_ID,
        code,
        customer_name: null,
        stamps: 0,
        rewards_claimed_mask: 0,
        last_seen_at: null,
        created_at: now,
        updated_at: now,
      }),
      device_id: DEVICE_ID,
      timestamp: now,
    };
  });

  const res = await fetch(`${API_BASE}/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: DEVICE_ID, changes }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`sync push failed: ${res.status} ${body}`);
  }
  let parsed = {};
  try { parsed = JSON.parse(body); } catch {}
  if (parsed.ok !== true) {
    throw new Error(`sync push not ok: ${body}`);
  }
  console.log(`Server accepted ${parsed.accepted}/${changes.length} changes`);
}

function zipDir(srcDir, zipPath) {
  // Use Windows' built-in Compress-Archive. Zero-dep, ships with PowerShell.
  // -Force overwrites an existing zip from a prior run.
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const pattern = path.join(srcDir, "*.png");
  const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${pattern}' -DestinationPath '${zipPath}' -Force"`;
  execSync(cmd, { stdio: "inherit" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
