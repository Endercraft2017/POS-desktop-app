import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const syncLog = sqliteTable("sync_log", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  operation: text("operation", {
    enum: ["insert", "update", "delete"],
  }).notNull(),
  payload: text("payload"), // JSON snapshot of the change
  deviceId: text("device_id").notNull(),
  timestamp: text("timestamp")
    .notNull()
    .default(sql`(datetime('now'))`),
  synced: integer("synced", { mode: "boolean" }).notNull().default(false),
  syncedAt: text("synced_at"),
});
