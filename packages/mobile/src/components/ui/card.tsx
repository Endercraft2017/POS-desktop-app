import React, { type ReactNode } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "../../hooks/use-theme";

type CardProps = {
  children: ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
};

export function Card({ children, style, elevated = false }: CardProps) {
  const { colors, borderRadius, spacing } = useTheme();

  const cardStyle: ViewStyle = {
    backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return <View style={[cardStyle, style]}>{children}</View>;
}
