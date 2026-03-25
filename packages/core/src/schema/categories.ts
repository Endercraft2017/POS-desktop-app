import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { products } from "./products";

export const categories = sqliteTable("categories", {
  ...baseColumns,
  name: text("name").notNull(),
  color: text("color").default("#2563EB"),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));
