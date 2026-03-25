import React, { useState } from "react";
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
  useCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
} from "../hooks/use-coupons";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type CouponType = "percentage" | "fixed" | "bogo";

type CouponForm = {
  code: string;
  name: string;
  description: string;
  type: CouponType;
  value: string;
  minOrderAmount: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
  buyProductId: string;
  buyProductName: string;
  getProductId: string;
  getProductName: string;
  buyQty: string;
  getQty: string;
};

const emptyForm: CouponForm = {
  code: "",
  name: "",
  description: "",
  type: "percentage",
  value: "",
  minOrderAmount: "",
  maxUses: "0",
  validFrom: "",
  validUntil: "",
  buyProductId: "",
  buyProductName: "",
  getProductId: "",
  getProductName: "",
  buyQty: "1",
  getQty: "1",
};

const COUPON_TYPES: { label: string; value: CouponType }[] = [
  { label: "Percentage Off", value: "percentage" },
  { label: "Fixed Amount Off", value: "fixed" },
  { label: "BOGO", value: "bogo" },
];

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function CouponsScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: coupons, isLoading } = useCoupons();
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [typePickerVisible, setTypePickerVisible] = useState(false);

  const getTypeBadge = (type: string) => {
    switch (type?.toLowerCase()) {
      case "percentage": return { label: "% Off", bg: colors.primaryLight, text: colors.primary };
      case "fixed": return { label: "$ Off", bg: colors.successLight, text: colors.success };
      case "bogo": return { label: "BOGO", bg: colors.warningLight, text: colors.warning };
      default: return { label: type ?? "Unknown", bg: colors.surfaceElevated, text: colors.textSecondary };
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (coupon: any) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code ?? "",
      name: coupon.name ?? "",
      description: coupon.description ?? "",
      type: coupon.type ?? "percentage",
      value: coupon.value != null ? String(coupon.value) : "",
      minOrderAmount: coupon.minOrderAmount != null ? String(coupon.minOrderAmount) : "",
      maxUses: coupon.maxUses != null ? String(coupon.maxUses) : "0",
      validFrom: coupon.validFrom ?? "",
      validUntil: coupon.validUntil ?? "",
      buyProductId: coupon.buyProductId ?? "",
      buyProductName: coupon.buyProductName ?? "",
      getProductId: coupon.getProductId ?? "",
      getProductName: coupon.getProductName ?? "",
      buyQty: coupon.buyQty != null ? String(coupon.buyQty) : "1",
      getQty: coupon.getQty != null ? String(coupon.getQty) : "1",
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) {
      Alert.alert("Validation", "Coupon code is required.");
      return;
    }
    if (!form.name.trim()) {
      Alert.alert("Validation", "Coupon name is required.");
      return;
    }
    if (form.type !== "bogo" && (!form.value || parseFloat(form.value) <= 0)) {
      Alert.alert("Validation", "Please enter a valid value.");
      return;
    }

    const payload: any = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      value: form.type === "bogo" ? 0 : parseFloat(form.value),
      minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : 0,
      maxUses: form.maxUses ? parseInt(form.maxUses, 10) : 0,
      validFrom: form.validFrom.trim() || null,
      validUntil: form.validUntil.trim() || null,
    };

    if (form.type === "bogo") {
      payload.buyProductId = form.buyProductId || null;
      payload.getProductId = form.getProductId || null;
      payload.buyQty = parseInt(form.buyQty, 10) || 1;
      payload.getQty = parseInt(form.getQty, 10) || 1;
    }

    if (editingId) {
      updateCoupon.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createCoupon.mutate(payload, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Coupon",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCoupon.mutate(id),
        },
      ]
    );
  };

  const handleToggleActive = (coupon: any) => {
    updateCoupon.mutate({
      id: coupon.id,
      data: { isActive: !coupon.isActive },
    });
  };

  const formatValue = (coupon: any) => {
    if (coupon.type === "percentage") return `${coupon.value}%`;
    if (coupon.type === "fixed") return `$${(coupon.value ?? 0).toFixed(2)}`;
    if (coupon.type === "bogo") return "BOGO";
    return String(coupon.value ?? "");
  };

  // Styles
  const container: ViewStyle = { flex: 1, backgroundColor: colors.background };

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
    maxHeight: "90%",
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

  const renderCoupon = ({ item: coupon }: { item: any }) => {
    const typeBadge = getTypeBadge(coupon.type);
    const usesText = coupon.maxUses > 0
      ? `${coupon.currentUses ?? 0}/${coupon.maxUses}`
      : `${coupon.currentUses ?? 0}/\u221E`;

    return (
      <Card style={{ marginBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
                {coupon.code}
              </Text>
              <View
                style={{
                  backgroundColor: typeBadge.bg,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: borderRadius.full,
                }}
              >
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: typeBadge.text }}>
                  {typeBadge.label}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: coupon.isActive ? colors.successLight : colors.errorLight,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: borderRadius.full,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: coupon.isActive ? colors.success : colors.error,
                  }}
                >
                  {coupon.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
              {coupon.name}
            </Text>

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xs, flexWrap: "wrap" }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary }}>
                {formatValue(coupon)}
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>
                Uses: {usesText}
              </Text>
            </View>

            {(coupon.validFrom || coupon.validUntil) && (
              <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>
                {coupon.validFrom ? new Date(coupon.validFrom).toLocaleDateString() : "..."}
                {" - "}
                {coupon.validUntil ? new Date(coupon.validUntil).toLocaleDateString() : "..."}
              </Text>
            )}
          </View>

          <View style={{ gap: spacing.xs }}>
            <TouchableOpacity
              onPress={() => handleToggleActive(coupon)}
              activeOpacity={0.7}
              style={{
                width: 50,
                height: 28,
                borderRadius: borderRadius.full,
                backgroundColor: coupon.isActive ? colors.success : colors.surfaceElevated,
                justifyContent: "center",
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.surface,
                  alignSelf: coupon.isActive ? "flex-end" : "flex-start",
                }}
              />
            </TouchableOpacity>
            <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(coupon)} />
            <Button
              title="Delete"
              variant="destructive"
              size="sm"
              onPress={() => handleDelete(coupon.id, coupon.name || coupon.code)}
            />
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Coupons</Text>
        <Button title="Add Coupon" onPress={openCreate} size="sm" />
      </View>

      <FlatList
        data={coupons ?? []}
        keyExtractor={(item: any) => item.id}
        renderItem={renderCoupon}
        contentContainerStyle={{ padding: spacing.md }}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No coupons yet. Tap "Add Coupon" to create one.
          </Text>
        }
      />

      {/* Add/Edit Modal */}
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
                {editingId ? "Edit Coupon" : "New Coupon"}
              </Text>

              {/* Code with auto-generate */}
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
                    Code
                  </Text>
                  <TouchableOpacity
                    onPress={() => setForm((f) => ({ ...f, code: generateCode() }))}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold }}>
                      Auto-Generate
                    </Text>
                  </TouchableOpacity>
                </View>
                <Input
                  value={form.code}
                  onChangeText={(text) => setForm((f) => ({ ...f, code: text.toUpperCase() }))}
                  placeholder="e.g. SUMMER20"
                  autoCapitalize="characters"
                />
              </View>

              <Input
                label="Name"
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="e.g. Summer Sale"
              />

              <Input
                label="Description"
                value={form.description}
                onChangeText={(text) => setForm((f) => ({ ...f, description: text }))}
                placeholder="Optional description..."
                multiline
                numberOfLines={2}
              />

              {/* Type Picker */}
              <View>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing.xs }}>
                  Type
                </Text>
                <TouchableOpacity
                  onPress={() => setTypePickerVisible(true)}
                  activeOpacity={0.7}
                  style={{
                    height: 48,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: borderRadius.sm,
                    paddingHorizontal: spacing.md,
                    justifyContent: "center",
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text style={{ fontSize: fontSize.md, color: colors.textPrimary }}>
                    {COUPON_TYPES.find((t) => t.value === form.type)?.label ?? form.type}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Value (not shown for BOGO) */}
              {form.type !== "bogo" && (
                <Input
                  label={form.type === "percentage" ? "Value (%)" : "Value ($)"}
                  value={form.value}
                  onChangeText={(text) => setForm((f) => ({ ...f, value: text }))}
                  keyboardType="decimal-pad"
                  placeholder={form.type === "percentage" ? "e.g. 20" : "e.g. 5.00"}
                />
              )}

              {/* BOGO fields */}
              {form.type === "bogo" && (
                <View style={{ gap: spacing.md }}>
                  <Input
                    label="Buy Product ID"
                    value={form.buyProductId}
                    onChangeText={(text) => setForm((f) => ({ ...f, buyProductId: text }))}
                    placeholder="Product ID to buy"
                  />
                  <Input
                    label="Buy Quantity"
                    value={form.buyQty}
                    onChangeText={(text) => setForm((f) => ({ ...f, buyQty: text }))}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                  <Input
                    label="Get Product ID"
                    value={form.getProductId}
                    onChangeText={(text) => setForm((f) => ({ ...f, getProductId: text }))}
                    placeholder="Product ID to get free"
                  />
                  <Input
                    label="Get Quantity"
                    value={form.getQty}
                    onChangeText={(text) => setForm((f) => ({ ...f, getQty: text }))}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </View>
              )}

              <Input
                label="Min Order Amount"
                value={form.minOrderAmount}
                onChangeText={(text) => setForm((f) => ({ ...f, minOrderAmount: text }))}
                keyboardType="decimal-pad"
                placeholder="0 (no minimum)"
              />

              <Input
                label="Max Uses (0 = unlimited)"
                value={form.maxUses}
                onChangeText={(text) => setForm((f) => ({ ...f, maxUses: text }))}
                keyboardType="number-pad"
                placeholder="0"
              />

              <Input
                label="Valid From"
                value={form.validFrom}
                onChangeText={(text) => setForm((f) => ({ ...f, validFrom: text }))}
                placeholder="e.g. 2026-04-01"
              />

              <Input
                label="Valid Until"
                value={form.validUntil}
                onChangeText={(text) => setForm((f) => ({ ...f, validUntil: text }))}
                placeholder="e.g. 2026-12-31"
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
                  loading={createCoupon.isPending || updateCoupon.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Type Picker Modal */}
      <Modal
        visible={typePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTypePickerVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={[modalContent, { maxHeight: "50%" }]}>
            <Text style={modalTitle}>Select Coupon Type</Text>
            {COUPON_TYPES.map((typeOption) => (
              <TouchableOpacity
                key={typeOption.value}
                onPress={() => {
                  setForm((f) => ({ ...f, type: typeOption.value }));
                  setTypePickerVisible(false);
                }}
                activeOpacity={0.7}
                style={{
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: form.type === typeOption.value ? colors.primaryLight : undefined,
                  paddingHorizontal: spacing.sm,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.md,
                    color: form.type === typeOption.value ? colors.primary : colors.textPrimary,
                    fontWeight: form.type === typeOption.value ? fontWeight.semibold : fontWeight.regular,
                  }}
                >
                  {typeOption.label}
                </Text>
              </TouchableOpacity>
            ))}
            <Button title="Cancel" variant="ghost" onPress={() => setTypePickerVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
