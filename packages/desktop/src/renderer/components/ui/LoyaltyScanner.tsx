import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTheme } from "../../hooks/use-theme";

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

// Accepted inputs:
//   https://3ks.afkcube.com/?card=47391    (the QR-encoded URL)
//   3ks.afkcube.com/?card=47391            (without protocol)
//   ?card=47391                            (raw query)
//   47391                                  (manual-entry path)
function extractCardCode(decoded: string): string | null {
  const s = decoded.trim();
  if (/^\d{5}$/.test(s)) return s;
  try {
    // URL() needs a scheme — prepend one if missing.
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
    const u = new URL(withScheme);
    const c = u.searchParams.get("card");
    if (c && /^\d{5}$/.test(c)) return c;
  } catch {
    // Fall through
  }
  // Last-ditch: regex-match a 5-digit number inside any string.
  const m = s.match(/card=(\d{5})/);
  return m ? m[1] : null;
}

export function LoyaltyScanner({ open, onClose, onScan }: Props) {
  const { colors, spacing, borderRadius, fontSize, isMobile } = useTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedRef = useRef(false); // Guard against multiple onScan calls
  const [status, setStatus] = useState<"requesting" | "scanning" | "denied" | "error">("requesting");
  const [errorMessage, setErrorMessage] = useState("");
  const [manualCode, setManualCode] = useState("");

  // Acquire camera + start the decode loop when open.
  useEffect(() => {
    if (!open) return;
    scannedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.setAttribute("playsinline", "true");
          // Safari/iOS needs an explicit play() after setting srcObject.
          await v.play().catch(() => {});
        }
        setStatus("scanning");
        scheduleTick();
      } catch (e: any) {
        const name = e && e.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStatus("denied");
          setErrorMessage("Camera permission denied. Type the card number below.");
        } else {
          setStatus("error");
          setErrorMessage(e?.message || "Camera unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopAll() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function scheduleTick() {
    rafRef.current = requestAnimationFrame(tick);
  }

  function tick() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || scannedRef.current) {
      scheduleTick();
      return;
    }
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (w > 0 && h > 0) {
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const result = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (result) {
            const code = extractCardCode(result.data);
            if (code) {
              scannedRef.current = true;
              stopAll();
              onScan(code);
              return;
            }
          }
        }
      }
    }
    scheduleTick();
  }

  function submitManual() {
    const code = extractCardCode(manualCode);
    if (!code) {
      setErrorMessage("Enter exactly 5 digits.");
      return;
    }
    scannedRef.current = true;
    stopAll();
    onScan(code);
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.md,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(640px, 90vh)",
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
            Scan loyalty card
          </div>
          <button
            onClick={onClose}
            aria-label="Close scanner"
            style={{
              border: "none",
              background: "transparent",
              color: colors.textTertiary,
              fontSize: fontSize.xl,
              cursor: "pointer",
              padding: spacing.xs,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            backgroundColor: "#000",
            borderRadius: borderRadius.md,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              backgroundColor: "#000",
            }}
          />
          {/* Hidden canvas for per-frame jsQR decoding */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Guide overlay */}
          <div
            style={{
              position: "absolute",
              inset: "10%",
              border: `3px solid rgba(255,255,255,0.7)`,
              borderRadius: borderRadius.md,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.25) inset",
              pointerEvents: "none",
            }}
          />

          {status === "requesting" && (
            <div style={{ color: "#fff", fontSize: fontSize.sm, zIndex: 1 }}>
              Requesting camera…
            </div>
          )}
          {(status === "denied" || status === "error") && (
            <div
              style={{
                color: "#fff",
                fontSize: fontSize.sm,
                zIndex: 1,
                textAlign: "center",
                padding: spacing.md,
                maxWidth: 320,
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
          <label style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
            Or type the 5-digit card number
          </label>
          <div style={{ display: "flex", gap: spacing.sm }}>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              value={manualCode}
              onChange={(e) => {
                setManualCode(e.target.value.replace(/\D/g, "").slice(0, 5));
                setErrorMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitManual();
              }}
              placeholder="47391"
              style={{
                flex: 1,
                padding: `${spacing.xs + 2}px ${spacing.sm}px`,
                fontSize: fontSize.lg,
                fontFamily: "monospace",
                letterSpacing: 4,
                textAlign: "center",
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                backgroundColor: colors.background,
                color: colors.textPrimary,
              }}
            />
            <button
              onClick={submitManual}
              disabled={manualCode.length !== 5}
              style={{
                padding: `${spacing.xs + 2}px ${spacing.md}px`,
                border: "none",
                borderRadius: borderRadius.md,
                fontSize: fontSize.sm,
                fontWeight: 600,
                cursor: manualCode.length === 5 ? "pointer" : "not-allowed",
                backgroundColor: manualCode.length === 5 ? colors.primary : colors.surfaceElevated,
                color: manualCode.length === 5 ? colors.textOnPrimary : colors.textTertiary,
              }}
            >
              Open
            </button>
          </div>
          {errorMessage && status === "scanning" && (
            <div style={{ fontSize: fontSize.xs, color: colors.error }}>{errorMessage}</div>
          )}
        </div>

        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, textAlign: "center" }}>
          {isMobile
            ? "Hold the printed QR card 6–8 inches from the rear camera."
            : "Hold the printed QR card in front of the camera."}
        </div>
      </div>
    </div>
  );
}
