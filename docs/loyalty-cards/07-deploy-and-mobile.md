# Step 07 — Deploy + Mobile (camera permission)

> Build, deploy the web bundle, verify the mobile APK can access the camera (one-time native change), end-to-end test plan.

---

## Web deploy

```powershell
.\packages\desktop\deploy-web.bat
```

This builds with electron-vite and uploads `dist-web/` to `https://3ks.afkcube.com/app/`. The 50 loyalty card PNGs (in `dist-web/loyalty-cards/`) ride along.

Pre-existing TypeScript strict errors (the `exclude_from_expenses` work-in-progress) continue to fail `tsc --noEmit` but the Vite build still succeeds — same as prior sessions.

---

## Mobile APK rebuild — CAMERA permission

The QR scanner needs `getUserMedia({ video: true })` to work inside the WebView. Required changes:

### 1. `packages/mobile/app.json`

```diff
"permissions": [
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
+ "android.permission.CAMERA"
],
```

### 2. iOS (only if/when we build for iOS)

```diff
"ios": {
  "infoPlist": {
-   "NSMicrophoneUsageDescription": "POS uses the microphone to transcribe spoken orders into the cart."
+   "NSMicrophoneUsageDescription": "POS uses the microphone to transcribe spoken orders into the cart.",
+   "NSCameraUsageDescription": "POS uses the camera to scan loyalty card QR codes at checkout."
  }
}
```

### 3. `packages/mobile/index.js` — already correct

```js
mediaCapturePermissionGrantType="grant"
```

is already set, which makes the WebView auto-grant on camera requests (so the user doesn't get an extra "Allow this WebView to use the camera?" prompt on top of the Android system one).

### 4. Version bump (1.0.4 → 1.0.5)

- `packages/mobile/package.json`
- `packages/mobile/app.json`
- `packages/mobile/android/app/build.gradle` — bump `versionCode` to 4 and `versionName` to "1.0.5"
- `packages/mobile/CHANGELOG.md` — entry for 1.0.5:
  > Added CAMERA permission for the WebView QR scanner used by the new Loyalty Cards feature.

### 5. Build steps (same as prior sessions)

```powershell
# Bundle JS
node .\packages\mobile\bundle-android.js --platform android --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res --dev false --minify true

# Build APK
cd packages\mobile\android
.\gradlew.bat assembleRelease

# Ship
scp -i %USERPROFILE%\kali_openclaw android\app\build\outputs\apk\release\app-release.apk root@76.13.215.54:/var/www/3ks.afkcube.com/download/releases/pos-mobile-1.0.5.apk

# Repoint symlink
ssh -i %USERPROFILE%\kali_openclaw root@76.13.215.54 "ln -sfn pos-mobile-1.0.5.apk /var/www/3ks.afkcube.com/download/releases/pos-mobile-latest.apk"
```

(Use the same Java-process-cleanup workaround we hit before if Gradle's transform cache complains: kill stray `java.exe` processes, then retry — see notes in earlier work.)

---

## End-to-end test plan

### Desktop (web build at `3ks.afkcube.com/app/`)

1. Hard-refresh the app, log in as admin.
2. **Verify the seed**: open the "Loyalty cards" section in checkout sidebar — should list 50 cards.
3. Open one card from the list → modal shows QR + reward grid + name field. Add a name → save. Close. Reopen → name persisted.
4. **Stamp flow**: add 3 stamps → row 1 reward becomes "claimable" → tap reward → claimed.
5. **Reward gating**: try to claim row 2 reward (locked) — confirm it's not clickable.
6. Click the **"Scan loyalty card"** button → camera modal opens → grant permission → hold a printed QR up to the webcam → modal opens for that card within ~2 s.
7. **Manual entry path**: open scanner → close camera → type a 5-digit code → modal opens.
8. **External scan**: open the phone's stock camera → point at a printed QR → confirm it offers to open `https://3ks.afkcube.com/?card=<code>` → tap → 3ks.afkcube.com loads (no error).
9. **Cloud sync**: in the desktop POS, add a stamp to card 47391. In another browser tab, reload `/app/` → card 47391 shows the new stamp count (sync round-trip works).

### Mobile APK (after rebuild + reinstall)

10. Download new APK from `https://3ks.afkcube.com/download/`, install (Android prompts to update over 1.0.4).
11. Launch → log in → tap "Scan loyalty card" → Android prompts for camera permission → grant.
12. Live preview of rear camera shows; hold QR up → modal opens.
13. Confirm the back-gesture (now drawer-only in Messages) doesn't conflict with the scanner modal — pressing back inside the scanner closes it (not the page).

---

## Rollback plan

If anything goes catastrophically wrong:

- **Web**: previous `dist-web/` is backed up to `/var/www/3ks.afkcube.com/app.bak/` (assumed; verify), or revert the deployment by re-running `deploy-web.bat` from a prior commit.
- **APK**: `pos-mobile-1.0.4.apk` is still on the server (in releases dir). Repoint the `pos-mobile-latest.apk` symlink back to it.
- **DB**: the `loyalty_cards` table is additive. Worst case, drop it. No existing data touched.

---

## Acceptance check for this step

- [ ] `deploy-web.bat` succeeds and the 50 PNGs are visible at `https://3ks.afkcube.com/app/loyalty-cards/<code>.png`
- [ ] New 1.0.5 APK is at `https://3ks.afkcube.com/download/releases/pos-mobile-1.0.5.apk`
- [ ] Symlink `pos-mobile-latest.apk` points to 1.0.5
- [ ] APK launches with CAMERA permission prompt on first scan
- [ ] All 13 test plan items above pass
- [ ] `CODE_REGISTRY.md` updated with the new files / table

---

## Memory updates after success

Save a project memory:

```
project_loyalty_cards.md
- 50 cards generated via packages/desktop/scripts/generate-loyalty-cards.js
- Encoded URLs are https://3ks.afkcube.com/?card=<5-digit-code>
- Card PNGs served from /app/loyalty-cards/<code>.png and bundled in /app/loyalty-cards.zip
- Scanner uses jsQR; CAMERA permission added in APK 1.0.5
- DB: loyalty_cards table (id, code, customer_name, stamps 0-9, rewards_claimed_mask)
```
