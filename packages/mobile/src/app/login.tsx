import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { router } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useAuthStore } from "../stores/auth-store";
import { employeeRepository } from "../lib/repositories/employee-repository";

export default function LoginScreen() {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handlePinPress = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");

      // Auto-submit when PIN reaches 4+ digits
      if (newPin.length >= 4) {
        attemptLogin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  const attemptLogin = async (pinValue: string) => {
    setLoading(true);
    try {
      const employee = await employeeRepository.authenticate(pinValue);
      if (employee) {
        login(employee);
        router.replace("/(tabs)");
      } else {
        // Only show error after 6 digits or explicit submit
        if (pinValue.length >= 6) {
          setError("Invalid PIN");
          setPin("");
        }
      }
    } catch (e) {
      setError("Authentication error");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    attemptLogin(pin);
  };

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  };

  const title: TextStyle = {
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const subtitle: TextStyle = {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginBottom: spacing["2xl"],
  };

  const dotsContainer: ViewStyle = {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  };

  const dot: ViewStyle = {
    width: 16,
    height: 16,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.border,
  };

  const dotFilled: ViewStyle = {
    ...dot,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  };

  const numpadContainer: ViewStyle = {
    gap: spacing.sm,
  };

  const numpadRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
  };

  const numKey: ViewStyle = {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  };

  const numKeyText: TextStyle = {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const errorText: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.error,
    marginBottom: spacing.md,
    height: 20,
  };

  const hintText: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    textAlign: "center",
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "back"],
  ];

  return (
    <View style={container}>
      <Text style={title}>POS System</Text>
      <Text style={subtitle}>Enter your PIN</Text>

      <View style={dotsContainer}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={i < pin.length ? dotFilled : dot} />
        ))}
      </View>

      <Text style={errorText}>{error}</Text>

      <View style={numpadContainer}>
        {digits.map((row, rowIdx) => (
          <View key={rowIdx} style={numpadRow}>
            {row.map((key, keyIdx) => {
              if (key === "") {
                return <View key={keyIdx} style={{ width: 72, height: 72 }} />;
              }
              if (key === "back") {
                return (
                  <TouchableOpacity
                    key={keyIdx}
                    style={numKey}
                    onPress={handleBackspace}
                  >
                    <Text style={numKeyText}>←</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={keyIdx}
                  style={numKey}
                  onPress={() => handlePinPress(key)}
                  disabled={loading}
                >
                  <Text style={numKeyText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {pin.length >= 4 && (
        <TouchableOpacity
          style={{
            marginTop: spacing.lg,
            backgroundColor: colors.primary,
            paddingHorizontal: spacing["2xl"],
            paddingVertical: spacing.md,
            borderRadius: borderRadius.sm,
            opacity: loading ? 0.6 : 1,
          }}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text
            style={{
              color: colors.textOnPrimary,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={hintText}>Default admin PIN: 1234</Text>
    </View>
  );
}
