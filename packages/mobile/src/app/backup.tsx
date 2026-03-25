import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../hooks/use-theme";
import { settingsRepository } from "../lib/repositories/settings-repository";
import { getRawDatabase } from "../lib/database";
import {
  productRepository,
  categoryRepository,
  ingredientRepository,
  orderRepository,
  customerRepository,
  supplierRepository,
  employeeRepository,
  taxRateRepository,
  expenseRepository,
} from "../lib/repositories";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

type DbStats = {
  products: number;
  categories: number;
  ingredients: number;
  orders: number;
  customers: number;
};

export default function BackupScreen() {
  const { colors, spacing, borderRadius, fontSize, fontWeight } = useTheme();

  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    try {
      const [backup, productsData, categoriesData, ingredientsData, ordersData, customersData] =
        await Promise.all([
          settingsRepository.get("last_backup_date"),
          productRepository.getAll(),
          categoryRepository.getAll(),
          ingredientRepository.getAll(),
          orderRepository.getAll(999999),
          customerRepository.getAll(),
        ]);

      setLastBackup(backup);
      setStats({
        products: productsData?.length ?? 0,
        categories: categoriesData?.length ?? 0,
        ingredients: ingredientsData?.length ?? 0,
        orders: ordersData?.length ?? 0,
        customers: customersData?.length ?? 0,
      });
    } catch (err) {
      Alert.alert("Error", "Failed to load database info.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportDatabase = async () => {
    setExporting(true);
    try {
      const rawDb = getRawDatabase();
      const dbName = "pos.db";

      await Share.share({
        title: "POS Database Export",
        message: `Database file: ${dbName}\nExported at: ${new Date().toISOString()}\n\nNote: The SQLite file is located in the app's data directory. Use a file manager to access and copy it for backup.`,
      });

      const now = new Date().toISOString();
      await settingsRepository.set("last_backup_date", now, "backup");
      setLastBackup(now);
    } catch (err: any) {
      if (err?.message !== "User did not share") {
        Alert.alert("Error", "Failed to export database.");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    setExportingJson(true);
    try {
      const [
        productsData,
        categoriesData,
        ingredientsData,
        ordersData,
        customersData,
        suppliersData,
        employeesData,
        taxRatesData,
        expensesData,
      ] = await Promise.all([
        productRepository.getAll(),
        categoryRepository.getAll(),
        ingredientRepository.getAll(),
        orderRepository.getAll(999999),
        customerRepository.getAll(),
        supplierRepository.getAll(),
        employeeRepository.getAll(),
        taxRateRepository.getAll(),
        expenseRepository.getAll(),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        data: {
          products: productsData ?? [],
          categories: categoriesData ?? [],
          ingredients: ingredientsData ?? [],
          orders: ordersData ?? [],
          customers: customersData ?? [],
          suppliers: suppliersData ?? [],
          employees: employeesData ?? [],
          taxRates: taxRatesData ?? [],
          expenses: expensesData ?? [],
        },
      };

      const jsonString = JSON.stringify(exportData, null, 2);

      await Share.share({
        title: "POS Data Export (JSON)",
        message: jsonString,
      });

      const now = new Date().toISOString();
      await settingsRepository.set("last_backup_date", now, "backup");
      setLastBackup(now);
    } catch (err: any) {
      if (err?.message !== "User did not share") {
        Alert.alert("Error", "Failed to export data as JSON.");
      }
    } finally {
      setExportingJson(false);
    }
  };

  const handleRestoreJson = () => {
    Alert.alert("Coming Soon", "Restore from JSON is not yet available. This feature will be added in a future update.");
  };

  const container: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const header: ViewStyle = {
    padding: spacing.md,
  };

  const headerTitle: TextStyle = {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  };

  const headerSubtitle: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const sectionTitle: TextStyle = {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  };

  const contentContainer: ViewStyle = {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  };

  const statRow: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  const statLabel: TextStyle = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  };

  const statValue: TextStyle = {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  };

  const lastBackupText: TextStyle = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  };

  const buttonGap: ViewStyle = {
    gap: spacing.sm,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={container}>
      <View style={header}>
        <Text style={headerTitle}>Backup & Export</Text>
        <Text style={headerSubtitle}>
          Export your data for safekeeping or transfer to another device.
        </Text>
      </View>

      <ScrollView contentContainerStyle={contentContainer}>
        <Card>
          <Text style={sectionTitle}>Last Backup</Text>
          {lastBackup ? (
            <Text style={lastBackupText}>
              {new Date(lastBackup).toLocaleString()}
            </Text>
          ) : (
            <Text style={lastBackupText}>No backups yet.</Text>
          )}
        </Card>

        <Card>
          <Text style={sectionTitle}>Export Options</Text>
          <View style={buttonGap}>
            <Button
              title="Export Database (SQLite)"
              onPress={handleExportDatabase}
              loading={exporting}
              fullWidth
            />
            <Button
              title="Export Data as JSON"
              onPress={handleExportJson}
              loading={exportingJson}
              fullWidth
              variant="secondary"
            />
            <Button
              title="Restore from JSON (Coming Soon)"
              onPress={handleRestoreJson}
              fullWidth
              variant="ghost"
            />
          </View>
        </Card>

        <Card>
          <Text style={sectionTitle}>Database Statistics</Text>
          {stats && (
            <View>
              <View style={statRow}>
                <Text style={statLabel}>Products</Text>
                <Text style={statValue}>{stats.products}</Text>
              </View>
              <View style={statRow}>
                <Text style={statLabel}>Categories</Text>
                <Text style={statValue}>{stats.categories}</Text>
              </View>
              <View style={statRow}>
                <Text style={statLabel}>Ingredients</Text>
                <Text style={statValue}>{stats.ingredients}</Text>
              </View>
              <View style={statRow}>
                <Text style={statLabel}>Orders</Text>
                <Text style={statValue}>{stats.orders}</Text>
              </View>
              <View style={statRow}>
                <Text style={statLabel}>Customers</Text>
                <Text style={statValue}>{stats.customers}</Text>
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
