import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import {
  useIngredients,
  useIngredientPrices,
  useCreateIngredient,
  useUpdateIngredient,
  useDeleteIngredient,
} from "../hooks/use-ingredients";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

const UNITS = ["g", "ml", "oz", "kg", "lb", "each", "piece"] as const;

type IngredientForm = {
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
};

const emptyForm: IngredientForm = {
  name: "",
  unit: "each",
  currentStock: "0",
  minStock: "0",
};

export default function IngredientsScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: ingredients, isLoading } = useIngredients();
  const createIngredient = useCreateIngredient();
  const updateIngredient = useUpdateIngredient();
  const deleteIngredient = useDeleteIngredient();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IngredientForm>(emptyForm);
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [priceIngredientId, setPriceIngredientId] = useState<string>("");
  const [priceIngredientName, setPriceIngredientName] = useState<string>("");

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (ingredient: any) => {
    setEditingId(ingredient.id);
    setForm({
      name: ingredient.name ?? "",
      unit: ingredient.unit ?? "each",
      currentStock: String(ingredient.currentStock ?? 0),
      minStock: String(ingredient.minStock ?? 0),
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Ingredient name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      currentStock: parseFloat(form.currentStock) || 0,
      minStock: parseFloat(form.minStock) || 0,
    };

    if (editingId) {
      updateIngredient.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createIngredient.mutate(payload as any, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Ingredient",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteIngredient.mutate(id),
        },
      ]
    );
  };

  const openPriceHistory = (id: string, name: string) => {
    setPriceIngredientId(id);
    setPriceIngredientName(name);
    setPriceModalVisible(true);
  };

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  };

  const headerTitle: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const listContainer: ViewStyle = {
    padding: spacing.md,
    gap: spacing.sm,
  };

  const unitPicker: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
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
    gap: spacing.md,
  };

  const modalTitle: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const modalActions: ViewStyle = {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Ingredients</Text>
        <Button title="Add Ingredient" onPress={openCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={listContainer}>
        {ingredients && ingredients.length === 0 && (
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No ingredients yet. Tap "Add Ingredient" to create one.
          </Text>
        )}

        {ingredients?.map((item: any) => {
          const isLowStock =
            item.minStock != null &&
            item.currentStock != null &&
            item.currentStock < item.minStock;

          return (
            <Card
              key={item.id}
              style={isLowStock ? { backgroundColor: colors.errorLight, borderColor: colors.error } : undefined}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.semibold,
                      color: colors.textPrimary,
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Unit: {item.unit ?? "N/A"}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xs }}>
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: isLowStock ? colors.error : colors.textSecondary,
                        fontWeight: isLowStock ? fontWeight.bold : fontWeight.regular,
                      }}
                    >
                      Stock: {item.currentStock ?? 0}
                    </Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                      Min: {item.minStock ?? 0}
                    </Text>
                  </View>
                  {isLowStock && (
                    <Text
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.error,
                        fontWeight: fontWeight.bold,
                        marginTop: spacing.xs,
                      }}
                    >
                      LOW STOCK WARNING
                    </Text>
                  )}
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Button
                    title="Prices"
                    variant="secondary"
                    size="sm"
                    onPress={() => openPriceHistory(item.id, item.name)}
                  />
                  <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(item)} />
                  <Button
                    title="Delete"
                    variant="destructive"
                    size="sm"
                    onPress={() => handleDelete(item.id, item.name)}
                  />
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={modalContent}>
            <Text style={modalTitle}>
              {editingId ? "Edit Ingredient" : "New Ingredient"}
            </Text>

            <Input
              label="Name"
              value={form.name}
              onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
              placeholder="e.g. Flour"
            />

            <View>
              <Text
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.medium,
                  color: colors.textSecondary,
                  marginBottom: spacing.xs,
                }}
              >
                Unit
              </Text>
              <View style={unitPicker}>
                {UNITS.map((u) => {
                  const isSelected = form.unit === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setForm((f) => ({ ...f, unit: u }))}
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: borderRadius.sm,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          color: isSelected ? colors.primary : colors.textPrimary,
                          fontWeight: isSelected ? fontWeight.semibold : fontWeight.regular,
                        }}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Input
              label="Current Stock"
              value={form.currentStock}
              onChangeText={(text) => setForm((f) => ({ ...f, currentStock: text }))}
              placeholder="0"
              keyboardType="numeric"
            />

            <Input
              label="Minimum Stock"
              value={form.minStock}
              onChangeText={(text) => setForm((f) => ({ ...f, minStock: text }))}
              placeholder="0"
              keyboardType="numeric"
            />

            <View style={modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setModalVisible(false)}
              />
              <Button
                title={editingId ? "Update" : "Create"}
                onPress={handleSave}
                loading={createIngredient.isPending || updateIngredient.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Price History Modal */}
      <PriceHistoryModal
        visible={priceModalVisible}
        ingredientId={priceIngredientId}
        ingredientName={priceIngredientName}
        onClose={() => setPriceModalVisible(false)}
      />
    </View>
  );
}

function PriceHistoryModal({
  visible,
  ingredientId,
  ingredientName,
  onClose,
}: {
  visible: boolean;
  ingredientId: string;
  ingredientName: string;
  onClose: () => void;
}) {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: prices, isLoading } = useIngredientPrices(ingredientId);

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
    maxHeight: "70%",
  };

  const modalTitle: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalOverlay}>
        <View style={modalContent}>
          <Text style={modalTitle}>Price History - {ingredientName}</Text>

          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : prices && prices.length > 0 ? (
            <ScrollView style={{ gap: spacing.sm }}>
              {prices.map((price: any, index: number) => (
                <View
                  key={price.id ?? index}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: spacing.sm,
                    borderBottomWidth: index < prices.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: fontSize.md, color: colors.textPrimary }}>
                    ${parseFloat(price.price ?? price.unitPrice ?? 0).toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                    {price.createdAt
                      ? new Date(price.createdAt).toLocaleDateString()
                      : "N/A"}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.md, textAlign: "center", paddingVertical: spacing.lg }}>
              No price history available.
            </Text>
          )}

          <View style={{ marginTop: spacing.md, alignItems: "flex-end" }}>
            <Button title="Close" variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
