import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useActiveExpenses } from "../hooks/use-expenses";
import { useActiveProducts } from "../hooks/use-products";
import {
  calculateDailyForecast,
  calculateWeeklyForecast,
  calculateMonthlyForecast,
} from "@pos/core/services";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import type {
  DailyForecastInput,
  DailyForecastResult,
  ExpenseFrequency,
} from "@pos/core/types";

type Period = "daily" | "weekly" | "monthly";

function toDailyCost(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case "daily":
      return amount;
    case "weekly":
      return amount / 7;
    case "monthly":
      return amount / 30;
    case "per_use":
      return amount;
    default:
      return amount;
  }
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function ForecastScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const router = useRouter();
  const { data: activeExpenses, isLoading: expensesLoading } =
    useActiveExpenses();
  const { data: activeProducts, isLoading: productsLoading } =
    useActiveProducts();

  // Input state
  const [avgCustomers, setAvgCustomers] = useState("");
  const [avgSpend, setAvgSpend] = useState("");
  const [riskPercent, setRiskPercent] = useState("15");
  const [period, setPeriod] = useState<Period>("daily");
  const [productQuantities, setProductQuantities] = useState<
    Record<string, string>
  >({});
  const [showProductMix, setShowProductMix] = useState(false);

  // Computed: total daily expenses
  const totalDailyExpenses = useMemo(() => {
    if (!activeExpenses) return 0;
    return activeExpenses.reduce(
      (sum: number, e: any) =>
        sum + toDailyCost(Number(e.amount) || 0, e.frequency),
      0
    );
  }, [activeExpenses]);

  // Build forecast input
  const forecastInput: DailyForecastInput = useMemo(() => {
    const opExpenses = (activeExpenses || []).map((e: any) => ({
      name: e.name,
      amount: Number(e.amount) || 0,
      frequency: e.frequency as ExpenseFrequency,
    }));

    const productMix =
      showProductMix && activeProducts
        ? activeProducts
            .filter(
              (p: any) =>
                productQuantities[p.id] &&
                Number(productQuantities[p.id]) > 0
            )
            .map((p: any) => ({
              productId: p.id,
              productName: p.name,
              estimatedDailySales: Number(productQuantities[p.id]) || 0,
              sellingPrice: Number(p.price) || 0,
              costPrice: Number(p.costPrice) || 0,
            }))
        : undefined;

    return {
      avgCustomersPerDay: Number(avgCustomers) || 0,
      avgSpendPerCustomer: Number(avgSpend) || 0,
      riskPercentage: Number(riskPercent) || 0,
      operationalExpenses: opExpenses,
      productMix:
        productMix && productMix.length > 0 ? productMix : undefined,
    };
  }, [
    avgCustomers,
    avgSpend,
    riskPercent,
    activeExpenses,
    activeProducts,
    productQuantities,
    showProductMix,
  ]);

  // Compute forecasts
  const dailyForecast: DailyForecastResult = useMemo(
    () => calculateDailyForecast(forecastInput),
    [forecastInput]
  );

  const displayForecast: DailyForecastResult = useMemo(() => {
    switch (period) {
      case "weekly":
        return calculateWeeklyForecast(dailyForecast);
      case "monthly":
        return calculateMonthlyForecast(dailyForecast);
      default:
        return dailyForecast;
    }
  }, [dailyForecast, period]);

  const periodLabel =
    period === "daily" ? "Day" : period === "weekly" ? "Week" : "Month";

  // Styles
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

  const headerSubtitle: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const labelStyle: TextStyle = {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  };

  const scrollContent: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing["2xl"],
  };

  const periodTabs: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  };

  const kpiGrid: ViewStyle = {
    gap: spacing.sm,
  };

  const kpiRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
  };

  const tableHeader: ViewStyle = {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const tableRow: ViewStyle = {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const isLoading = expensesLoading || productsLoading;

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
      <View style={header}>
        <Text style={headerTitle}>Sales Forecast</Text>
        <Text style={headerSubtitle}>
          Estimate revenue, expenses, and profit
        </Text>
      </View>

      <ScrollView contentContainerStyle={scrollContent}>
        {/* Customer Estimates Card */}
        <Card>
          <Text style={sectionTitle}>Customer Estimates</Text>
          <View style={{ gap: spacing.md }}>
            <Input
              label="Average Customers per Day"
              value={avgCustomers}
              onChangeText={(text) =>
                setAvgCustomers(text.replace(/[^0-9]/g, ""))
              }
              placeholder="e.g. 50"
              keyboardType="numeric"
            />
            <Input
              label="Average Spend per Customer ($)"
              value={avgSpend}
              onChangeText={(text) =>
                setAvgSpend(text.replace(/[^0-9.]/g, ""))
              }
              placeholder="e.g. 8.50"
              keyboardType="decimal-pad"
            />
          </View>
        </Card>

        {/* Risk Assessment Card */}
        <Card>
          <Text style={sectionTitle}>Risk Assessment</Text>
          <Input
            label="Risk Percentage (%)"
            value={riskPercent}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, "");
              const clamped = Math.min(Number(cleaned) || 0, 100);
              setRiskPercent(cleaned ? String(clamped) : "");
            }}
            placeholder="0-100"
            keyboardType="numeric"
          />
          <Text
            style={{
              fontSize: fontSize.xs,
              color: colors.textTertiary,
              marginTop: spacing.xs,
            }}
          >
            Accounts for slow days, weather, seasonal variation, etc. Reduces
            projected revenue by this percentage.
          </Text>

          {/* Risk visual bar */}
          <View
            style={{
              marginTop: spacing.sm,
              height: 8,
              backgroundColor: colors.surfaceElevated,
              borderRadius: borderRadius.full,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.min(Number(riskPercent) || 0, 100)}%`,
                height: "100%",
                backgroundColor:
                  (Number(riskPercent) || 0) > 50
                    ? colors.error
                    : (Number(riskPercent) || 0) > 25
                    ? colors.warning
                    : colors.success,
                borderRadius: borderRadius.full,
              }}
            />
          </View>
        </Card>

        {/* Operational Expenses Card */}
        <Card>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing.sm,
            }}
          >
            <Text style={sectionTitle}>Operational Expenses</Text>
            <Button
              title="Manage"
              variant="secondary"
              size="sm"
              onPress={() => router.push("/expenses")}
            />
          </View>

          {activeExpenses && activeExpenses.length === 0 && (
            <Text
              style={{
                fontSize: fontSize.sm,
                color: colors.textTertiary,
                textAlign: "center",
                paddingVertical: spacing.md,
              }}
            >
              No active expenses. Add some to include in forecast.
            </Text>
          )}

          {activeExpenses?.map((expense: any) => {
            const daily = toDailyCost(
              Number(expense.amount) || 0,
              expense.frequency
            );
            return (
              <View
                key={expense.id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.md,
                    color: colors.textPrimary,
                    flex: 1,
                  }}
                >
                  {expense.name}
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.medium,
                    color: colors.textSecondary,
                  }}
                >
                  {formatCurrency(daily)}/day
                </Text>
              </View>
            );
          })}

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: spacing.sm,
              marginTop: spacing.xs,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.md,
                fontWeight: fontWeight.bold,
                color: colors.textPrimary,
              }}
            >
              Total Daily Expenses
            </Text>
            <Text
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.bold,
                color: colors.error,
              }}
            >
              {formatCurrency(totalDailyExpenses)}
            </Text>
          </View>
        </Card>

        {/* Product Mix Card (optional) */}
        <Card>
          <TouchableOpacity
            onPress={() => setShowProductMix(!showProductMix)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={sectionTitle}>Product Mix (Optional)</Text>
            <Text
              style={{
                fontSize: fontSize.lg,
                color: colors.textTertiary,
              }}
            >
              {showProductMix ? "Hide" : "Show"}
            </Text>
          </TouchableOpacity>

          {showProductMix && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {activeProducts && activeProducts.length === 0 && (
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textTertiary,
                    textAlign: "center",
                    paddingVertical: spacing.md,
                  }}
                >
                  No active products available.
                </Text>
              )}

              {activeProducts?.map((product: any) => {
                const qty = Number(productQuantities[product.id]) || 0;
                const revenue = qty * (Number(product.price) || 0);
                const cost = qty * (Number(product.costPrice) || 0);
                const profit = revenue - cost;

                return (
                  <View
                    key={product.id}
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      paddingBottom: spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: fontSize.md,
                          fontWeight: fontWeight.medium,
                          color: colors.textPrimary,
                        }}
                      >
                        {product.name}
                      </Text>
                      <Input
                        value={productQuantities[product.id] || ""}
                        onChangeText={(text) =>
                          setProductQuantities((prev) => ({
                            ...prev,
                            [product.id]: text.replace(/[^0-9]/g, ""),
                          }))
                        }
                        placeholder="Qty"
                        keyboardType="numeric"
                        containerStyle={{ width: 80 }}
                        style={{ height: 36, textAlign: "center" }}
                      />
                    </View>
                    {qty > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: spacing.md,
                          marginTop: spacing.xs,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fontSize.xs,
                            color: colors.textSecondary,
                          }}
                        >
                          Rev: {formatCurrency(revenue)}
                        </Text>
                        <Text
                          style={{
                            fontSize: fontSize.xs,
                            color: colors.textSecondary,
                          }}
                        >
                          Cost: {formatCurrency(cost)}
                        </Text>
                        <Text
                          style={{
                            fontSize: fontSize.xs,
                            fontWeight: fontWeight.semibold,
                            color: profit >= 0 ? colors.success : colors.error,
                          }}
                        >
                          Profit: {formatCurrency(profit)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* ===== RESULTS SECTION ===== */}
        <View
          style={{
            borderTopWidth: 2,
            borderTopColor: colors.primary,
            paddingTop: spacing.md,
            marginTop: spacing.sm,
          }}
        >
          <Text
            style={{
              fontSize: fontSize["2xl"],
              fontWeight: fontWeight.bold,
              color: colors.textPrimary,
              marginBottom: spacing.md,
            }}
          >
            Forecast Results
          </Text>

          {/* Period Selector Tabs */}
          <View style={periodTabs}>
            {(["daily", "weekly", "monthly"] as Period[]).map((p) => {
              const isActive = period === p;
              const label =
                p === "daily"
                  ? "Daily"
                  : p === "weekly"
                  ? "Weekly"
                  : "Monthly";
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: borderRadius.sm,
                    backgroundColor: isActive
                      ? colors.primary
                      : colors.surfaceElevated,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: isActive
                        ? fontWeight.semibold
                        : fontWeight.regular,
                      color: isActive
                        ? colors.textOnPrimary
                        : colors.textPrimary,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* KPI Cards */}
          <View style={kpiGrid}>
            <View style={kpiRow}>
              <KPICard
                label="Projected Gross Revenue"
                value={formatCurrency(displayForecast.projectedGrossRevenue)}
                sublabel={`Per ${periodLabel}`}
                colors={colors}
                spacing={spacing}
                borderRadius={borderRadius}
                fontSize={fontSize}
                fontWeight={fontWeight}
              />
              <KPICard
                label="Risk-Adjusted Revenue"
                value={formatCurrency(displayForecast.riskAdjustedRevenue)}
                sublabel={`Risk: ${riskPercent || 0}%`}
                colors={colors}
                spacing={spacing}
                borderRadius={borderRadius}
                fontSize={fontSize}
                fontWeight={fontWeight}
              />
            </View>
            <View style={kpiRow}>
              <KPICard
                label="Total Expenses"
                value={formatCurrency(displayForecast.totalDailyExpenses)}
                sublabel={`Per ${periodLabel}`}
                valueColor={colors.error}
                colors={colors}
                spacing={spacing}
                borderRadius={borderRadius}
                fontSize={fontSize}
                fontWeight={fontWeight}
              />
              <KPICard
                label="Net Profit"
                value={formatCurrency(displayForecast.projectedNetProfit)}
                sublabel={`Per ${periodLabel}`}
                valueColor={
                  displayForecast.projectedNetProfit >= 0
                    ? colors.success
                    : colors.error
                }
                colors={colors}
                spacing={spacing}
                borderRadius={borderRadius}
                fontSize={fontSize}
                fontWeight={fontWeight}
              />
            </View>
            <View style={kpiRow}>
              <KPICard
                label="Break-Even Customers"
                value={String(displayForecast.breakEvenCustomers)}
                sublabel={`Needed per ${periodLabel.toLowerCase()}`}
                colors={colors}
                spacing={spacing}
                borderRadius={borderRadius}
                fontSize={fontSize}
                fontWeight={fontWeight}
              />
              <KPICard
                label="Profit Margin"
                value={`${displayForecast.profitMargin}%`}
                sublabel={
                  displayForecast.profitMargin >= 0 ? "Healthy" : "Negative"
                }
                valueColor={
                  displayForecast.profitMargin >= 0
                    ? colors.success
                    : colors.error
                }
                colors={colors}
                spacing={spacing}
                borderRadius={borderRadius}
                fontSize={fontSize}
                fontWeight={fontWeight}
              />
            </View>
          </View>

          {/* Expense Breakdown Table */}
          {displayForecast.expenseBreakdown.length > 0 && (
            <Card style={{ marginTop: spacing.md }}>
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  color: colors.textPrimary,
                  marginBottom: spacing.sm,
                }}
              >
                Expense Breakdown
              </Text>
              <View style={tableHeader}>
                <Text
                  style={{
                    flex: 2,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                  }}
                >
                  EXPENSE
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                    textAlign: "right",
                  }}
                >
                  COST
                </Text>
              </View>
              {displayForecast.expenseBreakdown.map((item, index) => (
                <View key={index} style={tableRow}>
                  <Text
                    style={{
                      flex: 2,
                      fontSize: fontSize.sm,
                      color: colors.textPrimary,
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.medium,
                      color: colors.textPrimary,
                      textAlign: "right",
                    }}
                  >
                    {formatCurrency(item.dailyCost)}
                  </Text>
                </View>
              ))}
              <View
                style={{
                  flexDirection: "row",
                  paddingTop: spacing.sm,
                  marginTop: spacing.xs,
                }}
              >
                <Text
                  style={{
                    flex: 2,
                    fontSize: fontSize.sm,
                    fontWeight: fontWeight.bold,
                    color: colors.textPrimary,
                  }}
                >
                  TOTAL
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: fontSize.sm,
                    fontWeight: fontWeight.bold,
                    color: colors.error,
                    textAlign: "right",
                  }}
                >
                  {formatCurrency(displayForecast.totalDailyExpenses)}
                </Text>
              </View>
            </Card>
          )}

          {/* Product Forecast Table */}
          {displayForecast.productForecast.length > 0 && (
            <Card style={{ marginTop: spacing.md }}>
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  color: colors.textPrimary,
                  marginBottom: spacing.sm,
                }}
              >
                Product Forecast
              </Text>
              <View style={tableHeader}>
                <Text
                  style={{
                    flex: 2,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                  }}
                >
                  PRODUCT
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                    textAlign: "right",
                  }}
                >
                  QTY
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                    textAlign: "right",
                  }}
                >
                  REVENUE
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                    textAlign: "right",
                  }}
                >
                  PROFIT
                </Text>
              </View>
              {displayForecast.productForecast.map((item, index) => (
                <View key={index} style={tableRow}>
                  <Text
                    style={{
                      flex: 2,
                      fontSize: fontSize.sm,
                      color: colors.textPrimary,
                    }}
                  >
                    {item.productName}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: fontSize.sm,
                      color: colors.textSecondary,
                      textAlign: "right",
                    }}
                  >
                    {item.estimatedDailySales}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.medium,
                      color: colors.textPrimary,
                      textAlign: "right",
                    }}
                  >
                    {formatCurrency(item.revenue)}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.semibold,
                      color: item.profit >= 0 ? colors.success : colors.error,
                      textAlign: "right",
                    }}
                  >
                    {formatCurrency(item.profit)}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Reusable KPI card used in the results section. */
function KPICard({
  label,
  value,
  sublabel,
  valueColor,
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
}: {
  label: string;
  value: string;
  sublabel?: string;
  valueColor?: string;
  colors: any;
  spacing: any;
  borderRadius: any;
  fontSize: any;
  fontWeight: any;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          color: colors.textSecondary,
          marginBottom: spacing.xs,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: fontSize.xl,
          fontWeight: fontWeight.bold,
          color: valueColor || colors.textPrimary,
        }}
      >
        {value}
      </Text>
      {sublabel && (
        <Text
          style={{
            fontSize: fontSize.xs,
            color: colors.textTertiary,
            marginTop: 2,
          }}
        >
          {sublabel}
        </Text>
      )}
    </View>
  );
}
