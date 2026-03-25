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
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useChangePin,
  useDeleteEmployee,
} from "../hooks/use-employees";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

const ROLES = ["admin", "manager", "cashier"] as const;
type Role = (typeof ROLES)[number];

type EmployeeForm = {
  name: string;
  pin: string;
  role: Role;
};

const emptyForm: EmployeeForm = {
  name: "",
  pin: "",
  role: "cashier",
};

export default function EmployeesScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: employees, isLoading } = useEmployees();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const changePin = useChangePin();
  const deleteEmployee = useDeleteEmployee();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinTarget, setPinTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPin, setNewPin] = useState("");

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (employee: any) => {
    setEditingId(employee.id);
    setForm({
      name: employee.name ?? "",
      pin: "",
      role: employee.role ?? "cashier",
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Employee name is required.");
      return;
    }

    if (editingId) {
      updateEmployee.mutate(
        {
          id: editingId,
          data: {
            name: form.name.trim(),
            role: form.role,
          },
        },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      if (!form.pin || form.pin.length < 4) {
        Alert.alert("Validation", "PIN must be at least 4 digits.");
        return;
      }
      createEmployee.mutate(
        {
          name: form.name.trim(),
          pin: form.pin,
          role: form.role,
        },
        { onSuccess: () => setModalVisible(false) }
      );
    }
  };

  const handleToggleActive = (employee: any) => {
    updateEmployee.mutate({
      id: employee.id,
      data: { isActive: !employee.isActive },
    });
  };

  const openChangePin = (id: string, name: string) => {
    setPinTarget({ id, name });
    setNewPin("");
    setPinModalVisible(true);
  };

  const handleChangePin = () => {
    if (!pinTarget) return;
    if (!newPin || newPin.length < 4) {
      Alert.alert("Validation", "PIN must be at least 4 digits.");
      return;
    }
    changePin.mutate(
      { id: pinTarget.id, newPin },
      { onSuccess: () => setPinModalVisible(false) }
    );
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Employee",
      `Are you sure you want to delete "${name}"? This will deactivate the employee.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteEmployee.mutate(id),
        },
      ]
    );
  };

  const roleLabel = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return { bg: colors.errorLight, text: colors.error };
      case "manager":
        return { bg: colors.warningLight, text: colors.warning };
      default:
        return { bg: colors.infoLight, text: colors.info };
    }
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

  const rolePicker: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
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
        <Text style={headerTitle}>Employees</Text>
        <Button title="Add Employee" onPress={openCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={listContainer}>
        {employees && employees.length === 0 && (
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No employees yet. Tap "Add Employee" to create one.
          </Text>
        )}

        {employees?.map((emp: any) => {
          const badge = roleBadgeColor(emp.role);
          return (
            <Card key={emp.id}>
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
                      {emp.name}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: borderRadius.full,
                        backgroundColor: badge.bg,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          fontWeight: fontWeight.semibold,
                          color: badge.text,
                        }}
                      >
                        {roleLabel(emp.role)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: borderRadius.full,
                        backgroundColor: emp.isActive ? colors.success : colors.textTertiary,
                      }}
                    />
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                      {emp.isActive ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(emp)} />
                  <Button
                    title={emp.isActive ? "Deactivate" : "Activate"}
                    variant="secondary"
                    size="sm"
                    onPress={() => handleToggleActive(emp)}
                  />
                  <Button
                    title="Change PIN"
                    variant="secondary"
                    size="sm"
                    onPress={() => openChangePin(emp.id, emp.name)}
                  />
                  <Button
                    title="Delete"
                    variant="destructive"
                    size="sm"
                    onPress={() => handleDelete(emp.id, emp.name)}
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
              {editingId ? "Edit Employee" : "New Employee"}
            </Text>

            <Input
              label="Name"
              value={form.name}
              onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
              placeholder="e.g. Jane Doe"
            />

            {!editingId && (
              <Input
                label="PIN"
                value={form.pin}
                onChangeText={(text) => setForm((f) => ({ ...f, pin: text.replace(/[^0-9]/g, "") }))}
                placeholder="Enter at least 4 digits"
                keyboardType="numeric"
                secureTextEntry
                maxLength={6}
              />
            )}

            <View>
              <Text
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.medium,
                  color: colors.textSecondary,
                  marginBottom: spacing.xs,
                }}
              >
                Role
              </Text>
              <View style={rolePicker}>
                {ROLES.map((r) => {
                  const isSelected = form.role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setForm((f) => ({ ...f, role: r }))}
                      style={{
                        flex: 1,
                        paddingVertical: spacing.sm,
                        borderRadius: borderRadius.sm,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          color: isSelected ? colors.primary : colors.textPrimary,
                          fontWeight: isSelected ? fontWeight.semibold : fontWeight.regular,
                        }}
                      >
                        {roleLabel(r)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                loading={createEmployee.isPending || updateEmployee.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Change PIN Modal */}
      <Modal
        visible={pinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPinModalVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={modalContent}>
            <Text style={modalTitle}>
              Change PIN - {pinTarget?.name}
            </Text>

            <Input
              label="New PIN"
              value={newPin}
              onChangeText={(text) => setNewPin(text.replace(/[^0-9]/g, ""))}
              placeholder="Enter at least 4 digits"
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
            />

            <View style={modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setPinModalVisible(false)}
              />
              <Button
                title="Change PIN"
                onPress={handleChangePin}
                loading={changePin.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
