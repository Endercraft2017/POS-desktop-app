import React from "react";
import { TouchableOpacity, Text, View, type ViewStyle, type TextStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";
import type { Product } from "@pos/core/types";

type ProductCardProps = {
  product: Product;
  categoryColor?: string;
  onPress: (product: Product) => void;
};

export function ProductCard({ product, categoryColor, onPress }: ProductCardProps) {
  const { colors, borderRadius, fontSize, fontWeight, spacing } = useTheme();

  const cardStyle: ViewStyle = {
    width: 110,
    height: 110,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "space-between",
    ...(categoryColor && {
      borderTopWidth: 3,
      borderTopColor: categoryColor,
    }),
  };

  const nameStyle: TextStyle = {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    numberOfLines: 2,
  };

  const priceStyle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  };

  const inactiveOverlay: ViewStyle = {
    ...(!product.isActive && {
      opacity: 0.5,
    }),
  };

  return (
    <TouchableOpacity
      style={[cardStyle, inactiveOverlay]}
      onPress={() => onPress(product)}
      activeOpacity={0.7}
      disabled={!product.isActive}
    >
      <Text style={nameStyle} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={priceStyle}>${product.price.toFixed(2)}</Text>
    </TouchableOpacity>
  );
}
