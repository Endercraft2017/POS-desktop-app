import React from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useOrder, useUpdateOrderStatus } from "../hooks/use-orders";
import { Button, Card } from "../components/ui";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const { data: order, isLoading } = useOrder(id ?? "");
  const updateStatus = useUpdateOrderStatus();

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

  const handleStatusChange = (
    newStatus: "pending" | "held" | "completed" | "cancelled" | "refunded",
    label: string
  ) => {
    Alert.alert(
      `${label} Order`,
      `Are you sure you want to ${label.toLowerCase()} this order?`,
      [
        { text: "No", style: "cancel" },
        {
          text: `Yes, ${label}`,
          style: newStatus === "cancelled" || newStatus === "refunded" ? "destructive" : "default",
          onPress: () => {
            updateStatus.mutate(
              { id: id!, status: newStatus },
              {
                onSuccess: () => {
                  Alert.alert("Success", `Order has been ${newStatus}.`);
                },
              }
            );
          },
        },
      ]
    );
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const scrollContent: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
  };

  const loadingContainer: ViewStyle = {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const headerRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  };

  const orderNumberText: TextStyle = {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const statusBadge = (status: string): ViewStyle => {
    const sc = getStatusColor(status);
    return {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: sc.bg,
    };
  };

  const statusTextStyle = (status: string): TextStyle => {
    const sc = getStatusColor(status);
    return {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: sc.text,
      textTransform: "capitalize",
    };
  };

  const infoRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  };

  const infoLabel: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  };

  const infoValue: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const itemRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const itemName: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    flex: 1,
  };

  const itemQty: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginRight: spacing.md,
  };

  const itemPrice: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const totalRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
    marginTop: spacing.sm,
  };

  const totalLabel: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const totalValue: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.primary,
  };

  const paymentRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const paymentMethod: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    textTransform: "capitalize",
  };

  const paymentAmount: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.success,
  };

  const receiptBox: ViewStyle = {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  };

  const receiptLine: TextStyle = {
    fontSize: fontSize.sm,
    fontFamily: "monospace",
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 20,
  };

  const actionRow: ViewStyle = {
    gap: spacing.sm,
    marginBottom: spacing["2xl"],
  };

  if (isLoading) {
    return (
      <View style={loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={loadingContainer}>
        <Text
          style={{
            fontSize: fontSize.lg,
            color: colors.textTertiary,
          }}
        >
          Order not found.
        </Text>
        <Button
          title="Go Back"
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  const receiptItems = order.items ?? [];
  const receiptPayments = order.payments ?? [];

  return (
    <View style={container}>
      <ScrollView contentContainerStyle={scrollContent}>
        {/* Order Header */}
        <Card>
          <View style={headerRow}>
            <Text style={orderNumberText}>#{order.orderNumber}</Text>
            <View style={statusBadge(order.status)}>
              <Text style={statusTextStyle(order.status)}>{order.status}</Text>
            </View>
          </View>
          <View style={infoRow}>
            <Text style={infoLabel}>Date</Text>
            <Text style={infoValue}>{formatDateTime(order.createdAt)}</Text>
          </View>
          {order.employeeId && (
            <View style={infoRow}>
              <Text style={infoLabel}>Employee</Text>
              <Text style={infoValue}>{order.employeeId}</Text>
            </View>
          )}
          {order.completedAt && (
            <View style={infoRow}>
              <Text style={infoLabel}>Completed</Text>
              <Text style={infoValue}>{formatDateTime(order.completedAt)}</Text>
            </View>
          )}
          {order.notes && (
            <View style={infoRow}>
              <Text style={infoLabel}>Notes</Text>
              <Text style={infoValue}>{order.notes}</Text>
            </View>
          )}
        </Card>

        {/* Items */}
        <Card>
          <Text style={sectionTitle}>Items</Text>
          {receiptItems.map((item: any) => (
            <View key={item.id} style={itemRow}>
              <Text style={itemName}>
                {item.product?.name ?? item.productName}
              </Text>
              <Text style={itemQty}>x{item.quantity}</Text>
              <Text style={itemPrice}>${item.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={infoRow}>
            <Text style={infoLabel}>Subtotal</Text>
            <Text style={infoValue}>${order.subtotal.toFixed(2)}</Text>
          </View>
          {order.taxAmount > 0 && (
            <View style={infoRow}>
              <Text style={infoLabel}>Tax</Text>
              <Text style={infoValue}>${order.taxAmount.toFixed(2)}</Text>
            </View>
          )}
          {order.discountAmount > 0 && (
            <View style={infoRow}>
              <Text style={infoLabel}>Discount</Text>
              <Text style={{ ...infoValue, color: colors.success }}>
                -${order.discountAmount.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={totalRow}>
            <Text style={totalLabel}>Total</Text>
            <Text style={totalValue}>${order.total.toFixed(2)}</Text>
          </View>
        </Card>

        {/* Payments */}
        {receiptPayments.length > 0 && (
          <Card>
            <Text style={sectionTitle}>Payments</Text>
            {receiptPayments.map((payment: any) => (
              <View key={payment.id} style={paymentRow}>
                <View>
                  <Text style={paymentMethod}>
                    {payment.method.replace("_", " ")}
                  </Text>
                  {payment.reference && (
                    <Text
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.textTertiary,
                      }}
                    >
                      Ref: {payment.reference}
                    </Text>
                  )}
                </View>
                <Text style={paymentAmount}>
                  ${payment.amount.toFixed(2)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Receipt Preview */}
        <Card>
          <Text style={sectionTitle}>Receipt Preview</Text>
          <View style={receiptBox}>
            <Text style={receiptLine}>================================</Text>
            <Text style={{ ...receiptLine, fontWeight: fontWeight.bold }}>
              RECEIPT
            </Text>
            <Text style={receiptLine}>================================</Text>
            <Text style={receiptLine}>Order: #{order.orderNumber}</Text>
            <Text style={receiptLine}>{formatDateTime(order.createdAt)}</Text>
            <Text style={receiptLine}>--------------------------------</Text>
            {receiptItems.map((item: any) => (
              <Text key={item.id} style={receiptLine}>
                {item.quantity}x {item.product?.name ?? item.productName}
                {"  "}${item.total.toFixed(2)}
              </Text>
            ))}
            <Text style={receiptLine}>--------------------------------</Text>
            <Text style={receiptLine}>
              Subtotal: ${order.subtotal.toFixed(2)}
            </Text>
            {order.taxAmount > 0 && (
              <Text style={receiptLine}>
                Tax: ${order.taxAmount.toFixed(2)}
              </Text>
            )}
            {order.discountAmount > 0 && (
              <Text style={receiptLine}>
                Discount: -${order.discountAmount.toFixed(2)}
              </Text>
            )}
            <Text style={{ ...receiptLine, fontWeight: fontWeight.bold }}>
              TOTAL: ${order.total.toFixed(2)}
            </Text>
            {receiptPayments.length > 0 && (
              <>
                <Text style={receiptLine}>--------------------------------</Text>
                {receiptPayments.map((p: any) => (
                  <Text key={p.id} style={receiptLine}>
                    Paid ({p.method.replace("_", " ")}): ${p.amount.toFixed(2)}
                  </Text>
                ))}
              </>
            )}
            <Text style={receiptLine}>================================</Text>
            <Text style={receiptLine}>Thank you!</Text>
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={actionRow}>
          {order.status === "pending" && (
            <>
              <Button
                title="Complete Order"
                onPress={() => handleStatusChange("completed", "Complete")}
                fullWidth
                loading={updateStatus.isPending}
              />
              <Button
                title="Hold Order"
                variant="secondary"
                onPress={() => handleStatusChange("held", "Hold")}
                fullWidth
              />
              <Button
                title="Cancel Order"
                variant="destructive"
                onPress={() => handleStatusChange("cancelled", "Cancel")}
                fullWidth
              />
            </>
          )}

          {order.status === "held" && (
            <>
              <Button
                title="Resume Order"
                onPress={() => handleStatusChange("pending", "Resume")}
                fullWidth
                loading={updateStatus.isPending}
              />
              <Button
                title="Cancel Order"
                variant="destructive"
                onPress={() => handleStatusChange("cancelled", "Cancel")}
                fullWidth
              />
            </>
          )}

          {order.status === "completed" && (
            <Button
              title="Refund Order"
              variant="destructive"
              onPress={() => handleStatusChange("refunded", "Refund")}
              fullWidth
              loading={updateStatus.isPending}
            />
          )}

          <Button
            title="Back to Orders"
            variant="ghost"
            onPress={() => router.back()}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}
