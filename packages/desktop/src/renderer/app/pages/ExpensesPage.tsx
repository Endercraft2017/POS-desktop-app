import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { expenseRepo } from "../../lib/repositories";
import type { ExpenseRow } from "../../lib/repositories";
import { performSync } from "../../lib/sync-manager";

const UNIT_OPTIONS = ["pcs", "g", "kg", "oz", "lb", "mL", "L", "cup", "tbsp", "tsp", "pack", "box", "bag", "bottle", "can", "each"];

export function ExpensesPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ name: "", unit: "pcs", quantity: "", cost: "", notes: "" });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => expenseRepo.getAll(),
  });

  const createExpense = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(form.quantity) || 0;
      const cost = parseFloat(form.cost) || 0;
      if (!form.name.trim()) throw new Error("Enter a product name");
      if (qty <= 0) throw new Error("Enter a quantity");
      if (cost <= 0) throw new Error("Enter a cost");
      return expenseRepo.create({
        name: form.name.trim(),
        category: form.unit,
        amount: cost,
        frequency: String(qty),
        notes: form.notes.trim() || null,
        is_active: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setForm({ name: "", unit: "pcs", quantity: "", cost: "", notes: "" });
      setError("");
      performSync().catch(() => {});
    },
    onError: (err) => setError((err as Error).message),
  });

  const updateExpense = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseRow> }) =>
      expenseRepo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setEditingId(null);
      setForm({ name: "", unit: "pcs", quantity: "", cost: "", notes: "" });
      setError("");
      performSync().catch(() => {});
    },
    onError: (err) => alert("Failed: " + (err as Error).message),
  });

  const deleteExpense = useMutation({
    mutationFn: (id: string) => expenseRepo.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      performSync().catch(() => {});
    },
  });

  const startEdit = (exp: ExpenseRow) => {
    setEditingId(exp.id);
    setForm({
      name: exp.name,
      unit: exp.category || "pcs",
      quantity: exp.frequency || "1",
      cost: String(exp.amount),
      notes: exp.notes || "",
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", unit: "pcs", quantity: "", cost: "", notes: "" });
    setError("");
  };

  const handleSave = () => {
    setError("");
    if (editingId) {
      const qty = parseFloat(form.quantity) || 0;
      const cost = parseFloat(form.cost) || 0;
      updateExpense.mutate({
        id: editingId,
        data: {
          name: form.name.trim(),
          category: form.unit,
          amount: cost,
          frequency: String(qty),
          notes: form.notes.trim() || null,
        },
      });
    } else {
      createExpense.mutate();
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return expenses;
    const q = search.toLowerCase();
    return expenses.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q) ||
      (e.category || "").toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const totalCost = useMemo(() =>
    filtered.reduce((s, e) => s + (e.amount || 0), 0),
    [filtered]
  );

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    outline: "none",
    minHeight: 30,
    boxSizing: "border-box" as const,
  };

  const btnStyle = (variant: "primary" | "secondary" | "danger"): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: variant === "secondary" ? `1px solid ${colors.border}` : "none",
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    minHeight: 30,
    backgroundColor:
      variant === "primary" ? colors.primary :
      variant === "danger" ? colors.error :
      colors.buttonSecondary,
    color: variant === "secondary" ? colors.buttonSecondaryText : colors.textOnPrimary,
  });

  return (
    <div style={{ padding: spacing.lg, display: "flex", flexDirection: "column", gap: spacing.md, height: "100%", overflow: "hidden", boxSizing: "border-box" }}>
      <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
        Expenses
      </h1>

      {/* Add / Edit form */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.sm }}>
          {editingId ? "Edit Expense" : "Add Expense"}
        </div>
        {error && (
          <div style={{ fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.xs, fontWeight: 600 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: spacing.sm, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Product / Item *</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              value={form.name}
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setError(""); }}
              placeholder="e.g. Flour, Cooking Oil, Cups"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Qty *</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              type="number" min="0" step="0.01"
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Unit</div>
            <select
              style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              value={form.unit}
              onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
            >
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Cost (₱) *</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              type="number" min="0" step="0.01"
              value={form.cost}
              onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="0.00"
            />
          </div>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Notes</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Optional notes"
            />
          </div>
          <button style={btnStyle("primary")} onClick={handleSave} disabled={!form.name.trim()}>
            {editingId ? "Save" : "+ Add"}
          </button>
          {editingId && (
            <button style={btnStyle("secondary")} onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </div>

      {/* Search + totals */}
      <div style={{ display: "flex", gap: spacing.sm, alignItems: "center", flexShrink: 0 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Search expenses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, whiteSpace: "nowrap" }}>
          {filtered.length} item{filtered.length !== 1 ? "s" : ""} · Total: ₱{totalCost.toFixed(2)}
        </div>
      </div>

      {/* Expenses list */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        flex: 1,
        overflow: "auto",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
            {expenses.length === 0 ? "No expenses yet. Add one above." : "No matches"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Product / Item", "Qty", "Unit", "Cost (₱)", "Notes", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: spacing.sm,
                    textAlign: i === 4 ? "right" : "left",
                    fontSize: fontSize.xs,
                    fontWeight: 700,
                    color: colors.textTertiary,
                    borderBottom: `2px solid ${colors.border}`,
                    position: "sticky",
                    top: 0,
                    backgroundColor: colors.surfaceElevated,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((exp, i) => {
                const isEditing = editingId === exp.id;
                return (
                  <tr
                    key={exp.id}
                    onClick={() => { if (!isEditing) startEdit(exp); }}
                    style={{
                      backgroundColor: isEditing ? colors.primaryLight : (i % 2 ? colors.surface : colors.background),
                      cursor: "pointer",
                      borderLeft: isEditing ? `3px solid ${colors.primary}` : "3px solid transparent",
                    }}
                    title="Click to edit"
                  >
                    <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: "nowrap" }}>{formatDate(exp.created_at)}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: isEditing ? 700 : 500 }}>{exp.name}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary }}>{exp.frequency || "1"}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary }}>{exp.category || "pcs"}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: 600, textAlign: "right" }}>₱{(exp.amount || 0).toFixed(2)}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{exp.notes || "—"}</td>
                    <td style={{ padding: spacing.sm }}>
                      <button
                        style={{ ...btnStyle("danger"), padding: `2px ${spacing.sm}px`, fontSize: fontSize.xs, minHeight: 24 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${exp.name}"?`)) deleteExpense.mutate(exp.id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
