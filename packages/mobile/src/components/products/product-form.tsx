import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../../hooks/use-theme";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { createProductSchema } from "@pos/core/validators";
import type { Product, Category } from "@pos/core/types";

type ProductFormProps = {
  initialData?: Product | null;
  categories: Category[];
  onSubmit: (data: {
    name: string;
    sku?: string;
    description?: string;
    price: number;
    costPrice?: number;
    categoryId?: string;
    barcode?: string;
    isActive?: boolean;
  }) => void;
  onCancel: () => void;
};

export function ProductForm({
  initialData,
  categories,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();

  const [name, setName] = useState(initialData?.name ?? "");
  const [sku, setSku] = useState(initialData?.sku ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [price, setPrice] = useState(initialData?.price?.toString() ?? "");
  const [costPrice, setCostPrice] = useState(initialData?.costPrice?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(initialData?.categoryId ?? "");
  const [barcode, setBarcode] = useState(initialData?.barcode ?? "");
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setSku(initialData.sku ?? "");
      setDescription(initialData.description ?? "");
      setPrice(initialData.price?.toString() ?? "");
      setCostPrice(initialData.costPrice?.toString() ?? "");
      setCategoryId(initialData.categoryId ?? "");
      setBarcode(initialData.barcode ?? "");
      setIsActive(initialData.isActive ?? true);
    }
  }, [initialData]);

  const handleSubmit = () => {
    const parsed = createProductSchema.safeParse({
      name: name.trim(),
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
      price: parseFloat(price) || 0,
      costPrice: costPrice ? parseFloat(costPrice) : undefined,
      categoryId: categoryId || undefined,
      barcode: barcode.trim() || undefined,
      isActive,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString();
        if (field) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(parsed.data);
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const sectionTitle: TextStyle = {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  };

  const fieldGap: ViewStyle = {
    marginBottom: spacing.md,
  };

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    gap: spacing.md,
  };

  const halfField: ViewStyle = {
    flex: 1,
  };

  const labelStyle: TextStyle = {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  };

  const pickerButton: ViewStyle = {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: colors.surface,
  };

  const pickerButtonText: TextStyle = {
    fontSize: fontSize.md,
    color: selectedCategory ? colors.textPrimary : colors.textTertiary,
  };

  const dropdownContainer: ViewStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
    maxHeight: 200,
  };

  const dropdownItem = (isSelected: boolean): ViewStyle => ({
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: isSelected ? colors.primaryLight : "transparent",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  });

  const dropdownItemText = (isSelected: boolean): TextStyle => ({
    fontSize: fontSize.md,
    color: isSelected ? colors.primary : colors.textPrimary,
    fontWeight: isSelected ? fontWeight.medium : fontWeight.regular,
  });

  const switchRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  };

  const switchLabel: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const buttonsRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={sectionTitle}>
        {initialData ? "Edit Product" : "New Product"}
      </Text>

      <View style={fieldGap}>
        <Input
          label="Name *"
          value={name}
          onChangeText={setName}
          placeholder="Product name"
          error={errors.name}
        />
      </View>

      <View style={[rowStyle, fieldGap]}>
        <View style={halfField}>
          <Input
            label="SKU"
            value={sku}
            onChangeText={setSku}
            placeholder="SKU code"
            error={errors.sku}
          />
        </View>
        <View style={halfField}>
          <Input
            label="Barcode"
            value={barcode}
            onChangeText={setBarcode}
            placeholder="Barcode"
            error={errors.barcode}
          />
        </View>
      </View>

      <View style={fieldGap}>
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Product description"
          multiline
          numberOfLines={3}
          style={{ height: 80, textAlignVertical: "top", paddingTop: spacing.sm }}
          error={errors.description}
        />
      </View>

      <View style={[rowStyle, fieldGap]}>
        <View style={halfField}>
          <Input
            label="Price *"
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={errors.price}
          />
        </View>
        <View style={halfField}>
          <Input
            label="Cost Price"
            value={costPrice}
            onChangeText={setCostPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={errors.costPrice}
          />
        </View>
      </View>

      <View style={fieldGap}>
        <Text style={labelStyle}>Category</Text>
        <TouchableOpacity
          style={pickerButton}
          onPress={() => setShowCategoryPicker(!showCategoryPicker)}
          activeOpacity={0.7}
        >
          <Text style={pickerButtonText}>
            {selectedCategory ? selectedCategory.name : "Select a category"}
          </Text>
        </TouchableOpacity>
        {errors.categoryId ? (
          <Text style={{ fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs }}>
            {errors.categoryId}
          </Text>
        ) : null}
        {showCategoryPicker && (
          <ScrollView style={dropdownContainer} nestedScrollEnabled>
            <TouchableOpacity
              style={dropdownItem(!categoryId)}
              onPress={() => {
                setCategoryId("");
                setShowCategoryPicker(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={dropdownItemText(!categoryId)}>None</Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={dropdownItem(categoryId === cat.id)}
                onPress={() => {
                  setCategoryId(cat.id);
                  setShowCategoryPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={dropdownItemText(categoryId === cat.id)}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={switchRow}>
        <Text style={switchLabel}>Active</Text>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ false: colors.border, true: colors.primaryLight }}
          thumbColor={isActive ? colors.primary : colors.textTertiary}
        />
      </View>

      <View style={buttonsRow}>
        <Button
          title="Cancel"
          onPress={onCancel}
          variant="ghost"
          style={{ flex: 1 }}
        />
        <Button
          title={initialData ? "Update Product" : "Create Product"}
          onPress={handleSubmit}
          variant="primary"
          style={{ flex: 1 }}
        />
      </View>
    </ScrollView>
  );
}
