import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import { useOrders, useTodayOrders, useTodayStats } from "../hooks/use-orders";
import { useProducts } from "../hooks/use-products";
import { useCategories } from "../hooks/use-categories";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type Period = "today" | "week" | "month" | "custom";
type ReportTab = "sales" | "products" | "categories" | "employees";

function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function ReportsScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: allOrders, isLoading: ordersLoading } = useOrders(500);
  const { data: todayOrders } = useTodayOrders();
  const { data: todayStats } = useTodayStats();
  const { data: products } = useProducts();
  const { data: categories } = useCategories();

  const [period, setPeriod] = useState<Period>("today");
  const [reportTab, setReportTab] = useState<ReportTab>("sales");
  const [customStart, setCustomStart] = useState(formatDate(new Date()));
  const [customEnd, setCustomEnd] = useState(formatDate(new Date()));

  const filteredOrders = useMemo(() => {
    if (period === "today" && todayOrders) {
      return todayOrders.filter((o: any) => o.status === "completed");
    }

    if (!allOrders) return [];

    const now = new Date();
    let startDate: Date;

    if (period === "week") {
      startDate = getStartOfWeek(now);
    } else if (period === "month") {
      startDate = getStartOfMonth(now);
    } else if (period === "custom") {
      startDate = new Date(customStart + "T00:00:00");
    } else {
      startDate = getStartOfDay(now);
    }

    const endDate = period === "custom" ? new Date(customEnd + "T23:59:59") : new Date();

    return allOrders.filter((order: any) => {
      if (order.status !== "completed") return false;
      const orderDate = new Date(order.createdAt);
      return orderDate >= startDate && orderDate <= endDate;
    });
  }, [period, allOrders, todayOrders, customStart, customEnd]);

  const salesData = useMemo(() => {
    const orders = filteredOrders || [];
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
    const totalCost = orders.reduce((sum: number, o: any) => {
      if (!o.items) return sum;
      return sum + o.items.reduce((iSum: number, item: any) => {
        const product = products?.find((p: any) => p.id === item.productId);
        return iSum + ((product?.costPrice || 0) * (item.quantity || 1));
      }, 0);
    }, 0);
    const grossProfit = totalRevenue - totalCost;
    const taxAmount = orders.reduce((sum: number, o: any) => sum + (o.taxAmount || 0), 0);
    const discountAmount = orders.reduce((sum: number, o: any) => sum + (o.discountAmount || 0), 0);
    const netProfit = grossProfit - taxAmount;
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    return { totalRevenue, totalCost, grossProfit, netProfit, taxAmount, discountAmount, orderCount, avgOrderValue };
  }, [filteredOrders, products]);

  const productData = useMemo(() => {
    const orders = filteredOrders || [];
    const productMap: Record<string, { name: string; qtySold: number; revenue: number; cost: number }> = {};

    for (const order of orders) {
      if (!order.items) continue;
      for (const item of order.items) {
        const key = item.productId || item.productName;
        if (!productMap[key]) {
          const product = products?.find((p: any) => p.id === item.productId);
          productMap[key] = {
            name: item.productName || product?.name || "Unknown",
            qtySold: 0,
            revenue: 0,
            cost: 0,
          };
        }
        productMap[key].qtySold += item.quantity || 1;
        productMap[key].revenue += item.total || 0;
        const product = products?.find((p: any) => p.id === item.productId);
        productMap[key].cost += (product?.costPrice || 0) * (item.quantity || 1);
      }
    }

    return Object.values(productMap)
      .map((p) => ({
        ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, products]);

  const categoryData = useMemo(() => {
    const orders = filteredOrders || [];
    const catMap: Record<string, { name: string; revenue: number; orderCount: number }> = {};

    for (const order of orders) {
      if (!order.items) continue;
      for (const item of order.items) {
        const product = products?.find((p: any) => p.id === item.productId);
        const catId = product?.categoryId || "uncategorized";
        const category = categories?.find((c: any) => c.id === catId);
        if (!catMap[catId]) {
          catMap[catId] = {
            name: category?.name || "Uncategorized",
            revenue: 0,
            orderCount: 0,
          };
        }
        catMap[catId].revenue += item.total || 0;
        catMap[catId].orderCount += 1;
      }
    }

    return Object.values(catMap).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, products, categories]);

  const employeeData = useMemo(() => {
    const orders = filteredOrders || [];
    const empMap: Record<string, { name: string; orderCount: number; totalSales: number }> = {};

    for (const order of orders) {
      const empId = order.employeeId || "unassigned";
      if (!empMap[empId]) {
        empMap[empId] = {
          name: empId === "unassigned" ? "Unassigned" : (order.employeeName || empId),
          orderCount: 0,
          totalSales: 0,
        };
      }
      empMap[empId].orderCount += 1;
      empMap[empId].totalSales += order.total || 0;
    }

    return Object.values(empMap).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredOrders]);

  const exportCSV = () => {
    let csv = "";

    if (reportTab === "sales") {
      csv = "Metric,Value\n";
      csv += `Total Revenue,${salesData.totalRevenue.toFixed(2)}\n`;
      csv += `Total Cost,${salesData.totalCost.toFixed(2)}\n`;
      csv += `Gross Profit,${salesData.grossProfit.toFixed(2)}\n`;
      csv += `Net Profit,${salesData.netProfit.toFixed(2)}\n`;
      csv += `Order Count,${salesData.orderCount}\n`;
      csv += `Avg Order Value,${salesData.avgOrderValue.toFixed(2)}\n`;
    } else if (reportTab === "products") {
      csv = "Product,Qty Sold,Revenue,Cost,Profit,Margin %\n";
      for (const p of productData) {
        csv += `"${p.name}",${p.qtySold},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${p.margin.toFixed(1)}\n`;
      }
    } else if (reportTab === "categories") {
      csv = "Category,Revenue,Items Sold\n";
      for (const c of categoryData) {
        csv += `"${c.name}",${c.revenue.toFixed(2)},${c.orderCount}\n`;
      }
    } else if (reportTab === "employees") {
      csv = "Employee,Order Count,Total Sales\n";
      for (const e of employeeData) {
        csv += `"${e.name}",${e.orderCount},${e.totalSales.toFixed(2)}\n`;
      }
    }

    Alert.alert("CSV Export", csv || "No data to export.", [{ text: "OK" }]);
  };

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    padding: spacing.md,
  };

  const headerTitle: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const periodRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  };

  const periodChip = (active: boolean): ViewStyle => ({
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: active ? colors.primary : colors.surfaceElevated,
    borderWidth: 1,
    borderColor: active ? colors.primary : colors.border,
  });

  const periodChipText = (active: boolean): TextStyle => ({
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: active ? colors.textOnPrimary : colors.textSecondary,
  });

  const tabBar: ViewStyle = {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  };

  const tabStyle = (isActive: boolean): ViewStyle => ({
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: "center",
    borderRadius: borderRadius.sm,
    backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
    borderWidth: isActive ? 0 : 1,
    borderColor: colors.border,
  });

  const tabTextStyle = (isActive: boolean): TextStyle => ({
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: isActive ? colors.textOnPrimary : colors.textSecondary,
  });

  const statCard: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  };

  const statItem: ViewStyle = {
    width: "47%" as any,
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const statLabel: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  };

  const statValue: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  };

  const tableHeader: ViewStyle = {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  };

  const tableRow: ViewStyle = {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const thText: TextStyle = {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  };

  const tdText: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  };

  const customDateRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  };

  if (ordersLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Reports</Text>
        <View style={periodRow}>
          {(["today", "week", "month", "custom"] as Period[]).map((p) => (
            <TouchableOpacity key={p} style={periodChip(period === p)} onPress={() => setPeriod(p)}>
              <Text style={periodChipText(period === p)}>
                {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom Range"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {period === "custom" && (
          <View style={customDateRow}>
            <View style={{ flex: 1 }}>
              <Input
                label="Start Date"
                value={customStart}
                onChangeText={setCustomStart}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="End Date"
                value={customEnd}
                onChangeText={setCustomEnd}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
        )}
      </View>

      <View style={tabBar}>
        {(["sales", "products", "categories", "employees"] as ReportTab[]).map((tab) => (
          <TouchableOpacity key={tab} style={tabStyle(reportTab === tab)} onPress={() => setReportTab(tab)}>
            <Text style={tabTextStyle(reportTab === tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
        {reportTab === "sales" && (
          <View style={{ gap: spacing.md }}>
            <Card>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
                Sales Summary
              </Text>
              <View style={statCard}>
                <View style={statItem}>
                  <Text style={statLabel}>Total Revenue</Text>
                  <Text style={statValue}>{formatCurrency(salesData.totalRevenue)}</Text>
                </View>
                <View style={statItem}>
                  <Text style={statLabel}>Total Cost</Text>
                  <Text style={statValue}>{formatCurrency(salesData.totalCost)}</Text>
                </View>
                <View style={statItem}>
                  <Text style={statLabel}>Gross Profit</Text>
                  <Text style={[statValue, { color: salesData.grossProfit >= 0 ? colors.success : colors.error }]}>
                    {formatCurrency(salesData.grossProfit)}
                  </Text>
                </View>
                <View style={statItem}>
                  <Text style={statLabel}>Net Profit</Text>
                  <Text style={[statValue, { color: salesData.netProfit >= 0 ? colors.success : colors.error }]}>
                    {formatCurrency(salesData.netProfit)}
                  </Text>
                </View>
                <View style={statItem}>
                  <Text style={statLabel}>Orders</Text>
                  <Text style={statValue}>{salesData.orderCount}</Text>
                </View>
                <View style={statItem}>
                  <Text style={statLabel}>Avg Order Value</Text>
                  <Text style={statValue}>{formatCurrency(salesData.avgOrderValue)}</Text>
                </View>
              </View>
            </Card>

            <Card>
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.xl }}>
                Chart placeholder — integrate a chart library for visual sales trends.
              </Text>
            </Card>
          </View>
        )}

        {reportTab === "products" && (
          <Card>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
              Products by Revenue
            </Text>

            {productData.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.lg }}>
                No product data for this period.
              </Text>
            ) : (
              <View>
                <View style={tableHeader}>
                  <Text style={[thText, { flex: 2 }]}>Product</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Qty</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Revenue</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Profit</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Margin</Text>
                </View>
                {productData.map((p, idx) => (
                  <View key={idx} style={tableRow}>
                    <Text style={[tdText, { flex: 2 }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{p.qtySold}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{formatCurrency(p.revenue)}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{formatCurrency(p.profit)}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{p.margin.toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {reportTab === "categories" && (
          <Card>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
              Sales by Category
            </Text>

            {categoryData.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.lg }}>
                No category data for this period.
              </Text>
            ) : (
              <View>
                <View style={tableHeader}>
                  <Text style={[thText, { flex: 2 }]}>Category</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Revenue</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Items</Text>
                </View>
                {categoryData.map((c, idx) => (
                  <View key={idx} style={tableRow}>
                    <Text style={[tdText, { flex: 2 }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{formatCurrency(c.revenue)}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{c.orderCount}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {reportTab === "employees" && (
          <Card>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
              Sales by Employee
            </Text>

            {employeeData.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.lg }}>
                No employee data for this period.
              </Text>
            ) : (
              <View>
                <View style={tableHeader}>
                  <Text style={[thText, { flex: 2 }]}>Employee</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Orders</Text>
                  <Text style={[thText, { flex: 1, textAlign: "right" }]}>Total Sales</Text>
                </View>
                {employeeData.map((e, idx) => (
                  <View key={idx} style={tableRow}>
                    <Text style={[tdText, { flex: 2 }]} numberOfLines={1}>{e.name}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{e.orderCount}</Text>
                    <Text style={[tdText, { flex: 1, textAlign: "right" }]}>{formatCurrency(e.totalSales)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button title="Export CSV" onPress={exportCSV} fullWidth variant="secondary" />
        </View>
      </ScrollView>
    </View>
  );
}
