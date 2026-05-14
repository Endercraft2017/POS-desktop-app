import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { ingredientRepo, stockAdjustmentRepo } from "../../lib/repositories";
import type { IngredientRow, StockAdjustmentWithIngredient } from "../../lib/repositories";
import { performSync } from "../../lib/sync-manager";

const UNIT_OPTIONS = ["g", "kg", "oz", "lb", "mL", "L", "cup", "tbsp", "tsp", "pcs", "each", "piece"];

export function IngredientsPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"manage" | "restock" | "history">("manage");

  // History filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // Restock form state
  const [restockMode, setRestockMode] = useState<"add" | "set" | "remove">("add");
  const [restockSearch, setRestockSearch] = useState("");
  const [restockIngId, setRestockIngId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockCost, setRestockCost] = useState("");
  const [restockSupplier, setRestockSupplier] = useState("");
  const [restockNotes, setRestockNotes] = useState("");
  const [restockError, setRestockError] = useState("");

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => ingredientRepo.getAll(),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: () => stockAdjustmentRepo.getAll(500),
  });

  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!restockIngId) throw new Error("Pick an ingredient");
      const qty = parseFloat(restockQty);
      if (!qty || qty <= 0) throw new Error("Enter a positive quantity");
      const cost = parseFloat(restockCost) || 0;
      const ing = ingredients.find((i) => i.id === restockIngId);
      if (!ing) throw new Error("Ingredient not found");
      const previous = ing.current_stock ?? 0;
      let next: number;
      let quantityChange: number;
      let type: string;
      if (restockMode === "add") {
        next = previous + qty;
        quantityChange = qty;
        type = "restock";
      } else if (restockMode === "set") {
        next = qty;
        quantityChange = qty - previous;
        type = "set";
      } else {
        next = previous - qty;
        quantityChange = -qty;
        type = "remove";
        if (next < 0) throw new Error(`Cannot remove ${qty} — only ${previous} ${ing.unit} in stock`);
      }
      return stockAdjustmentRepo.create({
        ingredient_id: restockIngId,
        type,
        quantity_change: quantityChange,
        previous_stock: previous,
        new_stock: next,
        cost: isAdd ? cost : undefined,
        supplier: restockSupplier.trim() || undefined,
        notes: restockNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      setRestockIngId(null);
      setRestockQty("");
      setRestockCost("");
      setRestockSupplier("");
      setRestockNotes("");
      setRestockSearch("");
      setRestockError("");
      performSync().catch(() => {});
    },
    onError: (err) => setRestockError((err as Error).message),
  });

  const deleteAdjustment = useMutation({
    mutationFn: (id: string) => stockAdjustmentRepo.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      performSync().catch(() => {});
    },
  });

  const createIngredient = useMutation({
    mutationFn: async () => {
      const exists = await ingredientRepo.existsByName(form.name);
      if (exists) throw new Error(`Ingredient "${form.name.trim()}" already exists`);
      return ingredientRepo.create({
        name: form.name.trim(),
        unit: form.unit,
        cost_per_unit: form.costPerUnit,
        current_stock: 0,
        min_stock: form.minStock,
        is_active: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
      setError("");
    },
    onError: (err) => setError((err as Error).message),
  });

  const updateIngredient = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IngredientRow> }) =>
      ingredientRepo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setEditingId(null);
      setForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
      setError("");
    },
    onError: (err) => alert("Failed: " + (err as Error).message),
  });

  const deleteIngredient = useMutation({
    mutationFn: (id: string) => ingredientRepo.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ingredients"] }),
  });

  const startEdit = (ing: IngredientRow) => {
    setEditingId(ing.id);
    setForm({ name: ing.name, unit: ing.unit, costPerUnit: ing.cost_per_unit ?? 0, minStock: ing.min_stock });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
    setError("");
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    setError("");
    if (editingId) {
      updateIngredient.mutate({
        id: editingId,
        data: {
          name: form.name.trim(),
          unit: form.unit,
          cost_per_unit: form.costPerUnit,
          min_stock: form.minStock,
        },
      });
    } else {
      createIngredient.mutate();
    }
  };

  const filtered = ingredients.filter((ing) =>
    !search.trim() || ing.name.toLowerCase().includes(search.toLowerCase())
  );

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    outline: "none",
    minHeight: 30,
    boxSizing: "border-box",
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

  const restockMatches = restockSearch.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(restockSearch.toLowerCase()))
    : ingredients;

  const restockSelected = ingredients.find((i) => i.id === restockIngId);

  const parseReason = (raw: string | null): { cost?: number; supplier?: string; notes?: string } => {
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw);
      return typeof obj === "object" && obj ? obj : {};
    } catch {
      return { notes: raw };
    }
  };

  const filteredHistory = history.filter((row: any) => {
    // Date range
    const dateStr = (row.created_at || "").slice(0, 10);
    if (historyFrom && dateStr < historyFrom) return false;
    if (historyTo && dateStr > historyTo) return false;
    // Text search
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    const reason = parseReason(row.reason);
    return (
      row.ingredient_name?.toLowerCase().includes(q) ||
      row.type?.toLowerCase().includes(q) ||
      (reason.supplier || "").toLowerCase().includes(q) ||
      (reason.notes || "").toLowerCase().includes(q)
    );
  });

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
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
    <div style={{ padding: spacing.lg, display: "flex", flexDirection: "column", gap: spacing.md, height: "100%", overflow: "hidden", boxSizing: "border-box" }}>
      <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
        Ingredients
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: spacing.xs, flexShrink: 0 }}>
        <button style={tabBtnStyle(activeView === "manage")} onClick={() => setActiveView("manage")}>Manage</button>
        <button style={tabBtnStyle(activeView === "restock")} onClick={() => setActiveView("restock")}>Adjust Stock</button>
        <button style={tabBtnStyle(activeView === "history")} onClick={() => setActiveView("history")}>
          History ({history.length})
        </button>
      </div>

      {activeView === "manage" && <>
      {/* Add / Edit form */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.sm }}>
          {editingId ? "Edit Ingredient" : "Add Ingredient"}
        </div>
        {error && (
          <div style={{ fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.xs, fontWeight: 600 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: spacing.sm, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Name</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              value={form.name}
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setError(""); }}
              placeholder="e.g. Flour, Sugar, Milk"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Unit</div>
            <select
              style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              value={form.unit}
              onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            >
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Cost/Unit (₱)</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              type="number" min="0" step="0.01"
              value={form.costPerUnit || ""}
              onChange={(e) => setForm((p) => ({ ...p, costPerUnit: parseFloat(e.target.value) || 0 }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="0.00"
            />
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Min Stock</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              type="number" min="0"
              value={form.minStock || ""}
              onChange={(e) => setForm((p) => ({ ...p, minStock: parseFloat(e.target.value) || 0 }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="0"
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

      {/* Search */}
      <input
        style={{ ...inputStyle, width: "100%" }}
        placeholder="Search ingredients..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Ingredients list */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        flex: 1,
        overflow: "auto",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
            {ingredients.length === 0 ? "No ingredients yet. Add one above." : "No matches"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: spacing.sm, textAlign: "left", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, backgroundColor: colors.surfaceElevated }}>Name</th>
                <th style={{ padding: spacing.sm, textAlign: "left", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, backgroundColor: colors.surfaceElevated, width: 80 }}>Unit</th>
                <th style={{ padding: spacing.sm, textAlign: "right", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, backgroundColor: colors.surfaceElevated, width: 110 }}>Cost/Unit</th>
                <th style={{ padding: spacing.sm, textAlign: "right", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, backgroundColor: colors.surfaceElevated, width: 100 }}>Stock</th>
                <th style={{ padding: spacing.sm, textAlign: "right", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, backgroundColor: colors.surfaceElevated, width: 100 }}>Min</th>
                <th style={{ padding: spacing.sm, textAlign: "center", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, borderBottom: `2px solid ${colors.border}`, position: "sticky", top: 0, backgroundColor: colors.surfaceElevated, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ing, i) => {
                const isEditing = editingId === ing.id;
                return (
                  <tr
                    key={ing.id}
                    onClick={() => { if (!isEditing) startEdit(ing); }}
                    style={{
                      backgroundColor: isEditing
                        ? colors.primaryLight
                        : (i % 2 ? colors.surface : colors.background),
                      cursor: "pointer",
                      borderLeft: isEditing ? `3px solid ${colors.primary}` : "3px solid transparent",
                    }}
                    title="Click to edit"
                  >
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: isEditing ? 700 : 500 }}>{ing.name}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary }}>{ing.unit}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "right" }}>₱{(ing.cost_per_unit ?? 0).toFixed(2)}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "right" }}>{ing.current_stock ?? 0}</td>
                    <td style={{
                      padding: spacing.sm,
                      fontSize: fontSize.sm,
                      color: (ing.current_stock ?? 0) < ing.min_stock ? colors.error : colors.textSecondary,
                      fontWeight: (ing.current_stock ?? 0) < ing.min_stock ? 700 : 400,
                      textAlign: "right",
                    }}>{ing.min_stock}</td>
                    <td style={{ padding: spacing.sm, textAlign: "center" }}>
                      <button
                        style={{ ...btnStyle("danger"), padding: `2px ${spacing.sm}px`, fontSize: fontSize.xs, minHeight: 24 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${ing.name}"?`)) deleteIngredient.mutate(ing.id);
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
      </>}

      {activeView === "restock" && (
        <div style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          padding: spacing.lg,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
            <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
              {restockMode === "add" ? "Add Stock" : restockMode === "set" ? "Set Stock" : "Remove Stock"}
            </div>
            <div style={{ display: "flex", gap: 0, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, overflow: "hidden" }}>
              <button
                onClick={() => setRestockMode("add")}
                style={{
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: restockMode === "add" ? colors.success : colors.surface,
                  color: restockMode === "add" ? "#fff" : colors.textSecondary,
                }}
              >
                + Add
              </button>
              <button
                onClick={() => setRestockMode("set")}
                style={{
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  border: "none",
                  borderLeft: `1px solid ${colors.border}`,
                  cursor: "pointer",
                  backgroundColor: restockMode === "set" ? colors.primary : colors.surface,
                  color: restockMode === "set" ? "#fff" : colors.textSecondary,
                }}
              >
                = Set
              </button>
              <button
                onClick={() => setRestockMode("remove")}
                style={{
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  border: "none",
                  borderLeft: `1px solid ${colors.border}`,
                  cursor: "pointer",
                  backgroundColor: restockMode === "remove" ? colors.error : colors.surface,
                  color: restockMode === "remove" ? "#fff" : colors.textSecondary,
                }}
              >
                − Remove
              </button>
            </div>
          </div>

          {restockError && (
            <div style={{ fontSize: fontSize.sm, color: colors.error, fontWeight: 600 }}>{restockError}</div>
          )}

          {/* Ingredient picker */}
          <div>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Search ingredient</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              placeholder="Type to search ingredients..."
              value={restockSearch}
              onChange={(e) => { setRestockSearch(e.target.value); setRestockIngId(null); }}
            />
            {restockSearch.trim() && !restockIngId && (
              <div style={{
                marginTop: spacing.xs,
                maxHeight: 200,
                overflowY: "auto",
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
              }}>
                {restockMatches.length === 0 ? (
                  <div style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textTertiary }}>No matches</div>
                ) : restockMatches.map((ing) => (
                  <div
                    key={ing.id}
                    onClick={() => { setRestockIngId(ing.id); setRestockSearch(ing.name); }}
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: fontSize.sm,
                      color: colors.textPrimary,
                      cursor: "pointer",
                      borderBottom: `1px solid ${colors.border}`,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{ing.name}</span>
                    <span style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>
                      Stock: {ing.current_stock ?? 0} {ing.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {restockSelected && (
            <>
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.primaryLight,
                borderRadius: borderRadius.sm,
                fontSize: fontSize.sm,
                color: colors.textPrimary,
              }}>
                <b>{restockSelected.name}</b> · current stock: {restockSelected.current_stock ?? 0} {restockSelected.unit}
              </div>

              <div style={{ display: "flex", gap: spacing.md, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>
                    {restockMode === "set" ? "New stock" : "Quantity"} ({restockSelected.unit}) *
                  </div>
                  <input
                    style={{ ...inputStyle, width: "100%" }}
                    type="number" min="0" step="0.01"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && restockMutation.mutate()}
                    placeholder="0"
                  />
                </div>
                {restockMode === "add" && (
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>
                      Total cost (₱)
                    </div>
                    <input
                      style={{ ...inputStyle, width: "100%" }}
                      type="number" min="0" step="0.01"
                      value={restockCost}
                      onChange={(e) => setRestockCost(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && restockMutation.mutate()}
                      placeholder="0.00"
                    />
                  </div>
                )}
              </div>

              {restockMode === "add" && (
                <div>
                  <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Supplier (optional)</div>
                  <input
                    style={{ ...inputStyle, width: "100%" }}
                    value={restockSupplier}
                    onChange={(e) => setRestockSupplier(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && restockMutation.mutate()}
                    placeholder="e.g. Local market, Costco"
                  />
                </div>
              )}

              <div>
                <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>
                  {restockMode === "remove" ? "Reason (e.g. spoilage, used in batch)" : "Notes (optional)"}
                </div>
                <input
                  style={{ ...inputStyle, width: "100%" }}
                  value={restockNotes}
                  onChange={(e) => setRestockNotes(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && restockMutation.mutate()}
                  placeholder={restockMode === "add" ? "Any details about this purchase" : "Why is the stock being removed?"}
                />
              </div>

              {parseFloat(restockQty) >= 0 && restockQty !== "" && (() => {
                const qty = parseFloat(restockQty);
                const cost = parseFloat(restockCost) || 0;
                const previous = restockSelected.current_stock ?? 0;
                const next = restockMode === "add" ? previous + qty : restockMode === "set" ? qty : previous - qty;
                const diff = next - previous;
                return (
                  <div style={{ fontSize: fontSize.sm, color: next < 0 ? colors.error : colors.textSecondary }}>
                    {restockMode !== "remove" && cost > 0 && qty > 0 && (
                      <>Cost per {restockSelected.unit}: <b>₱{(cost / qty).toFixed(4)}</b>{" · "}</>
                    )}
                    New stock: <b>{next.toFixed(2)} {restockSelected.unit}</b>
                    {restockMode === "set" && diff !== 0 && (
                      <span style={{ marginLeft: spacing.sm, color: diff > 0 ? colors.success : colors.error }}>
                        ({diff > 0 ? "+" : ""}{diff.toFixed(2)})
                      </span>
                    )}
                    {next < 0 && <span style={{ marginLeft: spacing.sm }}>⚠ Insufficient stock</span>}
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: spacing.sm }}>
                <button
                  style={{
                    ...btnStyle("primary"),
                    backgroundColor: restockMode === "add" ? colors.success : restockMode === "set" ? colors.primary : colors.error,
                  }}
                  onClick={() => restockMutation.mutate()}
                  disabled={!restockQty || parseFloat(restockQty) <= 0 || restockMutation.isPending}
                >
                  {restockMutation.isPending
                    ? (restockMode === "add" ? "Adding..." : restockMode === "set" ? "Setting..." : "Removing...")
                    : (restockMode === "add" ? "+ Add Stock" : restockMode === "set" ? "= Set Stock" : "− Remove Stock")}
                </button>
                <button
                  style={btnStyle("secondary")}
                  onClick={() => {
                    setRestockIngId(null);
                    setRestockSearch("");
                    setRestockQty("");
                    setRestockCost("");
                    setRestockSupplier("");
                    setRestockNotes("");
                    setRestockError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {activeView === "history" && (<>
        <div style={{ display: "flex", gap: spacing.sm, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <input
            placeholder="Search by ingredient, type, supplier, notes..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 240 }}
          />
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>From</span>
          <input
            type="date"
            value={historyFrom}
            onChange={(e) => setHistoryFrom(e.target.value)}
            style={{ ...inputStyle }}
          />
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>To</span>
          <input
            type="date"
            value={historyTo}
            onChange={(e) => setHistoryTo(e.target.value)}
            style={{ ...inputStyle }}
          />
          {(historyFrom || historyTo || historySearch) && (
            <button
              onClick={() => { setHistoryFrom(""); setHistoryTo(""); setHistorySearch(""); }}
              style={btnStyle("secondary")}
            >
              Clear
            </button>
          )}
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, whiteSpace: "nowrap" }}>
            {filteredHistory.length} of {history.length} entries
          </div>
        </div>
        <div style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          flex: 1,
          overflow: "auto",
        }}>
          {filteredHistory.length === 0 ? (
            <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary }}>
              {history.length === 0 ? "No restock history yet" : "No entries match your filters"}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Date / Time","Type","Ingredient","Quantity","Previous","New","Cost","Cost/Unit","Supplier","Notes",""]
                    .map((h, i) => (
                    <th key={i} style={{
                      padding: spacing.sm,
                      textAlign: "left",
                      fontSize: fontSize.xs,
                      fontWeight: 700,
                      color: colors.textTertiary,
                      borderBottom: `2px solid ${colors.border}`,
                      position: "sticky",
                      top: 0,
                      backgroundColor: colors.surfaceElevated,
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row, i) => {
                  const reason = parseReason(row.reason);
                  const cost = reason.cost ?? 0;
                  const costPerUnit = row.quantity_change > 0 ? cost / row.quantity_change : 0;
                  return (
                    <tr key={row.id} style={{ backgroundColor: i % 2 ? colors.surface : colors.background }}>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textPrimary, whiteSpace: "nowrap" }}>{formatDate(row.created_at)}</td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, textTransform: "capitalize" }}>{row.type}</td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: 500 }}>{(row as any).ingredient_name || row.ingredient_id}</td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: row.quantity_change > 0 ? colors.success : colors.error, fontWeight: 600, textAlign: "right" }}>
                        {row.quantity_change > 0 ? "+" : ""}{row.quantity_change} {(row as any).ingredient_unit || ""}
                      </td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textTertiary, textAlign: "right" }}>{row.previous_stock}</td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textPrimary, textAlign: "right" }}>{row.new_stock}</td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, textAlign: "right", fontWeight: 600 }}>
                        {cost > 0 ? `₱${cost.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, textAlign: "right" }}>
                        {costPerUnit > 0 ? `₱${costPerUnit.toFixed(4)}` : "—"}
                      </td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary }}>{reason.supplier || "—"}</td>
                      <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{reason.notes || "—"}</td>
                      <td style={{ padding: spacing.sm }}>
                        <button
                          style={{ ...btnStyle("danger"), padding: `2px ${spacing.sm}px`, fontSize: fontSize.xs, minHeight: 22 }}
                          onClick={() => { if (confirm("Delete this entry?")) deleteAdjustment.mutate(row.id); }}
                        >
                          Del
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>)}
    </div>
  );
}
