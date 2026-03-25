import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { orders } from "./orders";

export const customers = sqliteTable("customers", {
  ...baseColumns,
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  totalSpent: real("total_spent").notNull().default(0),
  visitCount: integer("visit_count").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));
