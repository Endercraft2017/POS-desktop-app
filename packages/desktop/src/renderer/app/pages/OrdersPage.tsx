import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTheme } from "../../hooks/use-theme";
import { useToday } from "../../hooks/use-today";
import { useAuthStore } from "../../stores/auth-store";
import { orderRepo } from "../../lib/repositories";
import type { OrderRow } from "../../lib/repositories";
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

type OrderStatus = "pending" | "held" | "completed" | "cancelled" | "refunded";

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Held", value: "held" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
];

export function OrdersPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const today = useToday();
  const { currentEmployee } = useAuthStore();
  const showChat = currentEmployee?.role === "admin";
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [customerDraft, setCustomerDraft] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ["orders", "today", today],
    queryFn: () => orderRepo.getToday(),
  });

  const { data: detail } = useQuery({
    queryKey: ["order-detail", detailId],
    queryFn: () => (detailId ? orderRepo.getById(detailId) : null),
    enabled: !!detailId,
  });

  // Reset the drafts whenever the selected order changes.
  useEffect(() => {
    setNoteDraft(detail?.notes ?? "");
    setEditingNote(false);
    setCustomerDraft((detail as any)?.customer_name ?? "");
    setEditingCustomer(false);
  }, [detailId, detail?.notes, (detail as any)?.customer_name]);

  const saveNote = useMutation({
    mutationFn: (vars: { id: string; notes: string }) => orderRepo.updateNotes(vars.id, vars.notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", detailId] });
      setEditingNote(false);
      performSync().catch(() => {});
    },
    onError: (err) => alert("Failed to save note: " + (err as Error).message),
  });

  const saveCustomer = useMutation({
    mutationFn: (vars: { id: string; name: string }) => orderRepo.updateCustomerName(vars.id, vars.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", detailId] });
      setEditingCustomer(false);
      performSync().catch(() => {});
    },
    onError: (err) => alert("Failed to save customer: " + (err as Error).message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      orderRepo.updateStatus(id, status),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "today"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await orderRepo.softDelete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "today"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      setSelectedIds(new Set());
      setConfirmBulk(false);
      setDetailId(null);
      performSync().catch(() => {});
    },
  });

  const filteredOrders = useMemo(() => {
    let out = activeTab === "all" ? orders : orders.filter((o) => o.status === activeTab);
    const q = search.trim().toLowerCase();
    if (q) {
      // If the query parses as a number, also match orders whose subtotal /
      // total starts with that number (lets cashier search "1349" or "13.50").
      const qNum = parseFloat(q);
      const isNumeric = !isNaN(qNum) && /^\d+(\.\d+)?$/.test(q);
      out = out.filter((o) => {
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
    }
    return out;
  }, [orders, activeTab, search]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredOrders.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
    getItemKey: (i) => filteredOrders[i]?.id ?? i,
  });

  // Arrow key navigation — changes the currently open detail modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingOrderId) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (filteredOrders.length === 0) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const idx = detailId ? filteredOrders.findIndex((o) => o.id === detailId) : -1;
      let nextIdx: number;
      if (idx === -1) {
        nextIdx = 0;
      } else if (e.key === "ArrowDown") {
        nextIdx = Math.min(idx + 1, filteredOrders.length - 1);
      } else {
        nextIdx = Math.max(idx - 1, 0);
      }
      const next = filteredOrders[nextIdx];
      if (next) {
        setDetailId(next.id);
        rowVirtualizer.scrollToIndex(nextIdx, { align: "auto" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredOrders, detailId, editingOrderId, rowVirtualizer]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusColor = (status: OrderStatus) => {
    switch (status) {
      case "pending": return { bg: colors.warningLight, text: colors.warning };
      case "held": return { bg: colors.infoLight, text: colors.info };
      case "completed": return { bg: colors.successLight, text: colors.success };
      case "cancelled": return { bg: colors.errorLight, text: colors.error };
      case "refunded": return { bg: colors.warningLight, text: colors.warning };
      default: return { bg: colors.surfaceElevated, text: colors.textSecondary };
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "2-digit", day: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    cursor: "pointer",
    minHeight: 30,
  });

  const badgeStyle = (status: OrderStatus): React.CSSProperties => {
    const sc = statusColor(status);
    return {
      display: "inline-block",
      padding: `2px ${spacing.sm}px`,
      fontSize: fontSize.xs,
      fontWeight: 700,
      borderRadius: borderRadius.full,
      backgroundColor: sc.bg,
      color: sc.text,
      textTransform: "capitalize",
    };
  };

  const rowBg = (id: string, status: OrderStatus) => {
    if (selectedIds.has(id)) return colors.primaryLight;
    if (hoveredRow === id) return colors.surfaceElevated;
    return colors.surface;
  };

  return (
    <div
      style={{
        padding: spacing.lg,
        display: "flex",
        flexDirection: "column",
        gap: spacing.md,
        height: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
        Orders
      </h1>

      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
        Left-click an order for details · Right-click to select for mass actions
      </div>

      <div style={{ display: "flex", gap: spacing.xs, flexShrink: 0, flexWrap: "wrap" }}>
        {STATUS_TABS.map((tab) => (
          <button key={tab.value} style={tabStyle(activeTab === tab.value)} onClick={() => setActiveTab(tab.value)}>
            {tab.label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order # or customer..."
          style={{
            flex: 1,
            minWidth: 180,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            outline: "none",
            minHeight: 30,
          }}
        />
      </div>

      <div ref={scrollRef} style={{ overflowY: "auto", flex: 1, position: "relative" }}>
        {filteredOrders.length === 0 ? (
          <p style={{ textAlign: "center", color: colors.textTertiary, fontSize: fontSize.md, marginTop: spacing.xl }}>
            No orders found
          </p>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const order = filteredOrders[vi.index];
              if (!order) return null;
              return (
                <div
                  key={vi.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={vi.index}
                  id={"orders-row-" + order.id}
                  onMouseEnter={() => setHoveredRow(order.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => setDetailId(order.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleSelect(order.id);
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                    backgroundColor: rowBg(order.id, order.status as OrderStatus),
                    border: selectedIds.has(order.id)
                      ? `2px solid ${colors.primary}`
                      : `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    marginBottom: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.md,
                    transition: "background-color 0.1s",
                    cursor: "pointer",
                    userSelect: "none",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: fontSize.md, fontWeight: 600, color: colors.textPrimary }}>
                      {order.order_number}
                    </div>
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                      {formatDate(order.created_at)}
                    </div>
                    {(order as any).employee_name && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 }}>
                        Cashier: {(order as any).employee_name}
                      </div>
                    )}
                    {(order as any).customer_name && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Customer: {(order as any).customer_name}
                      </div>
                    )}
                    {order.notes && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Note: {order.notes}
                      </div>
                    )}
                  </div>

                  <span style={badgeStyle(order.status as OrderStatus)}>{order.status}</span>

                  <span style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary, minWidth: 64, textAlign: "right" }}>
                    ₱{order.total.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk delete floating button */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: spacing.lg,
            right: spacing.lg,
            display: "flex",
            gap: spacing.sm,
            alignItems: "center",
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: `${spacing.sm}px ${spacing.md}px`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.xs,
              fontWeight: 600,
              backgroundColor: colors.surfaceElevated,
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
          {confirmBulk ? (
            <>
              <button
                onClick={() => deleteMutation.mutate(Array.from(selectedIds))}
                style={{
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 700,
                  backgroundColor: colors.error,
                  color: "#fff",
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmBulk(false)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  backgroundColor: "transparent",
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmBulk(true)}
              style={{
                padding: `${spacing.xs}px ${spacing.md}px`,
                fontSize: fontSize.sm,
                fontWeight: 700,
                backgroundColor: "transparent",
                color: colors.error,
                border: `1px solid ${colors.error}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
            >
              Delete Selected
            </button>
          )}
        </div>
      )}

      {/* Detail modal */}
      {detailId && (
        <div
          onClick={() => setDetailId(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
              padding: spacing.lg,
              width: "min(520px, 90vw)",
              maxHeight: "85vh",
              overflowY: "auto",
              border: `1px solid ${colors.border}`,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            {!detail ? (
              <div style={{ color: colors.textTertiary, textAlign: "center" }}>Loading…</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm }}>
                  <div>
                    <h2 style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
                      {detail.order_number}
                    </h2>
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                      {formatDate(detail.created_at)}
                    </div>
                  </div>
                  <span style={badgeStyle(detail.status as OrderStatus)}>{detail.status}</span>
                </div>

                {/* Editable customer name */}
                <div style={{ marginBottom: spacing.sm }}>
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
                          if (e.key === "Enter" && detailId) {
                            saveCustomer.mutate({ id: detailId, name: customerDraft.trim() });
                          } else if (e.key === "Escape") {
                            setEditingCustomer(false);
                            setCustomerDraft((detail as any)?.customer_name ?? "");
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
                          onClick={() => detailId && saveCustomer.mutate({ id: detailId, name: customerDraft.trim() })}
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
                          onClick={() => { setEditingCustomer(false); setCustomerDraft((detail as any)?.customer_name ?? ""); }}
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
                        color: (detail as any).customer_name ? colors.textPrimary : colors.textTertiary,
                        fontStyle: (detail as any).customer_name ? "normal" : "italic",
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        border: `1px dashed ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                      title="Click to edit"
                    >
                      {(detail as any).customer_name || "Click to add a customer name…"}
                    </div>
                  )}
                </div>

                {/* Editable notes */}
                <div style={{ marginBottom: spacing.sm }}>
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
                          onClick={() => detailId && saveNote.mutate({ id: detailId, notes: noteDraft.trim() })}
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
                          onClick={() => { setEditingNote(false); setNoteDraft(detail.notes ?? ""); }}
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
                        color: detail.notes ? colors.textPrimary : colors.textTertiary,
                        fontStyle: detail.notes ? "normal" : "italic",
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        border: `1px dashed ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                        whiteSpace: "pre-wrap",
                      }}
                      title="Click to edit"
                    >
                      {detail.notes || "Click to add a note…"}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
                  <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
                    Items
                  </div>
                  {detail.items.map((item) => (
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
                      <div style={{ color: colors.textPrimary }}>
                        <span style={{ fontWeight: 500 }}>{item.product_name}</span>
                        <span style={{ color: colors.textTertiary, marginLeft: spacing.xs }}>
                          × {item.quantity}
                        </span>
                      </div>
                      <span style={{ fontWeight: 600, color: colors.textPrimary }}>₱{item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs, marginBottom: spacing.md }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: colors.textSecondary }}>
                    <span>Subtotal</span>
                    <span>₱{detail.subtotal.toFixed(2)}</span>
                  </div>
                  {detail.tax_amount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: colors.textSecondary }}>
                      <span>Tax</span>
                      <span>₱{detail.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  {detail.discount_amount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: colors.success }}>
                      <span>Discount</span>
                      <span>-₱{detail.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, borderTop: `2px solid ${colors.border}`, paddingTop: spacing.xs }}>
                    <span>Total</span>
                    <span>₱{detail.total.toFixed(2)}</span>
                  </div>
                </div>

                {detail.payments.length > 0 && (
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
                      Payment
                    </div>
                    {detail.payments.map((pay) => (
                      <div key={pay.id} style={{ fontSize: fontSize.sm, display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ textTransform: "capitalize", color: colors.textSecondary }}>{pay.method}</span>
                          <span style={{ fontWeight: 600, color: colors.textPrimary }}>₱{pay.amount.toFixed(2)}</span>
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

                <div style={{ display: "flex", gap: spacing.sm, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md }}>
                  <button
                    onClick={() => setDetailId(null)}
                    style={{
                      flex: 1,
                      padding: `${spacing.xs}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                  {detail.status === "completed" && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "refunded" })}
                      style={{
                        flex: 1,
                        padding: `${spacing.xs}px`,
                        fontSize: fontSize.sm,
                        fontWeight: 600,
                        backgroundColor: colors.warning,
                        color: "#fff",
                        border: "none",
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                    >
                      Mark Refunded
                    </button>
                  )}
                  {detail.status === "pending" && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "held" })}
                      style={{
                        flex: 1,
                        padding: `${spacing.xs}px`,
                        fontSize: fontSize.sm,
                        fontWeight: 600,
                        backgroundColor: colors.info,
                        color: "#fff",
                        border: "none",
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                      }}
                    >
                      Hold
                    </button>
                  )}
                  <button
                    onClick={() => { setEditingOrderId(detail.id); setDetailId(null); }}
                    style={{
                      flex: 1,
                      padding: `${spacing.xs}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      backgroundColor: colors.primary,
                      color: colors.textOnPrimary,
                      border: "none",
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate([detail.id])}
                    style={{
                      flex: 1,
                      padding: `${spacing.xs}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 700,
                      backgroundColor: colors.error,
                      color: "#fff",
                      border: "none",
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewImage && <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />}

      {editingOrderId && (
        <EditOrderModal
          orderId={editingOrderId}
          onClose={() => {
            setEditingOrderId(null);
            queryClient.invalidateQueries({ queryKey: ["orders", "today"] });
            queryClient.invalidateQueries({ queryKey: ["order-detail", editingOrderId] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["today-stats"] });
          }}
        />
      )}
      {showChat && <ChatPanel page="orders" />}
    </div>
  );
}
