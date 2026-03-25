import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Alert,
  Switch,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import {
  useTaxRates,
  useCreateTaxRate,
  useUpdateTaxRate,
  useDeleteTaxRate,
} from "../hooks/use-tax-rates";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type TaxRateForm = {
  name: string;
  rate: string;
  isDefault: boolean;
};

const emptyForm: TaxRateForm = {
  name: "",
  rate: "",
  isDefault: false,
};

export default function TaxRatesScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: taxRates, isLoading } = useTaxRates();
  const createTaxRate = useCreateTaxRate();
  const updateTaxRate = useUpdateTaxRate();
  const deleteTaxRate = useDeleteTaxRate();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaxRateForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (taxRate: any) => {
    setEditingId(taxRate.id);
    setForm({
      name: taxRate.name ?? "",
      rate: taxRate.rate != null ? String((taxRate.rate * 100).toFixed(2)) : "",
      isDefault: taxRate.isDefault ?? false,
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Tax rate name is required.");
      return;
    }

    const ratePercent = parseFloat(form.rate);
    if (isNaN(ratePercent) || ratePercent < 0) {
      Alert.alert("Validation", "Please enter a valid rate percentage.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      rate: ratePercent / 100,
      isDefault: form.isDefault,
    };

    if (editingId) {
      updateTaxRate.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createTaxRate.mutate(payload as any, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Tax Rate",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteTaxRate.mutate(id),
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

  const switchRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
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
        <Text style={headerTitle}>Tax Rates</Text>
        <Button title="Add Tax Rate" onPress={openCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={listContainer}>
        {taxRates && taxRates.length === 0 && (
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No tax rates yet. Tap "Add Tax Rate" to create one.
          </Text>
        )}

        {taxRates?.map((tr: any) => (
          <Card key={tr.id}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text
                    style={{
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.semibold,
                      color: colors.textPrimary,
                    }}
                  >
                    {tr.name}
                  </Text>
                  {tr.isDefault && (
                    <View
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: borderRadius.full,
                        backgroundColor: colors.successLight,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          fontWeight: fontWeight.semibold,
                          color: colors.success,
                        }}
                      >
                        Default
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: fontSize["2xl"],
                    fontWeight: fontWeight.bold,
                    color: colors.primary,
                    marginTop: spacing.xs,
                  }}
                >
                  {tr.rate != null ? (tr.rate * 100).toFixed(2) : "0.00"}%
                </Text>
              </View>
              <View style={{ gap: spacing.xs }}>
                <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(tr)} />
                <Button
                  title="Delete"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleDelete(tr.id, tr.name)}
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
              {editingId ? "Edit Tax Rate" : "New Tax Rate"}
            </Text>

            <Input
              label="Name"
              value={form.name}
              onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
              placeholder="e.g. Sales Tax"
            />

            <Input
              label="Rate (%)"
              value={form.rate}
              onChangeText={(text) => setForm((f) => ({ ...f, rate: text }))}
              placeholder="e.g. 8.25"
              keyboardType="decimal-pad"
            />

            <View style={switchRow}>
              <View>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.medium,
                    color: colors.textPrimary,
                  }}
                >
                  Default Tax Rate
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  Applied to new products automatically
                </Text>
              </View>
              <Switch
                value={form.isDefault}
                onValueChange={(val) => setForm((f) => ({ ...f, isDefault: val }))}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={form.isDefault ? colors.primary : colors.surfaceElevated}
              />
            </View>

            <View style={modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setModalVisible(false)}
              />
              <Button
                title={editingId ? "Update" : "Create"}
                onPress={handleSave}
                loading={createTaxRate.isPending || updateTaxRate.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
