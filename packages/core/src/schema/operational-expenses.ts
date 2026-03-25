import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns";

export const operationalExpenses = sqliteTable("operational_expenses", {
  ...baseColumns,
  name: text("name").notNull(), // e.g., "Wages", "Butane Gas", "Rent", "Electricity"
  category: text("category", {
    enum: ["labor", "utilities", "supplies", "rent", "transport", "marketing", "other"],
  })
    .notNull()
    .default("other"),
  amount: real("amount").notNull(), // cost amount
  frequency: text("frequency", {
    enum: ["daily", "weekly", "monthly", "per_use"],
  })
    .notNull()
    .default("daily"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});
