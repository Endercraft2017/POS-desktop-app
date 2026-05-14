import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useCartStore } from "../../stores/cart-store";
import { useAuthStore } from "../../stores/auth-store";
import { useUiStore } from "../../stores/ui-store";
import { ImageViewer } from "../../components/ui/ImageViewer";
import { ChatPanel } from "../../components/ui/ChatPanel";
import { LoyaltyScanner } from "../../components/ui/LoyaltyScanner";
import { LoyaltyCardModal } from "../../components/ui/LoyaltyCardModal";
import { productRepo, orderRepo, settingsRepo, loyaltyCardRepo } from "../../lib/repositories";
import type { LoyaltyCardRow } from "../../lib/repositories";
import { performSync } from "../../lib/sync-manager";

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentEmployee } = useAuthStore();
  const showChat = currentEmployee?.role === "admin";
  const { colors, spacing, borderRadius, fontSize, isMobile, isPortrait } = useTheme();
  const { cart, addItem, updateQuantity, removeItem, clear, applyDiscount, customerName, setCustomerName } = useCartStore();
  const compactMode = useUiStore((s) => s.compactMode);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [payment, setPayment] = useState("");
  const [isGcash, setIsGcash] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [cashPart, setCashPart] = useState("");
  const [gcashPart, setGcashPart] = useState("");
  const [gcashImages, setGcashImages] = useState<string[]>([]);
  const [scannedQr, setScannedQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrScanning, setQrScanning] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  // --- Loyalty cards (DB-backed; cards seeded via scripts/generate-loyalty-cards.js)
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltySearch, setLoyaltySearch] = useState("");
  const [loyaltyScannerOpen, setLoyaltyScannerOpen] = useState(false);
  // Card currently shown in the detail modal (set by tapping a card in the
  // list, or by a successful scanner result).
  const [openLoyaltyCardId, setOpenLoyaltyCardId] = useState<string | null>(null);
  // Surfaces the "card not found" prompt when the scanner / manual entry gives
  // a code that has no row yet.
  const [unknownLoyaltyCode, setUnknownLoyaltyCode] = useState<string | null>(null);

  const isAdmin = currentEmployee?.role === "admin";

  const loyaltyCardsQuery = useQuery({
    queryKey: ["loyalty-cards", "all"],
    queryFn: () => loyaltyCardRepo.listAll(),
    staleTime: 15_000,
  });
  const loyaltyCards: LoyaltyCardRow[] = loyaltyCardsQuery.data ?? [];

  const filteredLoyalty = useMemo(() => {
    const q = loyaltySearch.trim().toLowerCase();
    if (!q) return loyaltyCards;
    return loyaltyCards.filter(
      (c) =>
        c.code.includes(q) ||
        (c.customer_name && c.customer_name.toLowerCase().includes(q)),
    );
  }, [loyaltyCards, loyaltySearch]);

  // Scanner result handler. If the code matches a row, open the card modal.
  // If not, prompt to create a row with that code (admin-only convenience).
  async function handleLoyaltyScan(code: string) {
    setLoyaltyScannerOpen(false);
    const card = await loyaltyCardRepo.getByCode(code);
    if (card) {
      setOpenLoyaltyCardId(card.id);
    } else {
      setUnknownLoyaltyCode(code);
    }
  }

  async function createMissingLoyaltyCard(code: string) {
    const created = await loyaltyCardRepo.create({ code });
    setUnknownLoyaltyCode(null);
    setOpenLoyaltyCardId(created.id);
    queryClient.invalidateQueries({ queryKey: ["loyalty-cards", "all"] });
  }

  const { data: dbProducts = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productRepo.getActive(),
  });

  const products = useMemo(() => {
    return dbProducts.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      categories: (p.category_ids ?? "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean),
    }));
  }, [dbProducts]);

  // Derive unique category names from all products for filter pills
  const categoryNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const c of p.categories) set.add(c);
    }
    return Array.from(set).sort();
  }, [products]);

  const allCategories = useMemo(() => {
    return [
      { id: "all", name: "All" },
      ...categoryNames.map((c) => ({ id: c, name: c.charAt(0).toUpperCase() + c.slice(1) })),
    ];
  }, [categoryNames]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === "all" || p.categories.includes(selectedCategory);
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const paymentAmount = parseFloat(payment) || 0;
  const cashPartAmt = parseFloat(cashPart) || 0;
  const gcashPartAmt = parseFloat(gcashPart) || 0;
  const splitPaid = cashPartAmt + gcashPartAmt;
  const change = isSplit ? splitPaid - cart.total : paymentAmount - cart.total;
  const canCharge = cart.items.length > 0 && (
    isSplit
      ? splitPaid >= cart.total && cashPartAmt > 0 && gcashPartAmt > 0
      : paymentAmount >= cart.total && paymentAmount > 0
  );

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 800px wide
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          setGcashImages((prev) => [...prev, dataUrl]);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Triggers a browser download of the raw captured file so it lands in the
  // phone's Downloads folder (Android auto-indexes this into the gallery).
  // iOS Safari opens a save/share prompt instead — still one tap to keep.
  const saveFileToDevice = (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      a.download = `gcash-receipt-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  const handleCameraCapture = (file: File) => {
    handleImageUpload(file);
    saveFileToDevice(file);
  };

  const handleQrResult = async (text: string) => {
    const promoMatch = text.match(/^POS-PROMO:(.+)$/);
    if (promoMatch) {
      const promoCode = promoMatch[1].trim().toUpperCase();
      try {
        const raw = await settingsRepo.get("promo_codes");
        const list = raw ? JSON.parse(raw) : [];
        const promo = Array.isArray(list) ? list.find((p: any) => p.code === promoCode && p.isActive) : null;
        if (!promo) {
          setQrError("Promo code not found or disabled: " + promoCode);
          return;
        }
        applyDiscount("percentage", promo.percentOff);
        setScannedQr(`${promo.label} (-${promo.percentOff}%)`);
      } catch (err) {
        setQrError("Failed to apply promo: " + (err as Error).message);
      }
    } else {
      setScannedQr(text);
    }
  };

  const handleQrScan = (file: File) => {
    setQrError(null);
    setQrScanning(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // 1. Try the native BarcodeDetector first (fast + accurate on Android Chrome)
          const nativeDetector = (window as any).BarcodeDetector;
          if (nativeDetector) {
            try {
              const supported = await nativeDetector.getSupportedFormats?.();
              if (!supported || supported.includes("qr_code")) {
                const detector = new nativeDetector({ formats: ["qr_code"] });
                const codes = await detector.detect(img);
                if (codes && codes.length > 0 && codes[0].rawValue) {
                  await handleQrResult(codes[0].rawValue);
                  setQrScanning(false);
                  return;
                }
              }
            } catch {
              // fall through to jsQR
            }
          }

          // 2. Fall back to jsQR. Downscale large images first — jsQR is slow and
          // less accurate on huge phone photos. 1280px on the long edge works well.
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("canvas unavailable");
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const { default: jsQR } = await import("jsqr");

          // Try at full downscaled size first, then at half size if it fails.
          // Some phone cameras' high resolution introduces noise that jsQR
          // handles better at lower resolution.
          let code = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
          if (!code) {
            const w2 = Math.max(1, Math.round(w / 2));
            const h2 = Math.max(1, Math.round(h / 2));
            const c2 = document.createElement("canvas");
            c2.width = w2;
            c2.height = h2;
            const ctx2 = c2.getContext("2d", { willReadFrequently: true });
            if (ctx2) {
              ctx2.drawImage(img, 0, 0, w2, h2);
              const imageData2 = ctx2.getImageData(0, 0, w2, h2);
              code = jsQR(imageData2.data, w2, h2, { inversionAttempts: "attemptBoth" });
            }
          }

          if (code && code.data) {
            await handleQrResult(code.data);
          } else {
            setQrError("No QR code found. Try holding the phone steadier and closer.");
          }
        } catch (err) {
          setQrError("QR decode failed: " + (err as Error).message);
        } finally {
          setQrScanning(false);
        }
      };
      img.onerror = () => {
        setQrError("Could not load the captured image");
        setQrScanning(false);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setQrError("Could not read the captured file");
      setQrScanning(false);
    };
    reader.readAsDataURL(file);
  };

  // Serializes multiple receipt images as a JSON array. A single image is kept
  // as a plain data URL string for backwards compatibility with older orders.
  const serializeReceipts = (imgs: string[]): string | null => {
    if (imgs.length === 0) return null;
    if (imgs.length === 1) return imgs[0];
    return JSON.stringify(imgs);
  };

  const handleCharge = async () => {
    if (!canCharge) return;
    const gcashRef = serializeReceipts(gcashImages);
    const splitPayments = isSplit
      ? [
          { method: "cash", amount: cashPartAmt, change: change > 0 ? change : 0 },
          { method: "gcash", amount: gcashPartAmt, reference: gcashRef, change: 0 },
        ]
      : undefined;
    // customer_name lives in its own column now. Keep QR (if any) in notes so
    // scan metadata isn't lost when the cashier edits the note later.
    const noteOnly = scannedQr ? `QR: ${scannedQr}` : null;
    const payload = {
      subtotal: cart.subtotal,
      tax_amount: cart.taxAmount,
      discount_amount: cart.discountAmount,
      total: cart.total,
      employee_id: currentEmployee?.id ?? null,
      customer_name: customerName.trim() || null,
      notes: noteOnly,
      payment_method: isSplit ? "split" : isGcash ? "gcash" : "cash",
      payment_reference: (isSplit || isGcash) ? gcashRef : null,
      payment_amount: isSplit ? splitPaid : paymentAmount,
      change_amount: change,
      payments: splitPayments,
      items: cart.items.map((item) => ({
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.total,
      })),
    };

    // Optimistic UI: reset the form immediately so the cashier can start the
    // next order. The DB write runs in the background; if it fails we alert.
    clear();
    setPayment("");
    setIsGcash(false);
    setIsSplit(false);
    setCashPart("");
    setGcashPart("");
    setCustomerName("");
    setGcashImages([]);
    setScannedQr(null);
    setQrError(null);

    try {
      await orderRepo.createFull(payload);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      performSync().catch(() => {});
    } catch (err) {
      alert("Failed to save order: " + (err as Error).message);
    }
  };

  const isVertical = isMobile && isPortrait;

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: isVertical ? "column" : "row",
    height: "100%",
    overflow: "hidden",
  };

  const leftPanelStyle: React.CSSProperties = isVertical
    ? {
        flex: "0 0 40%",
        display: "flex",
        flexDirection: "column",
        padding: spacing.sm,
        paddingTop: spacing.xl + spacing.md, // room for burger button
        gap: spacing.sm,
        overflow: "hidden",
        minWidth: 0,
      }
    : {
        flex: isMobile ? "0 0 50%" : "0 0 65%",
        display: "flex",
        flexDirection: "column",
        padding: spacing.md,
        gap: spacing.md,
        overflow: "hidden",
        minWidth: 0,
      };

  const rightPanelStyle: React.CSSProperties = isVertical
    ? {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        borderTop: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        minHeight: 0,
      }
    : {
        flex: isMobile ? "0 0 50%" : "0 0 35%",
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        minWidth: 0,
      };

  const searchInputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.md,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  const categoryRowStyle: React.CSSProperties = {
    display: "flex",
    gap: spacing.sm,
    overflowX: "auto",
    flexShrink: 0,
  };

  const categoryPillStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.full,
    backgroundColor: active ? colors.primary : colors.surfaceElevated,
    color: active ? colors.textOnPrimary : colors.textSecondary,
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: 28,
  });

  const productGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isVertical
      ? "repeat(auto-fill, minmax(90px, 1fr))"
      : "repeat(auto-fill, minmax(120px, 1fr))",
    gap: isVertical ? spacing.xs : spacing.sm,
    overflowY: "auto",
    flex: 1,
    padding: `${spacing.xs}px 0`,
  };

  const productCardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: isVertical ? borderRadius.sm : borderRadius.md,
    padding: isVertical ? spacing.xs : spacing.md,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: isVertical ? 2 : spacing.xs,
    cursor: "pointer",
    minHeight: isVertical ? 44 : 70,
    transition: "border-color 0.1s",
  };

  const cartHeaderStyle: React.CSSProperties = {
    padding: isVertical ? spacing.xs : spacing.md,
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const cartItemsStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: isVertical ? `${spacing.xs}px ${spacing.sm}px` : `${spacing.sm}px ${spacing.md}px`,
  };

  const cartItemRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: isVertical ? `${spacing.xs}px 0` : `${spacing.sm}px 0`,
    borderBottom: `1px solid ${colors.border}`,
    gap: isVertical ? spacing.xs : spacing.sm,
  };

  const qtyBtnStyle: React.CSSProperties = {
    width: isVertical ? 22 : 26,
    height: isVertical ? 22 : 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    cursor: "pointer",
    fontSize: isVertical ? fontSize.md : fontSize.lg,
    fontWeight: 700,
  };

  const removeBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: colors.error,
    cursor: "pointer",
    fontSize: fontSize.sm,
    fontWeight: 600,
    padding: `${spacing.xs}px`,
  };

  const cartFooterStyle: React.CSSProperties = {
    padding: isVertical ? spacing.xs : spacing.md,
    borderTop: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    gap: isVertical ? spacing.xs : spacing.sm,
  };

  const summaryRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: isVertical ? fontSize.sm : fontSize.md,
    color: colors.textSecondary,
  };

  const totalRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: isVertical ? fontSize.md : fontSize.xl,
    fontWeight: 700,
    color: colors.textPrimary,
  };

  const chargeBtnStyle: React.CSSProperties = {
    minHeight: isVertical ? 66 : 36,
    fontSize: isVertical ? fontSize["2xl"] : fontSize.lg,
    fontWeight: 700,
    backgroundColor: colors.success,
    color: colors.textOnPrimary,
    border: "none",
    borderRadius: borderRadius.md,
    cursor: "pointer",
    padding: isVertical ? `${spacing.md}px` : undefined,
  };

  const clearBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: colors.error,
    cursor: "pointer",
    fontSize: fontSize.sm,
    fontWeight: 600,
  };

  return (
    <>
    {viewImage && <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />}
    <LoyaltyScanner
      open={loyaltyScannerOpen}
      onClose={() => setLoyaltyScannerOpen(false)}
      onScan={handleLoyaltyScan}
    />
    {openLoyaltyCardId && (
      <LoyaltyCardModal cardId={openLoyaltyCardId} onClose={() => setOpenLoyaltyCardId(null)} />
    )}
    {unknownLoyaltyCode && (
      <div
        onClick={() => setUnknownLoyaltyCode(null)}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1500,
          padding: spacing.md,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            maxWidth: 400,
            display: "flex",
            flexDirection: "column",
            gap: spacing.sm,
          }}
        >
          <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary }}>
            Card #{unknownLoyaltyCode} isn't in the system
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
            Create a row for this card? You can add the customer's name on the next screen.
          </div>
          <div style={{ display: "flex", gap: spacing.sm, justifyContent: "flex-end", marginTop: spacing.sm }}>
            <button
              onClick={() => setUnknownLoyaltyCode(null)}
              style={{
                padding: `${spacing.xs + 2}px ${spacing.md}px`,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                backgroundColor: colors.surface,
                color: colors.textSecondary,
                fontSize: fontSize.sm,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => createMissingLoyaltyCard(unknownLoyaltyCode)}
              style={{
                padding: `${spacing.xs + 2}px ${spacing.md}px`,
                border: "none",
                borderRadius: borderRadius.md,
                backgroundColor: colors.primary,
                color: colors.textOnPrimary,
                fontSize: fontSize.sm,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create card
            </button>
          </div>
        </div>
      </div>
    )}
    {loyaltyOpen && (
      <div
        onClick={() => setLoyaltyOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: spacing.md,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            width: "min(720px, 100%)",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: spacing.md,
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <span style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
              Loyalty Cards ({loyaltyCards.length})
            </span>
            <div style={{ display: "flex", gap: spacing.xs }}>
              <a
                href="/app/loyalty-cards.zip"
                download="loyalty-cards.zip"
                style={{
                  padding: `4px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  border: `1px solid ${colors.primary}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary || "#fff",
                  cursor: "pointer",
                  textDecoration: "none",
                }}
                title="Download a zip with all printed-card PNGs"
              >
                ⬇ Download all
              </a>
              <button
                onClick={() => setLoyaltyOpen(false)}
                style={{
                  padding: `2px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textSecondary,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div style={{ padding: spacing.md, borderBottom: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: spacing.sm }}>
            <input
              autoFocus
              placeholder="Search by code or name…"
              value={loyaltySearch}
              onChange={(e) => setLoyaltySearch(e.target.value)}
              style={{
                width: "100%",
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: fontSize.sm,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.background,
                color: colors.textPrimary,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: spacing.md,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: spacing.sm,
              alignContent: "start",
            }}
          >
            {loyaltyCardsQuery.isLoading && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm, padding: spacing.lg }}>
                Loading…
              </div>
            )}
            {!loyaltyCardsQuery.isLoading && filteredLoyalty.length === 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  color: colors.textTertiary,
                  fontSize: fontSize.sm,
                  padding: spacing.lg,
                }}
              >
                {loyaltyCards.length === 0
                  ? "No loyalty cards yet. Run scripts/generate-loyalty-cards.js to seed 50."
                  : "No matches."}
              </div>
            )}
            {filteredLoyalty.map((card) => {
              const filledRows = Math.floor(card.stamps / 3);
              return (
                <button
                  key={card.id}
                  onClick={() => {
                    setLoyaltyOpen(false);
                    setOpenLoyaltyCardId(card.id);
                  }}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    backgroundColor: colors.surfaceElevated,
                    padding: spacing.sm,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: spacing.xs,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <img
                    src={`/app/loyalty-cards/${encodeURIComponent(card.code)}.png`}
                    alt={`QR for ${card.code}`}
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                    style={{
                      width: 120,
                      height: 120,
                      imageRendering: "pixelated",
                      backgroundColor: "#fff",
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                    }}
                  />
                  <span style={{ fontFamily: "monospace", fontSize: fontSize.xs, color: colors.textTertiary }}>
                    #{card.code}
                  </span>
                  <span
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      color: colors.textPrimary,
                      textAlign: "center",
                      width: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={card.customer_name || "(unnamed)"}
                  >
                    {card.customer_name || (
                      <em style={{ color: colors.textTertiary, fontWeight: 400 }}>(unnamed)</em>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[0, 1, 2].map((row) => (
                      <span
                        key={row}
                        style={{
                          width: 16,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: row < filledRows ? "#fcad1d" : colors.border,
                        }}
                      />
                    ))}
                    <span style={{ marginLeft: spacing.xs, fontSize: fontSize.xs, color: colors.textTertiary }}>
                      {card.stamps}/9
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}
    <div style={containerStyle}>
      {/* Left Panel - Products */}
      <div style={leftPanelStyle}>
        {!compactMode && (
          <input
            style={searchInputStyle}
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        <div style={categoryRowStyle}>
          {allCategories.map((cat) => (
            <button
              key={cat.id}
              style={categoryPillStyle(selectedCategory === cat.id)}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div style={productGridStyle}>
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              style={{
                ...productCardStyle,
                borderColor:
                  hoveredProduct === product.id
                    ? colors.primary
                    : colors.border,
              }}
              onClick={() => addItem(product)}
              onMouseEnter={() => setHoveredProduct(product.id)}
              onMouseLeave={() => setHoveredProduct(null)}
            >
              <span
                style={{
                  fontSize: fontSize.md,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  textAlign: "center",
                }}
              >
                {product.name}
              </span>
              <span
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: 700,
                  color: colors.primary,
                }}
              >
                ₱{product.price.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Cart */}
      <div style={rightPanelStyle}>
        <div style={cartHeaderStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: fontSize.xl,
                fontWeight: 700,
                color: colors.textPrimary,
              }}
            >
              Cart ({cart.items.length})
            </span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.background,
                color: colors.textPrimary,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: spacing.xs }}>
            <button
              style={{
                padding: `2px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 600,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.surfaceElevated,
                color: colors.textSecondary,
                cursor: "pointer",
              }}
              onClick={() => navigate("/history")}
            >
              History
            </button>
            <button
              style={{
                padding: `2px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 600,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.surfaceElevated,
                color: colors.textSecondary,
                cursor: "pointer",
              }}
              onClick={() => setLoyaltyScannerOpen(true)}
              title="Scan a loyalty card QR with the camera"
            >
              📷 Scan
            </button>
            <button
              style={{
                padding: `2px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 600,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.surfaceElevated,
                color: colors.textSecondary,
                cursor: "pointer",
              }}
              onClick={() => setLoyaltyOpen(true)}
              title="Browse all loyalty cards"
            >
              Loyalty
            </button>
            {cart.items.length > 0 && (
              <button style={clearBtnStyle} onClick={clear}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div style={cartItemsStyle}>
          {cart.items.length === 0 && (
            <p
              style={{
                textAlign: "center",
                color: colors.textTertiary,
                fontSize: fontSize.md,
                marginTop: spacing.xl,
              }}
            >
              No items in cart
            </p>
          )}
          {cart.items.map((item) => (
            <div key={item.productId} style={cartItemRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: 600,
                    color: colors.textPrimary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.productName}
                </div>
                <div
                  style={{ fontSize: fontSize.sm, color: colors.textSecondary }}
                >
                  ₱{item.unitPrice.toFixed(2)} each
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.xs,
                }}
              >
                <button
                  style={qtyBtnStyle}
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity - 1)
                  }
                >
                  -
                </button>
                <span
                  style={{
                    minWidth: 24,
                    textAlign: "center",
                    fontSize: fontSize.md,
                    fontWeight: 600,
                    color: colors.textPrimary,
                  }}
                >
                  {item.quantity}
                </span>
                <button
                  style={qtyBtnStyle}
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity + 1)
                  }
                >
                  +
                </button>
              </div>
              <span
                style={{
                  fontSize: fontSize.md,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  minWidth: 56,
                  textAlign: "right",
                }}
              >
                ₱{item.total.toFixed(2)}
              </span>
              <button
                style={removeBtnStyle}
                onClick={() => removeItem(item.productId)}
              >
                X
              </button>
            </div>
          ))}
        </div>

        {/* QR scan bar — small button + decoded chip, sits above the cart summary */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: spacing.xs, padding: `0 ${spacing.md}px`, flexWrap: "wrap" }}>
          {scannedQr && (
            <div
              title={scannedQr}
              style={{
                fontSize: fontSize.xs,
                color: colors.success,
                backgroundColor: colors.successLight ?? colors.surfaceElevated,
                padding: `2px ${spacing.xs + 2}px`,
                borderRadius: borderRadius.full,
                border: `1px solid ${colors.success}`,
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}
            >
              QR: {scannedQr}
            </div>
          )}
          {scannedQr && (
            <button
              onClick={() => {
                setScannedQr(null);
                // If the scan applied a promo discount, remove it
                if (cart.discountType === "percentage") applyDiscount("none", 0);
              }}
              style={{
                padding: `2px ${spacing.xs}px`,
                fontSize: fontSize.xs,
                backgroundColor: "transparent",
                color: colors.error,
                border: `1px solid ${colors.error}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
              title="Clear scanned QR"
            >
              ×
            </button>
          )}
          {qrError && (
            <span style={{ fontSize: fontSize.xs, color: colors.error }}>{qrError}</span>
          )}
          {qrScanning && (
            <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>Scanning…</span>
          )}
          <label
            title="Scan a QR code with the camera"
            style={{
              padding: `${spacing.xs - 1}px ${spacing.sm}px`,
              fontSize: fontSize.xs,
              fontWeight: 600,
              backgroundColor: colors.surfaceElevated,
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ⛶ Scan QR
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleQrScan(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div style={cartFooterStyle}>
          {!isVertical && (
            <>
              <div style={summaryRowStyle}>
                <span>Subtotal</span>
                <span>₱{cart.subtotal.toFixed(2)}</span>
              </div>
              <div style={summaryRowStyle}>
                <span>Tax</span>
                <span>₱{cart.taxAmount.toFixed(2)}</span>
              </div>
              {cart.discountAmount > 0 && (
                <div style={{ ...summaryRowStyle, color: colors.success }}>
                  <span>Discount</span>
                  <span>-₱{cart.discountAmount.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
          <div style={totalRowStyle}>
            <span>Total</span>
            <span>₱{cart.total.toFixed(2)}</span>
          </div>

          {/* Payment input */}
          {cart.items.length > 0 && (
            <>
              <div style={{ display: "flex", gap: spacing.md, flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.xs,
                    cursor: "pointer",
                    fontSize: isVertical ? fontSize.md : fontSize.sm,
                    fontWeight: 600,
                    color: isGcash && !isSplit ? colors.primary : colors.textSecondary,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isGcash && !isSplit}
                    onChange={(e) => {
                      setIsGcash(e.target.checked);
                      if (e.target.checked) setIsSplit(false);
                      if (!e.target.checked) setGcashImages([]);
                    }}
                    style={{ width: isVertical ? 22 : 16, height: isVertical ? 22 : 16, cursor: "pointer", accentColor: colors.primary }}
                  />
                  Pay with GCash
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.xs,
                    cursor: "pointer",
                    fontSize: isVertical ? fontSize.md : fontSize.sm,
                    fontWeight: 600,
                    color: isSplit ? colors.primary : colors.textSecondary,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSplit}
                    onChange={(e) => {
                      setIsSplit(e.target.checked);
                      if (e.target.checked) {
                        setIsGcash(false);
                        setPayment("");
                      } else {
                        setCashPart("");
                        setGcashPart("");
                        setGcashImages([]);
                      }
                    }}
                    style={{ width: isVertical ? 22 : 16, height: isVertical ? 22 : 16, cursor: "pointer", accentColor: colors.primary }}
                  />
                  Split (Cash + GCash)
                </label>
              </div>
              {(isGcash || isSplit) && (
                <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
                  <label
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: fontSize.xs,
                      fontWeight: 600,
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textSecondary,
                      border: `1px dashed ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                    }}
                  >
                    {gcashImages.length > 0 ? `+ Add another (${gcashImages.length})` : "+ Attach receipt"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                      }}
                    />
                  </label>
                  <label
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: fontSize.xs,
                      fontWeight: 600,
                      backgroundColor: colors.primary,
                      color: colors.textOnPrimary,
                      border: "none",
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title="Open the device camera to capture the receipt"
                  >
                    📷 Camera
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleCameraCapture(f);
                      }}
                    />
                  </label>
                  {gcashImages.map((img, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <img
                        src={img}
                        alt={`GCash receipt ${idx + 1}`}
                        style={{
                          height: 32,
                          borderRadius: borderRadius.sm,
                          border: `1px solid ${colors.border}`,
                          cursor: "pointer",
                        }}
                        onClick={() => setViewImage(img)}
                      />
                      <button
                        onClick={() => setGcashImages((prev) => prev.filter((_, i) => i !== idx))}
                        style={{
                          padding: `2px ${spacing.xs}px`,
                          fontSize: fontSize.xs,
                          backgroundColor: "transparent",
                          color: colors.error,
                          border: `1px solid ${colors.error}`,
                          borderRadius: borderRadius.sm,
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!isSplit && (
                <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                  <span style={{ fontSize: fontSize.sm, color: colors.textSecondary, whiteSpace: "nowrap" }}>
                    {isGcash ? "GCash ₱" : "Payment ₱"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && canCharge && handleCharge()}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: fontSize.md,
                      fontWeight: 600,
                      border: `1px solid ${paymentAmount > 0 && paymentAmount < cart.total ? colors.error : colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.background,
                      color: colors.textPrimary,
                      outline: "none",
                      textAlign: "right",
                      boxSizing: "border-box",
                    }}
                    autoFocus={false}
                  />
                  <button
                    onClick={() => setPayment(cart.total.toFixed(2))}
                    style={{
                      padding: isVertical ? `${spacing.sm}px ${spacing.md}px` : `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: isVertical ? fontSize.md : fontSize.xs,
                      fontWeight: 700,
                      backgroundColor: colors.primary,
                      color: colors.textOnPrimary,
                      border: "none",
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      minHeight: isVertical ? 38 : undefined,
                    }}
                  >
                    Exact
                  </button>
                </div>
              )}

              {isSplit && (
                <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
                  <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                    <span style={{ fontSize: fontSize.sm, color: colors.textSecondary, whiteSpace: "nowrap", width: 70 }}>
                      Cash ₱
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashPart}
                      onChange={(e) => setCashPart(e.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        fontSize: fontSize.md,
                        fontWeight: 600,
                        border: `1px solid ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        backgroundColor: colors.background,
                        color: colors.textPrimary,
                        outline: "none",
                        textAlign: "right",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                    <span style={{ fontSize: fontSize.sm, color: colors.textSecondary, whiteSpace: "nowrap", width: 70 }}>
                      GCash ₱
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={gcashPart}
                      onChange={(e) => setGcashPart(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && canCharge && handleCharge()}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        fontSize: fontSize.md,
                        fontWeight: 600,
                        border: `1px solid ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        backgroundColor: colors.background,
                        color: colors.textPrimary,
                        outline: "none",
                        textAlign: "right",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={() => {
                        const remaining = Math.max(0, cart.total - cashPartAmt);
                        setGcashPart(remaining.toFixed(2));
                      }}
                      style={{
                        padding: isVertical ? `${spacing.sm}px ${spacing.md}px` : `${spacing.xs}px ${spacing.sm}px`,
                        fontSize: isVertical ? fontSize.md : fontSize.xs,
                        fontWeight: 700,
                        backgroundColor: colors.primary,
                        color: colors.textOnPrimary,
                        border: "none",
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        minHeight: isVertical ? 38 : undefined,
                      }}
                    >
                      Fill
                    </button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.xs, color: colors.textTertiary }}>
                    <span>Paid: ₱{splitPaid.toFixed(2)}</span>
                    <span>Remaining: ₱{Math.max(0, cart.total - splitPaid).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Change display */}
              {((isSplit && splitPaid > 0) || (!isSplit && paymentAmount > 0)) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: fontSize.lg,
                    fontWeight: 700,
                    color: change >= 0 ? colors.success : colors.error,
                  }}
                >
                  <span>Change</span>
                  <span>{change >= 0 ? `₱${change.toFixed(2)}` : `-₱${Math.abs(change).toFixed(2)}`}</span>
                </div>
              )}

              {((isSplit && splitPaid > 0 && splitPaid < cart.total) || (!isSplit && paymentAmount > 0 && paymentAmount < cart.total)) && (
                <div style={{ fontSize: fontSize.xs, color: colors.error, textAlign: "center" }}>
                  Insufficient payment
                </div>
              )}
            </>
          )}

          <button
            style={{
              ...chargeBtnStyle,
              opacity: canCharge ? 1 : 0.4,
              width: "100%",
            }}
            disabled={!canCharge}
            onClick={handleCharge}
          >
            {cart.items.length === 0
              ? "Add items to cart"
              : !payment
              ? "Enter payment amount"
              : canCharge
              ? `Charge ₱${cart.total.toFixed(2)}`
              : "Insufficient payment"}
          </button>
        </div>
      </div>
    </div>
    {showChat && <ChatPanel page="checkout" />}
    </>
  );
}
