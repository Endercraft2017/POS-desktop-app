#!/usr/bin/env node
/**
 * Render the loyalty-card PNGs + zip into dist-web/ from the existing DB codes.
 *
 * Why this script exists: Vite clears `dist-web/` on every `pnpm build:web`,
 * which erases the PNGs that `generate-loyalty-cards.js` wrote during seeding.
 * This script regenerates only the PNGs (no DB changes) and is called by
 * deploy-web.bat right after the Vite build, so every deploy ships fresh
 * card images that match the canonical DB rows.
 *
 * Stand-alone usage:
 *   node packages/desktop/scripts/render-loyalty-pngs.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const QRCode = require("qrcode");

const COLORS = { dark: "#6b2e00", light: "#f6c057" };
const OUTPUT_DIR = path.resolve(__dirname, "..", "dist-web", "loyalty-cards");
const ZIP_PATH = path.resolve(__dirname, "..", "dist-web", "loyalty-cards.zip");
const API_BASE = "https://3ks.afkcube.com/api";
const API_TOKEN = "afkcube_2017";

async function main() {
  const res = await fetch(`${API_BASE}/db/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: `SELECT code FROM loyalty_cards WHERE deleted_at IS NULL ORDER BY code`,
      params: [],
    }),
  });
  if (!res.ok) throw new Error(`db/query failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const codes = (data.data || data.rows || []).map((r) => String(r.code));
  if (codes.length === 0) {
    console.warn("[render-loyalty-pngs] no cards in DB; skipping");
    return;
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`[render-loyalty-pngs] rendering ${codes.length} PNGs…`);
  for (const code of codes) {
    await QRCode.toFile(path.join(OUTPUT_DIR, `${code}.png`), `https://3ks.afkcube.com/?card=${code}`, {
      color: COLORS,
      errorCorrectionLevel: "H",
      margin: 4,
      width: 600,
    });
  }
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${OUTPUT_DIR}/*.png' -DestinationPath '${ZIP_PATH}' -Force"`,
    { stdio: "inherit" },
  );
  console.log(`[render-loyalty-pngs] done — ${codes.length} PNGs + zip in ${path.dirname(ZIP_PATH)}`);
}

main().catch((e) => {
  console.error("[render-loyalty-pngs] failed:", e.message);
  process.exit(1);
});
