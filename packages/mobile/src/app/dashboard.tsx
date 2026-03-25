import React from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import { useTodayStats, useTodayOrders } from "../hooks/use-orders";
import { useLowStockIngredients } from "../hooks/use-ingredients";
import { Card } from "../components/ui";

export default function DashboardScreen() {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const { data: stats, isLoading: statsLoading } = useTodayStats();
  const { data: todayOrders } = useTodayOrders();
  const { data: lowStock } = useLowStockIngredients();

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    padding: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const title: TextStyle = {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const subtitle: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const statsRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  };

  const statCard: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.lg,
  };

  const statValue: TextStyle = {
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.bold,
    color: colors.primary,
  };

  const statLabel: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  };

  const orderRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const statusDot = (status: string): ViewStyle => {
    const colorMap: Record<string, string> = {
      pending: colors.warning,
      held: colors.info,
      completed: colors.success,
      cancelled: colors.error,
      refunded: colors.error,
    };
    return {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colorMap[status] || colors.textTertiary,
      marginRight: spacing.sm,
    };
  };

  const lowStockItem: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (statsLoading) {
    return (
      <View style={[container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const completedOrders = todayOrders?.filter((o) => o.status === "completed") ?? [];
  const pendingOrders = todayOrders?.filter((o) => o.status === "pending" || o.status === "held") ?? [];

  return (
    <ScrollView style={container}>
      <View style={header}>
        <Text style={title}>Dashboard</Text>
        <Text style={subtitle}>{today}</Text>
      </View>

      {/* KPI Stats */}
      <View style={statsRow}>
        <Card style={statCard}>
          <Text style={statValue}>${(stats?.totalSales ?? 0).toFixed(2)}</Text>
          <Text style={statLabel}>Total Sales</Text>
        </Card>
        <Card style={statCard}>
          <Text style={statValue}>{stats?.orderCount ?? 0}</Text>
          <Text style={statLabel}>Orders</Text>
        </Card>
        <Card style={statCard}>
          <Text style={statValue}>${(stats?.averageOrder ?? 0).toFixed(2)}</Text>
          <Text style={statLabel}>Avg Order</Text>
        </Card>
      </View>

      {/* Low Stock Alerts */}
      {lowStock && lowStock.length > 0 && (
        <>
          <Text style={sectionTitle}>Low Stock Alerts</Text>
          <Card style={{ marginHorizontal: spacing.md }}>
            {lowStock.map((ingredient) => (
              <View key={ingredient.id} style={lowStockItem}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.error,
                      marginRight: spacing.sm,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.medium,
                      color: colors.textPrimary,
                    }}
                  >
                    {ingredient.name}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.error,
                    fontWeight: fontWeight.medium,
                  }}
                >
                  {ingredient.currentStock} / {ingredient.minStock} {ingredient.unit}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Pending/Held Orders */}
      {pendingOrders.length > 0 && (
        <>
          <Text style={sectionTitle}>
            Active Orders ({pendingOrders.length})
          </Text>
          <Card style={{ marginHorizontal: spacing.md }}>
            {pendingOrders.map((order) => (
              <View key={order.id} style={orderRow}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={statusDot(order.status)} />
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.medium,
                      color: colors.textPrimary,
                    }}
                  >
                    #{order.orderNumber}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.semibold,
                      color: colors.textPrimary,
                    }}
                  >
                    ${order.total.toFixed(2)}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.xs,
                      color: colors.textTertiary,
                      textTransform: "capitalize",
                    }}
                  >
                    {order.status}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Recent Completed */}
      <Text style={sectionTitle}>
        Recent Sales ({completedOrders.length})
      </Text>
      <Card style={{ marginHorizontal: spacing.md, marginBottom: spacing["2xl"] }}>
        {completedOrders.length === 0 ? (
          <Text
            style={{
              fontSize: fontSize.md,
              color: colors.textTertiary,
              textAlign: "center",
              paddingVertical: spacing.lg,
            }}
          >
            No completed sales today
          </Text>
        ) : (
          completedOrders.slice(0, 10).map((order) => (
            <View key={order.id} style={orderRow}>
              <View>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.medium,
                    color: colors.textPrimary,
                  }}
                >
                  #{order.orderNumber}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
                  {new Date(order.completedAt || order.createdAt).toLocaleTimeString(
                    [],
                    { hour: "2-digit", minute: "2-digit" }
                  )}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  color: colors.success,
                }}
              >
                ${order.total.toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}
