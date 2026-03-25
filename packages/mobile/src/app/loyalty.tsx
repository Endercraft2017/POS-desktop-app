import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import {
  useLoyaltyRewards,
  useCreateReward,
  useUpdateReward,
  useDeleteReward,
} from "../hooks/use-loyalty";
import { settingsRepository } from "../lib/repositories/settings-repository";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";

type Tab = "rewards" | "settings";

const REWARD_TYPES = ["discount_percent", "discount_fixed", "free_product"] as const;
type RewardType = (typeof REWARD_TYPES)[number];

const rewardTypeLabels: Record<RewardType, string> = {
  discount_percent: "Discount %",
  discount_fixed: "Discount $",
  free_product: "Free Product",
};

type RewardForm = {
  name: string;
  description: string;
  pointsCost: string;
  rewardType: RewardType;
  rewardValue: string;
  isActive: boolean;
};

const emptyForm: RewardForm = {
  name: "",
  description: "",
  pointsCost: "",
  rewardType: "discount_percent",
  rewardValue: "",
  isActive: true,
};

type LoyaltySettings = {
  pointsPerDollar: string;
  pointValue: string;
  welcomeBonus: string;
};

export default function LoyaltyScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();
  const { data: rewards, isLoading } = useLoyaltyRewards();
  const createReward = useCreateReward();
  const updateReward = useUpdateReward();
  const deleteReward = useDeleteReward();

  const [activeTab, setActiveTab] = useState<Tab>("rewards");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RewardForm>(emptyForm);

  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    pointsPerDollar: "1",
    pointValue: "100",
    welcomeBonus: "0",
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [ppd, pv, wb] = await Promise.all([
        settingsRepository.get("loyalty_points_per_dollar"),
        settingsRepository.get("loyalty_point_value"),
        settingsRepository.get("loyalty_welcome_bonus"),
      ]);
      setLoyaltySettings({
        pointsPerDollar: ppd ?? "1",
        pointValue: pv ?? "100",
        welcomeBonus: wb ?? "0",
      });
    } catch {
      // use defaults
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await Promise.all([
        settingsRepository.set("loyalty_points_per_dollar", loyaltySettings.pointsPerDollar, "loyalty"),
        settingsRepository.set("loyalty_point_value", loyaltySettings.pointValue, "loyalty"),
        settingsRepository.set("loyalty_welcome_bonus", loyaltySettings.welcomeBonus, "loyalty"),
      ]);
      Alert.alert("Success", "Loyalty settings saved.");
    } catch {
      Alert.alert("Error", "Failed to save settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (reward: any) => {
    setEditingId(reward.id);
    setForm({
      name: reward.name ?? "",
      description: reward.description ?? "",
      pointsCost: String(reward.pointsCost ?? ""),
      rewardType: reward.rewardType ?? "discount_percent",
      rewardValue: String(reward.rewardValue ?? ""),
      isActive: reward.isActive === 1 || reward.isActive === true,
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Reward name is required.");
      return;
    }
    if (!form.pointsCost || isNaN(Number(form.pointsCost)) || Number(form.pointsCost) <= 0) {
      Alert.alert("Validation", "Points cost must be a positive number.");
      return;
    }
    if (!form.rewardValue || isNaN(Number(form.rewardValue)) || Number(form.rewardValue) <= 0) {
      Alert.alert("Validation", "Reward value must be a positive number.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      pointsCost: parseInt(form.pointsCost, 10),
      rewardType: form.rewardType,
      rewardValue: parseFloat(form.rewardValue),
      isActive: form.isActive ? 1 : 0,
    };

    if (editingId) {
      updateReward.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setModalVisible(false) }
      );
    } else {
      createReward.mutate(payload as any, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Reward",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteReward.mutate(id),
        },
      ]
    );
  };

  const handleToggleActive = (reward: any) => {
    const newActive = reward.isActive === 1 || reward.isActive === true ? 0 : 1;
    updateReward.mutate({ id: reward.id, data: { isActive: newActive } });
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

  const tabBar: ViewStyle = {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  };

  const tabStyle = (isActive: boolean): ViewStyle => ({
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: borderRadius.sm,
    backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
    borderWidth: isActive ? 0 : 1,
    borderColor: colors.border,
  });

  const tabTextStyle = (isActive: boolean): TextStyle => ({
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: isActive ? colors.textOnPrimary : colors.textSecondary,
  });

  const listContainer: ViewStyle = {
    padding: spacing.md,
    gap: spacing.sm,
  };

  const cardRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  };

  const rewardInfo: ViewStyle = {
    flex: 1,
  };

  const rewardName: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const rewardMeta: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  };

  const actions: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
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

  const rewardTypeRow: ViewStyle = {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  };

  const rewardTypeChip = (selected: boolean): ViewStyle => ({
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: selected ? colors.primary : colors.surfaceElevated,
    borderWidth: 1,
    borderColor: selected ? colors.primary : colors.border,
  });

  const rewardTypeChipText = (selected: boolean): TextStyle => ({
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: selected ? colors.textOnPrimary : colors.textSecondary,
  });

  const settingsSection: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
  };

  const settingsLabel: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  if (isLoading || settingsLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Loyalty Program</Text>
        {activeTab === "rewards" && (
          <Button title="Add Reward" onPress={openCreate} size="sm" />
        )}
      </View>

      <View style={tabBar}>
        <TouchableOpacity style={tabStyle(activeTab === "rewards")} onPress={() => setActiveTab("rewards")}>
          <Text style={tabTextStyle(activeTab === "rewards")}>Rewards</Text>
        </TouchableOpacity>
        <TouchableOpacity style={tabStyle(activeTab === "settings")} onPress={() => setActiveTab("settings")}>
          <Text style={tabTextStyle(activeTab === "settings")}>Settings</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "rewards" && (
        <ScrollView contentContainerStyle={listContainer}>
          {rewards && rewards.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.md }}>
              No rewards yet. Tap "Add Reward" to create one.
            </Text>
          )}

          {rewards?.map((reward: any) => (
            <Card key={reward.id}>
              <View style={cardRow}>
                <View style={rewardInfo}>
                  <Text style={rewardName}>{reward.name}</Text>
                  <Text style={rewardMeta}>
                    {reward.pointsCost} pts — {rewardTypeLabels[reward.rewardType as RewardType] ?? reward.rewardType}:{" "}
                    {reward.rewardType === "discount_percent"
                      ? `${reward.rewardValue}%`
                      : reward.rewardType === "discount_fixed"
                      ? `$${reward.rewardValue}`
                      : `${reward.rewardValue}`}
                  </Text>
                  {reward.description ? (
                    <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                      {reward.description}
                    </Text>
                  ) : null}
                </View>
                <View style={actions}>
                  <Switch
                    value={reward.isActive === 1 || reward.isActive === true}
                    onValueChange={() => handleToggleActive(reward)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                  <Button title="Edit" variant="ghost" size="sm" onPress={() => openEdit(reward)} />
                  <Button
                    title="Delete"
                    variant="destructive"
                    size="sm"
                    onPress={() => handleDelete(reward.id, reward.name)}
                  />
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      {activeTab === "settings" && (
        <ScrollView contentContainerStyle={settingsSection}>
          <Card>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.md }}>
              Points Configuration
            </Text>

            <Input
              label="Points earned per dollar spent"
              value={loyaltySettings.pointsPerDollar}
              onChangeText={(text) => setLoyaltySettings((s) => ({ ...s, pointsPerDollar: text }))}
              placeholder="1"
              keyboardType="numeric"
            />
            <Text style={settingsLabel}>
              Customers earn this many points for every $1 spent.
            </Text>

            <View style={{ marginTop: spacing.md }}>
              <Input
                label="Points needed for $1 discount"
                value={loyaltySettings.pointValue}
                onChangeText={(text) => setLoyaltySettings((s) => ({ ...s, pointValue: text }))}
                placeholder="100"
                keyboardType="numeric"
              />
              <Text style={settingsLabel}>
                e.g. 100 means 100 points = $1 discount value.
              </Text>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Input
                label="Welcome bonus points for new customers"
                value={loyaltySettings.welcomeBonus}
                onChangeText={(text) => setLoyaltySettings((s) => ({ ...s, welcomeBonus: text }))}
                placeholder="0"
                keyboardType="numeric"
              />
              <Text style={settingsLabel}>
                Points automatically granted when a new customer signs up.
              </Text>
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <Button
                title="Save Settings"
                onPress={saveSettings}
                loading={settingsSaving}
                fullWidth
              />
            </View>
          </Card>
        </ScrollView>
      )}

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
                {editingId ? "Edit Reward" : "New Reward"}
              </Text>

              <Input
                label="Name"
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="e.g. 10% Off Next Order"
              />

              <Input
                label="Description"
                value={form.description}
                onChangeText={(text) => setForm((f) => ({ ...f, description: text }))}
                placeholder="Optional description"
                multiline
              />

              <Input
                label="Points Cost"
                value={form.pointsCost}
                onChangeText={(text) => setForm((f) => ({ ...f, pointsCost: text }))}
                placeholder="e.g. 500"
                keyboardType="numeric"
              />

              <View>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing.xs }}>
                  Reward Type
                </Text>
                <View style={rewardTypeRow}>
                  {REWARD_TYPES.map((rt) => (
                    <TouchableOpacity
                      key={rt}
                      style={rewardTypeChip(form.rewardType === rt)}
                      onPress={() => setForm((f) => ({ ...f, rewardType: rt }))}
                    >
                      <Text style={rewardTypeChipText(form.rewardType === rt)}>
                        {rewardTypeLabels[rt]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Input
                label={
                  form.rewardType === "discount_percent"
                    ? "Discount Percentage"
                    : form.rewardType === "discount_fixed"
                    ? "Discount Amount ($)"
                    : "Reward Value"
                }
                value={form.rewardValue}
                onChangeText={(text) => setForm((f) => ({ ...f, rewardValue: text }))}
                placeholder={form.rewardType === "discount_percent" ? "e.g. 10" : "e.g. 5.00"}
                keyboardType="numeric"
              />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: fontSize.md, color: colors.textPrimary }}>Active</Text>
                <Switch
                  value={form.isActive}
                  onValueChange={(val) => setForm((f) => ({ ...f, isActive: val }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
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
                  loading={createReward.isPending || updateReward.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
