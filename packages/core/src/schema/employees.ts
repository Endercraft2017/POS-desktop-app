import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { orders } from "./orders";

export const employees = sqliteTable("employees", {
  ...baseColumns,
  name: text("name").notNull(),
  pin: text("pin").notNull(), // bcrypt hashed
  role: text("role", {
    enum: ["admin", "manager", "cashier"],
  })
    .notNull()
    .default("cashier"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const employeesRelations = relations(employees, ({ many }) => ({
  orders: many(orders),
}));
