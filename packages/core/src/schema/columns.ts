import { text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Base columns included in every table for sync-readiness and soft deletes.
 * - id: ULID (globally unique, time-sortable)
 * - device_id: identifies which device created the record
 * - created_at: ISO timestamp
 * - updated_at: ISO timestamp
 * - deleted_at: ISO timestamp (null = not deleted, soft delete)
 */
export const baseColumns = {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  deletedAt: text("deleted_at"),
};
