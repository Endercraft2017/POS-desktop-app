import React from "react";
import { View, Text, type ViewStyle, type TextStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";
import { Button } from "../ui/button";
import { CartItemRow } from "./cart-item-row";
import { useCartStore } from "../../stores/cart-store";

type CartSummaryProps = {
  onCheckout: () => void;
};

export function CartSummary({ onCheckout }: CartSummaryProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const { cart, updateQuantity, removeItem } = useCartStore();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const headerStyle: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
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

  const emptyStyle: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: spacing["2xl"],
  };

  return (
    <View style={containerStyle}>
      <Text style={headerStyle}>
        Current Order ({cart.items.length} items)
      </Text>

      {cart.items.length === 0 ? (
        <Text style={emptyStyle}>No items added yet</Text>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {cart.items.map((item) => (
              <CartItemRow
                key={item.productId}
                item={item}
                onIncrement={() =>
                  updateQuantity(item.productId, item.quantity + 1)
                }
                onDecrement={() =>
                  updateQuantity(item.productId, item.quantity - 1)
                }
                onRemove={() => removeItem(item.productId)}
              />
            ))}
          </View>

          <View style={{ marginTop: spacing.md }}>
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
          </View>

          <Button
            title={`Charge $${cart.total.toFixed(2)}`}
            onPress={onCheckout}
            size="lg"
            fullWidth
            style={{ marginTop: spacing.md }}
          />
        </>
      )}
    </View>
  );
}
