import React from "react";
import { View, Text, TouchableOpacity, type ViewStyle, type TextStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";
import { Card } from "../ui/card";
import type { Product } from "@pos/core/types";

type ProductListItemProps = {
  product: Product;
  categoryName: string | null;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onToggleActive: (product: Product) => void;
};

export function ProductListItem({
  product,
  categoryName,
  onEdit,
  onDelete,
  onToggleActive,
}: ProductListItemProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const infoContainer: ViewStyle = {
    flex: 1,
    marginRight: spacing.sm,
  };

  const nameStyle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const skuStyle: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  };

  const detailRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    gap: spacing.sm,
  };

  const priceStyle: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  };

  const categoryStyle: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  };

  const badgeStyle: ViewStyle = {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: product.isActive ? colors.successLight : colors.errorLight,
  };

  const badgeTextStyle: TextStyle = {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: product.isActive ? colors.success : colors.error,
  };

  const actionsRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  };

  const actionButton = (bg: string): ViewStyle => ({
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: bg,
  });

  const actionText = (color: string): TextStyle => ({
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color,
  });

  return (
    <Card style={{ marginBottom: spacing.sm, opacity: product.isActive ? 1 : 0.75 }}>
      <View style={rowStyle}>
        <View style={infoContainer}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={nameStyle}>{product.name}</Text>
            <View style={badgeStyle}>
              <Text style={badgeTextStyle}>
                {product.isActive ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
          {product.sku ? <Text style={skuStyle}>SKU: {product.sku}</Text> : null}
          <View style={detailRow}>
            <Text style={priceStyle}>${product.price.toFixed(2)}</Text>
            {categoryName ? (
              <Text style={categoryStyle}>{categoryName}</Text>
            ) : null}
          </View>
        </View>

        <View style={actionsRow}>
          <TouchableOpacity
            style={actionButton(colors.primaryLight)}
            onPress={() => onEdit(product)}
            activeOpacity={0.7}
          >
            <Text style={actionText(colors.primary)}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={actionButton(product.isActive ? colors.warningLight : colors.successLight)}
            onPress={() => onToggleActive(product)}
            activeOpacity={0.7}
          >
            <Text style={actionText(product.isActive ? colors.warning : colors.success)}>
              {product.isActive ? "Deactivate" : "Activate"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={actionButton(colors.errorLight)}
            onPress={() => onDelete(product)}
            activeOpacity={0.7}
          >
            <Text style={actionText(colors.error)}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
}
