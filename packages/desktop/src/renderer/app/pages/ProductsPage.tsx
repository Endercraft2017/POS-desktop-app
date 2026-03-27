import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { productRepo, categoryRepo } from "../../lib/repositories";
import type { ProductRow } from "../../lib/repositories";
import { Tooltip } from "../../components/ui/Tooltip";

interface ProductForm {
  name: string;
  sku: string;
  price: number;
  costPrice: number;
  category: string;
  barcode: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  sku: "",
  price: 0,
  costPrice: 0,
  category: "",
  barcode: "",
};

export function ProductsPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productRepo.getAll(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryRepo.getActive(),
  });

  // Build a category id->name map for display
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      map[c.id] = c.name;
    }
    return map;
  }, [categories]);

  const createMutation = useMutation({
    mutationFn: (data: ProductForm) =>
      productRepo.create({
        name: data.name,
        sku: data.sku || null,
        description: null,
        price: data.price,
        cost_price: data.costPrice,
        category_id: data.category || null,
        image_uri: null,
        barcode: data.barcode || null,
        is_active: 1,
        sort_order: 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductForm }) =>
      productRepo.update(id, {
        name: data.name,
        sku: data.sku || null,
        price: data.price,
        cost_price: data.costPrice,
        category_id: data.category || null,
        barcode: data.barcode || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowModal(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productRepo.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (product: ProductRow) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      price: product.price,
      costPrice: product.cost_price,
      category: product.category_id ?? "",
      barcode: product.barcode ?? "",
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.sku.trim()) return;

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

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    padding: spacing.lg,
    display: "flex",
    flexDirection: "column",
    gap: spacing.md,
    height: "100%",
    overflow: "hidden",
    boxSizing: "border-box",
  };

  const topBarStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    flexShrink: 0,
  };

  const searchInputStyle: React.CSSProperties = {
    flex: 1,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.md,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    outline: "none",
  };

  const addBtnStyle: React.CSSProperties = {
    minHeight: 48,
    padding: `${spacing.sm}px ${spacing.lg}px`,
    fontSize: fontSize.md,
    fontWeight: 600,
    backgroundColor: colors.buttonPrimary,
    color: colors.textOnPrimary,
    border: "none",
    borderRadius: borderRadius.md,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const tableHeaderStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 80px 120px",
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 700,
    color: colors.textSecondary,
    borderBottom: `2px solid ${colors.border}`,
    flexShrink: 0,
  };

  const tableRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 80px 120px",
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderBottom: `1px solid ${colors.border}`,
    alignItems: "center",
    backgroundColor: colors.surface,
  };

  const listStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
  };

  const activeBadgeStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.xs,
    fontWeight: 700,
    borderRadius: borderRadius.full,
    backgroundColor: active ? colors.successLight : colors.errorLight,
    color: active ? colors.success : colors.error,
  });

  const actionBtnSmall = (
    variant: "edit" | "delete"
  ): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.xs,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    backgroundColor:
      variant === "edit" ? colors.primary : colors.buttonDestructive,
    color: colors.textOnPrimary,
    minHeight: 32,
  });

  // Modal styles
  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: 480,
    maxWidth: "90vw",
    display: "flex",
    flexDirection: "column",
    gap: spacing.md,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: fontSize.sm,
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.md,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  const modalBtnsStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  };

  return (
    <div style={containerStyle}>
      <h1
        style={{
          fontSize: fontSize["3xl"],
          fontWeight: 700,
          color: colors.textPrimary,
          margin: 0,
        }}
      >
        Products
      </h1>

      <div style={topBarStyle}>
        <input
          style={searchInputStyle}
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Tooltip text="Create a new product entry" position="bottom">
          <button style={addBtnStyle} onClick={openAdd}>
            + Add Product
          </button>
        </Tooltip>
      </div>

      <div style={tableHeaderStyle}>
        <span>Name / SKU</span>
        <span>Price</span>
        <span>Category</span>
        <span>Barcode</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      <div style={listStyle}>
        {filteredProducts.map((product) => (
          <div key={product.id} style={tableRowStyle}>
            <div>
              <div style={{ fontWeight: 600 }}>{product.name}</div>
              <div
                style={{ fontSize: fontSize.xs, color: colors.textTertiary }}
              >
                {product.sku}
              </div>
            </div>
            <span>${product.price.toFixed(2)}</span>
            <span>{categoryMap[product.category_id ?? ""] ?? product.category_id ?? ""}</span>
            <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
              {product.barcode}
            </span>
            <span style={activeBadgeStyle(product.is_active === 1)}>
              {product.is_active === 1 ? "Active" : "Inactive"}
            </span>
            <div style={{ display: "flex", gap: spacing.xs }}>
              <Tooltip text="Edit product details" position="left">
                <button
                  style={actionBtnSmall("edit")}
                  onClick={() => openEdit(product)}
                >
                  Edit
                </button>
              </Tooltip>
              <Tooltip text="Remove this product" position="left">
                <button
                  style={actionBtnSmall("delete")}
                  onClick={() => handleDelete(product.id)}
                >
                  Delete
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      {/* Product Form Modal */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2
              style={{
                margin: 0,
                fontSize: fontSize["2xl"],
                fontWeight: 700,
                color: colors.textPrimary,
              }}
            >
              {editingId ? "Edit Product" : "Add Product"}
            </h2>

            <div>
              <div style={labelStyle}>Name</div>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Product name"
              />
            </div>
            <div>
              <div style={labelStyle}>SKU</div>
              <input
                style={inputStyle}
                value={form.sku}
                onChange={(e) => updateField("sku", e.target.value)}
                placeholder="SKU-001"
              />
            </div>
            <div style={{ display: "flex", gap: spacing.md }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Price</div>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    updateField("price", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Cost Price</div>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) =>
                    updateField("costPrice", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div>
              <div style={labelStyle}>Category</div>
              <input
                style={inputStyle}
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
                placeholder="e.g. Coffee"
              />
            </div>
            <div>
              <div style={labelStyle}>Barcode</div>
              <input
                style={inputStyle}
                value={form.barcode}
                onChange={(e) => updateField("barcode", e.target.value)}
                placeholder="1234567890"
              />
            </div>

            <div style={modalBtnsStyle}>
              <button
                style={{
                  padding: `${spacing.sm}px ${spacing.lg}px`,
                  fontSize: fontSize.md,
                  fontWeight: 600,
                  backgroundColor: colors.buttonSecondary,
                  color: colors.buttonSecondaryText,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.md,
                  cursor: "pointer",
                  minHeight: 48,
                }}
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: `${spacing.sm}px ${spacing.lg}px`,
                  fontSize: fontSize.md,
                  fontWeight: 600,
                  backgroundColor: colors.buttonPrimary,
                  color: colors.textOnPrimary,
                  border: "none",
                  borderRadius: borderRadius.md,
                  cursor: "pointer",
                  minHeight: 48,
                }}
                onClick={handleSave}
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
