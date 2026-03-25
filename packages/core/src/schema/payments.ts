import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { orders } from "./orders";

export const payments = sqliteTable("payments", {
  ...baseColumns,
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  method: text("method", {
    enum: ["cash", "card", "mobile_pay", "gift_card", "store_credit", "other"],
  }).notNull(),
  amount: real("amount").notNull(),
  reference: text("reference"), // transaction ID, last-4 digits, etc.
  change: real("change").default(0), // change given (for cash)
  notes: text("notes"),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
}));
