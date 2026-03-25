import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../../hooks/use-theme";
import type { Ingredient } from "@pos/core/types";

type IngredientTypeaheadProps = {
  ingredients: Ingredient[];
  excludeIds?: string[]; // already-added ingredient IDs to exclude
  onSelect: (ingredient: Ingredient) => void;
  placeholder?: string;
};

export function IngredientTypeahead({
  ingredients,
  excludeIds = [],
  onSelect,
  placeholder = "Search ingredients...",
}: IngredientTypeaheadProps) {
  const { colors, fontSize, fontWeight, spacing, borderRadius } = useTheme();
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return ingredients
      .filter(
        (ing) =>
          ing.name.toLowerCase().includes(q) &&
          !excludeIds.includes(ing.id) &&
          ing.isActive
      )
      .slice(0, 8);
  }, [query, ingredients, excludeIds]);

  const handleSelect = (ingredient: Ingredient) => {
    onSelect(ingredient);
    setQuery("");
    setShowDropdown(false);
  };

  const container: ViewStyle = {
    position: "relative",
    zIndex: 10,
  };

  const inputStyle: ViewStyle & TextStyle = {
    height: 48,
    borderWidth: 1,
    borderColor: showDropdown && filtered.length > 0 ? colors.primary : colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  };

  const dropdown: ViewStyle = {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    maxHeight: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  };

  const itemStyle: ViewStyle = {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const itemName: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  };

  const itemUnit: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  };

  const stockInfo: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  };

  return (
    <View style={container}>
      <TextInput
        style={inputStyle}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
      />

      {showDropdown && filtered.length > 0 && (
        <View style={dropdown}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={itemStyle}
                onPress={() => handleSelect(item)}
              >
                <View>
                  <Text style={itemName}>{item.name}</Text>
                  <Text style={stockInfo}>
                    Stock: {item.currentStock} {item.unit}
                  </Text>
                </View>
                <Text style={itemUnit}>{item.unit}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {showDropdown && query.length > 0 && filtered.length === 0 && (
        <View style={dropdown}>
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: colors.textTertiary, textAlign: "center" }}>
              No matching ingredients
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
