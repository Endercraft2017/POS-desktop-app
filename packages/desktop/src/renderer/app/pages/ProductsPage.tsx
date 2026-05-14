import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { productRepo, categoryRepo, ingredientRepo, productIngredientRepo, ingredientPresetRepo } from "../../lib/repositories";
import type { ProductRow, IngredientRow, ProductIngredientRow, IngredientPresetRow } from "../../lib/repositories";
import { convertUnit, getCompatibleUnits, formatWithBestUnit } from "@pos/core/services";
import { performSync } from "../../lib/sync-manager";

interface ProductForm {
  name: string;
  sku: string;
  price: number;
  markupPercent: number;
  categories: string; // comma-separated
  tags: string; // comma-separated
  barcode: string;
  isSubProduct: boolean;
  parentIds: string[]; // multiple parent IDs
}

const EMPTY_FORM: ProductForm = {
  name: "",
  sku: "",
  price: 0,
  markupPercent: 0,
  categories: "",
  tags: "",
  barcode: "",
  isSubProduct: false,
  parentIds: [],
};

function normalizeCsv(input: string): string {
  return input
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe
    .join(", ");
}

export function ProductsPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [ingredientCost, setIngredientCost] = useState(0);
  // Track which field the user is actively changing to avoid circular updates
  const [lastEdited, setLastEdited] = useState<"price" | "markup" | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productRepo.getAll(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryRepo.getActive(),
  });

  const { data: allIngredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => ingredientRepo.getActive(),
  });

  const { data: presets = [] } = useQuery({
    queryKey: ["ingredient-presets"],
    queryFn: () => ingredientPresetRepo.getAll(),
  });

  // Linked ingredients for the product being edited
  const [linkedIngredients, setLinkedIngredients] = useState<ProductIngredientRow[]>([]);
  const [addIngredientId, setAddIngredientId] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [addIngredientQty, setAddIngredientQty] = useState(1);
  const [addIngredientUnit, setAddIngredientUnit] = useState(""); // entry unit for conversion
  const [savePresetName, setSavePresetName] = useState("");

  // Load linked ingredients when editing
  useEffect(() => {
    if (editingId) {
      productIngredientRepo.getByProduct(editingId).then(setLinkedIngredients);
    } else {
      setLinkedIngredients([]);
    }
  }, [editingId]);

  const ingredientNameMap = useMemo(() => {
    const map: Record<string, IngredientRow> = {};
    for (const ing of allIngredients) map[ing.id] = ing;
    return map;
  }, [allIngredients]);

  const handleAddIngredient = async () => {
    if (!editingId || !addIngredientId) return;
    // Convert to native unit if entering in a different unit
    let qty = addIngredientQty;
    const ing = ingredientNameMap[addIngredientId];
    if (ing && addIngredientUnit && addIngredientUnit !== ing.unit) {
      const converted = convertUnit(qty, addIngredientUnit, ing.unit);
      if (converted !== null) qty = converted;
    }
    await productIngredientRepo.add(editingId, addIngredientId, qty);
    const updated = await productIngredientRepo.getByProduct(editingId);
    setLinkedIngredients(updated);
    // Refresh ingredient cost
    const cost = await productRepo.getIngredientCost(editingId);
    setIngredientCost(cost);
    setAddIngredientId("");
    setAddIngredientQty(1);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleRemoveIngredient = async (piId: string) => {
    if (!editingId) return;
    await productIngredientRepo.remove(piId);
    const updated = await productIngredientRepo.getByProduct(editingId);
    setLinkedIngredients(updated);
    const cost = await productRepo.getIngredientCost(editingId);
    setIngredientCost(cost);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleUpdateIngredientQty = async (piId: string, qty: number) => {
    if (!editingId || qty <= 0) return;
    await productIngredientRepo.updateQuantity(piId, qty);
    const updated = await productIngredientRepo.getByProduct(editingId);
    setLinkedIngredients(updated);
    const cost = await productRepo.getIngredientCost(editingId);
    setIngredientCost(cost);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleApplyPreset = async (presetId: string) => {
    if (!editingId) return;
    const items = await ingredientPresetRepo.getItems(presetId);
    for (const item of items) {
      // Skip if already linked
      if (linkedIngredients.some((li) => li.ingredient_id === item.ingredient_id)) continue;
      await productIngredientRepo.add(editingId, item.ingredient_id, item.quantity);
    }
    const updated = await productIngredientRepo.getByProduct(editingId);
    setLinkedIngredients(updated);
    const cost = await productRepo.getIngredientCost(editingId);
    setIngredientCost(cost);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleSaveAsPreset = async () => {
    if (!editingId || !savePresetName.trim() || linkedIngredients.length === 0) return;
    await ingredientPresetRepo.saveFromProduct(savePresetName.trim(), editingId);
    queryClient.invalidateQueries({ queryKey: ["ingredient-presets"] });
    setSavePresetName("");
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm("Delete this preset?")) return;
    await ingredientPresetRepo.softDelete(presetId);
    queryClient.invalidateQueries({ queryKey: ["ingredient-presets"] });
  };

  // Build a category name lookup (for display in table)
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  // Build a product name lookup for parent display
  const productNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) map[p.id] = p.name;
    return map;
  }, [products]);

  // When editing, load the ingredient cost for that product
  useEffect(() => {
    if (editingId) {
      productRepo.getIngredientCost(editingId).then(setIngredientCost);
    } else {
      setIngredientCost(0);
    }
  }, [editingId]);

  // Auto-compute: when price changes -> update markup; when markup changes -> update price
  useEffect(() => {
    if (ingredientCost <= 0) return;
    if (lastEdited === "price" && form.price > 0) {
      const markup = ((form.price - ingredientCost) / ingredientCost) * 100;
      setForm((prev) => ({ ...prev, markupPercent: Math.round(markup * 100) / 100 }));
    } else if (lastEdited === "markup") {
      const price = ingredientCost * (1 + form.markupPercent / 100);
      setForm((prev) => ({ ...prev, price: Math.round(price * 100) / 100 }));
    }
  }, [form.price, form.markupPercent, ingredientCost, lastEdited]);

  const createMutation = useMutation({
    mutationFn: (data: ProductForm) =>
      productRepo.create({
        name: data.name,
        sku: data.sku || null,
        description: null,
        price: data.price,
        cost_price: ingredientCost,
        markup_percent: data.markupPercent,
        category_ids: normalizeCsv(data.categories),
        tags: normalizeCsv(data.tags),
        image_uri: null,
        barcode: data.barcode || null,
        is_sub_product: data.isSubProduct ? 1 : 0,
        parent_ids: data.isSubProduct ? data.parentIds.join(",") : "",
        is_active: 1,
        sort_order: 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowModal(false);
    },
    onError: (err) => {
      console.error("Create product failed:", err);
      alert("Failed to add product: " + (err as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductForm }) =>
      productRepo.update(id, {
        name: data.name,
        sku: data.sku || null,
        price: data.price,
        cost_price: ingredientCost,
        markup_percent: data.markupPercent,
        category_ids: normalizeCsv(data.categories),
        tags: normalizeCsv(data.tags),
        barcode: data.barcode || null,
        is_sub_product: data.isSubProduct ? 1 : 0,
        parent_ids: data.isSubProduct ? data.parentIds.join(",") : "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowModal(false);
    },
    onError: (err) => {
      console.error("Update product failed:", err);
      alert("Failed to update product: " + (err as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productRepo.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  // Derive unique categories and tags for filter pills
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const c of (p.category_ids ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        set.add(c);
      }
    }
    return Array.from(set).sort();
  }, [products]);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const t of (p.tags ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [products]);

  // Group products: parent products first, then their sub-products underneath
  // Sub-products with multiple parents appear under each parent
  const sortedProducts = useMemo(() => {
    const parents = products.filter((p) => p.is_sub_product !== 1);
    const subsByParent: Record<string, typeof products> = {};
    const allSubIds = new Set<string>();

    for (const p of products) {
      if (p.is_sub_product === 1) {
        const pids = (p.parent_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        for (const pid of pids) {
          if (!subsByParent[pid]) subsByParent[pid] = [];
          subsByParent[pid].push(p);
          allSubIds.add(p.id);
        }
        if (pids.length === 0) allSubIds.add(p.id); // orphan
      }
    }

    // Orphan sub-products (no valid parents)
    const orphans = products.filter(
      (p) => p.is_sub_product === 1 && !(p.parent_ids ?? "").split(",").some((pid) => products.some((pp) => pp.id === pid.trim()))
    );

    const result: typeof products = [];
    const seen = new Set<string>(); // avoid duplicate sub-product rows
    for (const parent of parents) {
      result.push(parent);
      if (subsByParent[parent.id]) {
        for (const sub of subsByParent[parent.id]) {
          // Show sub under each parent, but mark duplicates
          result.push(sub);
        }
      }
    }
    result.push(...orphans);
    return result;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return sortedProducts.filter((p) => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      const cats = (p.category_ids ?? "").toLowerCase();
      const matchesCategory = selectedCategory === "all" || cats.includes(selectedCategory);
      const tags = (p.tags ?? "").toLowerCase();
      const matchesTag = selectedTag === "all" || tags.includes(selectedTag);
      return matchesSearch && matchesCategory && matchesTag;
    });
  }, [sortedProducts, search, selectedCategory, selectedTag]);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIngredientCost(0);
    setLastEdited(null);
    setShowModal(true);
  };

  // Ctrl+N shortcut to add new product
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        if (!showModal) openAdd();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  const openEdit = (product: ProductRow) => {
    setEditingId(product.id);
    setLastEdited(null);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      price: product.price,
      markupPercent: product.markup_percent ?? 0,
      categories: product.category_ids ?? "",
      tags: product.tags ?? "",
      barcode: product.barcode ?? "",
      isSubProduct: product.is_sub_product === 1,
      parentIds: (product.parent_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteMutation.mutate(id);
    }
  };

  // --- Styles ---
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.xs + 2}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: fontSize.xs,
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: 2,
  };

  const readOnlyStyle: React.CSSProperties = {
    ...inputStyle,
    backgroundColor: colors.surfaceElevated,
    color: colors.textTertiary,
    cursor: "not-allowed",
  };

  const tableHeaderStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "36px 2fr 90px 80px 90px 1.5fr 70px 100px",
    gap: spacing.xs,
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: fontSize.xs,
    fontWeight: 700,
    color: colors.textSecondary,
    borderBottom: `2px solid ${colors.border}`,
    flexShrink: 0,
  };

  const tableRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "36px 2fr 90px 80px 90px 1.5fr 70px 100px",
    gap: spacing.xs,
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    borderBottom: `1px solid ${colors.border}`,
    alignItems: "center",
    backgroundColor: colors.surface,
  };

  const actionBtnSmall = (variant: "edit" | "delete"): React.CSSProperties => ({
    padding: `2px ${spacing.sm}px`,
    fontSize: fontSize.xs,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    backgroundColor: variant === "edit" ? colors.primary : colors.buttonDestructive,
    color: colors.textOnPrimary,
    minHeight: 24,
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
      <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
        Products
      </h1>

      {/* Search + Add */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: spacing.md, flexShrink: 0 }}>
        <input
          style={{
            flex: 1,
            padding: `${spacing.xs + 2}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            outline: "none",
          }}
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          style={{
            minHeight: 30,
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            backgroundColor: colors.buttonPrimary,
            color: colors.textOnPrimary,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: "pointer",
          }}
          onClick={openAdd}
        >
          + Add Product
        </button>
      </div>

      {/* Category & Tag Filters */}
      {(uniqueCategories.length > 0 || uniqueTags.length > 0) && (
        <div style={{ display: "flex", gap: spacing.lg, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
          {uniqueCategories.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
              <span style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: 600, marginRight: 2 }}>Category:</span>
              <button
                style={{
                  padding: `2px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: borderRadius.full,
                  backgroundColor: selectedCategory === "all" ? colors.primary : colors.surfaceElevated,
                  color: selectedCategory === "all" ? colors.textOnPrimary : colors.textSecondary,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedCategory("all")}
              >
                All
              </button>
              {uniqueCategories.map((cat) => (
                <button
                  key={cat}
                  style={{
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: borderRadius.full,
                    backgroundColor: selectedCategory === cat ? colors.primary : colors.surfaceElevated,
                    color: selectedCategory === cat ? colors.textOnPrimary : colors.textSecondary,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          {uniqueTags.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
              <span style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: 600, marginRight: 2 }}>Tag:</span>
              <button
                style={{
                  padding: `2px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: borderRadius.full,
                  backgroundColor: selectedTag === "all" ? colors.primary : colors.surfaceElevated,
                  color: selectedTag === "all" ? colors.textOnPrimary : colors.textSecondary,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedTag("all")}
              >
                All
              </button>
              {uniqueTags.map((tag) => (
                <button
                  key={tag}
                  style={{
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: borderRadius.full,
                    backgroundColor: selectedTag === tag ? colors.info : colors.surfaceElevated,
                    color: selectedTag === tag ? colors.textOnPrimary : colors.textSecondary,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedTag(selectedTag === tag ? "all" : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={tableHeaderStyle}>
        <span title="Show in checkout">✓</span>
        <span>Name / SKU</span>
        <span>Type</span>
        <span>Price</span>
        <span>Cost</span>
        <span>Categories / Tags</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            onMouseEnter={() => setHoveredRow(product.id)}
            onMouseLeave={() => setHoveredRow(null)}
            onClick={() => openEdit(product)}
            style={{
              ...tableRowStyle,
              backgroundColor: hoveredRow === product.id ? colors.surfaceElevated : colors.surface,
              transition: "background-color 0.1s",
              cursor: "pointer",
              opacity: product.is_active === 1 ? 1 : 0.55,
            }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <input
                type="checkbox"
                checked={product.is_active === 1}
                onChange={async (e) => {
                  await productRepo.update(product.id, { is_active: e.target.checked ? 1 : 0 });
                  queryClient.invalidateQueries({ queryKey: ["products"] });
                  performSync().catch(() => {});
                }}
                style={{ width: 18, height: 18, cursor: "pointer", accentColor: colors.primary }}
                title={product.is_active === 1 ? "Shown in checkout — click to hide" : "Hidden from checkout — click to show"}
              />
            </div>
            <div>
              <div style={{ fontWeight: 600, paddingLeft: product.is_sub_product === 1 ? 16 : 0 }}>
                {product.is_sub_product === 1 && (
                  <span style={{ color: colors.textTertiary, marginRight: 4 }}>└</span>
                )}
                {product.name}
              </div>
              {product.sku && (
                <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, paddingLeft: product.is_sub_product === 1 ? 16 : 0 }}>{product.sku}</div>
              )}
            </div>
            <span style={{ fontSize: fontSize.xs }}>
              {product.is_sub_product === 1 ? (
                <span style={{ color: colors.info }}>
                  Sub · {(product.parent_ids ?? "").split(",").map((id) => productNameMap[id.trim()]).filter(Boolean).join(", ") || "—"}
                </span>
              ) : (
                <span style={{ color: colors.textSecondary }}>Product</span>
              )}
            </span>
            <span>₱{product.price.toFixed(2)}</span>
            <span style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>
              ₱{(product.cost_price ?? 0).toFixed(2)}
              {product.markup_percent > 0 && (
                <span style={{ color: colors.success, marginLeft: 2 }}>
                  +{product.markup_percent}%
                </span>
              )}
            </span>
            <div style={{ fontSize: fontSize.xs }}>
              <div style={{ color: colors.textSecondary }}>{product.category_ids || "—"}</div>
              {product.tags && (
                <div style={{ color: colors.textTertiary, marginTop: 1 }}>{product.tags}</div>
              )}
            </div>
            <span
              style={{
                display: "inline-block",
                padding: `2px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 700,
                borderRadius: borderRadius.full,
                backgroundColor: product.is_active === 1 ? colors.successLight : colors.errorLight,
                color: product.is_active === 1 ? colors.success : colors.error,
              }}
            >
              {product.is_active === 1 ? "Active" : "Inactive"}
            </span>
            <div style={{ display: "flex", gap: spacing.xs }}>
              <button style={actionBtnSmall("edit")} onClick={(e) => { e.stopPropagation(); openEdit(product); }}>
                Edit
              </button>
              <button style={actionBtnSmall("delete")} onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Product Form Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              width: 520,
              maxWidth: "90vw",
              maxHeight: "85vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: spacing.md,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary }}>
              {editingId ? "Edit Product" : "Add Product"}
            </h2>

            {/* Name (required) */}
            <div>
              <div style={labelStyle}>Name *</div>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Product name"
                autoFocus
              />
            </div>

            {/* SKU (optional) */}
            <div>
              <div style={labelStyle}>SKU <span style={{ fontWeight: 400, color: colors.textTertiary }}>(optional)</span></div>
              <input
                style={inputStyle}
                value={form.sku}
                onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                placeholder="e.g. SKU-001"
              />
            </div>

            {/* Cost from ingredients (read-only) + Price + Markup */}
            <div style={{ display: "flex", gap: spacing.sm }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Ingredient Cost</div>
                <input
                  style={readOnlyStyle}
                  type="text"
                  value={ingredientCost > 0 ? `₱${ingredientCost.toFixed(2)}` : "No ingredients"}
                  readOnly
                  title="Computed from linked ingredients"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Selling Price *</div>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price || ""}
                  onChange={(e) => {
                    setLastEdited("price");
                    setForm((p) => ({ ...p, price: parseFloat(e.target.value) || 0 }));
                  }}
                  placeholder="0.00"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Markup %</div>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.1"
                  value={form.markupPercent || ""}
                  onChange={(e) => {
                    setLastEdited("markup");
                    setForm((p) => ({ ...p, markupPercent: parseFloat(e.target.value) || 0 }));
                  }}
                  placeholder={ingredientCost > 0 ? "e.g. 50" : "Set ingredients first"}
                  disabled={ingredientCost <= 0}
                  title={ingredientCost <= 0 ? "Add ingredients to this product first to use markup" : ""}
                />
              </div>
            </div>

            {ingredientCost > 0 && form.price > 0 && (
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: -8 }}>
                Profit per unit: ₱{(form.price - ingredientCost).toFixed(2)} ({form.markupPercent.toFixed(1)}% markup)
              </div>
            )}

            {/* Categories (search, select, or create) */}
            <div>
              <div style={labelStyle}>
                Categories <span style={{ fontWeight: 400, color: colors.textTertiary }}>(search or type new + Enter to create)</span>
              </div>
              <input
                style={{ ...inputStyle, marginBottom: spacing.xs }}
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search or create category..."
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && categorySearch.trim()) {
                    const name = categorySearch.trim();
                    const exists = categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
                    if (!exists) {
                      await categoryRepo.create({ name, color: "#2563EB", icon: null, sort_order: 0, is_active: 1 });
                      queryClient.invalidateQueries({ queryKey: ["categories"] });
                    }
                    // Add to selected
                    setForm((prev) => {
                      const current = prev.categories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                      if (!current.includes(name.toLowerCase())) {
                        return { ...prev, categories: [...current, name.toLowerCase()].join(", ") };
                      }
                      return prev;
                    });
                    setCategorySearch("");
                  }
                }}
              />
              {(() => {
                const selectedCats = form.categories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                const q = categorySearch.trim().toLowerCase();
                const filtered = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : [];
                const noMatch = q && !categories.some((c) => c.name.toLowerCase().includes(q));
                return (
                  <>
                    <div
                      style={{
                        border: `1px solid ${colors.border}`,
                        borderRadius: borderRadius.sm,
                        backgroundColor: colors.background,
                        maxHeight: 120,
                        overflowY: "auto",
                        padding: spacing.xs,
                      }}
                    >
                      {!q && filtered.length === 0 && (
                        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, padding: `2px ${spacing.xs}px` }}>
                          Type to search or create a category.
                        </div>
                      )}
                      {noMatch && (
                        <div style={{ fontSize: fontSize.xs, color: colors.info, padding: `2px ${spacing.xs}px` }}>
                          Press Enter to create "{categorySearch.trim()}"
                        </div>
                      )}
                      {filtered.map((cat) => {
                        const checked = selectedCats.includes(cat.name.toLowerCase());
                        return (
                          <label
                            key={cat.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: spacing.xs,
                              padding: `2px ${spacing.xs}px`,
                              borderRadius: borderRadius.sm,
                              cursor: "pointer",
                              backgroundColor: checked ? colors.primaryLight : "transparent",
                              fontSize: fontSize.sm,
                              color: colors.textPrimary,
                              userSelect: "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setForm((prev) => {
                                  const current = prev.categories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                                  const catName = cat.name.toLowerCase();
                                  const updated = checked
                                    ? current.filter((c) => c !== catName)
                                    : [...current, catName];
                                  return { ...prev, categories: updated.join(", ") };
                                });
                              }}
                              style={{ width: 14, height: 14, cursor: "pointer" }}
                            />
                            {cat.name}
                          </label>
                        );
                      })}
                    </div>
                    {selectedCats.length > 0 && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 4 }}>
                        Selected: {selectedCats.join(", ")}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Tags (search, select, or create) */}
            <div>
              <div style={labelStyle}>
                Tags <span style={{ fontWeight: 400, color: colors.textTertiary }}>(search or type new + Enter to create)</span>
              </div>
              <input
                style={{ ...inputStyle, marginBottom: spacing.xs }}
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search or create tag..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagSearch.trim()) {
                    const name = tagSearch.trim().toLowerCase();
                    setForm((prev) => {
                      const current = prev.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                      if (!current.includes(name)) {
                        return { ...prev, tags: [...current, name].join(", ") };
                      }
                      return prev;
                    });
                    setTagSearch("");
                  }
                }}
              />
              {(() => {
                const selectedTags = form.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                const q = tagSearch.trim().toLowerCase();
                const allTags = [...new Set([...uniqueTags, ...selectedTags])].sort();
                const filtered = q ? allTags.filter((t) => t.includes(q)) : [];
                const noMatch = q && !allTags.some((t) => t.includes(q));
                return (
                  <>
                    {(filtered.length > 0 || noMatch) && (
                      <div
                        style={{
                          border: `1px solid ${colors.border}`,
                          borderRadius: borderRadius.sm,
                          backgroundColor: colors.background,
                          maxHeight: 100,
                          overflowY: "auto",
                          padding: spacing.xs,
                        }}
                      >
                        {noMatch && (
                          <div style={{ fontSize: fontSize.xs, color: colors.info, padding: `2px ${spacing.xs}px` }}>
                            Press Enter to create "{tagSearch.trim()}"
                          </div>
                        )}
                        {filtered.map((tag) => {
                          const checked = selectedTags.includes(tag);
                          return (
                            <label
                              key={tag}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: spacing.xs,
                                padding: `2px ${spacing.xs}px`,
                                borderRadius: borderRadius.sm,
                                cursor: "pointer",
                                backgroundColor: checked ? colors.infoLight : "transparent",
                                fontSize: fontSize.sm,
                                color: colors.textPrimary,
                                userSelect: "none",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setForm((prev) => {
                                    const current = prev.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                                    const updated = checked ? current.filter((t) => t !== tag) : [...current, tag];
                                    return { ...prev, tags: updated.join(", ") };
                                  });
                                }}
                                style={{ width: 14, height: 14, cursor: "pointer" }}
                              />
                              {tag}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {!q && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, padding: `2px 0` }}>
                        Type to search or create a tag.
                      </div>
                    )}
                    {selectedTags.length > 0 && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 4 }}>
                        Selected: {selectedTags.join(", ")}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Barcode (optional) */}
            <div>
              <div style={labelStyle}>Barcode <span style={{ fontWeight: 400, color: colors.textTertiary }}>(optional)</span></div>
              <input
                style={inputStyle}
                value={form.barcode}
                onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
                placeholder="e.g. 1234567890"
              />
            </div>

            {/* Ingredients (only for existing products) */}
            {editingId && (
              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: spacing.sm }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
                  <div style={labelStyle}>
                    Ingredients
                    <span style={{ fontWeight: 400, color: colors.textTertiary, marginLeft: 4 }}>
                      ({linkedIngredients.length} linked)
                    </span>
                  </div>
                </div>

                {/* Presets: Apply or Save */}
                <div style={{ display: "flex", gap: spacing.xs, alignItems: "center", marginBottom: spacing.sm, flexWrap: "wrap" }}>
                  {presets.length > 0 && (
                    <>
                      <span style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: 600 }}>Presets:</span>
                      {presets.map((preset) => (
                        <div key={preset.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <button
                            style={{
                              padding: `2px ${spacing.sm}px`,
                              fontSize: fontSize.xs,
                              fontWeight: 600,
                              border: `1px solid ${colors.border}`,
                              borderRadius: borderRadius.sm,
                              backgroundColor: colors.surfaceElevated,
                              color: colors.primary,
                              cursor: "pointer",
                            }}
                            onClick={() => handleApplyPreset(preset.id)}
                            title={`Apply "${preset.name}" ingredients to this product`}
                          >
                            {preset.name}
                          </button>
                          <button
                            style={{
                              padding: `2px 4px`,
                              fontSize: fontSize.xs,
                              border: "none",
                              borderRadius: borderRadius.sm,
                              backgroundColor: "transparent",
                              color: colors.textTertiary,
                              cursor: "pointer",
                            }}
                            onClick={() => handleDeletePreset(preset.id)}
                            title="Delete this preset"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {linkedIngredients.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, marginLeft: presets.length > 0 ? spacing.sm : 0 }}>
                      <input
                        style={{ ...inputStyle, width: 120, fontSize: fontSize.xs }}
                        value={savePresetName}
                        onChange={(e) => setSavePresetName(e.target.value)}
                        placeholder="Preset name..."
                        onKeyDown={(e) => e.key === "Enter" && handleSaveAsPreset()}
                      />
                      <button
                        style={{
                          padding: `2px ${spacing.sm}px`,
                          fontSize: fontSize.xs,
                          fontWeight: 600,
                          border: "none",
                          borderRadius: borderRadius.sm,
                          backgroundColor: colors.success,
                          color: colors.textOnPrimary,
                          cursor: "pointer",
                        }}
                        onClick={handleSaveAsPreset}
                        disabled={!savePresetName.trim()}
                        title="Save current ingredients as a reusable preset"
                      >
                        Save as Preset
                      </button>
                    </div>
                  )}
                </div>

                {/* Linked ingredients list */}
                {linkedIngredients.length > 0 && (
                  <div style={{ marginBottom: spacing.sm }}>
                    {linkedIngredients.map((pi) => {
                      const ing = ingredientNameMap[pi.ingredient_id];
                      return (
                        <div
                          key={pi.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: spacing.xs,
                            padding: `3px 0`,
                            fontSize: fontSize.sm,
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                        >
                          <span style={{ flex: 1, color: colors.textPrimary }}>
                            {ing?.name ?? "Unknown"}
                            <span style={{ color: colors.textTertiary, marginLeft: 4, fontSize: fontSize.xs }}>
                              ({pi.quantity} {ing?.unit ?? ""}
                              {(() => {
                                if (!ing?.unit) return "";
                                const best = formatWithBestUnit(pi.quantity, ing.unit);
                                if (best.unit !== ing.unit) return ` = ${best.quantity} ${best.unit}`;
                                return "";
                              })()})
                            </span>
                          </span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={pi.quantity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (val > 0) handleUpdateIngredientQty(pi.id, val);
                            }}
                            style={{
                              ...inputStyle,
                              width: 70,
                              textAlign: "center" as const,
                            }}
                          />
                          <button
                            style={{
                              padding: `2px ${spacing.xs}px`,
                              fontSize: fontSize.xs,
                              fontWeight: 600,
                              border: "none",
                              borderRadius: borderRadius.sm,
                              cursor: "pointer",
                              backgroundColor: colors.buttonDestructive,
                              color: colors.textOnPrimary,
                              minHeight: 22,
                            }}
                            onClick={() => handleRemoveIngredient(pi.id)}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add ingredient */}
                <div>
                  <div style={{ display: "flex", gap: spacing.xs, alignItems: "flex-end" }}>
                    <div style={{ flex: 2 }}>
                      <input
                        style={{ ...inputStyle, width: "100%" }}
                        value={ingredientSearch}
                        onChange={(e) => { setIngredientSearch(e.target.value); setAddIngredientId(""); }}
                        placeholder="Search or create ingredient..."
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && ingredientSearch.trim()) {
                            const name = ingredientSearch.trim();
                            const existing = allIngredients.find((i) => i.name.toLowerCase() === name.toLowerCase());
                            if (existing) {
                              setAddIngredientId(existing.id);
                            } else {
                              // Create new ingredient and select it
                              const newId = await ingredientRepo.create({
                                name, unit: "pcs", cost_per_unit: 0, current_stock: 0, min_stock: 0, is_active: 1,
                              });
                              queryClient.invalidateQueries({ queryKey: ["ingredients"] });
                              setAddIngredientId(newId);
                            }
                            setIngredientSearch("");
                          }
                        }}
                      />
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={addIngredientQty}
                      onChange={(e) => setAddIngredientQty(parseFloat(e.target.value) || 1)}
                      style={{ ...inputStyle, width: 70, textAlign: "center" as const }}
                      placeholder="Qty"
                    />
                    {addIngredientId && (() => {
                      const selIng = ingredientNameMap[addIngredientId];
                      if (!selIng) return null;
                      const compatible = getCompatibleUnits(selIng.unit);
                      if (compatible.length <= 1) return null;
                      return (
                        <select
                          value={addIngredientUnit || selIng.unit}
                          onChange={(e) => setAddIngredientUnit(e.target.value)}
                          style={{
                            ...inputStyle,
                            width: 65,
                            padding: `2px ${spacing.xs}px`,
                          }}
                        >
                          {compatible.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      );
                    })()}
                    <button
                      style={{
                        padding: `3px ${spacing.sm}px`,
                        fontSize: fontSize.xs,
                        fontWeight: 600,
                        border: "none",
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                        backgroundColor: colors.primary,
                        color: colors.textOnPrimary,
                        minHeight: 24,
                      }}
                      onClick={handleAddIngredient}
                      disabled={!addIngredientId}
                    >
                      + Add
                    </button>
                  </div>
                  {(() => {
                    const q = ingredientSearch.trim().toLowerCase();
                    const available = allIngredients.filter((ing) => !linkedIngredients.some((li) => li.ingredient_id === ing.id));
                    const filtered = q ? available.filter((i) => i.name.toLowerCase().includes(q)) : [];
                    const noMatch = q && !available.some((i) => i.name.toLowerCase().includes(q));
                    return (
                      <>
                        {(filtered.length > 0 || noMatch) && (
                          <div
                            style={{
                              border: `1px solid ${colors.border}`,
                              borderRadius: borderRadius.sm,
                              backgroundColor: colors.background,
                              maxHeight: 100,
                              overflowY: "auto",
                              padding: spacing.xs,
                              marginTop: spacing.xs,
                            }}
                          >
                            {noMatch && (
                              <div style={{ fontSize: fontSize.xs, color: colors.info, padding: `2px ${spacing.xs}px` }}>
                                Press Enter to create "{ingredientSearch.trim()}" as new ingredient
                              </div>
                            )}
                            {filtered.map((ing) => (
                              <div
                                key={ing.id}
                                onClick={() => { setAddIngredientId(ing.id); setIngredientSearch(ing.name); }}
                                style={{
                                  padding: `3px ${spacing.xs}px`,
                                  fontSize: fontSize.sm,
                                  color: colors.textPrimary,
                                  cursor: "pointer",
                                  borderRadius: borderRadius.sm,
                                  backgroundColor: addIngredientId === ing.id ? colors.primaryLight : "transparent",
                                }}
                              >
                                {ing.name} <span style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>({ing.unit} · ₱{ing.cost_per_unit.toFixed(2)})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {!q && (
                          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>
                            Type to search or create an ingredient.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {!editingId && (
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontStyle: "italic" }}>
                Save the product first, then edit it to add ingredients.
              </div>
            )}

            {/* Sub-product toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: `${spacing.xs}px 0`,
                borderTop: `1px solid ${colors.border}`,
                paddingTop: spacing.sm,
              }}
            >
              <input
                type="checkbox"
                id="is-sub-product"
                checked={form.isSubProduct}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    isSubProduct: e.target.checked,
                    parentIds: e.target.checked ? p.parentIds : [],
                  }))
                }
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label
                htmlFor="is-sub-product"
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                This is a sub-product
              </label>
              <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
                (belongs under another product)
              </span>
            </div>

            {/* Parent product selector (only shown for sub-products) */}
            {form.isSubProduct && (
              <div>
                <div style={labelStyle}>Parent Products * <span style={{ fontWeight: 400, color: colors.textTertiary }}>(select one or more)</span></div>
                <div
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    backgroundColor: colors.background,
                    maxHeight: 150,
                    overflowY: "auto",
                    padding: spacing.xs,
                  }}
                >
                  {products
                    .filter((p) => p.is_sub_product === 0 && p.id !== editingId)
                    .map((p) => {
                      const checked = form.parentIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: spacing.xs,
                            padding: `3px ${spacing.xs}px`,
                            borderRadius: borderRadius.sm,
                            cursor: "pointer",
                            backgroundColor: checked ? colors.primaryLight : "transparent",
                            fontSize: fontSize.sm,
                            color: colors.textPrimary,
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((prev) => ({
                                ...prev,
                                parentIds: checked
                                  ? prev.parentIds.filter((id) => id !== p.id)
                                  : [...prev.parentIds, p.id],
                              }));
                            }}
                            style={{ width: 14, height: 14, cursor: "pointer" }}
                          />
                          {p.name}
                        </label>
                      );
                    })}
                  {products.filter((p) => p.is_sub_product === 0 && p.id !== editingId).length === 0 && (
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, padding: spacing.xs }}>
                      No parent products available. Add a product first.
                    </div>
                  )}
                </div>
                {form.parentIds.length > 0 && (
                  <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 4 }}>
                    Selected: {form.parentIds.map((id) => productNameMap[id] ?? id).join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.xs }}>
              <button
                style={{
                  padding: `${spacing.xs + 2}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  backgroundColor: colors.buttonSecondary,
                  color: colors.buttonSecondaryText,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                  minHeight: 32,
                }}
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: `${spacing.xs + 2}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  backgroundColor: colors.buttonPrimary,
                  color: colors.textOnPrimary,
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                  minHeight: 32,
                }}
                onClick={handleSave}
                disabled={!form.name.trim()}
              >
                {editingId ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
