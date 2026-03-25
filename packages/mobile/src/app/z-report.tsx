import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import { useTodayOrders, useTodayStats } from "../hooks/use-orders";
import { Button, Card, Input } from "../components/ui";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function ZReportScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: todayOrders, isLoading: ordersLoading } = useTodayOrders();
  const { data: todayStats, isLoading: statsLoading } = useTodayStats();

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [openingBalance, setOpeningBalance] = useState("");
  const [actualCash, setActualCash] = useState("");

  const isLoading = ordersLoading || statsLoading;

  const orders: any[] = todayOrders ?? [];

  // Sales Summary
  const salesSummary = useMemo(() => {
    const completedOrders = orders.filter(
      (o: any) => o.status === "completed" || o.status === "refunded"
    );
    const totalSales = completedOrders.reduce(
      (sum: number, o: any) => sum + (o.total ?? 0),
      0
    );
    const orderCount = completedOrders.length;
    const avgOrder = orderCount > 0 ? totalSales / orderCount : 0;
    const itemsSold = completedOrders.reduce(
      (sum: number, o: any) =>
        sum + (o.items ?? []).reduce((s: number, i: any) => s + (i.quantity ?? 0), 0),
      0
    );
    return { totalSales, orderCount, avgOrder, itemsSold };
  }, [orders]);

  // Payment Method Breakdown
  const paymentBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    orders.forEach((o: any) => {
      if (o.status !== "completed" && o.status !== "refunded") return;
      (o.payments ?? []).forEach((p: any) => {
        const method = p.method ?? "other";
        breakdown[method] = (breakdown[method] ?? 0) + (p.amount ?? 0);
      });
    });
    return breakdown;
  }, [orders]);

  // Discounts & Refunds
  const discountsRefunds = useMemo(() => {
    const totalDiscounts = orders.reduce(
      (sum: number, o: any) => sum + (o.discountAmount ?? 0),
      0
    );
    const refundedOrders = orders.filter((o: any) => o.status === "refunded");
    const totalRefunds = refundedOrders.reduce(
      (sum: number, o: any) => sum + (o.total ?? 0),
      0
    );
    return { totalDiscounts, totalRefunds };
  }, [orders]);

  // Cash Drawer
  const cashDrawer = useMemo(() => {
    const opening = parseFloat(openingBalance) || 0;
    const cashPayments = paymentBreakdown["cash"] ?? 0;
    const expectedCash = opening + cashPayments;
    const actual = parseFloat(actualCash) || 0;
    const difference = actual - expectedCash;
    return { opening, cashPayments, expectedCash, actual, difference };
  }, [openingBalance, actualCash, paymentBreakdown]);

  // Top Selling Products
  const topProducts = useMemo(() => {
    const productMap: Record<string, { name: string; qty: number; total: number }> = {};
    orders.forEach((o: any) => {
      if (o.status !== "completed" && o.status !== "refunded") return;
      (o.items ?? []).forEach((item: any) => {
        const name = item.product?.name ?? item.productName ?? "Unknown";
        const key = item.productId ?? name;
        if (!productMap[key]) {
          productMap[key] = { name, qty: 0, total: 0 };
        }
        productMap[key].qty += item.quantity ?? 0;
        productMap[key].total += item.total ?? 0;
      });
    });
    return Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [orders]);

  // Employee Performance
  const employeePerformance = useMemo(() => {
    const empMap: Record<string, { id: string; orders: number; total: number }> = {};
    orders.forEach((o: any) => {
      if (o.status !== "completed" && o.status !== "refunded") return;
      const empId = o.employeeId ?? "Unknown";
      if (!empMap[empId]) {
        empMap[empId] = { id: empId, orders: 0, total: 0 };
      }
      empMap[empId].orders += 1;
      empMap[empId].total += o.total ?? 0;
    });
    return Object.values(empMap).sort((a, b) => b.total - a.total);
  }, [orders]);

  const handleCloseRegister = () => {
    Alert.alert(
      "Close Register",
      `Are you sure you want to close the register for ${selectedDate}?\n\nCash difference: ${formatCurrency(cashDrawer.difference)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Register",
          style: "destructive",
          onPress: () => {
            Alert.alert("Register Closed", "The register has been closed for the day.");
          },
        },
      ]
    );
  };

  const handleExportText = () => {
    const lines: string[] = [];
    lines.push("========================================");
    lines.push("              Z-REPORT");
    lines.push("========================================");
    lines.push(`Date: ${selectedDate}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push("");
    lines.push("--- SALES SUMMARY ---");
    lines.push(`Total Sales:     ${formatCurrency(salesSummary.totalSales)}`);
    lines.push(`Order Count:     ${salesSummary.orderCount}`);
    lines.push(`Average Order:   ${formatCurrency(salesSummary.avgOrder)}`);
    lines.push(`Items Sold:      ${salesSummary.itemsSold}`);
    lines.push("");
    lines.push("--- PAYMENT BREAKDOWN ---");
    Object.entries(paymentBreakdown).forEach(([method, amount]) => {
      const label = method.charAt(0).toUpperCase() + method.slice(1).replace("_", " ");
      lines.push(`${label.padEnd(17)}${formatCurrency(amount)}`);
    });
    lines.push("");
    lines.push("--- DISCOUNTS & REFUNDS ---");
    lines.push(`Total Discounts: ${formatCurrency(discountsRefunds.totalDiscounts)}`);
    lines.push(`Total Refunds:   ${formatCurrency(discountsRefunds.totalRefunds)}`);
    lines.push("");
    lines.push("--- CASH DRAWER ---");
    lines.push(`Opening Balance: ${formatCurrency(cashDrawer.opening)}`);
    lines.push(`Cash Sales:      ${formatCurrency(cashDrawer.cashPayments)}`);
    lines.push(`Expected Cash:   ${formatCurrency(cashDrawer.expectedCash)}`);
    lines.push(`Actual Cash:     ${formatCurrency(cashDrawer.actual)}`);
    lines.push(`Difference:      ${formatCurrency(cashDrawer.difference)}`);
    lines.push("");
    lines.push("--- TOP SELLING PRODUCTS ---");
    topProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name} - ${p.qty} sold (${formatCurrency(p.total)})`);
    });
    lines.push("");
    lines.push("--- EMPLOYEE PERFORMANCE ---");
    employeePerformance.forEach((e) => {
      lines.push(`${e.id}: ${e.orders} orders, ${formatCurrency(e.total)}`);
    });
    lines.push("========================================");

    const report = lines.join("\n");
    Alert.alert("Z-Report", report);
  };

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const scrollContent: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing["2xl"],
  };

  const headerTitle: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const statRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  };

  const statLabel: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  };

  const statValue: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const rankNumber: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
    width: 28,
  };

  const productRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const empRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={container}>
      <ScrollView contentContainerStyle={scrollContent}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={headerTitle}>Z-Report</Text>
          <TouchableOpacity
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: borderRadius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
            onPress={() => {
              // Date selector placeholder - in production, use a date picker
              Alert.alert("Date", `Current date: ${selectedDate}`);
            }}
          >
            <Text
              style={{
                fontSize: fontSize.md,
                color: colors.textPrimary,
                fontWeight: fontWeight.medium,
              }}
            >
              {selectedDate}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 1. Sales Summary */}
        <Card>
          <Text style={sectionTitle}>Sales Summary</Text>
          <View style={statRow}>
            <Text style={statLabel}>Total Sales</Text>
            <Text
              style={{
                ...statValue,
                fontSize: fontSize.xl,
                color: colors.primary,
              }}
            >
              {formatCurrency(salesSummary.totalSales)}
            </Text>
          </View>
          <View style={statRow}>
            <Text style={statLabel}>Order Count</Text>
            <Text style={statValue}>{salesSummary.orderCount}</Text>
          </View>
          <View style={statRow}>
            <Text style={statLabel}>Average Order</Text>
            <Text style={statValue}>{formatCurrency(salesSummary.avgOrder)}</Text>
          </View>
          <View style={statRow}>
            <Text style={statLabel}>Items Sold</Text>
            <Text style={statValue}>{salesSummary.itemsSold}</Text>
          </View>
        </Card>

        {/* 2. Payment Method Breakdown */}
        <Card>
          <Text style={sectionTitle}>Payment Breakdown</Text>
          {Object.keys(paymentBreakdown).length === 0 && (
            <Text
              style={{
                fontSize: fontSize.md,
                color: colors.textSecondary,
                textAlign: "center",
                paddingVertical: spacing.sm,
              }}
            >
              No payments recorded.
            </Text>
          )}
          {Object.entries(paymentBreakdown).map(([method, amount]) => (
            <View key={method} style={statRow}>
              <Text
                style={{
                  ...statLabel,
                  textTransform: "capitalize",
                }}
              >
                {method.replace("_", " ")}
              </Text>
              <Text style={statValue}>{formatCurrency(amount)}</Text>
            </View>
          ))}
        </Card>

        {/* 3. Discounts & Refunds */}
        <Card>
          <Text style={sectionTitle}>Discounts & Refunds</Text>
          <View style={statRow}>
            <Text style={statLabel}>Total Discounts</Text>
            <Text style={{ ...statValue, color: colors.warning }}>
              {formatCurrency(discountsRefunds.totalDiscounts)}
            </Text>
          </View>
          <View style={statRow}>
            <Text style={statLabel}>Total Refunds</Text>
            <Text style={{ ...statValue, color: colors.error }}>
              {formatCurrency(discountsRefunds.totalRefunds)}
            </Text>
          </View>
        </Card>

        {/* 4. Cash Drawer */}
        <Card>
          <Text style={sectionTitle}>Cash Drawer</Text>
          <Input
            label="Opening Balance ($)"
            value={openingBalance}
            onChangeText={(text) =>
              setOpeningBalance(text.replace(/[^0-9.]/g, ""))
            }
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <View style={{ height: spacing.sm }} />
          <View style={statRow}>
            <Text style={statLabel}>Cash Sales</Text>
            <Text style={statValue}>
              {formatCurrency(cashDrawer.cashPayments)}
            </Text>
          </View>
          <View style={statRow}>
            <Text style={statLabel}>Expected Cash</Text>
            <Text
              style={{
                ...statValue,
                fontWeight: fontWeight.bold,
              }}
            >
              {formatCurrency(cashDrawer.expectedCash)}
            </Text>
          </View>
          <View style={{ height: spacing.sm }} />
          <Input
            label="Actual Cash ($)"
            value={actualCash}
            onChangeText={(text) =>
              setActualCash(text.replace(/[^0-9.]/g, ""))
            }
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <View style={{ height: spacing.sm }} />
          <View
            style={{
              ...statRow,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              backgroundColor:
                cashDrawer.difference < 0
                  ? colors.errorLight
                  : cashDrawer.difference > 0
                  ? colors.successLight
                  : colors.surfaceElevated,
              borderRadius: borderRadius.sm,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.md,
                fontWeight: fontWeight.semibold,
                color: colors.textPrimary,
              }}
            >
              Difference
            </Text>
            <Text
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.bold,
                color:
                  cashDrawer.difference < 0
                    ? colors.error
                    : cashDrawer.difference > 0
                    ? colors.success
                    : colors.textPrimary,
              }}
            >
              {cashDrawer.difference >= 0 ? "+" : ""}
              {formatCurrency(cashDrawer.difference)}
            </Text>
          </View>
        </Card>

        {/* 5. Top Selling Products */}
        <Card>
          <Text style={sectionTitle}>Top Selling Products</Text>
          {topProducts.length === 0 && (
            <Text
              style={{
                fontSize: fontSize.md,
                color: colors.textSecondary,
                textAlign: "center",
                paddingVertical: spacing.sm,
              }}
            >
              No products sold today.
            </Text>
          )}
          {topProducts.map((product, index) => (
            <View key={`${product.name}-${index}`} style={productRow}>
              <Text style={rankNumber}>{index + 1}.</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.medium,
                    color: colors.textPrimary,
                  }}
                >
                  {product.name}
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textSecondary,
                  }}
                >
                  {product.qty} sold
                </Text>
              </View>
              <Text
                style={{
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.semibold,
                  color: colors.textPrimary,
                }}
              >
                {formatCurrency(product.total)}
              </Text>
            </View>
          ))}
        </Card>

        {/* 6. Employee Performance */}
        <Card>
          <Text style={sectionTitle}>Employee Performance</Text>
          {employeePerformance.length === 0 && (
            <Text
              style={{
                fontSize: fontSize.md,
                color: colors.textSecondary,
                textAlign: "center",
                paddingVertical: spacing.sm,
              }}
            >
              No employee data available.
            </Text>
          )}
          {employeePerformance.map((emp) => (
            <View key={emp.id} style={empRow}>
              <View>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.medium,
                    color: colors.textPrimary,
                  }}
                >
                  {emp.id}
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textSecondary,
                  }}
                >
                  {emp.orders} orders
                </Text>
              </View>
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.bold,
                  color: colors.primary,
                }}
              >
                {formatCurrency(emp.total)}
              </Text>
            </View>
          ))}
        </Card>

        {/* Action Buttons */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Button
            title="Close Register"
            onPress={handleCloseRegister}
            fullWidth
            variant="destructive"
          />
          <Button
            title="Export as Text"
            onPress={handleExportText}
            fullWidth
            variant="secondary"
          />
        </View>
      </ScrollView>
    </View>
  );
}
