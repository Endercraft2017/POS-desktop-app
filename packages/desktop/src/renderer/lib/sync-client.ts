import type { SyncAdapter, SyncLogRow } from "@pos/core/services";
import { dbQuery, dbRun } from "./db-bridge";

const DEVICE_ID = "desktop-001";

// Stable per-browser device ID, persisted in localStorage
function getWebDeviceId(): string {
  if (typeof window === "undefined") return "web-unknown";
  let id = localStorage.getItem("web_device_id");
  if (!id) {
    id = "web-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("web_device_id", id);
  }
  return id;
}
export const WEB_DEVICE_ID = getWebDeviceId();

const VALID_TABLES = [
  "categories", "products", "ingredients", "product_ingredients", "suppliers",
  "ingredient_prices", "employees", "tax_rates", "orders", "order_items",
  "payments", "settings", "operational_expenses", "customers",
  "stock_adjustments", "purchase_orders", "purchase_order_items",
  "coupons", "loyalty_rewards", "loyalty_transactions", "refunds",
  "refund_items", "ingredient_presets", "ingredient_preset_items",
  "audit_log",
];

export const desktopSyncAdapter: SyncAdapter = {
  getUnsyncedLogs: async (limit = 100): Promise<SyncLogRow[]> => {
    return dbQuery<SyncLogRow>(
      `SELECT id, table_name, record_id, operation, payload, device_id, timestamp
       FROM sync_log WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?`,
      [limit]
    );
  },

  markSynced: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    await dbRun(
      `UPDATE sync_log SET synced = 1, synced_at = datetime('now') WHERE id IN (${placeholders})`,
      ids
    );
  },

  applyRemoteChange: async (change: SyncLogRow): Promise<void> => {
    const { table_name, record_id, operation, payload, device_id } = change;

    // Skip changes from our own device
    if (device_id === DEVICE_ID) return;

    // Validate table name
    if (!VALID_TABLES.includes(table_name)) {
      console.warn("[Sync] Invalid table name:", table_name);
      return;
    }

    const data = JSON.parse(payload);

    if (operation === "insert") {
      // Ensure NOT-NULL columns are populated even when the source payload omitted them.
      // device_id falls back to the originating device, timestamps use current time.
      if (!data.device_id) data.device_id = device_id || "unknown";
      const nowIso = new Date().toISOString();
      if (!data.created_at) data.created_at = nowIso;
      if (!data.updated_at) data.updated_at = nowIso;
      const keys = Object.keys(data);
      const placeholders = keys.map(() => "?").join(", ");
      // Quote column names to handle reserved words like "group"
      const columns = keys.map((k) => `"${k}"`).join(", ");
      const values = keys.map((k) => data[k]);
      await dbRun(
        `INSERT OR REPLACE INTO ${table_name} (${columns}) VALUES (${placeholders})`,
        values
      );
    } else if (operation === "update") {
      const { id, ...rest } = data;
      const keys = Object.keys(rest);
      if (keys.length === 0) return;
      const setClause = keys.map((k) => `"${k}" = ?`).join(", ");
      const values = [...keys.map((k) => rest[k]), id || record_id];
      await dbRun(
        `UPDATE ${table_name} SET ${setClause} WHERE id = ?`,
        values
      );
    } else if (operation === "delete") {
      await dbRun(
        `UPDATE ${table_name} SET deleted_at = datetime('now') WHERE id = ?`,
        [record_id]
      );
    }
  },

  getSetting: async (key: string): Promise<string | null> => {
    const rows = await dbQuery<{ value: string }>(
      `SELECT value FROM settings WHERE key = ? AND deleted_at IS NULL`,
      [key]
    );
    return rows.length > 0 ? rows[0].value : null;
  },

  setSetting: async (key: string, value: string): Promise<void> => {
    const existing = await dbQuery<{ id: string }>(
      `SELECT id FROM settings WHERE key = ? AND deleted_at IS NULL`,
      [key]
    );
    if (existing.length > 0) {
      await dbRun(
        `UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`,
        [value, key]
      );
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await dbRun(
        `INSERT INTO settings (id, device_id, key, value, "group", created_at, updated_at)
         VALUES (?, ?, ?, ?, 'sync', datetime('now'), datetime('now'))`,
        [id, DEVICE_ID, key, value]
      );
    }
  },
};

// Web variant: same logic but uses the web device ID for self-change filtering.
export const webSyncAdapter: SyncAdapter = {
  getUnsyncedLogs: desktopSyncAdapter.getUnsyncedLogs,
  markSynced: desktopSyncAdapter.markSynced,
  getSetting: desktopSyncAdapter.getSetting,

  applyRemoteChange: async (change: SyncLogRow): Promise<void> => {
    const { table_name, record_id, operation, payload, device_id } = change;
    if (device_id === WEB_DEVICE_ID) return; // skip our own changes
    if (!VALID_TABLES.includes(table_name)) {
      console.warn("[Sync] Invalid table name:", table_name);
      return;
    }
    const data = JSON.parse(payload);
    if (operation === "insert") {
      // Inject NOT-NULL columns the source omitted
      if (!data.device_id) data.device_id = device_id || "unknown";
      const nowIso = new Date().toISOString();
      if (!data.created_at) data.created_at = nowIso;
      if (!data.updated_at) data.updated_at = nowIso;
      const keys = Object.keys(data);
      const placeholders = keys.map(() => "?").join(", ");
      const columns = keys.map((k) => `"${k}"`).join(", ");
      const values = keys.map((k) => data[k]);
      await dbRun(
        `INSERT OR REPLACE INTO ${table_name} (${columns}) VALUES (${placeholders})`,
        values
      );
    } else if (operation === "update") {
      const { id, ...rest } = data;
      const keys = Object.keys(rest);
      if (keys.length === 0) return;
      const setClause = keys.map((k) => `"${k}" = ?`).join(", ");
      const values = [...keys.map((k) => rest[k]), id || record_id];
      await dbRun(
        `UPDATE ${table_name} SET ${setClause} WHERE id = ?`,
        values
      );
    } else if (operation === "delete") {
      await dbRun(
        `UPDATE ${table_name} SET deleted_at = datetime('now') WHERE id = ?`,
        [record_id]
      );
    }
  },

  setSetting: async (key: string, value: string): Promise<void> => {
    const existing = await dbQuery<{ id: string }>(
      `SELECT id FROM settings WHERE key = ? AND deleted_at IS NULL`,
      [key]
    );
    if (existing.length > 0) {
      await dbRun(
        `UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`,
        [value, key]
      );
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await dbRun(
        `INSERT INTO settings (id, device_id, key, value, "group", created_at, updated_at)
         VALUES (?, ?, ?, ?, 'sync', datetime('now'), datetime('now'))`,
        [id, WEB_DEVICE_ID, key, value]
      );
    }
  },
};
