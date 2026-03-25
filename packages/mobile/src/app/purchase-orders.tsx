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
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useReceivePOItems,
} from "../hooks/use-purchase-orders";
import { useSuppliers } from "../hooks/use-suppliers";
import { useActiveIngredients } from "../hooks/use-ingredients";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

const STATUS_TABS = ["All", "Draft", "Sent", "Partial", "Received", "Cancelled"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

type POItemForm = {
  ingredientId: string;
  ingredientName: string;
  quantity: string;
  unitPrice: string;
};

type POForm = {
  supplierId: string;
  supplierName: string;
  expectedDeliveryDate: string;
  notes: string;
  items: POItemForm[];
};

const emptyForm: POForm = {
  supplierId: "",
  supplierName: "",
  expectedDeliveryDate: "",
  notes: "",
  items: [],
};

type ReceivedItemEntry = {
  itemId: string;
  ingredientName: string;
  orderedQty: number;
  receivedQty: string;
};

export default function PurchaseOrdersScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: purchaseOrders, isLoading } = usePurchaseOrders();
  const createPO = useCreatePurchaseOrder();
  const receivePOItems = useReceivePOItems();
  const { data: suppliers } = useSuppliers();
  const { data: ingredients } = useActiveIngredients();

  const [activeTab, setActiveTab] = useState<StatusTab>("All");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [supplierPickerVisible, setSupplierPickerVisible] = useState(false);
  const [ingredientPickerVisible, setIngredientPickerVisible] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [form, setForm] = useState<POForm>(emptyForm);
  const [receiveItems, setReceiveItems] = useState<ReceivedItemEntry[]>([]);

  const filteredOrders = useMemo(() => {
    if (!purchaseOrders) return [];
    if (activeTab === "All") return purchaseOrders;
    return purchaseOrders.filter(
      (po: any) => po.status?.toLowerCase() === activeTab.toLowerCase()
    );
  }, [purchaseOrders, activeTab]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "draft": return { bg: colors.surfaceElevated, text: colors.textSecondary };
      case "sent": return { bg: colors.infoLight, text: colors.info };
      case "partial": return { bg: colors.warningLight, text: colors.warning };
      case "received": return { bg: colors.successLight, text: colors.success };
      case "cancelled": return { bg: colors.errorLight, text: colors.error };
      default: return { bg: colors.surfaceElevated, text: colors.textSecondary };
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setCreateModalVisible(true);
  };

  const openDetail = (po: any) => {
    setSelectedPO(po);
    setDetailModalVisible(true);
  };

  const openReceive = (po: any) => {
    setSelectedPO(po);
    const entries: ReceivedItemEntry[] = (po.items ?? []).map((item: any) => ({
      itemId: item.id,
      ingredientName: item.ingredientName ?? item.ingredient?.name ?? "Unknown",
      orderedQty: item.quantity ?? 0,
      receivedQty: "",
    }));
    setReceiveItems(entries);
    setDetailModalVisible(false);
    setReceiveModalVisible(true);
  };

  const selectSupplier = (supplier: any) => {
    setForm((f) => ({ ...f, supplierId: supplier.id, supplierName: supplier.name }));
    setSupplierPickerVisible(false);
  };

  const addIngredientItem = (ingredient: any) => {
    const exists = form.items.find((i) => i.ingredientId === ingredient.id);
    if (exists) {
      Alert.alert("Duplicate", "This ingredient is already added.");
      return;
    }
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          quantity: "",
          unitPrice: "",
        },
      ],
    }));
    setIngredientPickerVisible(false);
  };

  const updateItem = (index: number, field: "quantity" | "unitPrice", value: string) => {
    setForm((f) => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      return { ...f, items };
    });
  };

  const removeItem = (index: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  };

  const handleCreatePO = () => {
    if (!form.supplierId) {
      Alert.alert("Validation", "Please select a supplier.");
      return;
    }
    if (form.items.length === 0) {
      Alert.alert("Validation", "Please add at least one item.");
      return;
    }
    for (const item of form.items) {
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        Alert.alert("Validation", `Please enter a valid quantity for ${item.ingredientName}.`);
        return;
      }
      if (!item.unitPrice || parseFloat(item.unitPrice) <= 0) {
        Alert.alert("Validation", `Please enter a valid unit price for ${item.ingredientName}.`);
        return;
      }
    }

    const data = {
      supplierId: form.supplierId,
      expectedDeliveryDate: form.expectedDeliveryDate.trim() || null,
      notes: form.notes.trim() || null,
      status: "draft",
    };

    const items = form.items.map((item) => ({
      ingredientId: item.ingredientId,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
    }));

    createPO.mutate(
      { data, items },
      { onSuccess: () => setCreateModalVisible(false) }
    );
  };

  const handleReceive = () => {
    if (!selectedPO) return;

    const items = receiveItems
      .filter((item) => item.receivedQty.trim() !== "")
      .map((item) => ({
        itemId: item.itemId,
        receivedQty: parseFloat(item.receivedQty),
      }));

    if (items.length === 0) {
      Alert.alert("Validation", "Please enter received quantities for at least one item.");
      return;
    }

    receivePOItems.mutate(
      { poId: selectedPO.id, items },
      { onSuccess: () => setReceiveModalVisible(false) }
    );
  };

  const calcItemTotal = (qty: string, price: string) => {
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (isNaN(q) || isNaN(p)) return "0.00";
    return (q * p).toFixed(2);
  };

  const calcFormTotal = () => {
    return form.items
      .reduce((sum, item) => {
        const q = parseFloat(item.quantity) || 0;
        const p = parseFloat(item.unitPrice) || 0;
        return sum + q * p;
      }, 0)
      .toFixed(2);
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

  const tabBar: ViewStyle = {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
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

  const renderPO = ({ item: po }: { item: any }) => {
    const statusColor = getStatusColor(po.status);
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => openDetail(po)}>
        <Card style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {po.poNumber ?? `PO-${po.id?.slice(0, 8)}`}
                </Text>
                <View
                  style={{
                    backgroundColor: statusColor.bg,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: borderRadius.full,
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: statusColor.text }}>
                    {po.status?.toUpperCase() ?? "DRAFT"}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
                {po.supplierName ?? po.supplier?.name ?? "Unknown Supplier"}
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xs }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>
                  Total: ${(po.totalCost ?? 0).toFixed(2)}
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>
                  {po.createdAt ? new Date(po.createdAt).toLocaleDateString() : ""}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: fontSize.lg, color: colors.textTertiary }}>{"\u203A"}</Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Purchase Orders</Text>
        <Button title="New PO" onPress={openCreate} size="sm" />
      </View>

      {/* Status filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabBar}>
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: borderRadius.full,
                backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.semibold,
                  color: isActive ? colors.textOnPrimary : colors.textSecondary,
                }}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item: any) => item.id}
        renderItem={renderPO}
        contentContainerStyle={{ padding: spacing.md }}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
            No purchase orders found.
          </Text>
        }
      />

      {/* Create PO Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={modalContent}>
              <Text style={modalTitle}>New Purchase Order</Text>

              {/* Supplier Picker */}
              <View>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing.xs }}>
                  Supplier
                </Text>
                <TouchableOpacity
                  onPress={() => setSupplierPickerVisible(true)}
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
                  <Text style={{ fontSize: fontSize.md, color: form.supplierName ? colors.textPrimary : colors.textTertiary }}>
                    {form.supplierName || "Select a supplier..."}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Items */}
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
                    Items
                  </Text>
                  <Button
                    title="+ Add Item"
                    variant="ghost"
                    size="sm"
                    onPress={() => setIngredientPickerVisible(true)}
                  />
                </View>

                {form.items.length === 0 && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, textAlign: "center", paddingVertical: spacing.md }}>
                    No items added yet.
                  </Text>
                )}

                {form.items.map((item, index) => (
                  <View
                    key={item.ingredientId}
                    style={{
                      backgroundColor: colors.surfaceElevated,
                      borderRadius: borderRadius.sm,
                      padding: spacing.sm,
                      marginBottom: spacing.sm,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                        {item.ingredientName}
                      </Text>
                      <TouchableOpacity onPress={() => removeItem(index)}>
                        <Text style={{ fontSize: fontSize.sm, color: colors.error }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <Input
                          label="Qty"
                          value={item.quantity}
                          onChangeText={(v) => updateItem(index, "quantity", v)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Input
                          label="Unit Price"
                          value={item.unitPrice}
                          onChangeText={(v) => updateItem(index, "unitPrice", v)}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                        />
                      </View>
                      <View style={{ flex: 1, justifyContent: "flex-end" }}>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: spacing.xs }}>Total</Text>
                        <View
                          style={{
                            height: 48,
                            justifyContent: "center",
                            paddingHorizontal: spacing.sm,
                            backgroundColor: colors.surface,
                            borderRadius: borderRadius.sm,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <Text style={{ fontSize: fontSize.md, color: colors.textPrimary }}>
                            ${calcItemTotal(item.quantity, item.unitPrice)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}

                {form.items.length > 0 && (
                  <View style={{ alignItems: "flex-end", marginTop: spacing.xs }}>
                    <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
                      Grand Total: ${calcFormTotal()}
                    </Text>
                  </View>
                )}
              </View>

              <Input
                label="Expected Delivery Date"
                value={form.expectedDeliveryDate}
                onChangeText={(text) => setForm((f) => ({ ...f, expectedDeliveryDate: text }))}
                placeholder="e.g. 2026-04-01"
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
                <Button title="Cancel" variant="ghost" onPress={() => setCreateModalVisible(false)} />
                <Button
                  title="Create PO"
                  onPress={handleCreatePO}
                  loading={createPO.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Supplier Picker Modal */}
      <Modal
        visible={supplierPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSupplierPickerVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={[modalContent, { maxHeight: "70%" }]}>
            <Text style={modalTitle}>Select Supplier</Text>
            <ScrollView>
              {suppliers?.map((supplier: any) => (
                <TouchableOpacity
                  key={supplier.id}
                  onPress={() => selectSupplier(supplier)}
                  activeOpacity={0.7}
                  style={{
                    paddingVertical: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium }}>
                    {supplier.name}
                  </Text>
                  {supplier.contactName && (
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{supplier.contactName}</Text>
                  )}
                </TouchableOpacity>
              ))}
              {(!suppliers || suppliers.length === 0) && (
                <Text style={{ color: colors.textTertiary, textAlign: "center", padding: spacing.lg }}>
                  No suppliers available.
                </Text>
              )}
            </ScrollView>
            <Button title="Cancel" variant="ghost" onPress={() => setSupplierPickerVisible(false)} />
          </View>
        </View>
      </Modal>

      {/* Ingredient Picker Modal */}
      <Modal
        visible={ingredientPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIngredientPickerVisible(false)}
      >
        <View style={modalOverlay}>
          <View style={[modalContent, { maxHeight: "70%" }]}>
            <Text style={modalTitle}>Select Ingredient</Text>
            <ScrollView>
              {ingredients?.map((ingredient: any) => (
                <TouchableOpacity
                  key={ingredient.id}
                  onPress={() => addIngredientItem(ingredient)}
                  activeOpacity={0.7}
                  style={{
                    paddingVertical: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium }}>
                    {ingredient.name}
                  </Text>
                  {ingredient.unit && (
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Unit: {ingredient.unit}</Text>
                  )}
                </TouchableOpacity>
              ))}
              {(!ingredients || ingredients.length === 0) && (
                <Text style={{ color: colors.textTertiary, textAlign: "center", padding: spacing.lg }}>
                  No ingredients available.
                </Text>
              )}
            </ScrollView>
            <Button title="Cancel" variant="ghost" onPress={() => setIngredientPickerVisible(false)} />
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={modalContent}>
              {selectedPO && (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={modalTitle}>
                      {selectedPO.poNumber ?? `PO-${selectedPO.id?.slice(0, 8)}`}
                    </Text>
                    <View
                      style={{
                        backgroundColor: getStatusColor(selectedPO.status).bg,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: borderRadius.full,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          fontWeight: fontWeight.semibold,
                          color: getStatusColor(selectedPO.status).text,
                        }}
                      >
                        {selectedPO.status?.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                    Supplier: {selectedPO.supplierName ?? selectedPO.supplier?.name ?? "Unknown"}
                  </Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                    Total: ${(selectedPO.totalCost ?? 0).toFixed(2)}
                  </Text>
                  {selectedPO.expectedDeliveryDate && (
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                      Expected: {new Date(selectedPO.expectedDeliveryDate).toLocaleDateString()}
                    </Text>
                  )}
                  {selectedPO.notes && (
                    <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontStyle: "italic" }}>
                      {selectedPO.notes}
                    </Text>
                  )}

                  {/* Items list */}
                  <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: spacing.sm }}>
                    Items
                  </Text>
                  {(selectedPO.items ?? []).map((item: any, idx: number) => (
                    <View
                      key={item.id ?? idx}
                      style={{
                        backgroundColor: colors.surfaceElevated,
                        borderRadius: borderRadius.sm,
                        padding: spacing.sm,
                        marginBottom: spacing.xs,
                      }}
                    >
                      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                        {item.ingredientName ?? item.ingredient?.name ?? "Unknown"}
                      </Text>
                      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 2 }}>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                          Qty: {item.quantity}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                          Price: ${(item.unitPrice ?? 0).toFixed(2)}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                          Total: ${((item.quantity ?? 0) * (item.unitPrice ?? 0)).toFixed(2)}
                        </Text>
                        {item.receivedQuantity != null && (
                          <Text style={{ fontSize: fontSize.xs, color: colors.success }}>
                            Received: {item.receivedQuantity}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}

                  <View style={modalActions}>
                    {(selectedPO.status === "sent" ||
                      selectedPO.status === "partial") && (
                      <Button
                        title="Receive Items"
                        variant="secondary"
                        onPress={() => openReceive(selectedPO)}
                      />
                    )}
                    <Button title="Close" variant="ghost" onPress={() => setDetailModalVisible(false)} />
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Receive Items Modal */}
      <Modal
        visible={receiveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiveModalVisible(false)}
      >
        <View style={modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={modalContent}>
              <Text style={modalTitle}>Receive Items</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
                Enter the quantity received for each item.
              </Text>

              {receiveItems.map((item, index) => (
                <View
                  key={item.itemId}
                  style={{
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: borderRadius.sm,
                    padding: spacing.sm,
                    marginBottom: spacing.sm,
                  }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                    {item.ingredientName}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: spacing.xs }}>
                    Ordered: {item.orderedQty}
                  </Text>
                  <Input
                    label="Received Qty"
                    value={item.receivedQty}
                    onChangeText={(v) => {
                      setReceiveItems((prev) => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], receivedQty: v };
                        return updated;
                      });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              ))}

              <View style={modalActions}>
                <Button title="Cancel" variant="ghost" onPress={() => setReceiveModalVisible(false)} />
                <Button
                  title="Confirm Receipt"
                  onPress={handleReceive}
                  loading={receivePOItems.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
