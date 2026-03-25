import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(), // e.g., "order.void", "refund.create", "discount.apply"
  employeeId: text("employee_id"),
  details: text("details"), // JSON with action-specific data
  deviceId: text("device_id").notNull(),
  timestamp: text("timestamp")
    .notNull()
    .default(sql`(datetime('now'))`),
});
