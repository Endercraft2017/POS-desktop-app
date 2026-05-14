import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { dbQuery } from "../../lib/db-bridge";
import { stockAdjustmentRepo, expenseRepo } from "../../lib/repositories";
import type { StockAdjustmentWithIngredient, ExpenseRow } from "../../lib/repositories";

type Row = {
  order_number: string;
  created_at: string;
  status: string;
  order_total: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sku: string | null;
  barcode: string | null;
  employee_name: string | null;
  payment_method: string | null;
  payment_amount: number | null;
  customer_name: string | null;
};

type RestockRow = StockAdjustmentWithIngredient & {
  cost: number;
  cost_per_unit: number;
  supplier: string;
  notes: string;
};

const SQL = `
SELECT
  o.order_number,
  o.created_at,
  o.status,
  o.total       AS order_total,
  oi.product_name,
  oi.quantity,
  oi.unit_price,
  oi.total      AS line_total,
  p.sku,
  p.barcode,
  e.name        AS employee_name,
  py.method     AS payment_method,
  py.amount     AS payment_amount,
  o.notes       AS customer_name
FROM order_items oi
JOIN orders o    ON o.id = oi.order_id
LEFT JOIN products p   ON p.id = oi.product_id
LEFT JOIN employees e  ON e.id = o.employee_id
LEFT JOIN payments py  ON py.order_id = o.id AND py.deleted_at IS NULL
WHERE oi.deleted_at IS NULL AND o.deleted_at IS NULL
ORDER BY o.created_at DESC, o.order_number, oi.id
`;

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsvFile(headers: string[], rows: any[][], filename: string) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Build a map from order_number → sequential display number (001, 002, ...)
// Oldest order = 001. Rows are sorted DESC so we reverse-assign.
function buildOrderNumMap(rows: Row[]): Map<string, string> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!seen.has(r.order_number)) {
      seen.add(r.order_number);
      unique.push(r.order_number);
    }
  }
  // Rows come newest-first; reverse so oldest = 001
  unique.reverse();
  const map = new Map<string, string>();
  unique.forEach((on, i) => map.set(on, String(i + 1).padStart(3, "0")));
  return map;
}

