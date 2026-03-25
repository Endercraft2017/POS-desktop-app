import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { products } from "./products";
import { ingredients } from "./ingredients";

export const productIngredients = sqliteTable("product_ingredients", {
  ...baseColumns,
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  ingredientId: text("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  quantity: real("quantity").notNull(), // amount of ingredient used per product unit (computed from batch if batch mode)
  // Batch computation mode: "X amount of ingredient makes Y products"
  // When useBatchMode is true, batchIngredientQty / batchYield = quantity per product
  useBatchMode: integer("use_batch_mode", { mode: "boolean" }).notNull().default(false),
  batchIngredientQty: real("batch_ingredient_qty"), // e.g., 25 (kg of flour)
  batchYield: integer("batch_yield"), // e.g., 100 (loaves from 25kg flour)
});

export const productIngredientsRelations = relations(
  productIngredients,
  ({ one }) => ({
    product: one(products, {
      fields: [productIngredients.productId],
      references: [products.id],
    }),
    ingredient: one(ingredients, {
      fields: [productIngredients.ingredientId],
      references: [ingredients.id],
    }),
  })
);
