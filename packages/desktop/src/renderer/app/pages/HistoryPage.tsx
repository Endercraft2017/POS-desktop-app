import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { orderRepo } from "../../lib/repositories";
import type { OrderRow, OrderWithDetails } from "../../lib/repositories";
import { performSync } from "../../lib/sync-manager";
import { EditOrderModal } from "../../components/ui/EditOrderModal";
import { ImageViewer } from "../../components/ui/ImageViewer";
import { ChatPanel } from "../../components/ui/ChatPanel";

// payment_reference can be a single data URL or a JSON array of data URLs.
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

export function HistoryPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentEmployee } = useAuthStore();
  const showChat = currentEmployee?.role === "admin";
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [customerDraft, setCustomerDraft] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);

  const saveNote = useMutation({
    mutationFn: (vars: { id: string; notes: string }) => orderRepo.updateNotes(vars.id, vars.notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", selectedOrderId] });
      setEditingNote(false);
      performSync().catch(() => {});
    },
    onError: (err) => alert("Failed to save note: " + (err as Error).message),
  });

  const saveCustomer = useMutation({
    mutationFn: (vars: { id: string; name: string }) => orderRepo.updateCustomerName(vars.id, vars.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", selectedOrderId] });
      setEditingCustomer(false);
      performSync().catch(() => {});
    },
    onError: (err) => alert("Failed to save customer: " + (err as Error).message),
  });

  const toggleRefund = useMutation({
    mutationFn: (order: OrderRow) => {
      const next = order.status === "completed" ? "refunded" : "completed";
      return orderRepo.updateStatus(order.id, next);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", selectedOrderId] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
    },
  });

  const deleteOrder = useMutation({
    mutationFn: (orderId: string) => orderRepo.softDelete(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      if (selectedOrderId === confirmDeleteId) setSelectedOrderId(null);
      setConfirmDeleteId(null);
      performSync().catch(() => {});
    },
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: () => orderRepo.getAll(200),
  });
  const orders = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOrders;
    const qNum = parseFloat(q);
    const isNumeric = !isNaN(qNum) && /^\d+(\.\d+)?$/.test(q);
    return allOrders.filter((o: OrderRow) => {
      if ((o.order_number || "").toLowerCase().includes(q)) return true;
      if ((o.notes || "").toLowerCase().includes(q)) return true;
      if ((((o as any).customer_name) || "").toLowerCase().includes(q)) return true;
      if (isNumeric) {
        const sub = (o.subtotal ?? 0).toFixed(2);
        const tot = (o.total ?? 0).toFixed(2);
        if (sub.startsWith(q) || tot.startsWith(q)) return true;
      }
      return false;
    });
  }, [allOrders, search]);

  const { data: selectedOrder } = useQuery({
    queryKey: ["order-detail", selectedOrderId],
    queryFn: () => (selectedOrderId ? orderRepo.getById(selectedOrderId) : null),
    enabled: !!selectedOrderId,
  });

  // Reset the note and customer drafts whenever the selected order changes.
  useEffect(() => {
    setNoteDraft(selectedOrder?.notes ?? "");
    setEditingNote(false);
    setCustomerDraft((selectedOrder as any)?.customer_name ?? "");
    setEditingCustomer(false);
  }, [selectedOrderId, selectedOrder?.notes, (selectedOrder as any)?.customer_name]);

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingOrderId) return; // don't hijack keys when editing
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (orders.length === 0) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const idx = selectedOrderId ? orders.findIndex((o) => o.id === selectedOrderId) : -1;
      let nextIdx: number;
      if (idx === -1) {
        nextIdx = 0;
      } else if (e.key === "ArrowDown") {
        nextIdx = Math.min(idx + 1, orders.length - 1);
      } else {
        nextIdx = Math.max(idx - 1, 0);
      }
      const next = orders[nextIdx];
      if (next) {
        setSelectedOrderId(next.id);
        // Scroll into view
        setTimeout(() => {
          const el = document.getElementById("history-row-" + next.id);
          if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [orders, selectedOrderId, editingOrderId]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return { bg: colors.successLight, text: colors.success };
      case "pending": return { bg: colors.warningLight, text: colors.warning };
      case "held": return { bg: colors.infoLight, text: colors.info };
      case "cancelled": return { bg: colors.errorLight, text: colors.error };
      case "refunded": return { bg: colors.warningLight, text: colors.warning };
      default: return { bg: colors.surfaceElevated, text: colors.textSecondary };
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: Order list */}
      <div
        style={{
          flex: "0 0 55%",
          display: "flex",
          flexDirection: "column",
          padding: spacing.lg,
          gap: spacing.sm,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
            Transaction History
          </h1>
          <button
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 600,
              backgroundColor: colors.buttonSecondary,
              color: colors.buttonSecondaryText,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
              minHeight: 30,
            }}
            onClick={() => navigate("/")}
          >
            ← Back to Checkout
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order # or customer..."
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            outline: "none",
            minHeight: 30,
            flexShrink: 0,
          }}
        />

        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, flexShrink: 0 }}>
          {orders.length} transaction{orders.length !== 1 ? "s" : ""} found
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1.2fr 1fr 80px 90px",
            gap: spacing.xs,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.xs,
            fontWeight: 700,
            color: colors.textTertiary,
            borderBottom: `2px solid ${colors.border}`,
            flexShrink: 0,
          }}
        >
          <span>Order #</span>
          <span>Customer</span>
          <span>Date</span>
          <span>Status</span>
          <span style={{ textAlign: "right" }}>Total</span>
        </div>

        {/* Order rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {orders.length === 0 && (
            <div style={{ textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm, marginTop: spacing.xl }}>
              No transactions yet
            </div>
          )}
          {orders.map((order: OrderRow) => {
            const sc = statusColor(order.status);
            const isSelected = selectedOrderId === order.id;
            return (
              <div
                key={order.id}
                id={"history-row-" + order.id}
                onClick={() => setSelectedOrderId(order.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1.2fr 1fr 80px 90px",
                  gap: spacing.xs,
                  padding: `${spacing.xs + 2}px ${spacing.sm}px`,
                  fontSize: fontSize.sm,
                  color: colors.textPrimary,
                  borderBottom: `1px solid ${colors.border}`,
                  backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                  cursor: "pointer",
                  transition: "background-color 0.1s",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{order.order_number}</span>
                  {(order as any).employee_name && (
                    <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
                      Cashier: {(order as any).employee_name}
                    </span>
                  )}
                  {order.notes && (
                    <span
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.textSecondary,
                        fontStyle: "italic",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={order.notes}
                    >
                      Note: {order.notes}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: fontSize.sm,
                    color: (order as any).customer_name ? colors.textPrimary : colors.textTertiary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                  title={(order as any).customer_name || ""}
                >
                  {(order as any).customer_name || "—"}
                </span>
                <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                  {formatDate(order.created_at)}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (order.status === "completed" || order.status === "refunded") {
                      toggleRefund.mutate(order);
                    }
                  }}
                  style={{
                    display: "inline-block",
                    padding: `1px ${spacing.xs}px`,
                    fontSize: fontSize.xs,
                    fontWeight: 700,
                    borderRadius: borderRadius.full,
                    backgroundColor: sc.bg,
                    color: sc.text,
                    textTransform: "capitalize",
                    textAlign: "center",
                    cursor: (order.status === "completed" || order.status === "refunded") ? "pointer" : "default",
                  }}
                  title={
                    order.status === "completed" ? "Click to mark as refunded"
                    : order.status === "refunded" ? "Click to mark as completed"
                    : undefined
                  }
                >
                  {order.status}
                </span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>
                  ₱{order.total.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Order detail */}
      <div
        style={{
          flex: "0 0 45%",
          borderLeft: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!selectedOrder ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.textTertiary,
              fontSize: fontSize.sm,
            }}
          >
            Select a transaction to view details
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: spacing.lg }}>
            <h2 style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.sm }}>
              {selectedOrder.order_number}
            </h2>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: spacing.xs }}>
              {formatDate(selectedOrder.created_at)}
              {(selectedOrder as any).employee_name && (
                <span> · Cashier: <strong style={{ color: colors.textSecondary }}>{(selectedOrder as any).employee_name}</strong></span>
              )}
            </div>
            {/* Editable customer name */}
            <div style={{ marginBottom: spacing.sm, marginTop: spacing.xs }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: 4 }}>
                Customer
              </div>
              {editingCustomer ? (
                <>
                  <input
                    value={customerDraft}
                    onChange={(e) => setCustomerDraft(e.target.value)}
                    autoFocus
                    placeholder="Customer name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && selectedOrderId) {
                        saveCustomer.mutate({ id: selectedOrderId, name: customerDraft.trim() });
                      } else if (e.key === "Escape") {
                        setEditingCustomer(false);
                        setCustomerDraft((selectedOrder as any)?.customer_name ?? "");
                      }
                    }}
                    style={{
                      width: "100%",
                      fontSize: fontSize.sm,
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.background,
                      color: colors.textPrimary,
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: spacing.xs, marginTop: spacing.xs }}>
                    <button
                      onClick={() => selectedOrderId && saveCustomer.mutate({ id: selectedOrderId, name: customerDraft.trim() })}
                      disabled={saveCustomer.isPending}
                      style={{
                        padding: `${spacing.xs}px ${spacing.md}px`,
                        fontSize: fontSize.xs,
                        fontWeight: 600,
                        backgroundColor: colors.primary,
                        color: colors.textOnPrimary,
                        border: "none",
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingCustomer(false); setCustomerDraft((selectedOrder as any)?.customer_name ?? ""); }}
                      style={{
                        padding: `${spacing.xs}px ${spacing.md}px`,
                        fontSize: fontSize.xs,
                        fontWeight: 600,
                        backgroundColor: colors.buttonSecondary,
                        color: colors.buttonSecondaryText,
                        border: `1px solid ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div
                  onClick={() => setEditingCustomer(true)}
                  style={{
                    fontSize: fontSize.sm,
                    color: (selectedOrder as any).customer_name ? colors.textPrimary : colors.textTertiary,
                    fontStyle: (selectedOrder as any).customer_name ? "normal" : "italic",
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    border: `1px dashed ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                  }}
                  title="Click to edit"
                >
                  {(selectedOrder as any).customer_name || "Click to add a customer name…"}
                </div>
              )}
            </div>

            {/* Editable notes */}
            <div style={{ marginBottom: spacing.md }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: 4 }}>
                Note
              </div>
              {editingNote ? (
                <>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    autoFocus
                    rows={2}
                    placeholder="Add a note about this order…"
                    style={{
                      width: "100%",
                      fontSize: fontSize.sm,
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.background,
                      color: colors.textPrimary,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: spacing.xs, marginTop: spacing.xs }}>
                    <button
                      onClick={() => selectedOrderId && saveNote.mutate({ id: selectedOrderId, notes: noteDraft.trim() })}
                      disabled={saveNote.isPending}
                      style={{
                        padding: `${spacing.xs}px ${spacing.md}px`,
                        fontSize: fontSize.xs,
                        fontWeight: 600,
                        backgroundColor: colors.primary,
                        color: colors.textOnPrimary,
                        border: "none",
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingNote(false); setNoteDraft(selectedOrder.notes ?? ""); }}
                      style={{
                        padding: `${spacing.xs}px ${spacing.md}px`,
                        fontSize: fontSize.xs,
                        fontWeight: 600,
                        backgroundColor: colors.buttonSecondary,
                        color: colors.buttonSecondaryText,
                        border: `1px solid ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div
                  onClick={() => setEditingNote(true)}
                  style={{
                    fontSize: fontSize.sm,
                    color: selectedOrder.notes ? colors.textPrimary : colors.textTertiary,
                    fontStyle: selectedOrder.notes ? "normal" : "italic",
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    border: `1px dashed ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                    whiteSpace: "pre-wrap",
                  }}
                  title="Click to edit"
                >
                  {selectedOrder.notes || "Click to add a note…"}
                </div>
              )}
            </div>

            {/* Items */}
            <div style={{ marginBottom: spacing.md }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
                Items
              </div>
              {selectedOrder.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: `${spacing.xs}px 0`,
                    borderBottom: `1px solid ${colors.border}`,
                    fontSize: fontSize.sm,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{item.product_name}</span>
                    <span style={{ color: colors.textTertiary, marginLeft: spacing.xs }}>
                      × {item.quantity}
                    </span>
                  </div>
                  <span style={{ fontWeight: 600 }}>��{item.total.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs, marginBottom: spacing.md }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: colors.textSecondary }}>
                <span>Subtotal</span>
                <span>₱{selectedOrder.subtotal.toFixed(2)}</span>
              </div>
              {selectedOrder.tax_amount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: colors.textSecondary }}>
                  <span>Tax</span>
                  <span>₱{selectedOrder.tax_amount.toFixed(2)}</span>
                </div>
              )}
              {selectedOrder.discount_amount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: colors.success }}>
                  <span>Discount</span>
                  <span>-₱{selectedOrder.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, borderTop: `2px solid ${colors.border}`, paddingTop: spacing.xs }}>
                <span>Total</span>
                <span>₱{selectedOrder.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment info */}
            {selectedOrder.payments.length > 0 && (
              <div>
                <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
                  Payment
                </div>
                {selectedOrder.payments.map((pay) => (
                  <div key={pay.id} style={{ fontSize: fontSize.sm, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ textTransform: "capitalize", color: colors.textSecondary }}>{pay.method}</span>
                      <span style={{ fontWeight: 600 }}>₱{pay.amount.toFixed(2)}</span>
                    </div>
                    {pay.change > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: colors.success }}>
                        <span>Change</span>
                        <span>₱{pay.change.toFixed(2)}</span>
                      </div>
                    )}
                    {(() => {
                      const refs = parseReceiptRefs(pay.reference);
                      if (refs.length === 0) return null;
                      return (
                        <div style={{ marginTop: spacing.xs, display: "flex", flexWrap: "wrap", gap: spacing.xs }}>
                          {refs.map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt={`Payment receipt ${i + 1}`}
                              style={{
                                maxWidth: refs.length === 1 ? "100%" : 150,
                                maxHeight: 300,
                                borderRadius: borderRadius.sm,
                                border: `1px solid ${colors.border}`,
                                cursor: "pointer",
                              }}
                              onClick={() => setViewImage(src)}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}

            {/* Edit / Delete order */}
            <div style={{ marginTop: spacing.lg, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md }}>
              <button
                onClick={() => setEditingOrderId(selectedOrder.id)}
                style={{
                  width: "100%", padding: `${spacing.xs}px`, fontSize: fontSize.sm, fontWeight: 600,
                  backgroundColor: colors.primary, color: colors.textOnPrimary,
                  border: "none", borderRadius: borderRadius.sm, cursor: "pointer",
                  marginBottom: spacing.sm,
                }}
              >
                Edit Order
              </button>
            </div>
            <div style={{ }}>
              {confirmDeleteId === selectedOrder.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
                  <span style={{ fontSize: fontSize.sm, color: colors.error, fontWeight: 600 }}>
                    Delete this transaction?
                  </span>
                  <div style={{ display: "flex", gap: spacing.sm }}>
                    <button
                      onClick={() => deleteOrder.mutate(selectedOrder.id)}
                      style={{
                        flex: 1, padding: `${spacing.xs}px`, fontSize: fontSize.sm, fontWeight: 700,
                        backgroundColor: colors.error, color: "#fff", border: "none",
                        borderRadius: borderRadius.sm, cursor: "pointer",
                      }}
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{
                        flex: 1, padding: `${spacing.xs}px`, fontSize: fontSize.sm, fontWeight: 600,
                        backgroundColor: colors.surfaceElevated, color: colors.textSecondary,
                        border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(selectedOrder.id)}
                  style={{
                    width: "100%", padding: `${spacing.xs}px`, fontSize: fontSize.sm, fontWeight: 600,
                    backgroundColor: "transparent", color: colors.error,
                    border: `1px solid ${colors.error}`, borderRadius: borderRadius.sm, cursor: "pointer",
                  }}
                >
                  Delete Transaction
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {viewImage && <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />}

      {editingOrderId && (
        <EditOrderModal
          orderId={editingOrderId}
          onClose={() => {
            setEditingOrderId(null);
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["today-stats"] });
            if (selectedOrderId) queryClient.invalidateQueries({ queryKey: ["order-detail", selectedOrderId] });
          }}
        />
      )}
      {showChat && <ChatPanel page="history" />}
    </div>
  );
}
