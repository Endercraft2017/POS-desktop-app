import React from "react";
import { View, Text, TouchableOpacity, type ViewStyle, type TextStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";
import type { CartItem } from "@pos/core/types";

type CartItemRowProps = {
  item: CartItem;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
};

export function CartItemRow({
  item,
  onIncrement,
  onDecrement,
  onRemove,
}: CartItemRowProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const nameStyle: TextStyle = {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const qtyContainer: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  };

  const qtyButton: ViewStyle = {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  };

  const qtyText: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  };

  const totalStyle: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    minWidth: 60,
    textAlign: "right",
  };

  const removeButton: ViewStyle = {
    paddingLeft: spacing.sm,
  };

  return (
    <View style={rowStyle}>
      <Text style={nameStyle} numberOfLines={1}>
        {item.productName}
      </Text>
      <View style={qtyContainer}>
        <TouchableOpacity style={qtyButton} onPress={onDecrement}>
          <Text style={{ color: colors.textPrimary, fontSize: 18 }}>-</Text>
        </TouchableOpacity>
        <Text style={qtyText}>{item.quantity}</Text>
        <TouchableOpacity style={qtyButton} onPress={onIncrement}>
          <Text style={{ color: colors.textPrimary, fontSize: 18 }}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={totalStyle}>${item.total.toFixed(2)}</Text>
      <TouchableOpacity style={removeButton} onPress={onRemove}>
        <Text style={{ color: colors.error, fontSize: fontSize.lg }}>X</Text>
      </TouchableOpacity>
    </View>
  );
}
