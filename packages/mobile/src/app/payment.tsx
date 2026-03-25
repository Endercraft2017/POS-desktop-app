import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useCartStore } from "../stores/cart-store";
import { useAuthStore } from "../stores/auth-store";
import { useCreateOrder, useAddPayment } from "../hooks/use-orders";
import { Button, Card, Input } from "../components/ui";
import { Numpad } from "../components/cart/numpad";

type PaymentMethod = "cash" | "card" | "mobile_pay" | "other";

type SplitPayment = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
};

export default function PaymentScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const { cart, clear: clearCart } = useCartStore();
  const { currentEmployee } = useAuthStore();
  const createOrder = useCreateOrder();
  const addPayment = useAddPayment();

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [reference, setReference] = useState("");
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const totalPaid = useMemo(
    () => splitPayments.reduce((sum, p) => sum + p.amount, 0),
    [splitPayments]
  );

  const remaining = useMemo(
    () => Math.max(0, cart.total - totalPaid),
    [cart.total, totalPaid]
  );

  const cashAmount = parseFloat(cashInput) || 0;
  const changeAmount = useMemo(() => {
    if (selectedMethod !== "cash") return 0;
    const effectiveAmount = cashAmount;
    return Math.max(0, effectiveAmount - remaining);
  }, [cashAmount, remaining, selectedMethod]);

  const quickAmounts = [5, 10, 20, 50, 100];

  const handleQuickAmount = (amount: number) => {
    setCashInput(amount.toFixed(2));
  };

  const handleExactAmount = () => {
    setCashInput(remaining.toFixed(2));
  };

  const handleAddSplitPayment = () => {
    const amount = selectedMethod === "cash" ? Math.min(cashAmount, remaining) : remaining;
    if (amount <= 0) return;

    const payment: SplitPayment = {
      method: selectedMethod,
      amount,
      reference: reference || undefined,
    };

    setSplitPayments((prev) => [...prev, payment]);
    setCashInput("");
    setReference("");
  };

  const handleRemoveSplit = (index: number) => {
    setSplitPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCompleteSale = async () => {
    if (cart.items.length === 0) {
      Alert.alert("Error", "No items in cart.");
      return;
    }

    // Determine final payments
    let finalPayments: SplitPayment[];
    if (splitPayments.length > 0 && totalPaid >= cart.total) {
      finalPayments = splitPayments;
    } else if (splitPayments.length > 0 && remaining > 0) {
      // Add the current entry to cover remaining
      const currentAmount =
        selectedMethod === "cash" ? cashAmount : remaining;
      if (currentAmount < remaining) {
        Alert.alert("Error", "Payment amount does not cover the remaining balance.");
        return;
      }
      finalPayments = [
        ...splitPayments,
        {
          method: selectedMethod,
          amount: remaining,
          reference: reference || undefined,
        },
      ];
    } else {
      // Single payment
      const currentAmount =
        selectedMethod === "cash" ? cashAmount : cart.total;
      if (currentAmount < cart.total) {
        Alert.alert("Error", "Payment amount does not cover the total.");
        return;
      }
      finalPayments = [
        {
          method: selectedMethod,
          amount: cart.total,
          reference: reference || undefined,
        },
      ];
    }

    setIsProcessing(true);
    try {
      const order = await createOrder.mutateAsync({
        data: {
          subtotal: cart.subtotal,
          taxAmount: cart.taxAmount,
          discountAmount: cart.discountAmount,
          total: cart.total,
          discountType:
            cart.discountType !== "none" ? cart.discountType : undefined,
          discountValue: cart.discountValue || undefined,
          employeeId: currentEmployee?.id,
        },
        items: cart.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          discountAmount: item.discountAmount,
          total: item.total,
        })),
      });

      for (const payment of finalPayments) {
        await addPayment.mutateAsync({
          orderId: order.id,
          method: payment.method,
          amount: payment.amount,
          reference: payment.reference,
        });
      }

      clearCart();
      Alert.alert("Sale Complete", "The order has been processed successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert("Error", "Failed to process payment. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const methodLabels: Record<PaymentMethod, string> = {
    cash: "Cash",
    card: "Card",
    mobile_pay: "Mobile Pay",
    other: "Other",
  };

  const canComplete =
    splitPayments.length > 0
      ? totalPaid >= cart.total ||
        (selectedMethod === "cash"
          ? cashAmount >= remaining
          : remaining <= 0)
      : selectedMethod === "cash"
      ? cashAmount >= cart.total
      : true;

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const scrollContent: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
  };

  const headerText: TextStyle = {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const summaryRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  };

  const summaryLabel: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  };

  const summaryValue: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const totalRow: ViewStyle = {
    ...summaryRow,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
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

  const methodRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  };

  const methodButton = (isActive: boolean): ViewStyle => ({
    flex: 1,
    minWidth: 80,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
    borderWidth: 1,
    borderColor: isActive ? colors.primary : colors.border,
    alignItems: "center",
  });

  const methodText = (isActive: boolean): TextStyle => ({
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: isActive ? colors.textOnPrimary : colors.textPrimary,
  });

  const quickRow: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  };

  const quickButton: ViewStyle = {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const quickText: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const changeRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: changeAmount > 0 ? colors.successLight : colors.surfaceElevated,
    borderRadius: borderRadius.md,
  };

  const changeLabel: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: changeAmount > 0 ? colors.success : colors.textSecondary,
  };

  const changeValue: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: changeAmount > 0 ? colors.success : colors.textSecondary,
  };

  const splitRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const splitLabel: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  };

  const splitAmount: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.success,
  };

  const remainingBadge: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: remaining > 0 ? colors.warningLight : colors.successLight,
    borderRadius: borderRadius.md,
  };

  const remainingText: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: remaining > 0 ? colors.warning : colors.success,
  };

  return (
    <View style={container}>
      <ScrollView contentContainerStyle={scrollContent}>
        <Text style={headerText}>Payment</Text>

        {/* Order Summary */}
        <Card>
          <Text
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
              color: colors.textPrimary,
              marginBottom: spacing.sm,
            }}
          >
            Order Summary
          </Text>
          {cart.items.map((item) => (
            <View key={item.productId} style={summaryRow}>
              <Text style={summaryLabel}>
                {item.quantity}x {item.productName}
              </Text>
              <Text style={summaryValue}>${item.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={summaryRow}>
            <Text style={summaryLabel}>Subtotal</Text>
            <Text style={summaryValue}>${cart.subtotal.toFixed(2)}</Text>
          </View>
          {cart.taxAmount > 0 && (
            <View style={summaryRow}>
              <Text style={summaryLabel}>Tax</Text>
              <Text style={summaryValue}>${cart.taxAmount.toFixed(2)}</Text>
            </View>
          )}
          {cart.discountAmount > 0 && (
            <View style={summaryRow}>
              <Text style={summaryLabel}>Discount</Text>
              <Text style={{ ...summaryValue, color: colors.success }}>
                -${cart.discountAmount.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={totalRow}>
            <Text style={totalLabel}>Total</Text>
            <Text style={totalValue}>${cart.total.toFixed(2)}</Text>
          </View>
        </Card>

        {/* Split Payments */}
        {splitPayments.length > 0 && (
          <Card>
            <Text
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold,
                color: colors.textPrimary,
                marginBottom: spacing.sm,
              }}
            >
              Split Payments
            </Text>
            {splitPayments.map((sp, idx) => (
              <View key={idx} style={splitRow}>
                <View>
                  <Text style={splitLabel}>{methodLabels[sp.method]}</Text>
                  {sp.reference && (
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: colors.textTertiary,
                      }}
                    >
                      Ref: {sp.reference}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={splitAmount}>${sp.amount.toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => handleRemoveSplit(idx)}>
                    <Text
                      style={{
                        fontSize: fontSize.lg,
                        color: colors.error,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      X
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={remainingBadge}>
              <Text style={remainingText}>Remaining</Text>
              <Text style={remainingText}>${remaining.toFixed(2)}</Text>
            </View>
          </Card>
        )}

        {/* Payment Method Selection */}
        {remaining > 0 && (
          <>
            <Card>
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  color: colors.textPrimary,
                  marginBottom: spacing.md,
                }}
              >
                Payment Method
              </Text>
              <View style={methodRow}>
                {(
                  Object.keys(methodLabels) as PaymentMethod[]
                ).map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={methodButton(selectedMethod === method)}
                    onPress={() => {
                      setSelectedMethod(method);
                      setCashInput("");
                      setReference("");
                    }}
                  >
                    <Text style={methodText(selectedMethod === method)}>
                      {methodLabels[method]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            {/* Cash Payment */}
            {selectedMethod === "cash" && (
              <Card>
                <Text
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.md,
                  }}
                >
                  Amount Tendered
                </Text>
                <View style={quickRow}>
                  {quickAmounts.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={quickButton}
                      onPress={() => handleQuickAmount(amt)}
                    >
                      <Text style={quickText}>${amt}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={{
                      ...quickButton,
                      backgroundColor: colors.primaryLight,
                      borderColor: colors.primary,
                    }}
                    onPress={handleExactAmount}
                  >
                    <Text style={{ ...quickText, color: colors.primary }}>
                      Exact
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: spacing.md }}>
                  <Numpad value={cashInput} onChange={setCashInput} />
                </View>
                <View style={changeRow}>
                  <Text style={changeLabel}>Change Due</Text>
                  <Text style={changeValue}>${changeAmount.toFixed(2)}</Text>
                </View>
              </Card>
            )}

            {/* Card / Other Payment */}
            {(selectedMethod === "card" || selectedMethod === "other") && (
              <Card>
                <Text
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.md,
                  }}
                >
                  {selectedMethod === "card" ? "Card Payment" : "Other Payment"}
                </Text>
                <Input
                  label="Amount"
                  value={
                    splitPayments.length > 0
                      ? remaining.toFixed(2)
                      : cart.total.toFixed(2)
                  }
                  editable={false}
                  containerStyle={{ marginBottom: spacing.md }}
                />
                <Input
                  label={selectedMethod === "card" ? "Reference / Last 4 Digits" : "Note / Reference"}
                  placeholder="Optional reference..."
                  value={reference}
                  onChangeText={setReference}
                />
              </Card>
            )}

            {/* Mobile Pay */}
            {selectedMethod === "mobile_pay" && (
              <Card>
                <Text
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.md,
                  }}
                >
                  Mobile Pay
                </Text>
                <Input
                  label="Amount"
                  value={
                    splitPayments.length > 0
                      ? remaining.toFixed(2)
                      : cart.total.toFixed(2)
                  }
                  editable={false}
                  containerStyle={{ marginBottom: spacing.md }}
                />
                <Input
                  label="Reference / Transaction ID"
                  placeholder="Optional reference..."
                  value={reference}
                  onChangeText={setReference}
                />
              </Card>
            )}

            {/* Split Payment Button */}
            {splitPayments.length > 0 || remaining < cart.total ? null : null}
            <Button
              title="Add Split Payment"
              variant="ghost"
              onPress={handleAddSplitPayment}
              fullWidth
              disabled={
                selectedMethod === "cash"
                  ? cashAmount <= 0 || cashAmount >= remaining
                  : false
              }
            />
          </>
        )}

        {/* Complete Sale */}
        <Button
          title={
            isProcessing
              ? "Processing..."
              : `Complete Sale - $${cart.total.toFixed(2)}`
          }
          onPress={handleCompleteSale}
          size="lg"
          fullWidth
          loading={isProcessing}
          disabled={!canComplete || isProcessing || cart.items.length === 0}
          style={{ marginBottom: spacing["2xl"] }}
        />
      </ScrollView>
    </View>
  );
}
