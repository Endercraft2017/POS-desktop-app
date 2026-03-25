import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { categories } from "./categories";
import { productIngredients } from "./product-ingredients";
import { orderItems } from "./orders";

export const products = sqliteTable("products", {
  ...baseColumns,
  name: text("name").notNull(),
  sku: text("sku"),
  description: text("description"),
  price: real("price").notNull(),
  costPrice: real("cost_price").default(0),
  categoryId: text("category_id").references(() => categories.id),
  imageUri: text("image_uri"),
  barcode: text("barcode"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").default(0),
});

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  ingredients: many(productIngredients),
  orderItems: many(orderItems),
}));
