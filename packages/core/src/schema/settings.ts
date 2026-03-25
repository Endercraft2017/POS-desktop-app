import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns";

export const settings = sqliteTable("settings", {
  ...baseColumns,
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  group: text("group").default("general"), // e.g., "general", "receipt", "tax", "display"
});
