# Loyalty Cards — Overview

> Punch-card-style loyalty program: 50 pre-printed QR cards, each with a unique code. Customers bring their physical card; staff scans it at checkout; the POS shows current stamps + claimable rewards. External scans (with phone camera, not in-app) just open `https://3ks.afkcube.com/`.

---

## User-facing flow

1. **Admin generates 50 cards** once (one-time bulk operation). Each gets a random 5-digit code and an unnamed slot in the DB. The 50 QR PNGs are saved for printing; physical cards are handed out as customers join.
2. **First scan of a new card** in Checkout → modal opens with empty name field. Admin types the customer's name and saves.
3. **Every subsequent scan** → modal opens showing current stamps + rewards.
4. **Add stamp** by tapping an empty slot. Reaching 3 stamps in a row unlocks that row's reward.
5. **Claim reward** by tapping the reward cell once the row is full. Marks reward as claimed (visually + in DB).
6. **All 3 rewards claimed** → card is "complete". Open question: reset / archive / replace (see Open Questions).
7. **External scanner** (any QR app, including the phone's stock camera) reads the QR's URL and opens `https://3ks.afkcube.com/`. The `?card=<CODE>` query param is ignored by the site, so this is harmless.

---

## Reward tiers (per card)

| Row | Stamps to fill | Reward            |
|----:|---------------:|-------------------|
| 1   | 3              | Medium Fries      |
| 2   | 3              | Large Powder Shake (any flavor) |
| 3   | 3              | Empanada Special  |

Grid in the modal mirrors the reference image: 4 columns × 3 rows. Columns 1–3 are stamp slots; column 4 is the reward.

---

## QR encoding

- Each QR encodes: `https://3ks.afkcube.com/?card=<CODE>` where `<CODE>` is a 5-digit number (e.g. `47391`).
- The POS scanner extracts the `card=` param and looks up the card in the local DB.
- External scanners just open the site (no `card=` handling on the site → it loads normally).
- QR colors match brand: foreground `#6b2e00`, background `#f6c057` (matches the existing `qr-3ks-brand.png`).
- Error-correction level **H** (30 % redundancy) so the QR survives sticker-style printing and partial wear.

---

## Architectural decisions (with reasoning)

1. **Local SQLite + cloud sync** — same pattern as orders / customers / products. The `loyalty_cards` table joins the existing `base_columns` convention so cloud-sync auto-replicates it. *No server-side endpoint work is needed* if the sync layer just copies rows from the table set.
2. **Separate from existing `loyalty_rewards` table** — that one tracks loyalty *points*; this is a different model (physical punch cards). Keeping them separate avoids tangling two unrelated mechanics.
3. **Scanner uses `jsQR`** — already bundled in the renderer (`~304 KB` chunk seen in prior builds). No new dependency.
4. **PNG output for cards** — not just SVG, because PNGs are what the user will email to a print shop. Use the existing `qrcode` npm package.
5. **One-shot CLI seed script** lives at `packages/desktop/scripts/generate-loyalty-cards.js`. Runs from the dev machine, writes PNGs + inserts 50 rows via the API. NOT a runtime feature, so it's CLI-only.

---

## File-by-file change list (high-level)

| File | What changes |
|---|---|
| `packages/core/src/schema/loyalty-cards.ts` (NEW) | Drizzle table definition |
| `packages/core/src/schema/index.ts` | Add barrel export |
| `packages/core/src/types/index.ts` | Export `LoyaltyCard` type |
| `packages/desktop/src/renderer/lib/repositories.ts` | Add `loyaltyCardRepo` (listAll, getByCode, addStamp, claimReward, updateName) |
| `packages/desktop/src/renderer/components/ui/LoyaltyCardModal.tsx` (NEW) | Popup with QR preview + name input + 4×3 reward grid |
| `packages/desktop/src/renderer/components/ui/LoyaltyScanner.tsx` (NEW) | Camera + jsQR + paste-fallback |
| `packages/desktop/src/renderer/app/pages/CheckoutPage.tsx` | "Scan loyalty card" button; admin-only "Loyalty cards" list section |
| `packages/desktop/scripts/generate-loyalty-cards.js` (NEW) | Bulk-generate 50 QR PNGs + insert into DB |
| `packages/desktop/dist-web/loyalty-cards/` (output, gitignored) | The 50 generated PNGs + a zip for printing |
| `CODE_REGISTRY.md` | Register the new table, repo, components, and script |

The mobile APK already loads the web bundle, so all changes propagate via `deploy-web.bat`. The **one** native-side change needed is **CAMERA permission** for the WebView (see `07-deploy-and-mobile.md`).

---

## Decisions (locked in 2026-05-14)

| # | Question | Decision |
|---|---|---|
| Q1 | Reward progression | **Linear** — row 1 must fill before row 2; card "completes" after all 3 rewards claimed. |
| Q2 | Who can stamp / claim | **Any logged-in employee** (cashier-friendly). |
| Q3 | Customer fields | **Name only.** No phone, no email. Drop `customer_phone` from schema. |
| Q4 | Reward icons | **Use the same images** from the reference photo. Kyle has provided assets in [`User-made Resources/Loyalty Card pngs/`](../../User-made%20Resources/Loyalty%20Card%20pngs/): `Medium Fries.png`, `Large Shake.png`, `Empanada Special.png`, plus **`Stamp.png`** which replaces the plain "filled circle" visual for collected stamps. |
| Q5 | Distribution of 50 PNGs | "**Download all**" button on the admin loyalty-cards popup in Checkout. Clicks → downloads a zip of all PNGs (the same `loyalty-cards.zip` the seed script produces). |
| Q6 | Scan-to-cart coupling | **No** — scanning just edits the card. No cart discount entanglement in v1. |

These ripple into step files 01 (schema drops phone), 03 (zip ships to the server for the button to link to), 04 (any-employee permission), 05 (icon paths), 06 (Download-all button design), and 08 (customer-landing response drops phone).

---

## Sequencing (in order — see step files for details)

1. [01-schema.md](01-schema.md) — DB table
2. [02-repository.md](02-repository.md) — read/write API in renderer
3. [03-qr-generation.md](03-qr-generation.md) — seed script + 50 PNGs + zip
4. [04-checkout-scanner.md](04-checkout-scanner.md) — camera + jsQR
5. [05-loyalty-modal.md](05-loyalty-modal.md) — popup UI with reward grid
6. [06-admin-list.md](06-admin-list.md) — list view + "Download all" button
7. [07-deploy-and-mobile.md](07-deploy-and-mobile.md) — build, deploy, camera permission, end-to-end test
8. [08-customer-landing.md](08-customer-landing.md) — public homepage view rendered from `?card=<code>`

Total estimated effort: **~5–7 hours** of focused implementation (step 08 adds ~1 hour), plus ~5 min for each rebuild cycle.

---

## Risks / things to verify

- **WebView camera permission**: Android WebView needs the `CAMERA` permission in `AndroidManifest.xml` AND `mediaCapturePermissionGrantType="grant"` on the WebView (latter already set in [packages/mobile/index.js](../../packages/mobile/index.js)). I need to confirm CAMERA is present in `app.json` permissions; if not, this is an APK rebuild.
- **iOS camera permission** (if iOS APK is ever built): need `NSCameraUsageDescription` in `infoPlist`. Already pre-flighted in mind, would add in step 07.
- **Pre-existing TypeScript errors** in the renderer (`exclude_from_expenses` schema work-in-progress). The Vite build still ships; just noting that `tsc --noEmit` will continue to fail on unrelated files. Not blocking.
- **Cloud-sync schema awareness** — verify the sync layer pulls *all* tables vs. an explicit allowlist. If the latter, I'll need to add `loyalty_cards` to the allowlist on both the desktop sync code AND the server's `pos-cloud.db` schema.
