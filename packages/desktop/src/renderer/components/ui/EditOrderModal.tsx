import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { orderRepo, productRepo } from "../../lib/repositories";
import type { OrderWithDetails, OrderItemRow } from "../../lib/repositories";
import { performSync } from "../../lib/sync-manager";

function parseReceiptRefs(ref: string | null | undefined): string[] {
  if (!ref) return [];
  if (ref.startsWith("[")) {
    try {
      const arr = JSON.parse(ref);
      return Array.isArray(arr) ? arr.filter((s) => typeof s === "string" && s.startsWith("data:image/")) : [];
    } catch {
      return [];
    }
  }
  return ref.startsWith("data:image/") ? [ref] : [];
}

interface Props {
  orderId: string;
  onClose: () => void;
}

export function EditOrderModal({ orderId, onClose }: Props) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => orderRepo.getById(orderId),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productRepo.getActive(),
  });

  // Local editable copy of items
  const [items, setItems] = useState<(OrderItemRow & { _removed?: boolean; _new?: boolean })[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [isGcash, setIsGcash] = useState(false);
  const [gcashImages, setGcashImages] = useState<string[]>([]);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [orderDateTime, setOrderDateTime] = useState(""); // YYYY-MM-DDTHH:MM in local time

  useEffect(() => {
    if (order) {
      setItems(order.items.map((i) => ({ ...i })));
      setCustomerName(order.notes || "");
      // Convert order.created_at (ISO or SQLite format, UTC) to local datetime-local input value
      const raw = order.created_at || "";
      const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setOrderDateTime(local);
      }
      const pay = order.payments && order.payments[0];
      if (pay) {
        setPaymentId(pay.id);
        setIsGcash(pay.method === "gcash");
        setGcashImages(parseReceiptRefs(pay.reference));
      } else {
        setPaymentId(null);
        setIsGcash(false);
        setGcashImages([]);
      }
    }
  }, [order]);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
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

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    const existingIds = new Set(items.filter((i) => !i._removed).map((i) => i.product_id));
    return products
      .filter((p) => p.name.toLowerCase().includes(q) && !existingIds.has(p.id))
      .slice(0, 8);
  }, [productSearch, products, items]);

  const activeItems = items.filter((i) => !i._removed);
  const newTotal = activeItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: qty, total: qty * it.unit_price } : it));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, _removed: true } : it));
  };

  const restoreItem = (idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, _removed: false } : it));
  };

  const addProduct = (product: { id: string; name: string; price: number }) => {
    setItems((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        device_id: "",
        created_at: "",
        updated_at: "",
        deleted_at: null,
        order_id: orderId,
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price,
        discount_amount: 0,
        tax_amount: 0,
        total: product.price,
        notes: null,
        _new: true,
      } as any,
    ]);
    setProductSearch("");
  };

  const addCustomProduct = () => {
    if (!customName.trim() || !customPrice) return;
    const price = parseFloat(customPrice) || 0;
    if (price <= 0) return;
    addProduct({ id: `custom_${Date.now()}`, name: customName.trim(), price });
    setCustomName("");
    setCustomPrice("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      for (const item of items) {
        if ((item as any)._removed && !(item as any)._new) {
          await orderRepo.removeItem(item.id);
        } else if ((item as any)._new && !(item as any)._removed) {
          await orderRepo.addItem(orderId, {
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.quantity * item.unit_price,
          });
        } else if (!(item as any)._removed && !(item as any)._new) {
          // Check if qty changed from original
          const orig = order?.items.find((o) => o.id === item.id);
          if (orig && orig.quantity !== item.quantity) {
            await orderRepo.updateItem(item.id, item.quantity, item.unit_price);
          }
        }
      }
      // Save date/time if changed
      if (orderDateTime && order) {
        const oldLocal = (() => {
          const d = new Date(order.created_at.includes("T") ? order.created_at : order.created_at.replace(" ", "T") + "Z");
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })();
        if (orderDateTime !== oldLocal) {
          // Convert local datetime-local back to ISO UTC
          const newIso = new Date(orderDateTime).toISOString();
          await orderRepo.updateCreatedAt(orderId, newIso);
        }
      }

      // Save payment method + receipt if changed
      if (paymentId) {
        const origPay = order?.payments?.find((p) => p.id === paymentId);
        const newMethod = isGcash ? "gcash" : "cash";
        const newRef = isGcash && gcashImages.length > 0
          ? (gcashImages.length === 1 ? gcashImages[0] : JSON.stringify(gcashImages))
          : null;
        const methodChanged = origPay && origPay.method !== newMethod;
        const refChanged = origPay && (origPay.reference || null) !== newRef;
        if (methodChanged || refChanged) {
          await orderRepo.updatePayment(paymentId, { method: newMethod, reference: newRef });
        }
      }

      // Save customer name if changed
      if (customerName !== (order?.notes || "")) {
        await orderRepo.updateStatus(orderId, order!.status); // trigger updated_at
        const { dbRun } = await import("../../lib/db-bridge");
        await dbRun('UPDATE orders SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?', [customerName || null, orderId]);
        const { writeSyncLog } = await import("../../lib/sync-log-writer");
        await writeSyncLog("orders", orderId, "update", { id: orderId, notes: customerName || null });
      }
      await orderRepo.recalculate(orderId);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      performSync().catch(() => {});
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  if (!order) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.surface,
          borderRadius: borderRadius.md,
          padding: spacing.lg,
          width: "min(580px, 95vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <h2 style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
            Edit {order.order_number}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: fontSize.xl, color: colors.textSecondary, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        {/* Customer name + Date/Time */}
        <div style={{ display: "flex", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
              Customer
            </div>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
              Date / Time
            </div>
            <input
              type="datetime-local"
              value={orderDateTime}
              onChange={(e) => setOrderDateTime(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
        </div>

        {/* Payment method */}
        {paymentId && (
          <div style={{ marginBottom: spacing.md }}>
            <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
              Payment
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.xs,
                cursor: "pointer",
                fontSize: fontSize.sm,
                fontWeight: 600,
                color: isGcash ? colors.primary : colors.textSecondary,
                userSelect: "none",
                marginBottom: spacing.xs,
              }}
            >
              <input
                type="checkbox"
                checked={isGcash}
                onChange={(e) => {
                  setIsGcash(e.target.checked);
                  if (!e.target.checked) setGcashImages([]);
                }}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: colors.primary }}
              />
              Paid with GCash
            </label>
            {isGcash && (
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
                >
                  📷 Camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                    }}
                  />
                </label>
                {gcashImages.map((img, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <img
                      src={img}
                      alt={`Receipt ${idx + 1}`}
                      style={{
                        height: 40,
                        borderRadius: borderRadius.sm,
                        border: `1px solid ${colors.border}`,
                        cursor: "pointer",
                      }}
                      onClick={() => window.open(img, "_blank")}
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
          </div>
        )}

        {error && (
          <div style={{ fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm, fontWeight: 600 }}>{error}</div>
        )}

        {/* Current items */}
        <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
          Order Items
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: spacing.md }}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderBottom: `1px solid ${colors.border}`,
                opacity: (item as any)._removed ? 0.35 : 1,
                textDecoration: (item as any)._removed ? "line-through" : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.product_name}
                  {(item as any)._new && <span style={{ color: colors.success, fontSize: fontSize.xs, marginLeft: spacing.xs }}>NEW</span>}
                </div>
                <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>₱{item.unit_price.toFixed(2)} each</div>
              </div>

              {!(item as any)._removed && (
                <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                  <button
                    onClick={() => updateQty(idx, item.quantity - 1)}
                    style={{
                      width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm,
                      backgroundColor: colors.surfaceElevated, color: colors.textPrimary,
                      cursor: "pointer", fontSize: fontSize.md, fontWeight: 700,
                    }}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 24, textAlign: "center", fontSize: fontSize.sm, fontWeight: 600 }}>{item.quantity}</span>
                  <button
                    onClick={() => updateQty(idx, item.quantity + 1)}
                    style={{
                      width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm,
                      backgroundColor: colors.surfaceElevated, color: colors.textPrimary,
                      cursor: "pointer", fontSize: fontSize.md, fontWeight: 700,
                    }}
                  >
                    +
                  </button>
                </div>
              )}

              <span style={{ fontSize: fontSize.sm, fontWeight: 600, minWidth: 60, textAlign: "right" }}>
                ₱{(item.quantity * item.unit_price).toFixed(2)}
              </span>

              {(item as any)._removed ? (
                <button
                  onClick={() => restoreItem(idx)}
                  style={{
                    padding: `2px ${spacing.sm}px`, fontSize: fontSize.xs, fontWeight: 600,
                    backgroundColor: colors.info, color: "#fff", border: "none",
                    borderRadius: borderRadius.sm, cursor: "pointer",
                  }}
                >
                  Undo
                </button>
              ) : (
                <button
                  onClick={() => removeItem(idx)}
                  style={{
                    padding: `2px ${spacing.sm}px`, fontSize: fontSize.xs, fontWeight: 600,
                    backgroundColor: colors.error, color: "#fff", border: "none",
                    borderRadius: borderRadius.sm, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {activeItems.length === 0 && (
            <div style={{ fontSize: fontSize.sm, color: colors.textTertiary, padding: spacing.sm, textAlign: "center" }}>
              No items — add products below
            </div>
          )}
        </div>

        {/* Add product */}
        <div style={{ marginBottom: spacing.md }}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
            Add Product
          </div>
          <input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Search products to add..."
            style={{ ...inputStyle, width: "100%" }}
          />
          {filteredProducts.length > 0 && (
            <div style={{
              marginTop: spacing.xs, maxHeight: 160, overflowY: "auto",
              border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm,
            }}>
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => addProduct(p)}
                  style={{
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    fontSize: fontSize.sm,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span style={{ color: colors.primary, fontWeight: 600 }}>₱{p.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add custom product */}
        <div style={{ marginBottom: spacing.md }}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
            Add Custom Item
          </div>
          <div style={{ display: "flex", gap: spacing.xs, alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 120 }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Name</div>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomProduct()}
                placeholder="e.g. Extra sauce"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 80 }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Price (₱)</div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomProduct()}
                placeholder="0.00"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <button
              onClick={addCustomProduct}
              disabled={!customName.trim() || !customPrice || parseFloat(customPrice) <= 0}
              style={{
                padding: `${spacing.xs}px ${spacing.md}px`,
                fontSize: fontSize.sm,
                fontWeight: 600,
                backgroundColor: colors.success,
                color: "#fff",
                border: "none",
                borderRadius: borderRadius.sm,
                cursor: "pointer",
                opacity: (!customName.trim() || !customPrice) ? 0.5 : 1,
                minHeight: 30,
              }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* New total */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary,
          borderTop: `2px solid ${colors.border}`, paddingTop: spacing.sm, marginBottom: spacing.md,
        }}>
          <span>New Total</span>
          <span>₱{newTotal.toFixed(2)}</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: spacing.sm }}>
          <button
            onClick={handleSave}
            disabled={saving || activeItems.length === 0}
            style={{
              flex: 1, padding: `${spacing.sm}px`, fontSize: fontSize.md, fontWeight: 700,
              backgroundColor: colors.primary, color: colors.textOnPrimary,
              border: "none", borderRadius: borderRadius.sm, cursor: "pointer",
              opacity: saving || activeItems.length === 0 ? 0.5 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: `${spacing.sm}px`, fontSize: fontSize.md, fontWeight: 600,
              backgroundColor: colors.surfaceElevated, color: colors.textSecondary,
              border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
