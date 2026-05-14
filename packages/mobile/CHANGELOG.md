# Mobile APK Changelog

All notable changes to the Android APK. The APK is a thin React Native shell around the web build at `http://3ks.afkcube.com/app/`; most user-visible work happens in the web bundle, while this changelog tracks the **native shell** changes (and major web changes worth re-installing for).

## 1.0.5 — 2026-05-15

### Native shell

- **Added `CAMERA` permission** to the AndroidManifest + Expo `app.json` so the new Loyalty Cards QR scanner inside the WebView can request and use the rear camera.
- `versionCode` bumped to `4`.

### Web bundle (delivered automatically via WebView)

- **New Loyalty Cards system** in Checkout:
  - 50 pre-seeded physical cards (5-digit codes), each printable as a brand-colored QR
  - "Scan" button in the cart sidebar → opens a camera viewfinder + manual-entry fallback
  - Scanning a card opens a popup with the QR, customer name (editable), and a 4×3 reward grid (3 stamps × 3 rewards: Medium Fries → Large Powder Shake → Empanada Special)
  - "Loyalty" button shows the full card list with a "Download all" button (zips all 50 printable PNGs)
  - External scans of a loyalty QR open `https://3ks.afkcube.com/?card=<code>` (homepage; site is unaware of the param for now)

## 1.0.4 — 2026-05-12

### Native shell

- **Attachment downloads now work on Android.** The web bundle's `<a download>` click was being silently ignored by Android's WebView (which needs `setDownloadListener` to honor those). The shell now listens for `{type:"download", url}` postMessages from the page and opens the URL via `Linking.openURL`, so Android delegates to the system browser which handles the Content-Disposition download properly.
- `versionCode` bumped to `3`.

## 1.0.3 — 2026-05-12

### Native shell

- **Android back button / edge-swipe now opens the Messages drawer** instead of exiting the app. Added a `BackHandler` listener that forwards the back press to the WebView, and an injected JS bridge so the shell knows when the embedded web app has back history (because `history.pushState` doesn't fire react-native-webview's `onNavigationStateChange`).
- Bumped `versionCode` to `2` so Android treats this as an in-place update over `1.0.2`.

### Web bundle (delivered automatically via WebView)

- New **Messages** page in the sidebar — view all Facebook Page conversations and reply directly to customers.
- Customer names are resolved through Graph API and cached server-side (instead of "User 567890").
- Conversation history shows both incoming customer messages and outgoing Page replies.
- Mobile UI for Messages: thread list collapses into a slide-in drawer with a burger button; supports swipe-from-left to open and tap-anywhere-outside to close.
- Server-side Graph API poller (60→20s) keeps `messenger_messages` synced with Facebook; tap on a thread also forces an immediate sync so the open conversation refreshes within seconds rather than waiting for the next tick.

## 1.0.2 — 2026-04-07

- Initial standalone APK builds from the pnpm monorepo (web shell only; no native messaging shell yet).
