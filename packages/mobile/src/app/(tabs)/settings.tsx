import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/use-theme";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useAuthStore } from "../../stores/auth-store";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const { currentEmployee, logout } = useAuthStore();

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    padding: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const title: TextStyle = {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: fontSize.xs,
  };

  const menuItem: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const menuLabel: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const menuValue: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textTertiary,
  };

  const infoRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  };

  const label: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  };

  const value: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const menuItems = [
    {
      section: "Business Tools",
      items: [
        { label: "Dashboard & Reports", route: "/dashboard" },
        { label: "Advanced Reports", route: "/reports" },
        { label: "Sales Forecast", route: "/forecast" },
        { label: "End of Day (Z Report)", route: "/z-report" },
        { label: "Operational Expenses", route: "/expenses" },
      ],
    },
    {
      section: "Sales & Customers",
      items: [
        { label: "Customers", route: "/customers" },
        { label: "Coupons & Promotions", route: "/coupons" },
        { label: "Loyalty Program", route: "/loyalty" },
        { label: "Barcode Scanner", route: "/barcode" },
      ],
    },
    {
      section: "Inventory",
      items: [
        { label: "Categories", route: "/categories" },
        { label: "Ingredients", route: "/ingredients" },
        { label: "Stock Adjustments", route: "/stock-adjustments" },
        { label: "Suppliers", route: "/suppliers" },
        { label: "Purchase Orders", route: "/purchase-orders" },
      ],
    },
    {
      section: "Configuration",
      items: [
        { label: "Tax Rates", route: "/tax-rates" },
        { label: "Employees", route: "/employees" },
        { label: "Backup & Export", route: "/backup" },
      ],
    },
  ];

  return (
    <ScrollView style={container}>
      <View style={header}>
        <Text style={title}>Settings</Text>
      </View>

      {/* Current Session */}
      <Text style={sectionTitle}>Current Session</Text>
      <Card style={{ marginHorizontal: spacing.md }}>
        <View style={infoRow}>
          <Text style={label}>Employee</Text>
          <Text style={value}>{currentEmployee?.name || "Not logged in"}</Text>
        </View>
        <View style={infoRow}>
          <Text style={label}>Role</Text>
          <Text
            style={{
              ...value,
              color:
                currentEmployee?.role === "admin"
                  ? colors.error
                  : currentEmployee?.role === "manager"
                  ? colors.warning
                  : colors.info,
              textTransform: "capitalize",
            }}
          >
            {currentEmployee?.role || "—"}
          </Text>
        </View>
      </Card>

      {/* Menu Sections */}
      {menuItems.map((section) => (
        <React.Fragment key={section.section}>
          <Text style={sectionTitle}>{section.section}</Text>
          <Card style={{ marginHorizontal: spacing.md, padding: 0 }}>
            {section.items.map((item, idx) => (
              <TouchableOpacity
                key={item.route}
                style={{
                  ...menuItem,
                  ...(idx === section.items.length - 1 && {
                    borderBottomWidth: 0,
                  }),
                }}
                onPress={() => router.push(item.route as any)}
              >
                <Text style={menuLabel}>{item.label}</Text>
                <Text style={menuValue}>→</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </React.Fragment>
      ))}

      {/* System Info */}
      <Text style={sectionTitle}>System</Text>
      <Card style={{ marginHorizontal: spacing.md }}>
        <View style={infoRow}>
          <Text style={label}>Database</Text>
          <Text style={value}>Local (SQLite)</Text>
        </View>
        <View style={infoRow}>
          <Text style={label}>Sync Status</Text>
          <Text style={{ ...value, color: colors.textTertiary }}>Local only</Text>
        </View>
        <View style={infoRow}>
          <Text style={label}>Version</Text>
          <Text style={value}>1.0.0</Text>
        </View>
      </Card>

      {/* Sign Out */}
      <View style={{ padding: spacing.md, paddingBottom: spacing["2xl"] }}>
        <Button
          title="Sign Out"
          onPress={handleLogout}
          variant="destructive"
          fullWidth
        />
      </View>
    </ScrollView>
  );
}
