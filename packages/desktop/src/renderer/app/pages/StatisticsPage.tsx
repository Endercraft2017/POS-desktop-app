import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { orderRepo } from "../../lib/repositories";

type Period = "daily" | "monthly" | "annual";
type ViewMode = "sales" | "profit";

export function StatisticsPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("daily");
  const [viewMode, setViewMode] = useState<ViewMode>("sales");
  const [selected, setSelected] = useState<{ label: string; value: number; cash: number; gcash: number; gross: number; net: number; expenses: number; count: number; start: string; end: string } | null>(null);
  const [showSpecifics, setShowSpecifics] = useState(false);

  const { data: bestSeller } = useQuery({
    queryKey: ["stats", "best-seller", selected?.start, selected?.end],
    queryFn: () => selected ? orderRepo.getBucketBestSeller(selected.start, selected.end) : null,
    enabled: !!selected,
  });

  const { data: productBreakdown = [] } = useQuery({
    queryKey: ["stats", "product-breakdown", selected?.start, selected?.end],
    queryFn: () => selected ? orderRepo.getBucketProductBreakdown(selected.start, selected.end) : [],
    enabled: !!selected && showSpecifics,
  });

  const { data: dailyData = [] } = useQuery({
    queryKey: ["stats", "daily", "by-method"],
    queryFn: () => orderRepo.getDailySalesByMethod(30),
  });

  const { data: monthlyData = [] } = useQuery({
    queryKey: ["stats", "monthly", "by-method"],
    queryFn: () => orderRepo.getMonthlySalesByMethod(12),
  });

  const { data: annualData = [] } = useQuery({
    queryKey: ["stats", "annual", "by-method"],
    queryFn: () => orderRepo.getAnnualSalesByMethod(5),
  });

  const { data: dailyProfit = [] } = useQuery({
    queryKey: ["stats", "daily", "profit"],
    queryFn: () => orderRepo.getDailyProfitBuckets(30),
  });

  const { data: monthlyProfit = [] } = useQuery({
    queryKey: ["stats", "monthly", "profit"],
    queryFn: () => orderRepo.getMonthlyProfitBuckets(12),
  });

  const { data: annualProfit = [] } = useQuery({
    queryKey: ["stats", "annual", "profit"],
    queryFn: () => orderRepo.getAnnualProfitBuckets(5),
  });

  const chartData = useMemo(() => {
    // Each bucket has [start, end) range for drill-down queries (SQLite-compatible strings)
    const pad = (n: number) => String(n).padStart(2, "0");
    const dailyProfitMap = new Map(dailyProfit.map((p) => [p.date, p]));
    const monthlyProfitMap = new Map(monthlyProfit.map((p) => [p.month, p]));
    const annualProfitMap = new Map(annualProfit.map((p) => [p.year, p]));
    switch (period) {
      case "daily":
        return dailyData.map((d) => {
          const dt = new Date(d.date + "T00:00");
          const next = new Date(dt);
          next.setDate(next.getDate() + 1);
          const start = `${d.date} 00:00:00`;
          const end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())} 00:00:00`;
          const pr = dailyProfitMap.get(d.date);
          return {
            label: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            cash: d.cash,
            gcash: d.gcash,
            value: d.cash + d.gcash,
            gross: pr?.gross ?? 0,
            net: pr?.net ?? 0,
            expenses: pr?.expenses ?? 0,
            count: d.count,
            key: d.date,
            start,
            end,
          };
        });
      case "monthly":
        return monthlyData.map((d) => {
          const [y, m] = d.month.split("-");
          const yi = parseInt(y);
          const mi = parseInt(m);
          const date = new Date(yi, mi - 1);
          const start = `${y}-${pad(mi)}-01 00:00:00`;
          const nm = mi === 12 ? 1 : mi + 1;
          const ny = mi === 12 ? yi + 1 : yi;
          const end = `${ny}-${pad(nm)}-01 00:00:00`;
          const pr = monthlyProfitMap.get(d.month);
          return {
            label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
            cash: d.cash,
            gcash: d.gcash,
            value: d.cash + d.gcash,
            gross: pr?.gross ?? 0,
            net: pr?.net ?? 0,
            expenses: pr?.expenses ?? 0,
            count: d.count,
            key: d.month,
            start,
            end,
          };
        });
      case "annual":
        return annualData.map((d) => {
          const pr = annualProfitMap.get(d.year);
          return {
            label: d.year,
            cash: d.cash,
            gcash: d.gcash,
            value: d.cash + d.gcash,
            gross: pr?.gross ?? 0,
            net: pr?.net ?? 0,
            expenses: pr?.expenses ?? 0,
            count: d.count,
            key: d.year,
            start: `${d.year}-01-01 00:00:00`,
            end: `${parseInt(d.year) + 1}-01-01 00:00:00`,
          };
        });
    }
  }, [period, dailyData, monthlyData, annualData, dailyProfit, monthlyProfit, annualProfit]);

  const isProfitView = viewMode === "profit";
  const maxValue = isProfitView
    ? Math.max(...chartData.map((d) => Math.max(d.gross, 0)), 1)
    : Math.max(...chartData.map((d) => d.value), 1);
  const totalSales = chartData.reduce((sum, d) => sum + d.value, 0);
  const totalCash = chartData.reduce((sum, d) => sum + d.cash, 0);
  const totalGcash = chartData.reduce((sum, d) => sum + d.gcash, 0);
  const totalOrders = chartData.reduce((sum, d) => sum + d.count, 0);
  const totalGross = chartData.reduce((sum, d) => sum + d.gross, 0);
  const totalNet = chartData.reduce((sum, d) => sum + d.net, 0);
  const totalExpenses = chartData.reduce((sum, d) => sum + d.expenses, 0);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs + 2}px ${spacing.lg}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    cursor: "pointer",
    minHeight: 30,
  });

  return (
    <div
      style={{
        padding: spacing.lg,
        display: "flex",
        flexDirection: "column",
        gap: spacing.md,
        height: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
          Sales Statistics
        </h1>
        <button
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            backgroundColor: colors.buttonSecondary,
            color: colors.buttonSecondaryText,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            cursor: "pointer",
            minHeight: 30,
          }}
          onClick={() => navigate("/dashboard")}
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Period + view-mode tabs */}
      <div style={{ display: "flex", gap: spacing.xs, flexShrink: 0, flexWrap: "wrap" }}>
        <button style={tabStyle(period === "daily")} onClick={() => { setPeriod("daily"); setSelected(null); }}>
          Daily (30 days)
        </button>
        <button style={tabStyle(period === "monthly")} onClick={() => { setPeriod("monthly"); setSelected(null); }}>
          Monthly (12 months)
        </button>
        <button style={tabStyle(period === "annual")} onClick={() => { setPeriod("annual"); setSelected(null); }}>
          Annual (5 years)
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, overflow: "hidden" }}>
          <button
            onClick={() => setViewMode("sales")}
            style={{
              padding: `${spacing.xs + 2}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 600,
              backgroundColor: viewMode === "sales" ? colors.primary : colors.surface,
              color: viewMode === "sales" ? colors.textOnPrimary : colors.textSecondary,
              border: "none",
              cursor: "pointer",
              minHeight: 30,
            }}
          >
            Sales
          </button>
          <button
            onClick={() => setViewMode("profit")}
            style={{
              padding: `${spacing.xs + 2}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 600,
              backgroundColor: viewMode === "profit" ? colors.primary : colors.surface,
              color: viewMode === "profit" ? colors.textOnPrimary : colors.textSecondary,
              border: "none",
              cursor: "pointer",
              minHeight: 30,
            }}
          >
            Profit
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: spacing.md, flexShrink: 0, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            borderLeft: `4px solid ${colors.success}`,
          }}
        >
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total Sales</div>
          <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
            ₱{totalSales.toFixed(2)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            borderLeft: `4px solid ${colors.info ?? colors.primary}`,
          }}
        >
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Cash</div>
          <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
            ₱{totalCash.toFixed(2)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            borderLeft: `4px solid ${colors.warning ?? colors.accent}`,
          }}
        >
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>GCash</div>
          <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
            ₱{totalGcash.toFixed(2)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            borderLeft: `4px solid ${colors.primary}`,
          }}
        >
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total Orders</div>
          <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
            {totalOrders}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            borderLeft: `4px solid ${colors.accent}`,
          }}
        >
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Average per {period === "daily" ? "Day" : period === "monthly" ? "Month" : "Year"}</div>
          <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
            ₱{chartData.length > 0 ? (totalSales / chartData.length).toFixed(2) : "0.00"}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            borderLeft: `4px solid ${colors.success}`,
          }}
          title="Sum over sold items of (selling price − material cost) × quantity"
        >
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Estimated Profit</div>
          <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: totalGross < 0 ? colors.error : colors.textPrimary, marginTop: 2 }}>
            ₱{totalGross.toFixed(2)}
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>(Price − Mat cost) × Qty</div>
        </div>
      </div>

      {/* Bar chart */}
      <div
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          padding: spacing.md,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm, flexShrink: 0, flexWrap: "wrap", gap: spacing.sm }}>
          <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.textSecondary }}>
            {isProfitView ? "Profit" : "Sales"} ({period === "daily" ? "Last 30 Days" : period === "monthly" ? "Last 12 Months" : "Last 5 Years"})
          </div>
          <div style={{ display: "flex", gap: spacing.md, fontSize: fontSize.xs, color: colors.textTertiary, alignItems: "center", flexWrap: "wrap" }}>
            {isProfitView ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: spacing.xs }}>
                <span style={{ width: 12, height: 12, backgroundColor: colors.success, borderRadius: 2 }} /> (Price − Mat cost) × Qty
              </span>
            ) : (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: spacing.xs }}>
                  <span style={{ width: 12, height: 12, backgroundColor: colors.info ?? colors.primary, borderRadius: 2 }} /> Cash
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: spacing.xs }}>
                  <span style={{ width: 12, height: 12, backgroundColor: colors.warning ?? colors.accent, borderRadius: 2 }} /> GCash
                </span>
              </>
            )}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
            No {isProfitView ? "profit" : "sales"} data for this period
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Y-axis labels + bars area */}
            <div style={{ flex: 1, display: "flex", gap: spacing.xs, overflow: "hidden" }}>
              {/* Y-axis */}
              <div
                style={{
                  width: 60,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  fontSize: fontSize.xs,
                  color: colors.textTertiary,
                  textAlign: "right",
                  paddingRight: spacing.xs,
                  flexShrink: 0,
                }}
              >
                <span>₱{maxValue.toFixed(0)}</span>
                <span>₱{(maxValue * 0.75).toFixed(0)}</span>
                <span>₱{(maxValue * 0.5).toFixed(0)}</span>
                <span>₱{(maxValue * 0.25).toFixed(0)}</span>
                <span>₱0</span>
              </div>

              {/* Bars */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: period === "annual" ? spacing.lg : period === "monthly" ? spacing.xs : 2,
                  overflowX: "auto",
                  overflowY: "hidden",
                  paddingBottom: spacing.xs,
                  borderLeft: `1px solid ${colors.border}`,
                  borderBottom: `1px solid ${colors.border}`,
                  position: "relative",
                }}
              >
                {/* Grid lines */}
                {[0.25, 0.5, 0.75, 1].map((pct) => (
                  <div
                    key={pct}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: `${pct * 100}%`,
                      borderTop: `1px dashed ${colors.border}`,
                      pointerEvents: "none",
                    }}
                  />
                ))}

                {chartData.map((d, i) => {
                  const isSelected = selected?.start === d.start;
                  const cashColor = colors.info ?? colors.primary;
                  const gcashColor = colors.warning ?? colors.accent;
                  const grossColor = colors.warning ?? colors.success;
                  const netColor = colors.success;
                  const clickFn = () => {
                    // Click 1: select the bucket (shows the details summary).
                    // Click 2 on the same bar: open the Specifics popup.
                    if (isSelected) {
                      setShowSpecifics(true);
                    } else {
                      setSelected({ label: d.label, value: d.value, cash: d.cash, gcash: d.gcash, gross: d.gross, net: d.net, expenses: d.expenses, count: d.count, start: d.start, end: d.end });
                    }
                  };

                  // In profit view: single bar per bucket.
                  if (isProfitView) {
                    const grossPct = maxValue > 0 ? (Math.max(d.gross, 0) / maxValue) * 100 : 0;
                    return (
                      <div
                        key={i}
                        onClick={clickFn}
                        style={{
                          flex: period === "daily" ? "1 0 12px" : "1 0 30px",
                          maxWidth: period === "annual" ? 80 : period === "monthly" ? 50 : 30,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          height: "100%",
                          cursor: "pointer",
                        }}
                        title={`${d.label} — Profit ₱${d.gross.toFixed(2)}`}
                      >
                        <div style={{
                          width: "100%",
                          height: `${Math.max(grossPct, 1)}%`,
                          minHeight: d.gross > 0 ? 4 : 0,
                          backgroundColor: netColor,
                          borderRadius: `${borderRadius.sm}px ${borderRadius.sm}px 0 0`,
                          opacity: isSelected ? 1 : 0.9,
                          outline: isSelected ? `2px solid ${colors.accent}` : "none",
                        }} />
                      </div>
                    );
                  }

                  // Sales view (existing stacked cash/gcash)
                  const totalPct = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
                  const cashPct = maxValue > 0 ? (d.cash / maxValue) * 100 : 0;
                  const gcashPct = maxValue > 0 ? (d.gcash / maxValue) * 100 : 0;
                  return (
                    <div
                      key={i}
                      onClick={clickFn}
                      style={{
                        flex: period === "daily" ? "1 0 12px" : "1 0 30px",
                        maxWidth: period === "annual" ? 80 : period === "monthly" ? 50 : 30,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        height: "100%",
                        position: "relative",
                        cursor: "pointer",
                      }}
                      title={`${d.label}: ₱${d.value.toFixed(2)} (Cash ₱${d.cash.toFixed(2)} · GCash ₱${d.gcash.toFixed(2)} · ${d.count} orders)`}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: `${Math.max(totalPct, 1)}%`,
                          minHeight: d.value > 0 ? 4 : 0,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "flex-end",
                          borderRadius: `${borderRadius.sm}px ${borderRadius.sm}px 0 0`,
                          overflow: "hidden",
                          outline: isSelected ? `2px solid ${colors.accent}` : "none",
                          opacity: isSelected ? 1 : 0.9,
                          transition: "height 0.3s ease",
                        }}
                      >
                        <div style={{ width: "100%", flex: d.value > 0 ? gcashPct : 0, backgroundColor: gcashColor }} />
                        <div style={{ width: "100%", flex: d.value > 0 ? cashPct : 0, backgroundColor: cashColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X-axis labels */}
            <div
              style={{
                display: "flex",
                gap: period === "annual" ? spacing.lg : period === "monthly" ? spacing.xs : 2,
                paddingLeft: 64,
                marginTop: spacing.xs,
                overflowX: "auto",
                flexShrink: 0,
              }}
            >
              {chartData.map((d, i) => {
                // Show every Nth label for daily to avoid crowding
                const showLabel = period === "daily" ? i % 5 === 0 || i === chartData.length - 1 : true;
                return (
                  <div
                    key={i}
                    style={{
                      flex: period === "daily" ? "1 0 12px" : "1 0 30px",
                      maxWidth: period === "annual" ? 80 : period === "monthly" ? 50 : 30,
                      fontSize: fontSize.xs,
                      color: colors.textTertiary,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      visibility: showLabel ? "visible" : "hidden",
                    }}
                  >
                    {d.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected bar details */}
      {selected && (
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
            <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary }}>
              {selected.label} — Details
            </div>
            <div style={{ display: "flex", gap: spacing.xs }}>
              <button
                onClick={() => setShowSpecifics(true)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary,
                  border: `1px solid ${colors.primary}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Specifics
              </button>
              <button
                onClick={() => setSelected(null)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: colors.buttonSecondary,
                  color: colors.buttonSecondaryText,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: spacing.sm }}>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total Sales</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                ₱{selected.value.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Cash</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                ₱{selected.cash.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>GCash</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                ₱{selected.gcash.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Amount of Orders</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                {selected.count}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Best Selling Item</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                {bestSeller?.name ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Quantity Sold</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                {bestSeller ? bestSeller.qty : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Revenue from Item</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary, marginTop: 2 }}>
                {bestSeller ? `₱${bestSeller.revenue.toFixed(2)}` : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Estimated Profit</div>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: selected.gross < 0 ? colors.error : colors.textPrimary, marginTop: 2 }}>
                ₱{selected.gross.toFixed(2)}
              </div>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                (Price − Mat cost) × Qty
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Specifics popup — per-product breakdown for the selected bucket */}
      {selected && showSpecifics && (
        <div
          onClick={() => setShowSpecifics(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: spacing.lg,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
              padding: spacing.lg,
              maxWidth: 720,
              width: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              gap: spacing.sm,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
                {selected.label} — Product Breakdown
              </div>
              <button
                onClick={() => setShowSpecifics(false)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: colors.buttonSecondary,
                  color: colors.buttonSecondaryText,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm }}>
              {productBreakdown.length === 0 ? (
                <div style={{ padding: spacing.lg, textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
                  No products sold in this period.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fontSize.sm }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: colors.surfaceElevated }}>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th style={{ padding: spacing.sm, textAlign: "left", fontWeight: 700, color: colors.textSecondary }}>Product</th>
                      <th style={{ padding: spacing.sm, textAlign: "right", fontWeight: 700, color: colors.textSecondary }}>Qty</th>
                      <th style={{ padding: spacing.sm, textAlign: "right", fontWeight: 700, color: colors.textSecondary }}>Revenue</th>
                      <th style={{ padding: spacing.sm, textAlign: "right", fontWeight: 700, color: colors.textSecondary }}>Est. Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productBreakdown.map((p) => (
                      <tr key={p.name} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: spacing.sm, color: colors.textPrimary }}>{p.name}</td>
                        <td style={{ padding: spacing.sm, color: colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.qty}</td>
                        <td style={{ padding: spacing.sm, color: colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>₱{p.revenue.toFixed(2)}</td>
                        <td style={{ padding: spacing.sm, color: p.profit < 0 ? colors.error : colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          ₱{p.profit.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${colors.border}`, backgroundColor: colors.surfaceElevated }}>
                      <td style={{ padding: spacing.sm, fontWeight: 700, color: colors.textPrimary }}>Total</td>
                      <td style={{ padding: spacing.sm, fontWeight: 700, color: colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {productBreakdown.reduce((s, p) => s + p.qty, 0)}
                      </td>
                      <td style={{ padding: spacing.sm, fontWeight: 700, color: colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        ₱{productBreakdown.reduce((s, p) => s + p.revenue, 0).toFixed(2)}
                      </td>
                      <td style={{ padding: spacing.sm, fontWeight: 700, color: colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        ₱{productBreakdown.reduce((s, p) => s + p.profit, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
              Profit = revenue − (qty × current product cost). Click outside to close.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
