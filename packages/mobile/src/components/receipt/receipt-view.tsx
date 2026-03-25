import React from "react";
import { View, Text, type ViewStyle, type TextStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";
import type { OrderWithItems } from "@pos/core/types";

type ReceiptViewProps = {
  order: OrderWithItems;
  businessName?: string;
  footerMessage?: string;
};

export function ReceiptView({
  order,
  businessName = "My Business",
  footerMessage = "Thank you for your purchase!",
}: ReceiptViewProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const container: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  };

  const center: TextStyle = {
    textAlign: "center",
  };

  const mono: TextStyle = {
    fontFamily: "monospace",
  };

  const divider: ViewStyle = {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderStyle: "dashed",
    marginVertical: spacing.sm,
  };

  const row: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  };

  const labelText: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    ...mono,
  };

  const valueText: TextStyle = {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    ...mono,
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const paymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: "Cash",
      card: "Card",
      mobile_pay: "Mobile Pay",
      gift_card: "Gift Card",
      store_credit: "Store Credit",
      other: "Other",
    };
    return labels[method] || method;
  };

  return (
    <View style={container}>
      {/* Header */}
      <Text
        style={{
          ...center,
          fontSize: fontSize.xl,
          fontWeight: fontWeight.bold,
          color: colors.textPrimary,
          ...mono,
        }}
      >
        {businessName}
      </Text>
      <Text
        style={{
          ...center,
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          marginTop: spacing.xs,
          ...mono,
        }}
      >
        {formatDate(order.createdAt)} {formatTime(order.createdAt)}
      </Text>
      <Text
        style={{
          ...center,
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          ...mono,
        }}
      >
        Order #{order.orderNumber}
      </Text>
      {order.employee && (
        <Text
          style={{
            ...center,
            fontSize: fontSize.xs,
            color: colors.textTertiary,
            ...mono,
          }}
        >
          Served by: {order.employee.name}
        </Text>
      )}

      <View style={divider} />

      {/* Items */}
      {order.items.map((item, idx) => (
        <View key={idx}>
          <View style={row}>
            <Text
              style={{
                fontSize: fontSize.sm,
                color: colors.textPrimary,
                flex: 1,
                ...mono,
              }}
              numberOfLines={1}
            >
              {item.productName}
            </Text>
            <Text style={valueText}>${item.total.toFixed(2)}</Text>
          </View>
          <Text
            style={{
              fontSize: fontSize.xs,
              color: colors.textTertiary,
              paddingLeft: spacing.md,
              ...mono,
            }}
          >
            {item.quantity} x ${item.unitPrice.toFixed(2)}
          </Text>
        </View>
      ))}

      <View style={divider} />

      {/* Totals */}
      <View style={row}>
        <Text style={labelText}>Subtotal</Text>
        <Text style={valueText}>${order.subtotal.toFixed(2)}</Text>
      </View>

      {order.taxAmount > 0 && (
        <View style={row}>
          <Text style={labelText}>Tax</Text>
          <Text style={valueText}>${order.taxAmount.toFixed(2)}</Text>
        </View>
      )}

      {order.discountAmount > 0 && (
        <View style={row}>
          <Text style={labelText}>Discount</Text>
          <Text style={{ ...valueText, color: colors.success }}>
            -${order.discountAmount.toFixed(2)}
          </Text>
        </View>
      )}

      <View style={divider} />

      <View style={row}>
        <Text
          style={{
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: colors.textPrimary,
            ...mono,
          }}
        >
          TOTAL
        </Text>
        <Text
          style={{
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: colors.textPrimary,
            ...mono,
          }}
        >
          ${order.total.toFixed(2)}
        </Text>
      </View>

      <View style={divider} />

      {/* Payments */}
      {order.payments.map((payment, idx) => (
        <View key={idx} style={row}>
          <Text style={labelText}>{paymentMethodLabel(payment.method)}</Text>
          <Text style={valueText}>${payment.amount.toFixed(2)}</Text>
        </View>
      ))}

      {order.payments.some((p) => p.method === "cash" && (p.change ?? 0) > 0) && (
        <View style={row}>
          <Text style={labelText}>Change</Text>
          <Text style={valueText}>
            $
            {order.payments
              .filter((p) => p.method === "cash")
              .reduce((sum, p) => sum + (p.change ?? 0), 0)
              .toFixed(2)}
          </Text>
        </View>
      )}

      <View style={divider} />

      {/* Footer */}
      <Text
        style={{
          ...center,
          fontSize: fontSize.xs,
          color: colors.textTertiary,
          marginTop: spacing.sm,
          ...mono,
        }}
      >
        {footerMessage}
      </Text>
    </View>
  );
}
