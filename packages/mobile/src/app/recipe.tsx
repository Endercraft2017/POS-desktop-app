import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "../hooks/use-theme";
import { useActiveProducts, useUpdateProduct } from "../hooks/use-products";
import { useActiveIngredients } from "../hooks/use-ingredients";
import { Button, Card, Input } from "../components/ui";
import { IngredientTypeahead } from "../components/products/ingredient-typeahead";
import { productIngredientRepository } from "../lib/repositories/product-ingredient-repository";
import { ingredientRepository } from "../lib/repositories/ingredient-repository";
import {
  calculateFullPricing,
  calculateBatchQuantityPerProduct,
} from "@pos/core/services";
import type { ProductIngredientWithDetails } from "../lib/repositories/product-ingredient-repository";
import type { Ingredient } from "@pos/core/types";

type IngredientPriceMap = Record<string, number>;

export default function RecipeScreen() {
  const { productId: paramProductId } = useLocalSearchParams<{
    productId?: string;
  }>();
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const { data: products, isLoading: productsLoading } = useActiveProducts();
  const { data: allIngredients, isLoading: ingredientsLoading } =
    useActiveIngredients();
  const updateProduct = useUpdateProduct();

  const [selectedProductId, setSelectedProductId] = useState<string>(
    paramProductId ?? ""
  );
  const [linkedIngredients, setLinkedIngredients] = useState<
    ProductIngredientWithDetails[]
  >([]);
  const [ingredientPrices, setIngredientPrices] = useState<IngredientPriceMap>(
    {}
  );
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Add/edit ingredient state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [directQuantity, setDirectQuantity] = useState("");
  const [batchIngredientQty, setBatchIngredientQty] = useState("");
  const [batchYield, setBatchYield] = useState("");

  // Editing existing ingredient
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingIngredient, setEditingIngredient] =
    useState<Ingredient | null>(null);

  // Auto-pricing state
  const [markupPercent, setMarkupPercent] = useState("60");
  const [additionalCosts, setAdditionalCosts] = useState("0");

  const selectedProduct = useMemo(
    () => products?.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const linkedIngredientIds = useMemo(
    () => linkedIngredients.map((li) => li.ingredientId),
    [linkedIngredients]
  );

  // Load linked ingredients and their prices
  const loadLinkedIngredients = useCallback(async () => {
    if (!selectedProductId) return;
    setIsLoadingLinks(true);
    try {
      const data =
        await productIngredientRepository.getByProduct(selectedProductId);
      setLinkedIngredients(data);

      // Fetch latest price for each ingredient
      const priceMap: IngredientPriceMap = {};
      await Promise.all(
        data.map(async (li) => {
          try {
            const latestPrice = await ingredientRepository.getLatestPrice(
              li.ingredientId
            );
            if (latestPrice) {
              priceMap[li.ingredientId] = latestPrice.price;
            }
          } catch {
            // Price not available
          }
        })
      );
      setIngredientPrices(priceMap);
    } catch {
      Alert.alert("Error", "Failed to load ingredients for this product.");
    } finally {
      setIsLoadingLinks(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    if (selectedProductId) {
      loadLinkedIngredients();
    } else {
      setLinkedIngredients([]);
      setIngredientPrices({});
    }
  }, [selectedProductId, loadLinkedIngredients]);

  // Computed per-product quantity for batch mode
  const computedPerProduct = useMemo(() => {
    const bQty = parseFloat(batchIngredientQty);
    const bYield = parseFloat(batchYield);
    if (!bQty || !bYield || bQty <= 0 || bYield <= 0) return null;
    return calculateBatchQuantityPerProduct(bQty, bYield);
  }, [batchIngredientQty, batchYield]);

  // Full pricing calculation
  const pricing = useMemo(() => {
    if (linkedIngredients.length === 0) return null;
    const markup = parseFloat(markupPercent) || 0;
    const additional = parseFloat(additionalCosts) || 0;

    const ingredientData = linkedIngredients.map((li) => ({
      ingredientName: li.ingredient.name,
      quantityPerProduct: li.quantity,
      pricePerUnit: ingredientPrices[li.ingredientId] ?? 0,
      unit: li.ingredient.unit,
    }));

    return calculateFullPricing(ingredientData, markup, additional);
  }, [linkedIngredients, ingredientPrices, markupPercent, additionalCosts]);

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    setShowProductPicker(false);
  };

  const resetAddForm = () => {
    setSelectedIngredient(null);
    setDirectQuantity("");
    setBatchIngredientQty("");
    setBatchYield("");
    setIsBatchMode(false);
    setEditingLinkId(null);
    setEditingIngredient(null);
  };

  const openAddModal = () => {
    resetAddForm();
    setShowAddModal(true);
  };

  const openEditModal = (li: ProductIngredientWithDetails) => {
    resetAddForm();
    setEditingLinkId(li.id);
    setEditingIngredient(li.ingredient);
    setSelectedIngredient(li.ingredient);
    setDirectQuantity(String(li.quantity));
    setShowAddModal(true);
  };

  const getEffectiveQuantity = (): number | null => {
    if (isBatchMode) {
      return computedPerProduct;
    }
    const qty = parseFloat(directQuantity);
    if (!qty || qty <= 0) return null;
    return qty;
  };

  const handleSaveIngredient = async () => {
    const qty = getEffectiveQuantity();
    if (qty === null || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity.");
      return;
    }

    try {
      if (editingLinkId) {
        await productIngredientRepository.update(editingLinkId, qty);
      } else if (selectedIngredient) {
        await productIngredientRepository.create({
          productId: selectedProductId,
          ingredientId: selectedIngredient.id,
          quantity: qty,
        });
      }
      setShowAddModal(false);
      resetAddForm();
      loadLinkedIngredients();
    } catch {
      Alert.alert(
        "Error",
        editingLinkId
          ? "Failed to update ingredient."
          : "Failed to add ingredient."
      );
    }
  };

  const handleRemoveIngredient = (linkId: string, name: string) => {
    Alert.alert("Remove Ingredient", `Remove ${name} from this recipe?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await productIngredientRepository.remove(linkId);
            loadLinkedIngredients();
          } catch {
            Alert.alert("Error", "Failed to remove ingredient.");
          }
        },
      },
    ]);
  };

  const handleApplyPrice = async () => {
    if (!pricing || !selectedProduct) return;
    Alert.alert(
      "Apply Price",
      `Update ${selectedProduct.name} selling price to $${pricing.suggestedPrice.toFixed(2)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: async () => {
            try {
              await updateProduct.mutateAsync({
                id: selectedProduct.id,
                data: { price: pricing.suggestedPrice },
              });
              Alert.alert(
                "Success",
                `Price updated to $${pricing.suggestedPrice.toFixed(2)}`
              );
            } catch {
              Alert.alert("Error", "Failed to update product price.");
            }
          },
        },
      ]
    );
  };

  const handleIngredientSelected = (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient);
  };

  if (productsLoading || ingredientsLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text
          style={{
            fontSize: fontSize["3xl"],
            fontWeight: fontWeight.bold,
            color: colors.textPrimary,
            marginBottom: spacing.sm,
          }}
        >
          Product Recipe
        </Text>

        {/* Product Selector */}
        <Card>
          <Text
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
              color: colors.textPrimary,
              marginBottom: spacing.sm,
            }}
          >
            Select Product
          </Text>
          <TouchableOpacity
            style={{
              padding: spacing.md,
              borderRadius: borderRadius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onPress={() => setShowProductPicker(!showProductPicker)}
          >
            <Text
              style={{
                fontSize: fontSize.md,
                color: selectedProduct
                  ? colors.textPrimary
                  : colors.textTertiary,
                fontWeight: selectedProduct
                  ? fontWeight.medium
                  : fontWeight.regular,
              }}
            >
              {selectedProduct
                ? `${selectedProduct.name} ($${selectedProduct.price.toFixed(2)})`
                : "Tap to select a product..."}
            </Text>
            <Text
              style={{ color: colors.textTertiary, fontSize: fontSize.md }}
            >
              {showProductPicker ? "\u25B2" : "\u25BC"}
            </Text>
          </TouchableOpacity>

          {showProductPicker && (
            <ScrollView
              style={{
                backgroundColor: colors.surface,
                borderRadius: borderRadius.md,
                borderWidth: 1,
                borderColor: colors.border,
                maxHeight: 300,
                marginTop: spacing.sm,
              }}
              nestedScrollEnabled
            >
              {(products ?? []).map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={{
                    padding: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor:
                      product.id === selectedProductId
                        ? colors.primaryLight
                        : colors.surface,
                  }}
                  onPress={() => handleSelectProduct(product.id)}
                >
                  <Text
                    style={{ fontSize: fontSize.md, color: colors.textPrimary }}
                  >
                    {product.name} - ${product.price.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
              {(products ?? []).length === 0 && (
                <View style={{ padding: spacing.md }}>
                  <Text
                    style={{
                      color: colors.textTertiary,
                      textAlign: "center",
                    }}
                  >
                    No products available.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </Card>

        {/* Ingredient List & Management */}
        {selectedProductId ? (
          <>
            {/* Current Ingredients */}
            <Card>
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  color: colors.textPrimary,
                  marginBottom: spacing.sm,
                }}
              >
                Ingredients
              </Text>

              {isLoadingLinks ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ marginVertical: spacing.md }}
                />
              ) : linkedIngredients.length === 0 ? (
                <Text
                  style={{
                    fontSize: fontSize.md,
                    color: colors.textTertiary,
                    textAlign: "center",
                    paddingVertical: spacing.md,
                  }}
                >
                  No ingredients linked yet. Add ingredients below.
                </Text>
              ) : (
                <>
                  {linkedIngredients.map((li) => {
                    const pricePerUnit =
                      ingredientPrices[li.ingredientId] ?? 0;
                    const costPerProduct = li.quantity * pricePerUnit;

                    return (
                      <View
                        key={li.id}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingVertical: spacing.sm,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: fontSize.md,
                              fontWeight: fontWeight.medium,
                              color: colors.textPrimary,
                            }}
                          >
                            {li.ingredient.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: fontSize.sm,
                              color: colors.textSecondary,
                              marginTop: 2,
                            }}
                          >
                            {li.quantity} {li.ingredient.unit} per product
                          </Text>
                          <Text
                            style={{
                              fontSize: fontSize.sm,
                              color: colors.textTertiary,
                              marginTop: 2,
                            }}
                          >
                            Cost: ${costPerProduct.toFixed(2)} (${pricePerUnit.toFixed(2)}/{li.ingredient.unit})
                          </Text>
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.sm,
                          }}
                        >
                          <TouchableOpacity onPress={() => openEditModal(li)}>
                            <Text
                              style={{
                                fontSize: fontSize.sm,
                                color: colors.primary,
                                fontWeight: fontWeight.medium,
                              }}
                            >
                              Edit
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              handleRemoveIngredient(
                                li.id,
                                li.ingredient.name
                              )
                            }
                          >
                            <Text
                              style={{
                                fontSize: fontSize.sm,
                                color: colors.error,
                                fontWeight: fontWeight.medium,
                              }}
                            >
                              Remove
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {/* Add Ingredient Button */}
              <Button
                title="+ Add Ingredient"
                variant="secondary"
                onPress={openAddModal}
                fullWidth
                style={{ marginTop: spacing.md }}
              />
            </Card>

            {/* Auto-Pricing Section */}
            {linkedIngredients.length > 0 && pricing && (
              <Card>
                <Text
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.md,
                  }}
                >
                  Auto-Pricing
                </Text>

                {/* Total Ingredient Cost */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      color: colors.textSecondary,
                    }}
                  >
                    Total Ingredient Cost
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.semibold,
                      color: colors.textPrimary,
                    }}
                  >
                    ${pricing.totalIngredientCost.toFixed(2)}
                  </Text>
                </View>

                {/* Markup Input */}
                <Input
                  label="Desired Markup %"
                  value={markupPercent}
                  onChangeText={setMarkupPercent}
                  keyboardType="decimal-pad"
                  placeholder="60"
                  containerStyle={{ marginTop: spacing.md }}
                />

                {/* Additional Costs Input */}
                <Input
                  label="Additional Costs Per Unit (packaging, labor)"
                  value={additionalCosts}
                  onChangeText={setAdditionalCosts}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  containerStyle={{ marginTop: spacing.sm }}
                />

                {/* Pricing Results */}
                <View
                  style={{
                    marginTop: spacing.md,
                    padding: spacing.md,
                    backgroundColor: colors.primaryLight,
                    borderRadius: borderRadius.md,
                    gap: spacing.sm,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        color: colors.primary,
                      }}
                    >
                      Total Cost Per Unit
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: fontWeight.semibold,
                        color: colors.primary,
                      }}
                    >
                      ${pricing.totalCostPerUnit.toFixed(2)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.lg,
                        fontWeight: fontWeight.bold,
                        color: colors.primary,
                      }}
                    >
                      Suggested Price
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.lg,
                        fontWeight: fontWeight.bold,
                        color: colors.primary,
                      }}
                    >
                      ${pricing.suggestedPrice.toFixed(2)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        color: colors.primary,
                      }}
                    >
                      Profit Per Unit
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: fontWeight.semibold,
                        color: colors.primary,
                      }}
                    >
                      ${pricing.profitPerUnit.toFixed(2)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        color: colors.primary,
                      }}
                    >
                      Margin
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.md,
                        fontWeight: fontWeight.semibold,
                        color: colors.primary,
                      }}
                    >
                      {pricing.profitMarginPercent.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {/* Current vs Suggested */}
                {selectedProduct && (
                  <View
                    style={{
                      marginTop: spacing.sm,
                      padding: spacing.sm,
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.sm,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: colors.textSecondary,
                        textAlign: "center",
                      }}
                    >
                      Current price: ${selectedProduct.price.toFixed(2)} |
                      Suggested: ${pricing.suggestedPrice.toFixed(2)}
                    </Text>
                  </View>
                )}

                {/* Apply Price Button */}
                <Button
                  title="Apply as Product Price"
                  onPress={handleApplyPrice}
                  fullWidth
                  style={{ marginTop: spacing.md }}
                />
              </Card>
            )}
          </>
        ) : (
          <Card>
            <Text
              style={{
                fontSize: fontSize.md,
                color: colors.textTertiary,
                textAlign: "center",
                paddingVertical: spacing["2xl"],
              }}
            >
              Select a product above to manage its recipe ingredients.
            </Text>
          </Card>
        )}
      </ScrollView>

      {/* Add/Edit Ingredient Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowAddModal(false);
          resetAddForm();
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: borderRadius.lg,
              borderTopRightRadius: borderRadius.lg,
              padding: spacing.lg,
              maxHeight: "85%",
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={{
                  fontSize: fontSize.xl,
                  fontWeight: fontWeight.bold,
                  color: colors.textPrimary,
                  marginBottom: spacing.md,
                }}
              >
                {editingLinkId ? "Edit Ingredient" : "Add Ingredient"}
              </Text>

              {/* Ingredient Typeahead (only for adding new) */}
              {!editingLinkId && (
                <View style={{ marginBottom: spacing.md, zIndex: 10 }}>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.medium,
                      color: colors.textPrimary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Search Ingredient
                  </Text>
                  <IngredientTypeahead
                    ingredients={allIngredients ?? []}
                    excludeIds={linkedIngredientIds}
                    onSelect={handleIngredientSelected}
                    placeholder="Type to search ingredients..."
                  />
                </View>
              )}

              {/* Selected Ingredient Display */}
              {selectedIngredient && (
                <View
                  style={{
                    padding: spacing.md,
                    backgroundColor: colors.primaryLight,
                    borderRadius: borderRadius.md,
                    marginBottom: spacing.md,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.semibold,
                      color: colors.primary,
                    }}
                  >
                    {selectedIngredient.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      color: colors.primary,
                      marginTop: 2,
                    }}
                  >
                    Unit: {selectedIngredient.unit} | Stock:{" "}
                    {selectedIngredient.currentStock ?? 0}{" "}
                    {selectedIngredient.unit}
                  </Text>
                </View>
              )}

              {/* Mode Toggle */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.md,
                    color: colors.textPrimary,
                    fontWeight: fontWeight.medium,
                  }}
                >
                  {isBatchMode ? "Batch Mode" : "Direct Mode"}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      color: isBatchMode
                        ? colors.textTertiary
                        : colors.primary,
                    }}
                  >
                    Direct
                  </Text>
                  <Switch
                    value={isBatchMode}
                    onValueChange={setIsBatchMode}
                    trackColor={{
                      false: colors.border,
                      true: colors.primary,
                    }}
                    thumbColor={colors.surface}
                  />
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      color: isBatchMode
                        ? colors.primary
                        : colors.textTertiary,
                    }}
                  >
                    Batch
                  </Text>
                </View>
              </View>

              {/* Direct Mode */}
              {!isBatchMode && (
                <Input
                  label={`Quantity per product (${selectedIngredient?.unit ?? "units"})`}
                  value={directQuantity}
                  onChangeText={setDirectQuantity}
                  keyboardType="decimal-pad"
                  placeholder={`e.g., 0.25 ${selectedIngredient?.unit ?? ""}`}
                  containerStyle={{ marginBottom: spacing.md }}
                />
              )}

              {/* Batch Mode */}
              {isBatchMode && (
                <View style={{ marginBottom: spacing.md }}>
                  <Input
                    label={`Ingredient quantity per batch (${selectedIngredient?.unit ?? "units"})`}
                    value={batchIngredientQty}
                    onChangeText={setBatchIngredientQty}
                    keyboardType="decimal-pad"
                    placeholder={`e.g., 25 ${selectedIngredient?.unit ?? ""}`}
                    containerStyle={{ marginBottom: spacing.sm }}
                  />
                  <Input
                    label="Products per batch (yield)"
                    value={batchYield}
                    onChangeText={setBatchYield}
                    keyboardType="decimal-pad"
                    placeholder="e.g., 100"
                    containerStyle={{ marginBottom: spacing.sm }}
                  />

                  {/* Auto-computed per-product quantity */}
                  {computedPerProduct !== null && (
                    <View
                      style={{
                        padding: spacing.md,
                        backgroundColor: colors.successLight,
                        borderRadius: borderRadius.md,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          color: colors.success,
                          fontWeight: fontWeight.medium,
                        }}
                      >
                        Per-product quantity:
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.lg,
                          fontWeight: fontWeight.bold,
                          color: colors.success,
                        }}
                      >
                        {computedPerProduct}{" "}
                        {selectedIngredient?.unit ?? "units"} per product
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          color: colors.success,
                          marginTop: 2,
                        }}
                      >
                        ({batchIngredientQty} {selectedIngredient?.unit ?? ""}{" "}
                        / {batchYield} products)
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Action Buttons */}
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.sm,
                  marginTop: spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      setShowAddModal(false);
                      resetAddForm();
                    }}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={editingLinkId ? "Update" : "Add"}
                    onPress={handleSaveIngredient}
                    fullWidth
                    disabled={
                      !selectedIngredient ||
                      (isBatchMode
                        ? computedPerProduct === null
                        : !directQuantity || parseFloat(directQuantity) <= 0)
                    }
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
