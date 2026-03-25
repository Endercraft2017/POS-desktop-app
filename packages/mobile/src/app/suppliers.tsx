import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
} from "../hooks/use-suppliers";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type SupplierForm = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: SupplierForm = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function SuppliersScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: suppliers, isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (supplier: any) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name ?? "",
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Supplier name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (editingId) {
      updateSupplier.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createSupplier.mutate(payload as any, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Supplier",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteSupplier.mutate(id),
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
    maxHeight: "85%",
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
        <Text style={headerTitle}>Suppliers</Text>
        <Button title="Add Supplier" onPress={openCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={listContainer}>
        {suppliers && suppliers.length === 0 && (
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No suppliers yet. Tap "Add Supplier" to create one.
          </Text>
        )}

        {suppliers?.map((supplier: any) => (
          <Card key={supplier.id}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                  }}
                >
                  {supplier.name}
                </Text>
                {supplier.contactName && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
                    Contact: {supplier.contactName}
                  </Text>
                )}
                {supplier.phone && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
                    Phone: {supplier.phone}
                  </Text>
                )}
                {supplier.email && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
                    Email: {supplier.email}
                  </Text>
                )}
                {supplier.address && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, marginTop: 2 }}>
                    {supplier.address}
                  </Text>
                )}
                {supplier.notes && (
                  <Text
                    style={{
                      fontSize: fontSize.xs,
                      color: colors.textTertiary,
                      marginTop: spacing.xs,
                      fontStyle: "italic",
                    }}
                  >
                    {supplier.notes}
                  </Text>
                )}
              </View>
              <View style={{ gap: spacing.xs }}>
                <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(supplier)} />
                <Button
                  title="Delete"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleDelete(supplier.id, supplier.name)}
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
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={modalContent}>
              <Text style={modalTitle}>
                {editingId ? "Edit Supplier" : "New Supplier"}
              </Text>

              <Input
                label="Name"
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="e.g. Fresh Foods Co."
              />

              <Input
                label="Contact Name"
                value={form.contactName}
                onChangeText={(text) => setForm((f) => ({ ...f, contactName: text }))}
                placeholder="e.g. John Smith"
              />

              <Input
                label="Phone"
                value={form.phone}
                onChangeText={(text) => setForm((f) => ({ ...f, phone: text }))}
                placeholder="e.g. +1 555-123-4567"
                keyboardType="phone-pad"
              />

              <Input
                label="Email"
                value={form.email}
                onChangeText={(text) => setForm((f) => ({ ...f, email: text }))}
                placeholder="e.g. contact@freshfoods.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Input
                label="Address"
                value={form.address}
                onChangeText={(text) => setForm((f) => ({ ...f, address: text }))}
                placeholder="e.g. 123 Main St, City"
                multiline
                numberOfLines={2}
              />

              <Input
                label="Notes"
                value={form.notes}
                onChangeText={(text) => setForm((f) => ({ ...f, notes: text }))}
                placeholder="Additional notes..."
                multiline
                numberOfLines={3}
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
                  loading={createSupplier.isPending || updateSupplier.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
