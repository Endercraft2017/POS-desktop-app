import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns";

export const taxRates = sqliteTable("tax_rates", {
  ...baseColumns,
  name: text("name").notNull(), // e.g., "Sales Tax", "VAT"
  rate: real("rate").notNull(), // e.g., 0.08 for 8%
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});