function formatDateOnly(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTimeOnly(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function downloadSalesCsv(rows: Row[], numMap: Map<string, string>) {
  const headers = [
    "Order #", "Date", "Time", "Status", "Customer", "Product", "Qty", "Unit Price",
    "Line Total", "Order Total", "SKU", "Barcode", "Employee", "Payment Method", "Paid",
  ];
  const data = rows.map((r) => [
    numMap.get(r.order_number) || r.order_number,
    formatDateOnly(r.created_at), formatTimeOnly(r.created_at),
    r.status, r.customer_name, r.product_name, r.quantity,
    r.unit_price, r.line_total, r.order_total, r.sku, r.barcode,
    r.employee_name, r.payment_method, r.payment_amount,
  ]);
  downloadCsvFile(headers, data, `sales-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadExpensesCsv(rows: ExpenseRow[]) {
  const headers = ["Date", "Time", "Product / Item", "Qty", "Unit", "Cost (₱)", "Notes"];
  const data = rows.map((r) => [
    formatDateOnly(r.created_at), formatTimeOnly(r.created_at),
    r.name, r.frequency || "1", r.category || "pcs", r.amount, r.notes || "",
  ]);
  downloadCsvFile(headers, data, `expenses-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadRestockCsv(rows: RestockRow[]) {
  const headers = [
    "Date", "Time", "Type", "Ingredient", "Unit", "Quantity Change",
    "Previous Stock", "New Stock", "Total Cost", "Cost/Unit", "Supplier", "Notes",
  ];
  const data = rows.map((r) => [
    formatDateOnly(r.created_at), formatTimeOnly(r.created_at),
    r.type, r.ingredient_name, r.ingredient_unit, r.quantity_change,
    r.previous_stock, r.new_stock, r.cost || "", r.cost_per_unit || "", r.supplier, r.notes,
  ]);
  downloadCsvFile(headers, data, `ingredient-restocks-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function SpreadsheetPage() {
  const { colors, spacing, fontSize, borderRadius } = useTheme();
  const [activeTab, setActiveTab] = useState<"sales" | "restocks" | "expenses">("sales");
  const [search, setSearch] = useState("");
  const [restockSearch, setRestockSearch] = useState("");
  // Date range filters (YYYY-MM-DD strings, empty = no bound)
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [restockFrom, setRestockFrom] = useState("");
  const [restockTo, setRestockTo] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");

  function inDateRange(iso: string, from: string, to: string): boolean {
    if (!iso) return true;
    // SQLite stores as 'YYYY-MM-DD HH:MM:SS' in UTC
    const dateStr = iso.slice(0, 10);
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
  }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["spreadsheet", "all"],
    queryFn: () => dbQuery<Row>(SQL),
  });

  const { data: restockRaw = [] } = useQuery({
    queryKey: ["stock-adjustments", "all"],
    queryFn: () => stockAdjustmentRepo.getAll(2000),
  });

  const restocks: RestockRow[] = useMemo(() => {
    return restockRaw.map((r) => {
      let cost = 0, supplier = "", notes = "";
      try {
        const parsed = r.reason ? JSON.parse(r.reason) : {};
        cost = parsed.cost ?? 0;
        supplier = parsed.supplier ?? "";
        notes = parsed.notes ?? "";
      } catch {
        notes = r.reason ?? "";
      }
      const cost_per_unit = r.quantity_change > 0 ? cost / r.quantity_change : 0;
      return { ...r, cost, cost_per_unit, supplier, notes };
    });
  }, [restockRaw]);

  const filteredRestocks = useMemo(() => {
    const q = restockSearch.trim().toLowerCase();
    return restocks.filter((r) => {
      if (!inDateRange(r.created_at, restockFrom, restockTo)) return false;
      if (!q) return true;
      return (
        r.ingredient_name?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q) ||
        r.supplier?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      );
    });
  }, [restocks, restockSearch, restockFrom, restockTo]);

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses", "all"],
    queryFn: () => expenseRepo.getAll(),
  });

  const filteredExpenses = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    return allExpenses.filter((e) => {
      if (!inDateRange(e.created_at, expenseFrom, expenseTo)) return false;
      if (!q) return true;
      return (
        e.name?.toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q)
      );
    });
  }, [allExpenses, expenseSearch, expenseFrom, expenseTo]);

  const expenseTotals = useMemo(() => {
    let total = 0;
    for (const e of filteredExpenses) total += e.amount || 0;
    return { count: filteredExpenses.length, total };
  }, [filteredExpenses]);

  const restockTotals = useMemo(() => {
    let totalCost = 0, totalQty = 0;
    for (const r of filteredRestocks) {
      totalCost += r.cost || 0;
      totalQty += r.quantity_change || 0;
    }
    return { totalCost, totalQty, count: filteredRestocks.length };
  }, [filteredRestocks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inDateRange(r.created_at, salesFrom, salesTo)) return false;
      if (!q) return true;
      return (
        r.order_number?.toLowerCase().includes(q) ||
        r.product_name?.toLowerCase().includes(q) ||
        r.sku?.toLowerCase().includes(q) ||
        r.barcode?.toLowerCase().includes(q) ||
        r.employee_name?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, salesFrom, salesTo]);

  const orderNumMap = useMemo(() => buildOrderNumMap(filtered), [filtered]);

  const totals = useMemo(() => {
    let qty = 0, revenue = 0;
    for (const r of filtered) {
      qty += r.quantity || 0;
      revenue += r.line_total || 0;
    }
    return { qty, revenue, lines: filtered.length };
  }, [filtered]);

  const cellStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderBottom: `1px solid ${colors.border}`,
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    whiteSpace: "nowrap",
  };
  const headStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 700,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceElevated,
    position: "sticky",
    top: 0,
    borderBottom: `2px solid ${colors.border}`,
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    cursor: "pointer",
    minHeight: 32,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: spacing.lg, gap: spacing.md }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
          Spreadsheets
        </h1>
        <a
          href="/sheet/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary,
            border: "none",
            borderRadius: borderRadius.sm,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Open Sheet Editor
        </a>
      </div>

      <div style={{ display: "flex", gap: spacing.xs, flexShrink: 0 }}>
        <button style={tabBtnStyle(activeTab === "sales")} onClick={() => setActiveTab("sales")}>Sales</button>
        <button style={tabBtnStyle(activeTab === "restocks")} onClick={() => setActiveTab("restocks")}>Ingredient Restocks</button>
        <button style={tabBtnStyle(activeTab === "expenses")} onClick={() => setActiveTab("expenses")}>Expenses</button>
      </div>

    {activeTab === "sales" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: spacing.sm, flexWrap: "wrap" }}>
        <div style={{ fontSize: fontSize.md, fontWeight: 600, color: colors.textSecondary }}>Sales History</div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>From</span>
          <input
            type="date"
            value={salesFrom}
            onChange={(e) => setSalesFrom(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              outline: "none",
            }}
          />
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>To</span>
          <input
            type="date"
            value={salesTo}
            onChange={(e) => setSalesTo(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              outline: "none",
            }}
          />
          {(salesFrom || salesTo) && (
            <button
              onClick={() => { setSalesFrom(""); setSalesTo(""); }}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 600,
                backgroundColor: "transparent",
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        <button
          onClick={() => downloadSalesCsv(filtered, orderNumMap)}
          disabled={filtered.length === 0}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 700,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: filtered.length ? "pointer" : "not-allowed",
            opacity: filtered.length ? 1 : 0.5,
            minHeight: 32,
          }}
        >
          Export CSV ({filtered.length})
        </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: spacing.md, alignItems: "center", flexShrink: 0 }}>
        <input
          placeholder="Search by product, order #, SKU, barcode, employee, status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            outline: "none",
          }}
        />
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, whiteSpace: "nowrap" }}>
          {totals.lines} line{totals.lines !== 1 ? "s" : ""} · {totals.qty} item{totals.qty !== 1 ? "s" : ""} · ₱{totals.revenue.toFixed(2)}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm }}>
        {isLoading ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary }}>No sales found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>Order #</th>
                <th style={headStyle}>Date</th>
                <th style={headStyle}>Time</th>
                <th style={headStyle}>Status</th>
                <th style={headStyle}>Customer</th>
                <th style={headStyle}>Product</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Qty</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Unit Price</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Line Total</th>
                <th style={headStyle}>SKU</th>
                <th style={headStyle}>Barcode</th>
                <th style={headStyle}>Employee</th>
                <th style={headStyle}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.order_number}-${i}`} style={{ backgroundColor: i % 2 ? colors.surface : colors.background }}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{orderNumMap.get(r.order_number) || r.order_number}</td>
                  <td style={cellStyle}>{formatDateOnly(r.created_at)}</td>
                  <td style={cellStyle}>{formatTimeOnly(r.created_at)}</td>
                  <td style={{ ...cellStyle, textTransform: "capitalize" }}>{r.status}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary }}>{r.customer_name || "—"}</td>
                  <td style={cellStyle}>{r.product_name}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{r.quantity}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>₱{r.unit_price?.toFixed(2)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>₱{r.line_total?.toFixed(2)}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary }}>{r.sku || "—"}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary }}>{r.barcode || "—"}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary }}>{r.employee_name || "—"}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary, textTransform: "capitalize" }}>
                    {r.payment_method || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>}

    {activeTab === "restocks" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: spacing.sm, flexWrap: "wrap" }}>
        <div style={{ fontSize: fontSize.md, fontWeight: 600, color: colors.textSecondary }}>Ingredient Restock History</div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>From</span>
          <input
            type="date"
            value={restockFrom}
            onChange={(e) => setRestockFrom(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              outline: "none",
            }}
          />
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>To</span>
          <input
            type="date"
            value={restockTo}
            onChange={(e) => setRestockTo(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              outline: "none",
            }}
          />
          {(restockFrom || restockTo) && (
            <button
              onClick={() => { setRestockFrom(""); setRestockTo(""); }}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 600,
                backgroundColor: "transparent",
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        <button
          onClick={() => downloadRestockCsv(filteredRestocks)}
          disabled={filteredRestocks.length === 0}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 700,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: filteredRestocks.length ? "pointer" : "not-allowed",
            opacity: filteredRestocks.length ? 1 : 0.5,
            minHeight: 32,
          }}
        >
          Export CSV ({filteredRestocks.length})
        </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: spacing.md, alignItems: "center", flexShrink: 0 }}>
        <input
          placeholder="Search by ingredient, type, supplier, notes..."
          value={restockSearch}
          onChange={(e) => setRestockSearch(e.target.value)}
          style={{
            flex: 1,
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            outline: "none",
          }}
        />
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, whiteSpace: "nowrap" }}>
          {restockTotals.count} entries · ₱{restockTotals.totalCost.toFixed(2)} total spent
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm }}>
        {filteredRestocks.length === 0 ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary }}>No restocks recorded</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>Date</th>
                <th style={headStyle}>Time</th>
                <th style={headStyle}>Type</th>
                <th style={headStyle}>Ingredient</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Qty Change</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Previous</th>
                <th style={{ ...headStyle, textAlign: "right" }}>New Stock</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Cost</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Cost/Unit</th>
                <th style={headStyle}>Supplier</th>
                <th style={headStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRestocks.map((r, i) => (
                <tr key={r.id} style={{ backgroundColor: i % 2 ? colors.surface : colors.background }}>
                  <td style={cellStyle}>{formatDateOnly(r.created_at)}</td>
                  <td style={cellStyle}>{formatTimeOnly(r.created_at)}</td>
                  <td style={{ ...cellStyle, textTransform: "capitalize" }}>{r.type}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{r.ingredient_name || "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: r.quantity_change > 0 ? colors.success : colors.error, fontWeight: 600 }}>
                    {r.quantity_change > 0 ? "+" : ""}{r.quantity_change} {r.ingredient_unit || ""}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right", color: colors.textSecondary }}>{r.previous_stock}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{r.new_stock}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>{r.cost > 0 ? `₱${r.cost.toFixed(2)}` : "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: colors.textSecondary }}>{r.cost_per_unit > 0 ? `₱${r.cost_per_unit.toFixed(4)}` : "—"}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary }}>{r.supplier || "—"}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>}

    {activeTab === "expenses" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: spacing.sm, flexWrap: "wrap" }}>
        <div style={{ fontSize: fontSize.md, fontWeight: 600, color: colors.textSecondary }}>Expenses</div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>From</span>
          <input type="date" value={expenseFrom} onChange={(e) => setExpenseFrom(e.target.value)}
            style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: fontSize.sm, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, backgroundColor: colors.surface, color: colors.textPrimary, outline: "none" }} />
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>To</span>
          <input type="date" value={expenseTo} onChange={(e) => setExpenseTo(e.target.value)}
            style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: fontSize.sm, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, backgroundColor: colors.surface, color: colors.textPrimary, outline: "none" }} />
          {(expenseFrom || expenseTo) && (
            <button onClick={() => { setExpenseFrom(""); setExpenseTo(""); }}
              style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: fontSize.xs, fontWeight: 600, backgroundColor: "transparent", color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: "pointer" }}>
              Clear
            </button>
          )}
          <button onClick={() => downloadExpensesCsv(filteredExpenses)}
            disabled={filteredExpenses.length === 0}
            style={{ padding: `${spacing.xs}px ${spacing.md}px`, fontSize: fontSize.sm, fontWeight: 700, backgroundColor: colors.primary, color: colors.textOnPrimary, border: "none", borderRadius: borderRadius.sm, cursor: filteredExpenses.length ? "pointer" : "not-allowed", opacity: filteredExpenses.length ? 1 : 0.5, minHeight: 32 }}>
            Export CSV ({filteredExpenses.length})
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: spacing.md, alignItems: "center", flexShrink: 0 }}>
        <input placeholder="Search by product, unit, notes..." value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)}
          style={{ flex: 1, padding: `${spacing.xs}px ${spacing.md}px`, fontSize: fontSize.sm, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, backgroundColor: colors.surface, color: colors.textPrimary, outline: "none" }} />
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, whiteSpace: "nowrap" }}>
          {expenseTotals.count} item{expenseTotals.count !== 1 ? "s" : ""} · ₱{expenseTotals.total.toFixed(2)}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm }}>
        {filteredExpenses.length === 0 ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary }}>No expenses found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>Date</th>
                <th style={headStyle}>Time</th>
                <th style={headStyle}>Product / Item</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Qty</th>
                <th style={headStyle}>Unit</th>
                <th style={{ ...headStyle, textAlign: "right" }}>Cost (₱)</th>
                <th style={headStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((e, i) => (
                <tr key={e.id} style={{ backgroundColor: i % 2 ? colors.surface : colors.background }}>
                  <td style={cellStyle}>{formatDateOnly(e.created_at)}</td>
                  <td style={cellStyle}>{formatTimeOnly(e.created_at)}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{e.name}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{e.frequency || "1"}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary }}>{e.category || "pcs"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>₱{(e.amount || 0).toFixed(2)}</td>
                  <td style={{ ...cellStyle, color: colors.textSecondary, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{e.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>}
    </div>
  );
}
