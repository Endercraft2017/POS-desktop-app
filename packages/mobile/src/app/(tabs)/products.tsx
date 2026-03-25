import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../../hooks/use-theme";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProduct,
} from "../../hooks/use-products";
import { useActiveCategories } from "../../hooks/use-categories";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ProductListItem } from "../../components/products/product-list-item";
import { ProductForm } from "../../components/products/product-form";
import type { Product } from "@pos/core/types";

export default function ProductsScreen() {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: categories } = useActiveCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const toggleProduct = useToggleProduct();

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (categories) {
      for (const cat of categories) {
        map[cat.id] = cat.name;
      }
    }
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, search]);

  const handleAdd = useCallback(() => {
    setEditingProduct(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    (product: Product) => {
      Alert.alert(
        "Delete Product",
        `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteProduct.mutate(product.id),
          },
        ]
      );
    },
    [deleteProduct]
  );

  const handleToggleActive = useCallback(
    (product: Product) => {
      toggleProduct.mutate({ id: product.id, isActive: !product.isActive });
    },
    [toggleProduct]
  );

  const handleFormSubmit = useCallback(
    (data: {
      name: string;
      sku?: string;
      description?: string;
      price: number;
      costPrice?: number;
      categoryId?: string;
      barcode?: string;
      isActive?: boolean;
    }) => {
      if (editingProduct) {
        updateProduct.mutate(
          { id: editingProduct.id, data },
          {
            onSuccess: () => setShowForm(false),
          }
        );
      } else {
        createProduct.mutate(data, {
          onSuccess: () => setShowForm(false),
        });
      }
    },
    [editingProduct, updateProduct, createProduct]
  );

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingProduct(null);
  }, []);

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    padding: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const titleRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  };

  const title: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const countBadge: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const emptyContainer: ViewStyle = {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  };

  const emptyText: TextStyle = {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
  };

  const listContent: ViewStyle = {
    padding: spacing.md,
    paddingBottom: spacing["2xl"],
  };

  const modalOverlay: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductListItem
        product={item}
        categoryName={item.categoryId ? categoryMap[item.categoryId] ?? null : null}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
      />
    ),
    [categoryMap, handleEdit, handleDelete, handleToggleActive]
  );

  const keyExtractor = useCallback((item: Product) => item.id, []);

  if (productsLoading) {
    return (
      <View style={[container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: spacing.md, fontSize: fontSize.md }}>
          Loading products...
        </Text>
      </View>
    );
  }

  return (
    <View style={container}>
      <View style={header}>
        <View style={titleRow}>
          <View>
            <Text style={title}>Products</Text>
            <Text style={countBadge}>
              {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
              {search ? " found" : " total"}
            </Text>
          </View>
          <Button title="+ Add Product" onPress={handleAdd} variant="primary" size="sm" />
        </View>
        <Input
          placeholder="Search by name, SKU, or barcode..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {filteredProducts.length === 0 ? (
        <View style={emptyContainer}>
          <Text style={emptyText}>
            {search
              ? "No products match your search."
              : "No products yet. Tap \"+ Add Product\" to create one."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showForm}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleFormCancel}
      >
        <View style={modalOverlay}>
          <ProductForm
            initialData={editingProduct}
            categories={categories ?? []}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
          />
        </View>
      </Modal>
    </View>
  );
}
