import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../../hooks/use-theme";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const { colors, borderRadius, fontSize, fontWeight } = useTheme();

  const sizeStyles: Record<ButtonSize, { height: number; px: number; fs: number }> = {
    sm: { height: 36, px: 12, fs: fontSize.sm },
    md: { height: 48, px: 16, fs: fontSize.md },
    lg: { height: 56, px: 24, fs: fontSize.lg },
  };

  const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
    primary: { bg: colors.buttonPrimary, text: colors.textOnPrimary },
    secondary: { bg: colors.buttonSecondary, text: colors.buttonSecondaryText },
    destructive: { bg: colors.buttonDestructive, text: colors.textOnPrimary },
    ghost: { bg: "transparent", text: colors.textPrimary },
  };

  const s = sizeStyles[size];
  const v = variantStyles[variant];

  const containerStyle: ViewStyle = {
    height: s.height,
    paddingHorizontal: s.px,
    backgroundColor: disabled ? colors.surfaceElevated : v.bg,
    borderRadius: borderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    ...(fullWidth && { width: "100%" }),
    ...(variant === "ghost" && {
      borderWidth: 1,
      borderColor: colors.border,
    }),
  };

  const textStyle: TextStyle = {
    fontSize: s.fs,
    fontWeight: fontWeight.semibold,
    color: disabled ? colors.textTertiary : v.text,
  };

  return (
    <TouchableOpacity
      style={[containerStyle, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
