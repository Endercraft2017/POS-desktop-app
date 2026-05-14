import React, { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { ingredientRepo, categoryRepo, settingsRepo } from "../../lib/repositories";
import { getLastStartupMs } from "../../lib/startup-perf";
import type { IngredientRow, CategoryRow } from "../../lib/repositories";
import {
  performSync,
  startAutoSync,
  stopAutoSync,
} from "../../lib/sync-manager";

const SETTING_LINKS = [
  { label: "Categories", description: "Manage product categories", key: "categories" },
  { label: "Suppliers", description: "Manage suppliers", key: "suppliers" },
  { label: "Tax Rates", description: "Configure tax rates", key: "tax-rates" },
  { label: "Employees", description: "Manage employee accounts and PINs", key: "employees" },
  { label: "Spreadsheet", description: "Open the bulk editor for sales, ingredients, and expenses", key: "spreadsheet" },
  { label: "Snapshots", description: "Weekly backups that can be restored to recover lost data", key: "snapshots" },
  { label: "Promo codes", description: "Generate QR codes that give a percentage off in Checkout", key: "promo-codes" },
  { label: "Default counting", description: "Numbers seeded into the Counting tab on every new day", key: "counting-defaults" },
];

const THEME_OPTIONS: { value: "system" | "light" | "dark"; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const UNIT_OPTIONS = ["g", "kg", "oz", "lb", "mL", "L", "cup", "tbsp", "tsp", "pcs", "each", "piece"];

export function SettingsPage() {
  const { colors, spacing, borderRadius, fontSize, isDark, themeMode, setThemeMode } =
    useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentEmployee, logout } = useAuthStore();
  const { tooltipsEnabled, setTooltipsEnabled } = useSettingsStore();

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  // --- Sync state ---
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data: syncEnabled = true } = useQuery({
    queryKey: ["settings", "sync_enabled"],
    queryFn: async () => {
      const rows = await settingsRepo.get("sync_enabled");
      return rows !== "false";
    },
  });

  const { data: lastSyncTime } = useQuery({
    queryKey: ["settings", "last_sync_success"],
    queryFn: () => settingsRepo.get("last_sync_success"),
    refetchInterval: 10000,
  });

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await performSync();
      if (result.error) {
        setSyncMessage(`Error: ${result.error}`);
      } else {
        setSyncMessage(`Pushed ${result.pushed}, pulled ${result.pulled}`);
        queryClient.invalidateQueries({ queryKey: ["settings", "last_sync_success"] });
      }
    } catch (e: any) {
      setSyncMessage(`Failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleToggleSync = useCallback(async (enabled: boolean) => {
    await settingsRepo.set("sync_enabled", enabled ? "true" : "false");
    if (enabled) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
    queryClient.invalidateQueries({ queryKey: ["settings", "sync_enabled"] });
  }, []);

  // --- Ingredient state ---
  const [ingredientForm, setIngredientForm] = useState({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
  const [ingredientError, setIngredientError] = useState("");
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  // --- Category state ---
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // Ingredients data
  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => ingredientRepo.getAll(),
  });

  // Categories data
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryRepo.getAll(),
  });

  const createCategory = useMutation({
    mutationFn: async () => {
      const exists = await categoryRepo.existsByName(categoryName);
      if (exists) throw new Error(`Category "${categoryName.trim()}" already exists`);
      return categoryRepo.create({ name: categoryName.trim(), color: "#2563EB", icon: null, sort_order: 0, is_active: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryName("");
      setCategoryError("");
    },
    onError: (err) => setCategoryError((err as Error).message),
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      categoryRepo.update(id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingCategoryId(null);
      setCategoryName("");
      setCategoryError("");
    },
    onError: (err) => setCategoryError((err as Error).message),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => categoryRepo.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const handleSaveCategory = () => {
    if (!categoryName.trim()) return;
    setCategoryError("");
    if (editingCategoryId) {
      updateCategory.mutate({ id: editingCategoryId, name: categoryName });
    } else {
      createCategory.mutate();
    }
  };

  const createIngredient = useMutation({
    mutationFn: async () => {
      const exists = await ingredientRepo.existsByName(ingredientForm.name);
      if (exists) throw new Error(`Ingredient "${ingredientForm.name.trim()}" already exists`);
      return ingredientRepo.create({
        name: ingredientForm.name.trim(),
        unit: ingredientForm.unit,
        cost_per_unit: ingredientForm.costPerUnit,
        current_stock: 0,
        min_stock: ingredientForm.minStock,
        is_active: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setIngredientForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
      setIngredientError("");
    },
    onError: (err) => setIngredientError((err as Error).message),
  });

  const updateIngredient = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IngredientRow> }) =>
      ingredientRepo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setEditingIngredientId(null);
      setIngredientForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
      setIngredientError("");
    },
    onError: (err) => alert("Failed: " + (err as Error).message),
  });

  const deleteIngredient = useMutation({
    mutationFn: (id: string) => ingredientRepo.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ingredients"] }),
  });

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key));
    setEditingIngredientId(null);
    setIngredientForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
    setIngredientError("");
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryError("");
  };

  const startEditIngredient = (ing: IngredientRow) => {
    setEditingIngredientId(ing.id);
    setIngredientForm({ name: ing.name, unit: ing.unit, costPerUnit: ing.cost_per_unit ?? 0, minStock: ing.min_stock });
    setIngredientError("");
  };

  const handleSaveIngredient = () => {
    if (!ingredientForm.name.trim()) return;
    setIngredientError("");
    if (editingIngredientId) {
      updateIngredient.mutate({
        id: editingIngredientId,
        data: {
          name: ingredientForm.name.trim(),
          unit: ingredientForm.unit,
          cost_per_unit: ingredientForm.costPerUnit,
          min_stock: ingredientForm.minStock,
        },
      });
    } else {
      createIngredient.mutate();
    }
  };

  // --- Styles ---
  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: fontSize.lg,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
    marginBottom: spacing.sm,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${spacing.sm}px 0`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: 600,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: 600,
  };

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs + 2}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const smallBtnStyle = (variant: "primary" | "secondary" | "danger"): React.CSSProperties => ({
    padding: `3px ${spacing.sm}px`,
    fontSize: fontSize.xs,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    minHeight: 24,
    backgroundColor:
      variant === "primary" ? colors.primary
      : variant === "danger" ? colors.buttonDestructive
      : colors.buttonSecondary,
    color: variant === "secondary" ? colors.buttonSecondaryText : colors.textOnPrimary,
  });

  const linkBtnStyle = (isExpanded: boolean): React.CSSProperties => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    backgroundColor: isExpanded ? colors.surfaceElevated : "transparent",
    color: colors.textPrimary,
    border: "none",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
    textAlign: "left",
    minHeight: 36,
    transition: "background-color 0.1s",
  });

  return (
    <div
      style={{
        padding: spacing.lg,
        display: "flex",
        flexDirection: "column",
        gap: spacing.md,
        height: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
        Settings
      </h1>

      {/* Current Session */}
      <div>
        <h2 style={sectionTitleStyle}>Current Session</h2>
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>Employee</span>
            <span style={valueStyle}>{currentEmployee?.name ?? "Unknown"}</span>
          </div>
          <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}` }}>
            <span style={labelStyle}>Role</span>
            <span style={{ ...valueStyle, textTransform: "capitalize" as const }}>{currentEmployee?.role ?? "N/A"}</span>
          </div>
          {(() => {
            const startup = getLastStartupMs();
            if (!startup) return null;
            const seconds = (startup.ms / 1000).toFixed(2);
            return (
              <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}` }}>
                <span style={labelStyle} title="Time from page load until the app became interactive">Last Startup Time</span>
                <span style={{ ...valueStyle, color: startup.ms < 1500 ? colors.success : startup.ms < 3500 ? colors.textPrimary : colors.warning ?? colors.textPrimary }}>
                  {seconds}s <span style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: 400 }}>({startup.ms} ms)</span>
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Management */}
      <div>
        <h2 style={sectionTitleStyle}>Management</h2>
        <div style={cardStyle}>
          {SETTING_LINKS.map((link, i) => (
            <div key={link.key}>
              <button
                style={{
                  ...linkBtnStyle(expandedSection === link.key),
                  borderBottom: i === SETTING_LINKS.length - 1 && expandedSection !== link.key ? "none" : linkBtnStyle(false).borderBottom,
                }}
                onClick={() =>
                  link.key === "spreadsheet"
                    ? navigate("/spreadsheet")
                    : (link.key === "ingredients" || link.key === "categories" || link.key === "snapshots" || link.key === "promo-codes" || link.key === "counting-defaults")
                    ? toggleSection(link.key)
                    : alert("Coming soon")
                }
              >
                <div>
                  <div>{link.label}</div>
                  <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: 400, marginTop: 1 }}>
                    {link.description}
                  </div>
                </div>
                <span style={{ fontSize: fontSize.md, color: colors.textTertiary, transition: "transform 0.2s", transform: expandedSection === link.key ? "rotate(90deg)" : "none" }}>
                  ›
                </span>
              </button>

              {/* Categories expanded section */}
              {link.key === "categories" && expandedSection === "categories" && (
                <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.background }}>
                  {categoryError && (
                    <div style={{ fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.xs, fontWeight: 600 }}>
                      {categoryError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: spacing.xs, alignItems: "flex-end", marginBottom: spacing.sm }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Category Name</div>
                      <input
                        style={{ ...inputStyle, width: "100%" }}
                        value={categoryName}
                        onChange={(e) => { setCategoryName(e.target.value); setCategoryError(""); }}
                        placeholder="e.g. Beverages, Food, Desserts"
                        onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()}
                      />
                    </div>
                    <button
                      style={smallBtnStyle("primary")}
                      onClick={handleSaveCategory}
                      disabled={!categoryName.trim()}
                    >
                      {editingCategoryId ? "Save" : "+ Add"}
                    </button>
                    {editingCategoryId && (
                      <button
                        style={smallBtnStyle("secondary")}
                        onClick={() => { setEditingCategoryId(null); setCategoryName(""); setCategoryError(""); }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {categories.length === 0 ? (
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, padding: `${spacing.xs}px 0` }}>
                      No categories yet. Add one above.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: `${spacing.xs}px 0`,
                            fontSize: fontSize.sm,
                            color: colors.textPrimary,
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{cat.name}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              style={smallBtnStyle("primary")}
                              onClick={() => { setEditingCategoryId(cat.id); setCategoryName(cat.name); setCategoryError(""); }}
                            >
                              Edit
                            </button>
                            <button
                              style={smallBtnStyle("danger")}
                              onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteCategory.mutate(cat.id); }}
                            >
                              Del
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ingredients expanded section */}
              {link.key === "ingredients" && expandedSection === "ingredients" && (
                <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.background }}>

                  {/* Error message */}
                  {ingredientError && (
                    <div style={{ fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.xs, fontWeight: 600 }}>
                      {ingredientError}
                    </div>
                  )}

                  {/* Add / Edit form */}
                  <div style={{ display: "flex", gap: spacing.xs, alignItems: "flex-end", marginBottom: spacing.sm, flexWrap: "wrap" }}>
                    <div style={{ flex: 2, minWidth: 120 }}>
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Name</div>
                      <input
                        style={{ ...inputStyle, width: "100%" }}
                        value={ingredientForm.name}
                        onChange={(e) => { setIngredientForm((p) => ({ ...p, name: e.target.value })); setIngredientError(""); }}
                        placeholder="e.g. Flour, Sugar, Milk"
                        onKeyDown={(e) => e.key === "Enter" && handleSaveIngredient()}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 60 }}>
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Unit</div>
                      <select
                        style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
                        value={ingredientForm.unit}
                        onChange={(e) => setIngredientForm((p) => ({ ...p, unit: e.target.value }))}
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Cost/Unit ($)</div>
                      <input
                        style={{ ...inputStyle, width: "100%" }}
                        type="number"
                        min="0"
                        step="0.01"
                        value={ingredientForm.costPerUnit || ""}
                        onChange={(e) => setIngredientForm((p) => ({ ...p, costPerUnit: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 70 }}>
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Min Stock</div>
                      <input
                        style={{ ...inputStyle, width: "100%" }}
                        type="number"
                        min="0"
                        value={ingredientForm.minStock || ""}
                        onChange={(e) => setIngredientForm((p) => ({ ...p, minStock: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                    <button
                      style={smallBtnStyle("primary")}
                      onClick={handleSaveIngredient}
                      disabled={!ingredientForm.name.trim()}
                    >
                      {editingIngredientId ? "Save" : "+ Add"}
                    </button>
                    {editingIngredientId && (
                      <button
                        style={smallBtnStyle("secondary")}
                        onClick={() => {
                          setEditingIngredientId(null);
                          setIngredientForm({ name: "", unit: "g", costPerUnit: 0, minStock: 0 });
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Ingredients list */}
                  {ingredients.length === 0 ? (
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, padding: `${spacing.xs}px 0` }}>
                      No ingredients yet. Add one above.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 250, overflowY: "auto" }}>
                      {/* Header */}
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 50px 70px 70px 80px", gap: spacing.xs, padding: `2px 0`, fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: 700, borderBottom: `1px solid ${colors.border}` }}>
                        <span>Name</span>
                        <span>Unit</span>
                        <span>Cost/Unit</span>
                        <span>Min Stock</span>
                        <span>Actions</span>
                      </div>
                      {ingredients.map((ing) => (
                        <div
                          key={ing.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 50px 70px 70px 80px",
                            gap: spacing.xs,
                            padding: `${spacing.xs}px 0`,
                            fontSize: fontSize.sm,
                            color: colors.textPrimary,
                            borderBottom: `1px solid ${colors.border}`,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{ing.name}</span>
                          <span style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>{ing.unit}</span>
                          <span style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>₱{(ing.cost_per_unit ?? 0).toFixed(2)}</span>
                          <span style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>{ing.min_stock}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button style={smallBtnStyle("primary")} onClick={() => startEditIngredient(ing)}>Edit</button>
                            <button
                              style={smallBtnStyle("danger")}
                              onClick={() => {
                                if (confirm(`Delete "${ing.name}"?`)) deleteIngredient.mutate(ing.id);
                              }}
                            >
                              Del
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Snapshots expanded section */}
              {link.key === "snapshots" && expandedSection === "snapshots" && (
                <SnapshotsSection
                  busy={snapshotBusy}
                  setBusy={setSnapshotBusy}
                  message={snapshotMsg}
                  setMessage={setSnapshotMsg}
                />
              )}

              {/* Promo codes expanded section */}
              {link.key === "promo-codes" && expandedSection === "promo-codes" && (
                <PromoCodesSection />
              )}

              {/* Default counting expanded section */}
              {link.key === "counting-defaults" && expandedSection === "counting-defaults" && (
                <CountingDefaultsSection />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div>
        <h2 style={sectionTitleStyle}>Appearance</h2>
        <div style={cardStyle}>
          <div style={rowStyle}>
            <div>
              <span style={labelStyle}>Theme</span>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                Currently {isDark ? "dark" : "light"}{themeMode === "system" ? " (following system)" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  style={{
                    padding: `${spacing.xs}px ${spacing.md}px`,
                    fontSize: fontSize.sm,
                    fontWeight: 600,
                    backgroundColor: themeMode === opt.value ? colors.primary : colors.buttonSecondary,
                    color: themeMode === opt.value ? colors.textOnPrimary : colors.buttonSecondaryText,
                    border: `1px solid ${themeMode === opt.value ? colors.primary : colors.border}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                    minHeight: 28,
                  }}
                  onClick={() => setThemeMode(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}` }}>
            <div>
              <span style={labelStyle}>Tooltips</span>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                Show helpful hints when hovering
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                backgroundColor: tooltipsEnabled ? colors.primary : colors.border,
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.2s",
                flexShrink: 0,
              }}
              onClick={() => setTooltipsEnabled(!tooltipsEnabled)}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#fff",
                  position: "absolute",
                  top: 3,
                  left: tooltipsEnabled ? 21 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Sync */}
      <div>
        <h2 style={sectionTitleStyle}>Cloud Sync</h2>
        <div style={cardStyle}>
          <div style={rowStyle}>
            <div>
              <span style={labelStyle}>Auto Sync</span>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                Automatically sync data every 30 seconds
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                backgroundColor: syncEnabled ? colors.primary : colors.border,
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.2s",
                flexShrink: 0,
              }}
              onClick={() => handleToggleSync(!syncEnabled)}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#fff",
                  position: "absolute",
                  top: 3,
                  left: syncEnabled ? 21 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
          </div>
          <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}` }}>
            <span style={labelStyle}>Last Synced</span>
            <span style={valueStyle}>
              {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : "Never"}
            </span>
          </div>
          {syncMessage && (
            <div
              style={{
                fontSize: fontSize.xs,
                color: syncMessage.startsWith("Error") || syncMessage.startsWith("Failed")
                  ? colors.error
                  : colors.success,
                paddingTop: spacing.xs,
                fontWeight: 600,
              }}
            >
              {syncMessage}
            </div>
          )}
          <button
            style={{
              width: "100%",
              minHeight: 32,
              marginTop: spacing.sm,
              fontSize: fontSize.sm,
              fontWeight: 600,
              backgroundColor: colors.primary,
              color: colors.textOnPrimary,
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: syncing ? "wait" : "pointer",
              opacity: syncing ? 0.6 : 1,
            }}
            onClick={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>

      {/* System Info */}
      <div>
        <h2 style={sectionTitleStyle}>System Info</h2>
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>Database</span>
            <span style={valueStyle}>Local SQLite</span>
          </div>
          <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}` }}>
            <span style={labelStyle}>Sync</span>
            <span style={{ ...valueStyle, color: syncEnabled ? colors.success : colors.textTertiary }}>
              {syncEnabled ? "Cloud Sync Active" : "Local Only"}
            </span>
          </div>
          <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}` }}>
            <span style={labelStyle}>Version</span>
            <span style={valueStyle}>1.0.0</span>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <button
        style={{
          width: "100%",
          minHeight: 34,
          fontSize: fontSize.sm,
          fontWeight: 600,
          backgroundColor: colors.buttonDestructive,
          color: colors.textOnPrimary,
          border: "none",
          borderRadius: borderRadius.md,
          cursor: "pointer",
        }}
        onClick={handleSignOut}
      >
        Sign Out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshots section
// ---------------------------------------------------------------------------

const SNAPSHOT_API_BASE = "https://3ks.afkcube.com/api";
const SNAPSHOT_API_TOKEN = "afkcube_2017";

interface SnapshotInfo {
  filename: string;
  size: number;
  created_at: string;
  kind: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function SnapshotsSection({ busy, setBusy, message, setMessage }: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  message: string | null;
  setMessage: (m: string | null) => void;
}) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["backup-snapshots"],
    queryFn: async (): Promise<SnapshotInfo[]> => {
      const res = await fetch(`${SNAPSHOT_API_BASE}/backup/snapshots`, {
        headers: { Authorization: `Bearer ${SNAPSHOT_API_TOKEN}` },
      });
      const data = await res.json();
      return data.success ? data.snapshots : [];
    },
  });

  const createNow = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("Creating snapshot...");
    try {
      const res = await fetch(`${SNAPSHOT_API_BASE}/backup/snapshot`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SNAPSHOT_API_TOKEN}` },
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Snapshot created: ${data.snapshot.filename} (${formatBytes(data.snapshot.size)})`);
        queryClient.invalidateQueries({ queryKey: ["backup-snapshots"] });
      } else {
        setMessage("Failed: " + data.error);
      }
    } catch (e) {
      setMessage("Failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (filename: string) => {
    if (busy) return;
    if (!confirm(`Restore from ${filename}?\n\nThis replaces the current cloud database. A safety backup of the current state will be created first. Restart clients after restore.`)) return;
    setBusy(true);
    setMessage("Restoring...");
    try {
      const res = await fetch(`${SNAPSHOT_API_BASE}/backup/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SNAPSHOT_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Restored from ${filename}. Pre-restore safety copy: ${data.pre_restore_backup}. Reload apps to see changes.`);
        queryClient.invalidateQueries({ queryKey: ["backup-snapshots"] });
      } else {
        setMessage("Restore failed: " + data.error);
      }
    } catch (e) {
      setMessage("Restore failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.background }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm, flexWrap: "wrap", gap: spacing.sm }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
          Automatic end-of-day snapshots run nightly. Gzip-compressed, kept for 365 days.
        </div>
        <button
          onClick={createNow}
          disabled={busy}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.xs,
            fontWeight: 600,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          + Create Snapshot Now
        </button>
      </div>

      {message && (
        <div style={{
          fontSize: fontSize.xs,
          color: message.startsWith("Failed") || message.startsWith("Restore failed") ? colors.error : colors.success,
          padding: `${spacing.xs}px ${spacing.sm}px`,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.sm,
          marginBottom: spacing.sm,
        }}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>Loading snapshots...</div>
      ) : snapshots.length === 0 ? (
        <div style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>No snapshots yet.</div>
      ) : (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, overflow: "hidden" }}>
          {snapshots.map((snap, i) => (
            <div
              key={snap.filename}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: `${spacing.xs + 2}px ${spacing.sm}px`,
                borderBottom: i === snapshots.length - 1 ? "none" : `1px solid ${colors.border}`,
                backgroundColor: i % 2 ? colors.surface : colors.background,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary, wordBreak: "break-all" }}>
                  {snap.filename}
                </div>
                <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                  {new Date(snap.created_at).toLocaleString()} · {formatBytes(snap.size)} ·{" "}
                  <span style={{
                    display: "inline-block",
                    padding: `0 ${spacing.xs}px`,
                    fontSize: fontSize.xs,
                    fontWeight: 700,
                    borderRadius: borderRadius.full,
                    backgroundColor:
                      snap.kind === "end-of-day" ? (colors.successLight ?? colors.surfaceElevated) :
                      snap.kind === "manual" ? (colors.infoLight ?? colors.surfaceElevated) :
                      colors.surfaceElevated,
                    color:
                      snap.kind === "end-of-day" ? (colors.success ?? colors.textSecondary) :
                      snap.kind === "manual" ? (colors.info ?? colors.textSecondary) :
                      colors.textSecondary,
                  }}>
                    {snap.kind}
                  </span>
                </div>
              </div>
              <button
                onClick={() => restore(snap.filename)}
                disabled={busy}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: "transparent",
                  color: colors.warning ?? colors.textSecondary,
                  border: `1px solid ${colors.warning ?? colors.border}`,
                  borderRadius: borderRadius.sm,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.5 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promo codes section — generate QR codes that give a percentage off in Checkout
// ---------------------------------------------------------------------------

interface PromoCode {
  id: string;
  code: string;       // short alphanumeric string encoded in the QR
  label: string;      // human-readable name, e.g. "Holiday 10%"
  percentOff: number; // 0..100
  isActive: boolean;
  createdAt: string;
}

const PROMO_CODES_KEY = "promo_codes";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function PromoCodesSection() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ label: "", percentOff: "10", code: "" });
  const [error, setError] = useState("");
  const [qrPreview, setQrPreview] = useState<{ promo: PromoCode; dataUrl: string } | null>(null);

  const { data: raw } = useQuery({
    queryKey: ["promo-codes"],
    queryFn: () => settingsRepo.get(PROMO_CODES_KEY),
  });

  const promos: PromoCode[] = useMemo(() => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [raw]);

  const saveAll = async (next: PromoCode[]) => {
    await settingsRepo.set(PROMO_CODES_KEY, JSON.stringify(next), "promo-codes");
    queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
    performSync().catch(() => {});
  };

  const handleCreate = async () => {
    setError("");
    const percent = parseFloat(form.percentOff);
    if (!form.label.trim()) { setError("Enter a label"); return; }
    if (isNaN(percent) || percent <= 0 || percent > 100) { setError("Percent off must be between 0 and 100"); return; }
    let code = form.code.trim().toUpperCase() || randomCode();
    // Ensure uniqueness
    while (promos.some((p) => p.code === code)) code = randomCode();
    const promo: PromoCode = {
      id: "promo_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      code,
      label: form.label.trim(),
      percentOff: percent,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await saveAll([promo, ...promos]);
    setForm({ label: "", percentOff: "10", code: "" });
  };

  const toggleActive = async (id: string) => {
    await saveAll(promos.map((p) => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this promo code?")) return;
    await saveAll(promos.filter((p) => p.id !== id));
  };

  const showQr = async (promo: PromoCode) => {
    const { toDataURL } = await import("qrcode");
    const payload = `POS-PROMO:${promo.code}`;
    const dataUrl = await toDataURL(payload, { width: 320, margin: 1 });
    setQrPreview({ promo, dataUrl });
  };

  const downloadQr = () => {
    if (!qrPreview) return;
    const a = document.createElement("a");
    a.href = qrPreview.dataUrl;
    a.download = `promo-${qrPreview.promo.code}-${qrPreview.promo.percentOff}off.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.background }}>
      {error && (
        <div style={{ fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.xs, fontWeight: 600 }}>{error}</div>
      )}

      {/* Create form */}
      <div style={{ display: "flex", gap: spacing.xs, alignItems: "flex-end", marginBottom: spacing.sm, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 140 }}>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Label</div>
          <input
            style={{ ...inputStyle, width: "100%" }}
            value={form.label}
            onChange={(e) => { setForm((p) => ({ ...p, label: e.target.value })); setError(""); }}
            placeholder="e.g. Holiday 10%, Loyalty, Grand Opening"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>% Off</div>
          <input
            style={{ ...inputStyle, width: "100%" }}
            type="number" min="0" max="100" step="1"
            value={form.percentOff}
            onChange={(e) => setForm((p) => ({ ...p, percentOff: e.target.value }))}
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Code (auto if blank)</div>
          <input
            style={{ ...inputStyle, width: "100%", textTransform: "uppercase" }}
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
            placeholder="Auto-generated"
          />
        </div>
        <button
          onClick={handleCreate}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: "pointer",
            minHeight: 30,
          }}
        >
          + Create
        </button>
      </div>

      {/* List */}
      {promos.length === 0 ? (
        <div style={{ fontSize: fontSize.sm, color: colors.textTertiary, padding: spacing.sm }}>
          No promo codes yet. Create one above.
        </div>
      ) : (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, overflow: "hidden" }}>
          {promos.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: `${spacing.xs + 2}px ${spacing.sm}px`,
                borderBottom: i === promos.length - 1 ? "none" : `1px solid ${colors.border}`,
                backgroundColor: i % 2 ? colors.surface : colors.background,
                opacity: p.isActive ? 1 : 0.55,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.textPrimary }}>
                  {p.label}
                  <span style={{ marginLeft: spacing.sm, fontSize: fontSize.xs, color: colors.success, fontWeight: 700 }}>
                    {p.percentOff}% OFF
                  </span>
                </div>
                <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2, fontFamily: "monospace" }}>
                  Code: {p.code}
                </div>
              </div>
              <button
                onClick={() => showQr(p)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary,
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                ⛶ QR
              </button>
              <button
                onClick={() => toggleActive(p.id)}
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
                {p.isActive ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: "transparent",
                  color: colors.error,
                  border: `1px solid ${colors.error}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* QR preview modal */}
      {qrPreview && (
        <div
          onClick={() => setQrPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.md,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
              padding: spacing.lg,
              maxWidth: 380,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: spacing.md,
            }}
          >
            <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
              {qrPreview.promo.label}
            </div>
            <div style={{ fontSize: fontSize.md, color: colors.success, fontWeight: 700 }}>
              {qrPreview.promo.percentOff}% OFF
            </div>
            <img src={qrPreview.dataUrl} alt="Promo QR" style={{ width: 280, height: 280, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm }} />
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontFamily: "monospace", wordBreak: "break-all", textAlign: "center" }}>
              Code: {qrPreview.promo.code}
            </div>
            <div style={{ display: "flex", gap: spacing.sm }}>
              <button
                onClick={downloadQr}
                style={{
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary,
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Download
              </button>
              <button
                onClick={() => setQrPreview(null)}
                style={{
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  backgroundColor: "transparent",
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default counting — numbers seeded into the Counting tab on every new day
// ---------------------------------------------------------------------------

const COUNTING_DEFAULTS_KEY = "scheduling_counting_defaults";

interface CountingDefault {
  id: string;
  value: number;
}

function CountingDefaultsSection() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState("");

  const { data: raw } = useQuery({
    queryKey: ["counting-defaults"],
    queryFn: () => settingsRepo.get(COUNTING_DEFAULTS_KEY),
  });

  const items: CountingDefault[] = useMemo(() => {
    if (!raw) return [];
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }, [raw]);

  const saveAll = async (next: CountingDefault[]) => {
    await settingsRepo.set(COUNTING_DEFAULTS_KEY, JSON.stringify(next), "scheduling");
    queryClient.invalidateQueries({ queryKey: ["counting-defaults"] });
    performSync().catch(() => {});
  };

  const handleAdd = async () => {
    const v = parseFloat(adding);
    if (isNaN(v)) return;
    const id = "cntdef_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await saveAll([...items, { id, value: v }]);
    setAdding("");
  };

  const handleDelete = async (id: string) => {
    await saveAll(items.filter((it) => it.id !== id));
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
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.background }}>
      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: spacing.xs }}>
        These numbers will appear in the Counting tab for any day that hasn't been edited yet. Once a day is touched, it keeps its own list.
      </div>
      <div style={{ display: "flex", gap: spacing.xs, marginBottom: spacing.sm }}>
        <input
          type="number"
          placeholder="Number"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={handleAdd}
          disabled={adding.trim() === ""}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            border: `1px solid ${colors.primary}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary || "#fff",
            cursor: adding.trim() === "" ? "not-allowed" : "pointer",
            opacity: adding.trim() === "" ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, textAlign: "center", padding: spacing.sm }}>
          No defaults set.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                display: "flex",
                gap: spacing.xs,
                alignItems: "center",
                padding: spacing.sm,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.surface,
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: fontSize.lg,
                  fontWeight: 700,
                  color: colors.textPrimary,
                  textAlign: "right",
                  paddingRight: spacing.sm,
                }}
              >
                {it.value}
              </div>
              <button
                onClick={() => handleDelete(it.id)}
                aria-label="Delete row"
                style={{
                  width: 30,
                  height: 30,
                  fontSize: fontSize.md,
                  fontWeight: 700,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.error,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

