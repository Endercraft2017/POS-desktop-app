import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/use-theme";
import { useCartStore } from "../../stores/cart-store";
import { useActiveProducts } from "../../hooks/use-products";
import { useActiveCategories } from "../../hooks/use-categories";
import { useDefaultTaxRate } from "../../hooks/use-tax-rates";
import { ProductCard } from "../../components/products/product-card";
import { CartSummary } from "../../components/cart/cart-summary";
import { Input } from "../../components/ui/input";
import type { Product } from "@pos/core/types";

export default function CheckoutScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const { addItem, setDefaultTaxRate } = useCartStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: products, isLoading: productsLoading } = useActiveProducts();
  const { data: categories } = useActiveCategories();
  const { data: defaultTax } = useDefaultTaxRate();

  // Set default tax rate when loaded
  React.useEffect(() => {
    if (defaultTax) {
      setDefaultTaxRate(defaultTax.rate);
    }
  }, [defaultTax, setDefaultTaxRate]);

  const categoryMap = useMemo(() => {
    const map: Record<string, { name: string; color: string | null }> = {};
    if (categories) {
      for (const cat of categories) {
        map[cat.id] = { name: cat.name, color: cat.color };
      }
    }
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.barcode && p.barcode.includes(searchQuery));
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const handleProductPress = (product: Product) => {
    addItem({ id: product.id, name: product.name, price: product.price });
  };

  const handleCheckout = () => {
    router.push("/payment");
  };

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  };

  const topSection: ViewStyle = {
    marginBottom: spacing.md,
  };

  const categoryRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  };

  const categoryTab = (isActive: boolean, color: string): ViewStyle => ({
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: isActive ? color : colors.surfaceElevated,
  });

  const categoryText = (isActive: boolean): TextStyle => ({
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: isActive ? colors.textOnPrimary : colors.textSecondary,
  });

  const contentRow: ViewStyle = {
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
  };

  const productGrid: ViewStyle = {
    flex: 2,
  };

  const cartPanel: ViewStyle = {
    flex: 1,
    minWidth: 280,
  };

  if (productsLoading) {
    return (
      <View style={[container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={container}>
      <View style={topSection}>
        <Input
          placeholder="Search products or scan barcode..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={categoryRow}>
            <TouchableOpacity
              style={categoryTab(selectedCategory === null, colors.primary)}
              onPress={() => setSelectedCategory(null)}
            >
              <Text style={categoryText(selectedCategory === null)}>All</Text>
            </TouchableOpacity>
            {(categories ?? []).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={categoryTab(
                  selectedCategory === cat.id,
                  cat.color || colors.primary
                )}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text style={categoryText(selectedCategory === cat.id)}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={contentRow}>
        <View style={productGrid}>
          <FlatList
            data={filteredProducts}
            numColumns={3}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={{ gap: spacing.sm, marginBottom: spacing.sm }}
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                categoryColor={
                  item.categoryId
                    ? categoryMap[item.categoryId]?.color || undefined
                    : undefined
                }
                onPress={handleProductPress}
              />
            )}
            ListEmptyComponent={
              <View style={{ paddingVertical: spacing["2xl"], alignItems: "center" }}>
                <Text style={{ color: colors.textTertiary, fontSize: fontSize.md }}>
                  {searchQuery ? "No products match your search" : "No products yet. Add products in the Products tab."}
                </Text>
              </View>
            }
          />
        </View>

        <View style={cartPanel}>
          <CartSummary onCheckout={handleCheckout} />
        </View>
      </View>
    </View>
  );
}
