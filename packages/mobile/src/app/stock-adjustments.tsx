import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import { useActiveIngredients } from "../hooks/use-ingredients";
import {
  useStockAdjustments,
  useAdjustStock,
} from "../hooks/use-stock-adjustments";
import { useAuthStore } from "../stores/auth-store";
import { Button, Card, Input } from "../components/ui";

type AdjustmentType = "waste" | "breakage" | "theft" | "count" | "other";

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string }[] = [
  { value: "waste", label: "Waste" },
  { value: "breakage", label: "Breakage" },
  { value: "theft", label: "Theft" },
  { value: "count", label: "Count" },
  { value: "other", label: "Other" },
];

const TYPE_COLORS: Record<AdjustmentType, { bg: string; text: string }> = {
  waste: { bg: "#FEF3C7", text: "#D97706" },
  breakage: { bg: "#FEE2E2", text: "#DC2626" },
  theft: { bg: "#EDE9FE", text: "#7C3AED" },
  count: { bg: "#DBEAFE", text: "#2563EB" },
  other: { bg: "#F1F5F9", text: "#64748B" },
};

export default function StockAdjustmentsScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: ingredients, isLoading: ingredientsLoading } = useActiveIngredients();
  const { data: recentAdjustments, isLoading: adjustmentsLoading } = useStockAdjustments(30);
  const adjustStock = useAdjustStock();
  const currentEmployee = useAuthStore((s) => s.currentEmployee);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState<any>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("waste");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const filteredIngredients = useMemo(() => {
    if (!ingredients) return [];
    if (!searchQuery.trim()) return ingredients;
    const q = searchQuery.toLowerCase();
    return ingredients.filter((i: any) =>
      (i.name ?? "").toLowerCase().includes(q)
    );
  }, [ingredients, searchQuery]);

  const computedChange = useMemo(() => {
    const val = parseFloat(quantity);
    if (isNaN(val)) return 0;
    if (adjustmentType === "count") {
      const currentStock = selectedIngredient?.currentStock ?? 0;
      return val - currentStock;
    }
    // For waste, breakage, theft: deduct; other: could be +/-
    if (adjustmentType === "other") return val;
    return -Math.abs(val);
  }, [adjustmentType, quantity, selectedIngredient]);

  const resetForm = () => {
    setSelectedIngredient(null);
    setAdjustmentType("waste");
    setQuantity("");
    setReason("");
  };

  const handleSubmit = () => {
    if (!selectedIngredient) {
      Alert.alert("Validation", "Please select an ingredient.");
      return;
    }
    const val = parseFloat(quantity);
    if (isNaN(val) || val === 0) {
      Alert.alert("Validation", "Please enter a valid quantity.");
      return;
    }

    const changeAmount = computedChange;

    Alert.alert(
      "Confirm Adjustment",
      `Adjust ${selectedIngredient.name} by ${changeAmount > 0 ? "+" : ""}${changeAmount} ${selectedIngredient.unit ?? "units"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            adjustStock.mutate(
              {
                ingredientId: selectedIngredient.id,
                type: adjustmentType,
                quantityChange: changeAmount,
                reason: reason.trim() || undefined,
                employeeId: currentEmployee?.id,
              },
              {
                onSuccess: () => {
                  Alert.alert("Success", "Stock adjustment recorded.");
                  resetForm();
                },
                onError: (err) => {
                  Alert.alert("Error", err.message || "Failed to adjust stock.");
                },
              }
            );
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Styles
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const scrollContent: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing["2xl"],
  };

  const header: ViewStyle = {
    padding: spacing.md,
    paddingBottom: 0,
  };

  const headerTitle: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const chipRow: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  };

  const pickerButton: ViewStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const modalOverlay: ViewStyle = {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: spacing.lg,
  };

  const modalContent: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: "80%",
  };

  const modalTitle: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  };

  const ingredientOption: ViewStyle = {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const stockInfo: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
  };

  const logItem: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  };

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Stock Adjustments</Text>
      </View>

      <ScrollView contentContainerStyle={scrollContent}>
        {/* Ingredient Picker */}
        <Card>
          <Text style={sectionTitle}>Ingredient</Text>
          <TouchableOpacity
            style={pickerButton}
            onPress={() => {
              setSearchQuery("");
              setPickerVisible(true);
            }}
          >
            <Text
              style={{
                fontSize: fontSize.md,
                color: selectedIngredient
                  ? colors.textPrimary
                  : colors.textTertiary,
              }}
            >
              {selectedIngredient
                ? selectedIngredient.name
                : "Select an ingredient..."}
            </Text>
            <Text style={{ fontSize: fontSize.md, color: colors.textTertiary }}>
              ▼
            </Text>
          </TouchableOpacity>

          {/* Current Stock Display */}
          {selectedIngredient && (
            <View style={{ ...stockInfo, marginTop: spacing.sm }}>
              <Text
                style={{
                  fontSize: fontSize.md,
                  color: colors.textSecondary,
                }}
              >
                Current Stock
              </Text>
              <Text
                style={{
                  fontSize: fontSize.xl,
                  fontWeight: fontWeight.bold,
                  color: colors.textPrimary,
                }}
              >
                {selectedIngredient.currentStock ?? 0}{" "}
                {selectedIngredient.unit ?? "units"}
              </Text>
            </View>
          )}
        </Card>

        {/* Adjustment Type */}
        <Card>
          <Text style={sectionTitle}>Adjustment Type</Text>
          <View style={chipRow}>
            {ADJUSTMENT_TYPES.map((type) => {
              const isSelected = adjustmentType === type.value;
              const typeColor = TYPE_COLORS[type.value];
              return (
                <TouchableOpacity
                  key={type.value}
                  onPress={() => {
                    setAdjustmentType(type.value);
                    setQuantity("");
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: borderRadius.full,
                    borderWidth: 1,
                    borderColor: isSelected ? typeColor.text : colors.border,
                    backgroundColor: isSelected ? typeColor.bg : colors.surface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      color: isSelected ? typeColor.text : colors.textPrimary,
                      fontWeight: isSelected
                        ? fontWeight.semibold
                        : fontWeight.regular,
                    }}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Quantity Input */}
        <Card>
          <Text style={sectionTitle}>
            {adjustmentType === "count" ? "New Stock Count" : "Quantity"}
          </Text>
          {adjustmentType === "count" ? (
            <Input
              label={`Enter the actual stock count (${selectedIngredient?.unit ?? "units"})`}
              value={quantity}
              onChangeText={(text) => setQuantity(text.replace(/[^0-9.\-]/g, ""))}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          ) : (
            <Input
              label={
                adjustmentType === "other"
                  ? "Enter quantity (positive to add, negative to deduct)"
                  : `Quantity to deduct (${selectedIngredient?.unit ?? "units"})`
              }
              value={quantity}
              onChangeText={(text) => setQuantity(text.replace(/[^0-9.\-]/g, ""))}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          )}

          {selectedIngredient && quantity !== "" && (
            <View
              style={{
                marginTop: spacing.sm,
                padding: spacing.sm,
                backgroundColor:
                  computedChange < 0 ? colors.errorLight : colors.successLight,
                borderRadius: borderRadius.sm,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.semibold,
                  color: computedChange < 0 ? colors.error : colors.success,
                  textAlign: "center",
                }}
              >
                Stock change: {computedChange > 0 ? "+" : ""}
                {computedChange} {selectedIngredient.unit ?? "units"}
                {"  "}→{"  "}
                {(selectedIngredient.currentStock ?? 0) + computedChange}{" "}
                {selectedIngredient.unit ?? "units"}
              </Text>
            </View>
          )}
        </Card>

        {/* Reason */}
        <Card>
          <Input
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Describe why this adjustment is being made..."
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: "top" }}
          />
        </Card>

        {/* Submit */}
        <Button
          title="Submit Adjustment"
          onPress={handleSubmit}
          fullWidth
          loading={adjustStock.isPending}
          disabled={!selectedIngredient || !quantity}
        />

        {/* Recent Adjustments Log */}
        <Card>
          <Text style={sectionTitle}>Recent Adjustments</Text>
          {adjustmentsLoading && (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginVertical: spacing.md }}
            />
          )}
          {recentAdjustments && recentAdjustments.length === 0 && (
            <Text
              style={{
                fontSize: fontSize.md,
                color: colors.textSecondary,
                textAlign: "center",
                paddingVertical: spacing.md,
              }}
            >
              No recent adjustments.
            </Text>
          )}
          {recentAdjustments?.map((adj: any) => {
            const typeColor =
              TYPE_COLORS[(adj.type as AdjustmentType) ?? "other"] ??
              TYPE_COLORS.other;
            return (
              <View key={adj.id} style={logItem}>
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: borderRadius.full,
                    backgroundColor: typeColor.bg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.semibold,
                      color: typeColor.text,
                      textTransform: "capitalize",
                    }}
                  >
                    {adj.type}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.medium,
                      color: colors.textPrimary,
                    }}
                  >
                    {adj.ingredient?.name ?? adj.ingredientId}
                  </Text>
                  {adj.reason ? (
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: colors.textSecondary,
                      }}
                      numberOfLines={1}
                    >
                      {adj.reason}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.bold,
                      color:
                        adj.quantityChange < 0 ? colors.error : colors.success,
                    }}
                  >
                    {adj.quantityChange > 0 ? "+" : ""}
                    {adj.quantityChange}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.xs,
                      color: colors.textTertiary,
                    }}
                  >
                    {adj.createdAt ? formatDate(adj.createdAt) : ""}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>

      {/* Ingredient Picker Modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={modalContent}>
            <Text style={modalTitle}>Select Ingredient</Text>
            <Input
              placeholder="Search ingredients..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              containerStyle={{ marginBottom: spacing.md }}
            />
            {ingredientsLoading ? (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={{ marginVertical: spacing.lg }}
              />
            ) : (
              <FlatList
                data={filteredIngredients}
                keyExtractor={(item: any) => item.id}
                style={{ maxHeight: 300 }}
                renderItem={({ item }: { item: any }) => (
                  <TouchableOpacity
                    style={ingredientOption}
                    onPress={() => {
                      setSelectedIngredient(item);
                      setPickerVisible(false);
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontSize: fontSize.md,
                          fontWeight: fontWeight.medium,
                          color: colors.textPrimary,
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          color: colors.textSecondary,
                        }}
                      >
                        Stock: {item.currentStock ?? 0} {item.unit ?? "units"}
                      </Text>
                    </View>
                    {selectedIngredient?.id === item.id && (
                      <Text
                        style={{
                          fontSize: fontSize.md,
                          color: colors.primary,
                          fontWeight: fontWeight.bold,
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text
                    style={{
                      textAlign: "center",
                      color: colors.textSecondary,
                      paddingVertical: spacing.lg,
                      fontSize: fontSize.md,
                    }}
                  >
                    No ingredients found.
                  </Text>
                }
              />
            )}
            <Button
              title="Close"
              variant="ghost"
              onPress={() => setPickerVisible(false)}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
