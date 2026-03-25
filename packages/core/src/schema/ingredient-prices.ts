import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { ingredients } from "./ingredients";
import { suppliers } from "./suppliers";

export const ingredientPrices = sqliteTable("ingredient_prices", {
  ...baseColumns,
  ingredientId: text("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  supplierId: text("supplier_id").references(() => suppliers.id),
  price: real("price").notNull(), // price per unit
  quantity: real("quantity").notNull(), // quantity purchased
  totalCost: real("total_cost").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  notes: text("notes"),
});

export const ingredientPricesRelations = relations(
  ingredientPrices,
  ({ one }) => ({
    ingredient: one(ingredients, {
      fields: [ingredientPrices.ingredientId],
      references: [ingredients.id],
    }),
    supplier: one(suppliers, {
      fields: [ingredientPrices.supplierId],
      references: [suppliers.id],
    }),
  })
);
