import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { productIngredients } from "./product-ingredients";
import { ingredientPrices } from "./ingredient-prices";

export const ingredients = sqliteTable("ingredients", {
  ...baseColumns,
  name: text("name").notNull(),
  unit: text("unit").notNull(), // e.g., "g", "ml", "oz", "each"
  currentStock: real("current_stock").default(0),
  minStock: real("min_stock").default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  productIngredients: many(productIngredients),
  prices: many(ingredientPrices),
}));
