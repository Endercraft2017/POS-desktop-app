import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { ingredientPrices } from "./ingredient-prices";

export const suppliers = sqliteTable("suppliers", {
  ...baseColumns,
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
});

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  ingredientPrices: many(ingredientPrices),
}));
