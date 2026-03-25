import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useSearchProducts, useProducts, useUpdateProduct } from "../hooks/use-products";
import { useCartStore } from "../stores/cart-store";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type Mode = "lookup" | "checkout";

export default function BarcodeScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === "checkout" ? "checkout" : "lookup";

  const [barcode, setBarcode] = useState("");
  const [searchedBarcode, setSearchedBarcode] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");

  const { data: searchResults, isLoading: searching } = useSearchProducts(searchedBarcode);
  const { data: allProducts } = useProducts();
  const updateProduct = useUpdateProduct();
  const addItem = useCartStore((s) => s.addItem);

  const matchedProduct = searchResults?.find(
    (p: any) => p.barcode === searchedBarcode || p.sku === searchedBarcode
  );

  const handleSearch = useCallback(() => {
    const trimmed = barcode.trim();
    if (!trimmed) {
      Alert.alert("Input Required", "Please enter a barcode.");
      return;
    }
    setSearchedBarcode(trimmed);
    setShowAssignModal(false);
  }, [barcode]);

  const handleAddToCart = useCallback(() => {
    if (!matchedProduct) return;
    addItem({
      id: matchedProduct.id,
      name: matchedProduct.name,
      price: matchedProduct.price,
    });

    if (mode === "checkout") {
      Alert.alert("Added", `${matchedProduct.name} added to cart.`, [
        { text: "Scan Another", onPress: () => { setBarcode(""); setSearchedBarcode(""); } },
        { text: "Go to Checkout", onPress: () => router.back() },
      ]);
    } else {
      Alert.alert("Added", `${matchedProduct.name} added to cart.`);
    }
  }, [matchedProduct, addItem, mode, router]);

  const handleAssignBarcode = useCallback(
    (product: any) => {
      Alert.alert(
        "Assign Barcode",
        `Assign barcode "${searchedBarcode}" to "${product.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Assign",
            onPress: () => {
              updateProduct.mutate(
                { id: product.id, data: { barcode: searchedBarcode } },
                {
                  onSuccess: () => {
                    Alert.alert("Success", `Barcode assigned to ${product.name}.`);
                    setShowAssignModal(false);
                    setSearchedBarcode(searchedBarcode);
                  },
                }
              );
            },
          },
        ]
      );
    },
    [searchedBarcode, updateProduct]
  );

  const filteredAssignProducts = allProducts?.filter((p: any) => {
    if (!assignSearch.trim()) return true;
    const q = assignSearch.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
  });

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    padding: spacing.md,
  };

  const headerTitle: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const headerSubtitle: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const modeBadge: ViewStyle = {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: mode === "checkout" ? colors.primary : colors.surfaceElevated,
    marginTop: spacing.sm,
  };

  const modeBadgeText: TextStyle = {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: mode === "checkout" ? colors.textOnPrimary : colors.textSecondary,
  };

  const inputRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: "flex-end",
  };

  const cameraPlaceholder: ViewStyle = {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: 200,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  };

  const cameraPlaceholderText: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  };

  const contentContainer: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  };

  const productCardRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const productName: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const productDetail: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  };

  const productPrice: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  };

  const notFoundContainer: ViewStyle = {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  };

  const notFoundText: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  };

  const assignListItem: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const assignItemName: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  };

  const assignItemSku: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  };

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Barcode Scanner</Text>
        <Text style={headerSubtitle}>
          Enter or scan a barcode to find products.
        </Text>
        <View style={modeBadge}>
          <Text style={modeBadgeText}>
            {mode === "checkout" ? "Checkout Mode" : "Lookup Mode"}
          </Text>
        </View>
      </View>

      <View style={cameraPlaceholder}>
        <Text style={cameraPlaceholderText}>
          Camera preview placeholder{"\n"}(requires expo-camera with native build)
        </Text>
      </View>

      <View style={inputRow}>
        <View style={{ flex: 1 }}>
          <Input
            label="Barcode / SKU"
            value={barcode}
            onChangeText={setBarcode}
            placeholder="Enter barcode or SKU"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
          />
        </View>
        <Button title="Search" onPress={handleSearch} size="md" />
      </View>

      <ScrollView contentContainerStyle={contentContainer}>
        {searching && (
          <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {searchedBarcode && !searching && matchedProduct && (
          <Card>
            <Text style={{ fontSize: fontSize.sm, color: colors.success, fontWeight: fontWeight.semibold, marginBottom: spacing.sm }}>
              Product Found
            </Text>
            <View style={productCardRow}>
              <View style={{ flex: 1 }}>
                <Text style={productName}>{matchedProduct.name}</Text>
                {matchedProduct.sku && (
                  <Text style={productDetail}>SKU: {matchedProduct.sku}</Text>
                )}
                {matchedProduct.barcode && (
                  <Text style={productDetail}>Barcode: {matchedProduct.barcode}</Text>
                )}
                {matchedProduct.categoryId && (
                  <Text style={productDetail}>
                    Category: {matchedProduct.categoryId}
                  </Text>
                )}
                <Text style={productDetail}>
                  Stock: {matchedProduct.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
              <Text style={productPrice}>${matchedProduct.price?.toFixed(2)}</Text>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Button
                title="Add to Cart"
                onPress={handleAddToCart}
                fullWidth
              />
            </View>
          </Card>
        )}

        {searchedBarcode && !searching && !matchedProduct && (
          <Card>
            <View style={notFoundContainer}>
              <Text style={notFoundText}>Product not found</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, textAlign: "center" }}>
                No product matches barcode "{searchedBarcode}".
              </Text>
              <Button
                title="Assign to Existing Product"
                onPress={() => setShowAssignModal(true)}
                variant="secondary"
              />
            </View>
          </Card>
        )}

        {showAssignModal && (
          <Card>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
              Assign Barcode to Product
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
              Barcode: {searchedBarcode}
            </Text>

            <Input
              label="Search products"
              value={assignSearch}
              onChangeText={setAssignSearch}
              placeholder="Type to filter products..."
            />

            <FlatList
              data={filteredAssignProducts?.slice(0, 20) ?? []}
              keyExtractor={(item: any) => item.id}
              scrollEnabled={false}
              style={{ marginTop: spacing.sm, maxHeight: 300 }}
              renderItem={({ item }: { item: any }) => (
                <TouchableOpacity
                  style={assignListItem}
                  onPress={() => handleAssignBarcode(item)}
                >
                  <View>
                    <Text style={assignItemName}>{item.name}</Text>
                    {item.sku && <Text style={assignItemSku}>SKU: {item.sku}</Text>}
                    {item.barcode && <Text style={assignItemSku}>Current barcode: {item.barcode}</Text>}
                  </View>
                  <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold }}>
                    Assign
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.md }}>
                  No products found.
                </Text>
              }
            />

            <View style={{ marginTop: spacing.sm }}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setShowAssignModal(false)}
                fullWidth
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
