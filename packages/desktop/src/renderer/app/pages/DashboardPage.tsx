import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { orderRepo, ingredientRepo } from "../../lib/repositories";

export function DashboardPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => orderRepo.getTodayStats(),
  });

  const { data: todayOrders = [] } = useQuery({
    queryKey: ["orders", "today"],
    queryFn: () => orderRepo.getToday(),
  });

  const { data: lowStockItems = [] } = useQuery({
    queryKey: ["ingredients", "lowStock"],
    queryFn: () => ingredientRepo.getLowStock(),
  });

  // Derive recent completed orders and active (pending/held) orders
  const recentOrders = todayOrders
    .filter((o) => o.status === "completed")
    .slice(0, 5);

  const activeOrders = todayOrders.filter(
    (o) => o.status === "pending" || o.status === "held"
  );

  const kpiData = {
    totalSales: stats?.total_revenue ?? 0,
    orderCount: stats?.total_orders ?? 0,
    averageOrder: stats?.average_order ?? 0,
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const containerStyle: React.CSSProperties = {
    padding: spacing.lg,
    display: "flex",
    flexDirection: "column",
    gap: spacing.lg,
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
  };

  const headerStyle: React.CSSProperties = {
    fontSize: fontSize["3xl"],
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  };

  const kpiRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: spacing.md,
  };

  const kpiCardStyle = (accentColor: string): React.CSSProperties => ({
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeft: `4px solid ${accentColor}`,
  });

  const kpiLabelStyle: React.CSSProperties = {
    fontSize: fontSize.sm,
    fontWeight: 600,
    color: colors.textSecondary,
    margin: 0,
  };

  const kpiValueStyle: React.CSSProperties = {
    fontSize: fontSize["4xl"],
    fontWeight: 700,
    color: colors.textPrimary,
    margin: `${spacing.xs}px 0 0 0`,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: fontSize.xl,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  };

  const gridTwoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: spacing.md,
  };

  const alertRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${spacing.sm}px 0`,
    borderBottom: `1px solid ${colors.border}`,
  };

  const stockBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.xs,
    fontWeight: 700,
    borderRadius: borderRadius.full,
    backgroundColor: colors.errorLight,
    color: colors.error,
  };

  const orderRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${spacing.sm}px 0`,
    borderBottom: `1px solid ${colors.border}`,
  };

  const statusBadge = (status: string): React.CSSProperties => {
    const isHeld = status === "held";
    return {
      display: "inline-block",
      padding: `${spacing.xs}px ${spacing.sm}px`,
      fontSize: fontSize.xs,
      fontWeight: 700,
      borderRadius: borderRadius.full,
      backgroundColor: isHeld ? colors.infoLight : colors.warningLight,
      color: isHeld ? colors.info : colors.warning,
      textTransform: "capitalize",
    };
  };

  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>Dashboard</h1>

      {/* KPI Cards */}
      <div style={kpiRowStyle}>
        <div style={kpiCardStyle(colors.success)}>
          <p style={kpiLabelStyle}>Total Sales Today</p>
          <p style={kpiValueStyle}>${kpiData.totalSales.toFixed(2)}</p>
        </div>
        <div style={kpiCardStyle(colors.primary)}>
          <p style={kpiLabelStyle}>Order Count</p>
          <p style={kpiValueStyle}>{kpiData.orderCount}</p>
        </div>
        <div style={kpiCardStyle(colors.accent)}>
          <p style={kpiLabelStyle}>Average Order</p>
          <p style={kpiValueStyle}>${kpiData.averageOrder.toFixed(2)}</p>
        </div>
      </div>

      {/* Two-column section */}
      <div style={gridTwoCol}>
        {/* Low Stock Alerts */}
        <div>
          <h2 style={{ ...sectionTitleStyle, marginBottom: spacing.sm }}>
            Low Stock Alerts
          </h2>
          <div style={cardStyle}>
            {lowStockItems.length === 0 ? (
              <p style={{ color: colors.textTertiary, fontSize: fontSize.md }}>
                All stock levels are healthy
              </p>
            ) : (
              lowStockItems.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    ...alertRowStyle,
                    borderBottom:
                      i === lowStockItems.length - 1
                        ? "none"
                        : alertRowStyle.borderBottom,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: 600,
                        color: colors.textPrimary,
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.textTertiary,
                      }}
                    >
                      Min: {item.min_stock}
                    </div>
                  </div>
                  <span style={stockBadgeStyle}>
                    {item.current_stock} left
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div>
          <h2 style={{ ...sectionTitleStyle, marginBottom: spacing.sm }}>
            Recent Orders
          </h2>
          <div style={cardStyle}>
            {recentOrders.length === 0 ? (
              <p style={{ color: colors.textTertiary, fontSize: fontSize.md }}>
                No completed orders today
              </p>
            ) : (
              recentOrders.map((order, i) => (
                <div
                  key={order.id}
                  style={{
                    ...orderRowStyle,
                    borderBottom:
                      i === recentOrders.length - 1
                        ? "none"
                        : orderRowStyle.borderBottom,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: 600,
                        color: colors.textPrimary,
                      }}
                    >
                      {order.order_number}
                    </div>
                    <div
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.textTertiary,
                      }}
                    >
                      {formatTime(order.created_at)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: 700,
                      color: colors.textPrimary,
                    }}
                  >
                    ${order.total.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Active Orders */}
      <div>
        <h2 style={{ ...sectionTitleStyle, marginBottom: spacing.sm }}>
          Active Orders
        </h2>
        <div style={cardStyle}>
          {activeOrders.length === 0 ? (
            <p style={{ color: colors.textTertiary, fontSize: fontSize.md }}>
              No active orders
            </p>
          ) : (
            activeOrders.map((order, i) => (
              <div
                key={order.id}
                style={{
                  ...orderRowStyle,
                  borderBottom:
                    i === activeOrders.length - 1
                      ? "none"
                      : orderRowStyle.borderBottom,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: 600,
                      color: colors.textPrimary,
                    }}
                  >
                    {order.order_number}
                  </div>
                  <div
                    style={{
                      fontSize: fontSize.xs,
                      color: colors.textTertiary,
                    }}
                  >
                    {formatTime(order.created_at)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.md,
                  }}
                >
                  <span style={statusBadge(order.status)}>
                    {order.status}
                  </span>
                  <span
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: 700,
                      color: colors.textPrimary,
                    }}
                  >
                    ${order.total.toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
