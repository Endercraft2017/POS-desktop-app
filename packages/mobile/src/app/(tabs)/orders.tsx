import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/use-theme";
import {
  useTodayOrders,
  useOrdersByStatus,
  useUpdateOrderStatus,
} from "../../hooks/use-orders";
import { Card } from "../../components/ui";
import type { Order } from "@pos/core/types";

type StatusFilter = "all" | "pending" | "held" | "completed" | "cancelled";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "held", label: "Held" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function OrdersScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");

  const todayOrders = useTodayOrders();
  const filteredOrders = useOrdersByStatus(activeFilter === "all" ? "" : activeFilter);
  const updateStatus = useUpdateOrderStatus();

  const orders = useMemo(() => {
    if (activeFilter === "all") {
      return todayOrders.data ?? [];
    }
    return filteredOrders.data ?? [];
  }, [activeFilter, todayOrders.data, filteredOrders.data]);

  const isLoading =
    activeFilter === "all" ? todayOrders.isLoading : filteredOrders.isLoading;

  const handleOrderPress = (order: Order) => {
    router.push({ pathname: "/order-detail", params: { id: order.id } });
  };

  const handleHoldOrder = (order: Order) => {
    Alert.alert("Hold Order", `Hold order ${order.orderNumber}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Hold",
        onPress: () => updateStatus.mutate({ id: order.id, status: "held" }),
      },
    ]);
  };

  const handleCancelOrder = (order: Order) => {
    Alert.alert("Cancel Order", `Cancel order ${order.orderNumber}? This cannot be undone.`, [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: () => updateStatus.mutate({ id: order.id, status: "cancelled" }),
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return { bg: colors.warningLight, text: colors.warning };
      case "held":
        return { bg: colors.infoLight, text: colors.info };
      case "completed":
        return { bg: colors.successLight, text: colors.success };
      case "cancelled":
        return { bg: colors.errorLight, text: colors.error };
      case "refunded":
        return { bg: colors.errorLight, text: colors.error };
      default:
        return { bg: colors.surfaceElevated, text: colors.textSecondary };
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  };

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  };

  const headerText: TextStyle = {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  };

  const filterRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  };

  const filterTab = (isActive: boolean): ViewStyle => ({
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
    borderWidth: 1,
    borderColor: isActive ? colors.primary : colors.border,
  });

  const filterText = (isActive: boolean): TextStyle => ({
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: isActive ? colors.textOnPrimary : colors.textSecondary,
  });

  const orderCard: ViewStyle = {
    marginBottom: spacing.sm,
  };

  const orderHeader: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  };

  const orderNumber: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const statusBadge = (status: string): ViewStyle => {
    const sc = getStatusColor(status);
    return {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: sc.bg,
    };
  };

  const statusText = (status: string): TextStyle => {
    const sc = getStatusColor(status);
    return {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: sc.text,
      textTransform: "capitalize",
    };
  };

  const orderMeta: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  };

  const metaText: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  };

  const totalText: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  };

  const actionRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  };

  const actionButton = (color: string): ViewStyle => ({
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: color,
  });

  const actionText = (color: string): TextStyle => ({
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color,
  });

  const emptyContainer: ViewStyle = {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing["2xl"],
  };

  const emptyText: TextStyle = {
    fontSize: fontSize.lg,
    color: colors.textTertiary,
    textAlign: "center",
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity onPress={() => handleOrderPress(item)} activeOpacity={0.7}>
      <Card style={orderCard}>
        <View style={orderHeader}>
          <Text style={orderNumber}>#{item.orderNumber}</Text>
          <View style={statusBadge(item.status)}>
            <Text style={statusText(item.status)}>{item.status}</Text>
          </View>
        </View>

        <View style={orderMeta}>
          <Text style={metaText}>
            {formatDate(item.createdAt)} at {formatTime(item.createdAt)}
          </Text>
          <Text style={totalText}>${item.total.toFixed(2)}</Text>
        </View>

        {item.status === "pending" && (
          <View style={actionRow}>
            <TouchableOpacity
              style={actionButton(colors.info)}
              onPress={() => handleHoldOrder(item)}
            >
              <Text style={actionText(colors.info)}>Hold</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={actionButton(colors.error)}
              onPress={() => handleCancelOrder(item)}
            >
              <Text style={actionText(colors.error)}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={container}>
      <Text style={headerText}>Orders</Text>

      <View style={filterRow}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={filterTab(activeFilter === filter.key)}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Text style={filterText(activeFilter === filter.key)}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          ListEmptyComponent={
            <View style={emptyContainer}>
              <Text style={emptyText}>
                No orders found.{"\n"}
                {activeFilter !== "all"
                  ? `No ${activeFilter} orders today.`
                  : "Orders will appear here once sales are made."}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
