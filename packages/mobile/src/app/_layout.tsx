import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, type ViewStyle } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "../hooks/use-theme";
import { initializeDatabase } from "../lib/database";
import { employeeRepository } from "../lib/repositories/employee-repository";
import { settingsRepository } from "../lib/repositories/settings-repository";
import { setDeviceId } from "@pos/core/utils";
import { generateId } from "@pos/core/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    async function init() {
      await initializeDatabase();

      // Set device ID (persisted in settings, or generate new)
      const existingDeviceId = await settingsRepository.get("device_id");
      if (existingDeviceId) {
        setDeviceId(existingDeviceId);
      } else {
        const newDeviceId = generateId();
        setDeviceId(newDeviceId);
        await settingsRepository.set("device_id", newDeviceId, "system");
      }

      // Ensure default admin exists
      await employeeRepository.ensureDefaultAdmin();

      // Initialize default settings
      await settingsRepository.initializeDefaults();

      setDbReady(true);
    }
    init();
  }, []);

  if (!dbReady) {
    const loadingStyle: ViewStyle = {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    };
    return (
      <View style={loadingStyle}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="payment"
          options={{ title: "Payment", presentation: "modal" }}
        />
        <Stack.Screen
          name="order-detail"
          options={{ title: "Order Details" }}
        />
        <Stack.Screen
          name="categories"
          options={{ title: "Categories" }}
        />
        <Stack.Screen
          name="ingredients"
          options={{ title: "Ingredients" }}
        />
        <Stack.Screen
          name="suppliers"
          options={{ title: "Suppliers" }}
        />
        <Stack.Screen
          name="employees"
          options={{ title: "Employees" }}
        />
        <Stack.Screen
          name="tax-rates"
          options={{ title: "Tax Rates" }}
        />
        <Stack.Screen
          name="recipe"
          options={{ title: "Product Recipe" }}
        />
        <Stack.Screen
          name="dashboard"
          options={{ title: "Dashboard" }}
        />
        <Stack.Screen
          name="expenses"
          options={{ title: "Operational Expenses" }}
        />
        <Stack.Screen
          name="forecast"
          options={{ title: "Sales Forecast" }}
        />
        <Stack.Screen
          name="refund"
          options={{ title: "Process Refund" }}
        />
        <Stack.Screen
          name="stock-adjustments"
          options={{ title: "Stock Adjustments" }}
        />
        <Stack.Screen
          name="z-report"
          options={{ title: "End of Day Report" }}
        />
        <Stack.Screen
          name="customers"
          options={{ title: "Customers" }}
        />
        <Stack.Screen
          name="purchase-orders"
          options={{ title: "Purchase Orders" }}
        />
        <Stack.Screen
          name="coupons"
          options={{ title: "Coupons & Promotions" }}
        />
        <Stack.Screen
          name="loyalty"
          options={{ title: "Loyalty Program" }}
        />
        <Stack.Screen
          name="reports"
          options={{ title: "Advanced Reports" }}
        />
        <Stack.Screen
          name="backup"
          options={{ title: "Backup & Export" }}
        />
        <Stack.Screen
          name="barcode"
          options={{ title: "Barcode Scanner" }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
