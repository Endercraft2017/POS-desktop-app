import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
} from "../hooks/use-expenses";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import type { ExpenseCategory, ExpenseFrequency } from "@pos/core/types";

const CATEGORIES: ExpenseCategory[] = [
  "labor",
  "utilities",
  "supplies",
  "rent",
  "transport",
  "marketing",
  "other",
];

const FREQUENCIES: ExpenseFrequency[] = ["daily", "weekly", "monthly", "per_use"];

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  labor: { bg: "#DBEAFE", text: "#2563EB" },
  utilities: { bg: "#FEF3C7", text: "#D97706" },
  supplies: { bg: "#DCFCE7", text: "#16A34A" },
  rent: { bg: "#EDE9FE", text: "#7C3AED" },
  transport: { bg: "#FFEDD5", text: "#EA580C" },
  marketing: { bg: "#FCE7F3", text: "#DB2777" },
  other: { bg: "#F1F5F9", text: "#64748B" },
};

type ExpenseForm = {
  name: string;
  category: ExpenseCategory;
  amount: string;
  frequency: ExpenseFrequency;
  notes: string;
};

const emptyForm: ExpenseForm = {
  name: "",
  category: "other",
  amount: "",
  frequency: "monthly",
  notes: "",
};

function toDailyCost(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case "daily":
      return amount;
    case "weekly":
      return amount / 7;
    case "monthly":
      return amount / 30;
    case "per_use":
      return amount;
    default:
      return amount;
  }
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}

