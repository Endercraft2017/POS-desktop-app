import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { useCartStore } from "../../stores/cart-store";
import { productRepo, categoryRepo } from "../../lib/repositories";
import { Tooltip } from "../../components/ui/Tooltip";

export function CheckoutPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const { cart, addItem, updateQuantity, removeItem, clear } = useCartStore();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: dbProducts = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productRepo.getActive(),
  });

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryRepo.getActive(),
  });

  const categories = useMemo(() => {
    return [
      { id: "all", name: "All" },
      ...dbCategories.map((c) => ({ id: c.id, name: c.name })),
    ];
  }, [dbCategories]);

  const products = useMemo(() => {
    return dbProducts.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category_id ?? "",
    }));
  }, [dbProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === "all" || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const handleCharge = () => {
    // TODO: Create order via db-bridge, navigate to payment flow
    alert(`Charge $${cart.total.toFixed(2)}`);
    clear();
  };

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    display: "flex",
    height: "100%",
    overflow: "hidden",
  };

  const leftPanelStyle: React.CSSProperties = {
    flex: "0 0 65%",
    display: "flex",
    flexDirection: "column",
    padding: spacing.md,
    gap: spacing.md,
    overflow: "hidden",
  };

  const rightPanelStyle: React.CSSProperties = {
    flex: "0 0 35%",
    display: "flex",
    flexDirection: "column",
    borderLeft: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
  };

  const searchInputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.md,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  const categoryRowStyle: React.CSSProperties = {
    display: "flex",
    gap: spacing.sm,
    overflowX: "auto",
    flexShrink: 0,
  };

  const categoryPillStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.full,
    backgroundColor: active ? colors.primary : colors.surfaceElevated,
    color: active ? colors.textOnPrimary : colors.textSecondary,
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: 36,
  });

  const productGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: spacing.sm,
    overflowY: "auto",
    flex: 1,
    padding: `${spacing.xs}px 0`,
  };

  const productCardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    cursor: "pointer",
    minHeight: 90,
    transition: "border-color 0.1s",
  };

  const cartHeaderStyle: React.CSSProperties = {
    padding: spacing.md,
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const cartItemsStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: `${spacing.sm}px ${spacing.md}px`,
  };

  const cartItemRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.sm}px 0`,
    borderBottom: `1px solid ${colors.border}`,
    gap: spacing.sm,
  };

  const qtyBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    cursor: "pointer",
    fontSize: fontSize.lg,
    fontWeight: 700,
  };

  const removeBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: colors.error,
    cursor: "pointer",
    fontSize: fontSize.sm,
    fontWeight: 600,
    padding: `${spacing.xs}px`,
  };

  const cartFooterStyle: React.CSSProperties = {
    padding: spacing.md,
    borderTop: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    gap: spacing.sm,
  };

  const summaryRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: fontSize.md,
    color: colors.textSecondary,
  };

  const totalRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: fontSize.xl,
    fontWeight: 700,
    color: colors.textPrimary,
  };

  const chargeBtnStyle: React.CSSProperties = {
    minHeight: 48,
    fontSize: fontSize.lg,
    fontWeight: 700,
    backgroundColor: colors.success,
    color: colors.textOnPrimary,
    border: "none",
    borderRadius: borderRadius.md,
    cursor: "pointer",
  };

  const clearBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: colors.error,
    cursor: "pointer",
    fontSize: fontSize.sm,
    fontWeight: 600,
  };

  return (
    <div style={containerStyle}>
      {/* Left Panel - Products */}
      <div style={leftPanelStyle}>
        <input
          style={searchInputStyle}
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={categoryRowStyle}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              style={categoryPillStyle(selectedCategory === cat.id)}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div style={productGridStyle}>
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              style={productCardStyle}
              onClick={() => addItem(product)}
            >
              <span
                style={{
                  fontSize: fontSize.md,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  textAlign: "center",
                }}
              >
                {product.name}
              </span>
              <span
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: 700,
                  color: colors.primary,
                }}
              >
                ${product.price.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Cart */}
      <div style={rightPanelStyle}>
        <div style={cartHeaderStyle}>
          <span
            style={{
              fontSize: fontSize.xl,
              fontWeight: 700,
              color: colors.textPrimary,
            }}
          >
            Cart ({cart.items.length})
          </span>
          {cart.items.length > 0 && (
            <Tooltip text="Remove all items from the cart" position="bottom">
              <button style={clearBtnStyle} onClick={clear}>
                Clear
              </button>
            </Tooltip>
          )}
        </div>

        <div style={cartItemsStyle}>
          {cart.items.length === 0 && (
            <p
              style={{
                textAlign: "center",
                color: colors.textTertiary,
                fontSize: fontSize.md,
                marginTop: spacing.xl,
              }}
            >
              No items in cart
            </p>
          )}
          {cart.items.map((item) => (
            <div key={item.productId} style={cartItemRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: 600,
                    color: colors.textPrimary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.name}
                </div>
                <div
                  style={{ fontSize: fontSize.sm, color: colors.textSecondary }}
                >
                  ${item.unitPrice.toFixed(2)} each
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.xs,
                }}
              >
                <button
                  style={qtyBtnStyle}
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity - 1)
                  }
                >
                  -
                </button>
                <span
                  style={{
                    minWidth: 24,
                    textAlign: "center",
                    fontSize: fontSize.md,
                    fontWeight: 600,
                    color: colors.textPrimary,
                  }}
                >
                  {item.quantity}
                </span>
                <button
                  style={qtyBtnStyle}
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity + 1)
                  }
                >
                  +
                </button>
              </div>
              <span
                style={{
                  fontSize: fontSize.md,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  minWidth: 56,
                  textAlign: "right",
                }}
              >
                ${item.subtotal.toFixed(2)}
              </span>
              <button
                style={removeBtnStyle}
                onClick={() => removeItem(item.productId)}
              >
                X
              </button>
            </div>
          ))}
        </div>

        <div style={cartFooterStyle}>
          <div style={summaryRowStyle}>
            <span>Subtotal</span>
            <span>${cart.subtotal.toFixed(2)}</span>
          </div>
          <div style={summaryRowStyle}>
            <span>Tax</span>
            <span>${cart.taxAmount.toFixed(2)}</span>
          </div>
          {cart.discountAmount > 0 && (
            <div style={{ ...summaryRowStyle, color: colors.success }}>
              <span>Discount</span>
              <span>-${cart.discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={totalRowStyle}>
            <span>Total</span>
            <span>${cart.total.toFixed(2)}</span>
          </div>
          <Tooltip text="Proceed to payment" position="top">
            <button
              style={{
                ...chargeBtnStyle,
                opacity: cart.items.length === 0 ? 0.5 : 1,
                width: "100%",
              }}
              disabled={cart.items.length === 0}
              onClick={handleCharge}
            >
              Charge ${cart.total.toFixed(2)}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
