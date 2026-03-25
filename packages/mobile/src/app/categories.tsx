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
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "../hooks/use-categories";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type CategoryForm = {
  name: string;
  color: string;
  icon: string;
  sortOrder: string;
};

const emptyForm: CategoryForm = {
  name: "",
  color: "#2563EB",
  icon: "",
  sortOrder: "0",
};

export default function CategoriesScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (category: any) => {
    setEditingId(category.id);
    setForm({
      name: category.name ?? "",
      color: category.color ?? "#2563EB",
      icon: category.icon ?? "",
      sortOrder: String(category.sortOrder ?? 0),
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Category name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      color: form.color.trim() || null,
      icon: form.icon.trim() || null,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    };

    if (editingId) {
      updateCategory.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => setModalVisible(false),
        }
      );
    } else {
      createCategory.mutate(payload as any, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCategory.mutate(id),
        },
      ]
    );
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

  const cardRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  };

  const colorSwatch: ViewStyle = {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const categoryInfo: ViewStyle = {
    flex: 1,
  };

  const categoryName: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const categoryMeta: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  };

  const actions: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
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

  const colorPreviewRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
        <Text style={headerTitle}>Categories</Text>
        <Button title="Add Category" onPress={openCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={listContainer}>
        {categories && categories.length === 0 && (
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No categories yet. Tap "Add Category" to create one.
          </Text>
        )}

        {categories?.map((cat: any) => (
          <Card key={cat.id}>
            <View style={cardRow}>
              <View
                style={[colorSwatch, { backgroundColor: cat.color || colors.primary }]}
              />
              <View style={categoryInfo}>
                <Text style={categoryName}>
                  {cat.icon ? `${cat.icon} ` : ""}
                  {cat.name}
                </Text>
                <Text style={categoryMeta}>Sort Order: {cat.sortOrder ?? 0}</Text>
              </View>
              <View style={actions}>
                <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(cat)} />
                <Button
                  title="Delete"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleDelete(cat.id, cat.name)}
                />
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={modalContent}>
            <Text style={modalTitle}>
              {editingId ? "Edit Category" : "New Category"}
            </Text>

            <Input
              label="Name"
              value={form.name}
              onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
              placeholder="e.g. Beverages"
            />

            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing.xs }}>
                Color
              </Text>
              <View style={colorPreviewRow}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: borderRadius.sm,
                    backgroundColor: form.color || colors.primary,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Input
                    value={form.color}
                    onChangeText={(text) => setForm((f) => ({ ...f, color: text }))}
                    placeholder="#2563EB"
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>

            <Input
              label="Icon (emoji or text)"
              value={form.icon}
              onChangeText={(text) => setForm((f) => ({ ...f, icon: text }))}
              placeholder="e.g. coffee emoji"
            />

            <Input
              label="Sort Order"
              value={form.sortOrder}
              onChangeText={(text) => setForm((f) => ({ ...f, sortOrder: text }))}
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
                loading={createCategory.isPending || updateCategory.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