export default function ExpensesScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: expenses, isLoading } = useExpenses();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);

  const totalDailyCost = useMemo(() => {
    if (!expenses) return 0;
    return expenses
      .filter((e: any) => e.isActive)
      .reduce(
        (sum: number, e: any) =>
          sum + toDailyCost(Number(e.amount) || 0, e.frequency),
        0
      );
  }, [expenses]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (expense: any) => {
    setEditingId(expense.id);
    setForm({
      name: expense.name ?? "",
      category: expense.category ?? "other",
      amount: String(expense.amount ?? ""),
      frequency: expense.frequency ?? "monthly",
      notes: expense.notes ?? "",
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Expense name is required.");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Validation", "Please enter a valid amount greater than 0.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      amount,
      frequency: form.frequency,
      notes: form.notes.trim() || null,
    };

    if (editingId) {
      updateExpense.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createExpense.mutate(
        { ...payload, isActive: true },
        { onSuccess: () => setModalVisible(false) }
      );
    }
  };

  const handleToggleActive = (expense: any) => {
    updateExpense.mutate({
      id: expense.id,
      data: { isActive: !expense.isActive },
    });
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteExpense.mutate(id),
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
    paddingBottom: spacing["2xl"],
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

  const chipRow: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  };

  if (isLoading) {
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
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Expenses</Text>
        <Button title="Add Expense" onPress={openCreate} size="sm" />
      </View>

      {/* Total Daily Cost Banner */}
      <Card
        style={{
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
          backgroundColor: colors.primaryLight,
          borderColor: colors.primary,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: fontSize.md,
              fontWeight: fontWeight.medium,
              color: colors.textPrimary,
            }}
          >
            Total Daily Cost
          </Text>
          <Text
            style={{
              fontSize: fontSize["2xl"],
              fontWeight: fontWeight.bold,
              color: colors.primary,
            }}
          >
            {formatCurrency(totalDailyCost)}
          </Text>
        </View>
      </Card>

      <ScrollView contentContainerStyle={listContainer}>
        {expenses && expenses.length === 0 && (
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: spacing.xl,
              fontSize: fontSize.md,
            }}
          >
            No expenses yet. Tap "Add Expense" to create one.
          </Text>
        )}

        {expenses?.map((expense: any) => {
          const catColor =
            CATEGORY_COLORS[expense.category as ExpenseCategory] ??
            CATEGORY_COLORS.other;
          const dailyEquiv = toDailyCost(
            Number(expense.amount) || 0,
            expense.frequency
          );

          return (
            <Card key={expense.id}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.lg,
                        fontWeight: fontWeight.semibold,
                        color: colors.textPrimary,
                      }}
                    >
                      {expense.name}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: borderRadius.full,
                        backgroundColor: catColor.bg,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          fontWeight: fontWeight.semibold,
                          color: catColor.text,
                        }}
                      >
                        {capitalize(expense.category)}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      marginTop: spacing.xs,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.xl,
                        fontWeight: fontWeight.bold,
                        color: colors.textPrimary,
                      }}
                    >
                      {formatCurrency(Number(expense.amount) || 0)}
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: colors.textSecondary,
                      }}
                    >
                      {capitalize(expense.frequency)}
                    </Text>
                  </View>

                  {expense.frequency !== "daily" && (
                    <Text
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.textTertiary,
                        marginTop: 2,
                      }}
                    >
                      ({formatCurrency(dailyEquiv)}/day)
                    </Text>
                  )}
                </View>

                <View style={{ alignItems: "center", gap: spacing.xs }}>
                  <Switch
                    value={!!expense.isActive}
                    onValueChange={() => handleToggleActive(expense)}
                    trackColor={{
                      false: colors.border,
                      true: colors.primary,
                    }}
                    thumbColor={colors.surface}
                  />
                  <Text
                    style={{
                      fontSize: fontSize.xs,
                      color: expense.isActive
                        ? colors.success
                        : colors.textTertiary,
                    }}
                  >
                    {expense.isActive ? "Active" : "Off"}
                  </Text>
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Button
                    title="Edit"
                    variant="ghost"
                    size="sm"
                    onPress={() => openEdit(expense)}
                  />
                  <Button
                    title="Delete"
                    variant="destructive"
                    size="sm"
                    onPress={() => handleDelete(expense.id, expense.name)}
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
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={modalContent}>
              <Text style={modalTitle}>
                {editingId ? "Edit Expense" : "New Expense"}
              </Text>

              <Input
                label="Name"
                value={form.name}
                onChangeText={(text) =>
                  setForm((f) => ({ ...f, name: text }))
                }
                placeholder="e.g. Monthly Rent"
              />

              {/* Category Picker */}
              <View>
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    fontWeight: fontWeight.medium,
                    color: colors.textSecondary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Category
                </Text>
                <View style={chipRow}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = form.category === cat;
                    const catColor = CATEGORY_COLORS[cat];
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() =>
                          setForm((f) => ({ ...f, category: cat }))
                        }
                        style={{
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          borderRadius: borderRadius.full,
                          borderWidth: 1,
                          borderColor: isSelected
                            ? catColor.text
                            : colors.border,
                          backgroundColor: isSelected
                            ? catColor.bg
                            : colors.surface,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fontSize.sm,
                            color: isSelected
                              ? catColor.text
                              : colors.textPrimary,
                            fontWeight: isSelected
                              ? fontWeight.semibold
                              : fontWeight.regular,
                          }}
                        >
                          {capitalize(cat)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <Input
                label="Amount ($)"
                value={form.amount}
                onChangeText={(text) =>
                  setForm((f) => ({
                    ...f,
                    amount: text.replace(/[^0-9.]/g, ""),
                  }))
                }
                placeholder="0.00"
                keyboardType="decimal-pad"
              />

              {/* Frequency Picker */}
              <View>
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    fontWeight: fontWeight.medium,
                    color: colors.textSecondary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Frequency
                </Text>
                <View style={chipRow}>
                  {FREQUENCIES.map((freq) => {
                    const isSelected = form.frequency === freq;
                    return (
                      <TouchableOpacity
                        key={freq}
                        onPress={() =>
                          setForm((f) => ({ ...f, frequency: freq }))
                        }
                        style={{
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          borderRadius: borderRadius.full,
                          borderWidth: 1,
                          borderColor: isSelected
                            ? colors.primary
                            : colors.border,
                          backgroundColor: isSelected
                            ? colors.primaryLight
                            : colors.surface,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: fontSize.sm,
                            color: isSelected
                              ? colors.primary
                              : colors.textPrimary,
                            fontWeight: isSelected
                              ? fontWeight.semibold
                              : fontWeight.regular,
                          }}
                        >
                          {capitalize(freq)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <Input
                label="Notes"
                value={form.notes}
                onChangeText={(text) =>
                  setForm((f) => ({ ...f, notes: text }))
                }
                placeholder="Optional notes..."
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: "top" }}
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
                  loading={
                    createExpense.isPending || updateExpense.isPending
                  }
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
