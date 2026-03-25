import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { orderRepo } from "../../lib/repositories";
import type { OrderRow } from "../../lib/repositories";

type OrderStatus = "pending" | "held" | "completed" | "cancelled";

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Held", value: "held" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export function OrdersPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const queryClient = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ["orders", "today"],
    queryFn: () => orderRepo.getToday(),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      orderRepo.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const filteredOrders =
    activeTab === "all"
      ? orders
      : orders.filter((o) => o.status === activeTab);

  const handleHold = (orderId: string) => {
    updateStatusMutation.mutate({ id: orderId, status: "held" });
  };

  const handleCancel = (orderId: string) => {
    updateStatusMutation.mutate({ id: orderId, status: "cancelled" });
  };

  const statusColor = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return { bg: colors.warningLight, text: colors.warning };
      case "held":
        return { bg: colors.infoLight, text: colors.info };
      case "completed":
        return { bg: colors.successLight, text: colors.success };
      case "cancelled":
        return { bg: colors.errorLight, text: colors.error };
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const containerStyle: React.CSSProperties = {
    padding: spacing.lg,
    display: "flex",
    flexDirection: "column",
    gap: spacing.md,
    height: "100%",
    overflow: "hidden",
    boxSizing: "border-box",
  };

  const headerStyle: React.CSSProperties = {
    fontSize: fontSize["3xl"],
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  };

  const tabRowStyle: React.CSSProperties = {
    display: "flex",
    gap: spacing.sm,
    flexShrink: 0,
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.md,
    fontWeight: 600,
    border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    cursor: "pointer",
    minHeight: 40,
  });

  const listStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: spacing.sm,
    overflowY: "auto",
    flex: 1,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  };

  const badgeStyle = (status: OrderStatus): React.CSSProperties => {
    const sc = statusColor(status);
    return {
      display: "inline-block",
      padding: `${spacing.xs}px ${spacing.sm}px`,
      fontSize: fontSize.xs,
      fontWeight: 700,
      borderRadius: borderRadius.full,
      backgroundColor: sc.bg,
      color: sc.text,
      textTransform: "capitalize",
    };
  };

  const actionBtnStyle = (variant: "hold" | "cancel"): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    minHeight: 36,
    backgroundColor: variant === "hold" ? colors.info : colors.error,
    color: colors.textOnPrimary,
  });

  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>Orders</h1>

      <div style={tabRowStyle}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            style={tabStyle(activeTab === tab.value)}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={listStyle}>
        {filteredOrders.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: colors.textTertiary,
              fontSize: fontSize.md,
              marginTop: spacing.xl,
            }}
          >
            No orders found
          </p>
        )}
        {filteredOrders.map((order: OrderRow) => (
          <div key={order.id} style={cardStyle}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: 700,
                  color: colors.textPrimary,
                }}
              >
                {order.order_number}
              </div>
              <div
                style={{
                  fontSize: fontSize.sm,
                  color: colors.textSecondary,
                  marginTop: spacing.xs,
                }}
              >
                {formatDate(order.created_at)}
              </div>
            </div>

            <span style={badgeStyle(order.status as OrderStatus)}>{order.status}</span>

            <span
              style={{
                fontSize: fontSize.lg,
                fontWeight: 700,
                color: colors.textPrimary,
                minWidth: 72,
                textAlign: "right",
              }}
            >
              ${order.total.toFixed(2)}
            </span>

            <div style={{ display: "flex", gap: spacing.xs }}>
              {order.status === "pending" && (
                <>
                  <button
                    style={actionBtnStyle("hold")}
                    onClick={() => handleHold(order.id)}
                  >
                    Hold
                  </button>
                  <button
                    style={actionBtnStyle("cancel")}
                    onClick={() => handleCancel(order.id)}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
