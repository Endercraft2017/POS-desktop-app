# Step 04 — Checkout scanner

> Add a "Scan loyalty card" button to the Checkout page sidebar. Tapping opens a camera-based QR scanner. On successful scan, extract the `card` query param from the decoded URL and open the loyalty modal.

---

## New component: `packages/desktop/src/renderer/components/ui/LoyaltyScanner.tsx`

Modal-style camera viewfinder with three states:

1. **Requesting permission** — initial state, asks for camera access via `getUserMedia`
2. **Scanning** — live camera preview with a translucent guide overlay; `jsQR` polls each video frame on a `requestAnimationFrame` loop
3. **Manual entry fallback** — bottom of modal: "Can't scan? Type the card number" field accepting 5 digits, with a Submit button

On successful decode (`jsQR` returns non-null), call `onScan(code)` and let the parent open `LoyaltyCardModal`.

```ts
interface LoyaltyScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void; // 5-digit code
}
```

---

## Where it lives in CheckoutPage

[CheckoutPage.tsx](../../packages/desktop/src/renderer/app/pages/CheckoutPage.tsx) has a cart sidebar on the right (with customer name, payment method, etc.). Add a button there, near the customer field:

```
+------- Cart sidebar -------+
| Customer:  [____________]  |
| [ Scan loyalty card ]      |   ← NEW button
| Payment: [Cash | Card]     |
| ...                        |
+----------------------------+
```

Button label: **"Scan loyalty card"** with a small QR icon.

Visibility: **every employee role** (cashier-friendly per Q2.B in overview).

---

## Decode logic

```ts
import jsQR from "jsqr";

const tick = () => {
  if (videoRef.current?.readyState === videoRef.current?.HAVE_ENOUGH_DATA) {
    canvasCtx.drawImage(videoRef.current, 0, 0, width, height);
    const imageData = canvasCtx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert", // QR is dark-on-light; skip inversion for speed
    });
    if (code) {
      const cardCode = extractCardCode(code.data);
      if (cardCode) {
        stopCamera();
        onScan(cardCode);
        return;
      }
    }
  }
  requestAnimationFrame(tick);
};

function extractCardCode(decoded: string): string | null {
  // Accept any of:
  //   https://3ks.afkcube.com/?card=47391
  //   3ks.afkcube.com/?card=47391
  //   ?card=47391
  //   47391                          ← raw code (manual entry path)
  if (/^\d{5}$/.test(decoded)) return decoded;
  try {
    const url = new URL(decoded);
    const c = url.searchParams.get("card");
    if (c && /^\d{5}$/.test(c)) return c;
  } catch {}
  return null;
}
```

---

## Camera permission flow

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" }, // rear camera on phones
  audio: false,
});
```

- **Desktop browser**: permission prompt shown once; cached for the origin.
- **Mobile WebView (APK)**:
  - `mediaCapturePermissionGrantType="grant"` is already set in [packages/mobile/index.js](../../packages/mobile/index.js), so the WebView auto-grants.
  - BUT — the Android manifest must declare `<uses-permission android:name="android.permission.CAMERA" />`. Currently only `RECORD_AUDIO` is declared in `app.json`. **This is the one APK rebuild item — see step 07.**

If permission is denied / errors out:
- Show the manual entry fallback prominently
- Show a "Camera unavailable: type the card number instead" hint

---

## Cleanup

On modal close / unmount:
- Stop all `MediaStreamTrack`s (`stream.getTracks().forEach((t) => t.stop())`)
- Cancel the `requestAnimationFrame` loop

Otherwise the camera stays on, the LED keeps glowing, and the user gets antsy.

---

## Wiring in CheckoutPage

```tsx
// inside CheckoutPage
const [scannerOpen, setScannerOpen] = useState(false);
const [scannedCardId, setScannedCardId] = useState<string | null>(null);

const handleScan = async (code: string) => {
  setScannerOpen(false);
  const card = await loyaltyCardRepo.getByCode(code);
  if (!card) {
    // open the modal anyway with the unknown code (admin can create the
    // missing row, or close out)
    setUnknownCode(code);
  } else {
    setScannedCardId(card.id);
  }
};

// ...
{scannerOpen && (
  <LoyaltyScanner
    open
    onClose={() => setScannerOpen(false)}
    onScan={handleScan}
  />
)}
{scannedCardId && (
  <LoyaltyCardModal
    cardId={scannedCardId}
    onClose={() => setScannedCardId(null)}
  />
)}
```

---

## Edge cases

| Case | Behavior |
|---|---|
| QR doesn't decode after 30 s | Show "Still scanning… try better lighting" hint; manual entry remains visible. |
| Decoded but not a loyalty URL | Toast "Not a loyalty card QR"; keep scanning. |
| Decoded, valid code, but no row in DB | Modal opens with "Card 47391 not found — create it?" → admin types name and `loyaltyCardRepo.create({ code, customer_name })` is called. |
| Camera denied | Manual entry only; toast explains how to re-enable in Settings. |
| Card already scanned (modal already open) | Ignore subsequent decodes until modal closes. |

---

## Acceptance check for this step

- [ ] "Scan loyalty card" button appears in CheckoutPage sidebar for all roles
- [ ] Clicking it opens the scanner modal and prompts for camera (first time only)
- [ ] Holding a printed loyalty QR up to the camera triggers the modal within ~2 seconds
- [ ] External QR scanned via phone camera (outside the app) opens https://3ks.afkcube.com/ as expected
- [ ] Typing `47391` into the manual entry field and submitting opens the loyalty modal
- [ ] Closing the scanner stops the camera (LED off; no hung MediaStream)
- [ ] Scanning a QR with an unrecognized code opens the "create card" flow
