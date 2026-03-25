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
import {
  useCustomers,
  useSearchCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "../hooks/use-customers";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function CustomersScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: customers, isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [searchQuery, setSearchQuery] = useState("");
  const { data: searchResults } = useSearchCustomers(searchQuery);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const displayedCustomers = useMemo(() => {
    if (searchQuery.trim().length > 0 && searchResults) {
      return searchResults;
    }
    return customers ?? [];
  }, [searchQuery, searchResults, customers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (customer: any) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (editingId) {
      updateCustomer.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createCustomer.mutate(payload as any, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Customer",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCustomer.mutate(id),
        },
      ]
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
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

  const searchContainer: ViewStyle = {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  };

  const badge: ViewStyle = {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
  };

  const badgeText: TextStyle = {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  };

  const statRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  };

  const statItem: ViewStyle = {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: "center",
  };

  const statLabel: TextStyle = {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: 2,
  };

  const statValue: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
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

  const renderCustomer = ({ item: customer }: { item: any }) => {
    const isExpanded = expandedId === customer.id;

    return (
      <Card style={{ marginBottom: spacing.sm }}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(customer.id)}>
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
                  {customer.name}
                </Text>
                {(customer.loyaltyPoints != null && customer.loyaltyPoints > 0) && (
                  <View style={badge}>
                    <Text style={badgeText}>{customer.loyaltyPoints} pts</Text>
                  </View>
                )}
              </View>
              {customer.phone && (
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
                  {customer.phone}
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xs }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>
                  Spent: ${(customer.totalSpent ?? 0).toFixed(2)}
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>
                  Visits: {customer.visitCount ?? 0}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: fontSize.lg, color: colors.textTertiary }}>
              {isExpanded ? "\u25B2" : "\u25BC"}
            </Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            {customer.email && (
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>
                Email: {customer.email}
              </Text>
            )}
            {customer.address && (
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>
                Address: {customer.address}
              </Text>
            )}
            {customer.notes && (
              <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontStyle: "italic", marginBottom: spacing.sm }}>
                {customer.notes}
              </Text>
            )}

            <View style={statRow}>
              <View style={statItem}>
                <Text style={statLabel}>Total Spent</Text>
                <Text style={statValue}>${(customer.totalSpent ?? 0).toFixed(2)}</Text>
              </View>
              <View style={statItem}>
                <Text style={statLabel}>Visits</Text>
                <Text style={statValue}>{customer.visitCount ?? 0}</Text>
              </View>
              <View style={statItem}>
                <Text style={statLabel}>Loyalty Pts</Text>
                <Text style={statValue}>{customer.loyaltyPoints ?? 0}</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(customer)} />
              <Button
                title="Delete"
                variant="destructive"
                size="sm"
                onPress={() => handleDelete(customer.id, customer.name)}
              />
            </View>
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Customers</Text>
        <Button title="Add Customer" onPress={openCreate} size="sm" />
      </View>

      <View style={searchContainer}>
        <Input
          placeholder="Search by name, phone, or email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={displayedCustomers}
        keyExtractor={(item: any) => item.id}
        renderItem={renderCustomer}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            {searchQuery.trim().length > 0
              ? "No customers match your search."
              : 'No customers yet. Tap "Add Customer" to create one.'}
          </Text>
        }
      />

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
                {editingId ? "Edit Customer" : "New Customer"}
              </Text>

              <Input
                label="Name"
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="e.g. Jane Doe"
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
                placeholder="e.g. jane@example.com"
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
                  loading={createCustomer.isPending || updateCustomer.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
