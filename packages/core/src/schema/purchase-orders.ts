import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "./columns";
import { suppliers } from "./suppliers";
import { ingredients } from "./ingredients";

export const purchaseOrders = sqliteTable("purchase_orders", {
  ...baseColumns,
  poNumber: text("po_number").notNull(),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  status: text("status", {
    enum: ["draft", "sent", "partial", "received", "cancelled"],
  })
    .notNull()
    .default("draft"),
  totalCost: real("total_cost").notNull().default(0),
  notes: text("notes"),
  expectedDate: text("expected_date"),
  receivedDate: text("received_date"),
});

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchaseOrders.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItems = sqliteTable("purchase_order_items", {
  ...baseColumns,
  purchaseOrderId: text("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  ingredientId: text("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  totalPrice: real("total_price").notNull(),
  receivedQuantity: real("received_quantity").default(0),
});

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  ingredient: one(ingredients, {
    fields: [purchaseOrderItems.ingredientId],
    references: [ingredients.id],
  }),
}));
