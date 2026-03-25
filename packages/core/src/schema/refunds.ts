import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { orders, orderItems } from "./orders";
import { employees } from "./employees";

export const refunds = sqliteTable("refunds", {
  ...baseColumns,
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  type: text("type", {
    enum: ["full", "partial"],
  }).notNull(),
  status: text("status", {
    enum: ["pending", "approved", "completed", "rejected"],
  })
    .notNull()
    .default("pending"),
  totalAmount: real("total_amount").notNull(),
  refundMethod: text("refund_method", {
    enum: ["cash", "card", "store_credit", "original_method"],
  }).notNull(),
  reason: text("reason").notNull(),
  notes: text("notes"),
  employeeId: text("employee_id").references(() => employees.id),
  restockItems: integer("restock_items", { mode: "boolean" }).notNull().default(true),
  completedAt: text("completed_at"),
});

export const refundsRelations = relations(refunds, ({ one, many }) => ({
  order: one(orders, {
    fields: [refunds.orderId],
    references: [orders.id],
  }),
  employee: one(employees, {
    fields: [refunds.employeeId],
    references: [employees.id],
  }),
  items: many(refundItems),
}));

export const refundItems = sqliteTable("refund_items", {
  ...baseColumns,
  refundId: text("refund_id")
    .notNull()
    .references(() => refunds.id),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.id),
  quantity: integer("quantity").notNull(),
  amount: real("amount").notNull(),
});

export const refundItemsRelations = relations(refundItems, ({ one }) => ({
  refund: one(refunds, {
    fields: [refundItems.refundId],
    references: [refunds.id],
  }),
  orderItem: one(orderItems, {
    fields: [refundItems.orderItemId],
    references: [orderItems.id],
  }),
}));
