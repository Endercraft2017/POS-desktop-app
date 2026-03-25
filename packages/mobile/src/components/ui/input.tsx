import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from "react-native";
import { useTheme } from "../../hooks/use-theme";

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
};

export function Input({
  label,
  error,
  containerStyle,
  style,
  ...props
}: InputProps) {
  const { colors, borderRadius, fontSize, fontWeight, spacing } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const labelStyle: TextStyle = {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  };

  const inputStyle: ViewStyle & TextStyle = {
    height: 48,
    borderWidth: 1,
    borderColor: error
      ? colors.error
      : isFocused
      ? colors.primary
      : colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  };

  const errorStyle: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: spacing.xs,
  };

  return (
    <View style={containerStyle}>
      {label && <Text style={labelStyle}>{label}</Text>}
      <TextInput
        style={[inputStyle, style]}
        placeholderTextColor={colors.textTertiary}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      {error && <Text style={errorStyle}>{error}</Text>}
    </View>
  );
}
