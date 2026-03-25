import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { ingredients } from "./ingredients";
import { employees } from "./employees";

export const stockAdjustments = sqliteTable("stock_adjustments", {
  ...baseColumns,
  ingredientId: text("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  type: text("type", {
    enum: ["waste", "breakage", "theft", "count", "received", "returned", "sale_deduction", "other"],
  }).notNull(),
  quantityChange: real("quantity_change").notNull(), // positive = add, negative = remove
  previousStock: real("previous_stock").notNull(),
  newStock: real("new_stock").notNull(),
  reason: text("reason"),
  employeeId: text("employee_id").references(() => employees.id),
});

export const stockAdjustmentsRelations = relations(stockAdjustments, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [stockAdjustments.ingredientId],
    references: [ingredients.id],
  }),
  employee: one(employees, {
    fields: [stockAdjustments.employeeId],
    references: [employees.id],
  }),
}));
