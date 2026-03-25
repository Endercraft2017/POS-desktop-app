import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns";

export const coupons = sqliteTable("coupons", {
  ...baseColumns,
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["percentage", "fixed", "bogo"],
  }).notNull(),
  value: real("value").notNull(), // percentage (0-100) or fixed amount
  minOrderAmount: real("min_order_amount").default(0),
  maxUses: integer("max_uses").default(0), // 0 = unlimited
  currentUses: integer("current_uses").notNull().default(0),
  validFrom: text("valid_from"),
  validUntil: text("valid_until"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // BOGO fields
  buyProductId: text("buy_product_id"),
  getProductId: text("get_product_id"),
  buyQuantity: integer("buy_quantity"),
  getQuantity: integer("get_quantity"),
});

export const loyaltyRewards = sqliteTable("loyalty_rewards", {
  ...baseColumns,
  name: text("name").notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull(),
  rewardType: text("reward_type", {
    enum: ["discount_percentage", "discount_fixed", "free_product"],
  }).notNull(),
  rewardValue: real("reward_value").notNull(), // percentage, amount, or product ID reference
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const loyaltyTransactions = sqliteTable("loyalty_transactions", {
  ...baseColumns,
  customerId: text("customer_id").notNull(),
  orderId: text("order_id"),
  points: integer("points").notNull(), // positive = earned, negative = redeemed
  type: text("type", {
    enum: ["earned", "redeemed", "adjusted", "expired"],
  }).notNull(),
  description: text("description"),
});
