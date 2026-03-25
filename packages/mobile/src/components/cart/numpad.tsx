import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../../hooks/use-theme";

type NumpadProps = {
  value: string;
  onChange: (value: string) => void;
  maxDecimals?: number;
};

export function Numpad({ value, onChange, maxDecimals = 2 }: NumpadProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const handlePress = (key: string) => {
    if (key === "backspace") {
      onChange(value.length > 0 ? value.slice(0, -1) : "");
      return;
    }

    if (key === ".") {
      if (value.includes(".")) return;
      onChange(value.length === 0 ? "0." : value + ".");
      return;
    }

    // Prevent leading zeros (except "0.")
    if (value === "0" && key !== ".") {
      onChange(key);
      return;
    }

    // Enforce max decimal places
    const decimalIndex = value.indexOf(".");
    if (decimalIndex !== -1) {
      const decimals = value.length - decimalIndex - 1;
      if (decimals >= maxDecimals) return;
    }

    onChange(value + key);
  };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "backspace"],
  ];

  const displayStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: "flex-end",
  };

  const displayText: TextStyle = {
    fontSize: fontSize["5xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const gridStyle: ViewStyle = {
    gap: spacing.sm,
  };

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  };

  const keyStyle: ViewStyle = {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  };

  const keyText: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const displayValue = value.length === 0 ? "0" : value;
  const formattedDisplay = displayValue.includes(".")
    ? "$" + displayValue
    : "$" + displayValue;

  return (
    <View>
      <View style={displayStyle}>
        <Text style={displayText}>{formattedDisplay}</Text>
      </View>
      <View style={gridStyle}>
        {keys.map((row, rowIndex) => (
          <View key={rowIndex} style={rowStyle}>
            {row.map((key) => (
              <TouchableOpacity
                key={key}
                style={keyStyle}
                onPress={() => handlePress(key)}
                activeOpacity={0.6}
              >
                <Text style={keyText}>
                  {key === "backspace" ? "\u232B" : key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
