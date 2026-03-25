import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { products } from "./products";
import { employees } from "./employees";
import { payments } from "./payments";

export const orders = sqliteTable("orders", {
  ...baseColumns,
  orderNumber: text("order_number").notNull(),
  status: text("status", {
    enum: ["pending", "held", "completed", "cancelled", "refunded"],
  })
    .notNull()
    .default("pending"),
  subtotal: real("subtotal").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  discountAmount: real("discount_amount").notNull().default(0),
  total: real("total").notNull().default(0),
  discountType: text("discount_type", {
    enum: ["percentage", "fixed", "none"],
  }).default("none"),
  discountValue: real("discount_value").default(0),
  notes: text("notes"),
  employeeId: text("employee_id").references(() => employees.id),
  customerId: text("customer_id"),
  completedAt: text("completed_at"),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  employee: one(employees, {
    fields: [orders.employeeId],
    references: [employees.id],
  }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItems = sqliteTable("order_items", {
  ...baseColumns,
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name").notNull(), // snapshot at time of sale
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull(),
  discountAmount: real("discount_amount").default(0),
  taxAmount: real("tax_amount").default(0),
  total: real("total").notNull(),
  notes: text("notes"),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
