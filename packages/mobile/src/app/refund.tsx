import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useOrder } from "../hooks/use-orders";
import { useCreateRefund } from "../hooks/use-refunds";
import { Button, Card, Input } from "../components/ui";

type RefundMethod = "cash" | "card" | "store_credit" | "original_method";

const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "store_credit", label: "Store Credit" },
  { value: "original_method", label: "Original Method" },
];

export default function RefundScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: order, isLoading } = useOrder(orderId ?? "");
  const createRefund = useCreateRefund();

  const [isFullRefund, setIsFullRefund] = useState(true);
  const [selectedItems, setSelectedItems] = useState<
    Record<string, { selected: boolean; quantity: number }>
  >({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("original_method");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [restockItems, setRestockItems] = useState(true);

  const orderItems: any[] = order?.items ?? [];

  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      const current = prev[itemId];
      if (current?.selected) {
        return { ...prev, [itemId]: { selected: false, quantity: 0 } };
      }
      return { ...prev, [itemId]: { selected: true, quantity: maxQty } };
    });
  };

  const setItemQuantity = (itemId: string, qty: number, maxQty: number) => {
    const clamped = Math.max(1, Math.min(qty, maxQty));
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { selected: true, quantity: clamped },
    }));
  };

  const refundTotal = useMemo(() => {
    if (!order) return 0;
    if (isFullRefund) return order.total;

    return orderItems.reduce((sum: number, item: any) => {
      const sel = selectedItems[item.id];
      if (!sel?.selected) return sum;
      const unitPrice = item.total / item.quantity;
      return sum + unitPrice * sel.quantity;
    }, 0);
  }, [isFullRefund, order, orderItems, selectedItems]);

  const handleSubmit = () => {
    if (!reason.trim()) {
      Alert.alert("Validation", "A reason for the refund is required.");
      return;
    }
    if (!isFullRefund) {
      const hasSelection = Object.values(selectedItems).some((s) => s.selected);
      if (!hasSelection) {
        Alert.alert("Validation", "Please select at least one item to refund.");
        return;
      }
    }

    const refundItems = isFullRefund
      ? orderItems.map((item: any) => ({
          orderItemId: item.id,
          quantity: item.quantity,
          amount: item.total,
        }))
      : orderItems
          .filter((item: any) => selectedItems[item.id]?.selected)
          .map((item: any) => {
            const sel = selectedItems[item.id];
            const unitPrice = item.total / item.quantity;
            return {
              orderItemId: item.id,
              quantity: sel.quantity,
              amount: unitPrice * sel.quantity,
            };
          });

    Alert.alert(
      "Confirm Refund",
      `Refund $${refundTotal.toFixed(2)} via ${REFUND_METHODS.find((m) => m.value === refundMethod)?.label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Refund",
          style: "destructive",
          onPress: () => {
            createRefund.mutate(
              {
                data: {
                  orderId: orderId!,
                  type: isFullRefund ? "full" : "partial",
                  totalAmount: refundTotal,
                  refundMethod,
                  reason: reason.trim(),
                  notes: notes.trim() || undefined,
                  restockItems,
                },
                items: refundItems,
              },
              {
                onSuccess: () => {
                  Alert.alert("Success", "Refund has been processed.", [
                    { text: "OK", onPress: () => router.back() },
                  ]);
                },
                onError: (err) => {
                  Alert.alert("Error", err.message || "Failed to process refund.");
                },
              }
            );
          },
        },
      ]
    );
  };

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const scrollContent: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing["2xl"],
  };

  const loadingContainer: ViewStyle = {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
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
  };

  const toggleRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  };

  const toggleLabel: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const chipRow: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  };

  const qtyControl: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  };

  const qtyButton: ViewStyle = {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  };

  const qtyButtonText: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const qtyText: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
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
        <Text style={{ fontSize: fontSize.lg, color: colors.textTertiary }}>
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

  return (
    <View style={container}>
      <ScrollView contentContainerStyle={scrollContent}>
        {/* Order Summary */}
        <Card>
          <Text style={sectionTitle}>Order Summary</Text>
          <View style={headerRow}>
            <Text
              style={{
                fontSize: fontSize["2xl"],
                fontWeight: fontWeight.bold,
                color: colors.textPrimary,
              }}
            >
              #{order.orderNumber}
            </Text>
            <Text
              style={{
                fontSize: fontSize["2xl"],
                fontWeight: fontWeight.bold,
                color: colors.primary,
              }}
            >
              ${order.total.toFixed(2)}
            </Text>
          </View>
          <View style={infoRow}>
            <Text style={infoLabel}>Items</Text>
            <Text style={infoValue}>{orderItems.length}</Text>
          </View>
          <View style={infoRow}>
            <Text style={infoLabel}>Status</Text>
            <Text style={{ ...infoValue, textTransform: "capitalize" }}>
              {order.status}
            </Text>
          </View>
        </Card>

        {/* Full vs Partial Toggle */}
        <Card>
          <Text style={sectionTitle}>Refund Type</Text>
          <View style={toggleRow}>
            <Text style={toggleLabel}>Full Refund</Text>
            <Switch
              value={isFullRefund}
              onValueChange={(val) => {
                setIsFullRefund(val);
                if (val) setSelectedItems({});
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          {isFullRefund && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
              All items will be refunded in full.
            </Text>
          )}
        </Card>

        {/* Partial Refund Item Selection */}
        {!isFullRefund && (
          <Card>
            <Text style={sectionTitle}>Select Items to Refund</Text>
            {orderItems.map((item: any) => {
              const sel = selectedItems[item.id];
              const isSelected = !!sel?.selected;
              const unitPrice = item.total / item.quantity;

              return (
                <View key={item.id} style={itemRow}>
                  <TouchableOpacity
                    onPress={() => toggleItem(item.id, item.quantity)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: borderRadius.sm,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected ? colors.primary : "transparent",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {isSelected && (
                      <Text
                        style={{
                          color: colors.textOnPrimary,
                          fontSize: fontSize.xs,
                          fontWeight: fontWeight.bold,
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: fontWeight.medium,
                        color: colors.textPrimary,
                      }}
                    >
                      {item.product?.name ?? item.productName}
                    </Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                      ${unitPrice.toFixed(2)} each (ordered: {item.quantity})
                    </Text>
                  </View>

                  {isSelected && (
                    <View style={qtyControl}>
                      <TouchableOpacity
                        style={qtyButton}
                        onPress={() =>
                          setItemQuantity(item.id, (sel?.quantity ?? 1) - 1, item.quantity)
                        }
                      >
                        <Text style={qtyButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={qtyText}>{sel?.quantity ?? 1}</Text>
                      <TouchableOpacity
                        style={qtyButton}
                        onPress={() =>
                          setItemQuantity(item.id, (sel?.quantity ?? 1) + 1, item.quantity)
                        }
                      >
                        <Text style={qtyButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {isSelected && (
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: fontWeight.semibold,
                        color: colors.error,
                        minWidth: 60,
                        textAlign: "right",
                      }}
                    >
                      ${(unitPrice * (sel?.quantity ?? 1)).toFixed(2)}
                    </Text>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        {/* Refund Method */}
        <Card>
          <Text style={sectionTitle}>Refund Method</Text>
          <View style={chipRow}>
            {REFUND_METHODS.map((method) => {
              const isSelected = refundMethod === method.value;
              return (
                <TouchableOpacity
                  key={method.value}
                  onPress={() => setRefundMethod(method.value)}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: borderRadius.full,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      color: isSelected ? colors.primary : colors.textPrimary,
                      fontWeight: isSelected ? fontWeight.semibold : fontWeight.regular,
                    }}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Reason & Notes */}
        <Card>
          <Text style={sectionTitle}>Details</Text>
          <Input
            label="Reason (required)"
            value={reason}
            onChangeText={setReason}
            placeholder="Why is this refund being processed?"
          />
          <View style={{ height: spacing.sm }} />
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes (optional)"
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: "top" }}
          />
        </Card>

        {/* Restock Toggle */}
        <Card>
          <View style={toggleRow}>
            <View>
              <Text style={toggleLabel}>Restock Items</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                Return items to inventory
              </Text>
            </View>
            <Switch
              value={restockItems}
              onValueChange={setRestockItems}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </Card>

        {/* Refund Total */}
        <Card
          style={{
            backgroundColor: colors.errorLight,
            borderColor: colors.error,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold,
                color: colors.textPrimary,
              }}
            >
              Total Refund Amount
            </Text>
            <Text
              style={{
                fontSize: fontSize["3xl"],
                fontWeight: fontWeight.bold,
                color: colors.error,
              }}
            >
              ${refundTotal.toFixed(2)}
            </Text>
          </View>
        </Card>

        {/* Actions */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Button
            title="Process Refund"
            onPress={handleSubmit}
            fullWidth
            variant="destructive"
            loading={createRefund.isPending}
          />
          <Button
            title="Cancel"
            onPress={() => router.back()}
            fullWidth
            variant="ghost"
          />
        </View>
      </ScrollView>
    </View>
  );
}
