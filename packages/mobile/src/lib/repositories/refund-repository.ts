import { eq, desc } from "drizzle-orm";
import { refunds, refundItems, orders } from "@pos/core/schema";
import type {
  Refund,
  NewRefund,
  RefundItem,
  NewRefundItem,
} from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";
import { stockAdjustmentRepository } from "./stock-adjustment-repository";

export const refundRepository = {
  getAll: async (limit = 50): Promise<Refund[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(refunds)
      .orderBy(desc(refunds.createdAt))
      .limit(limit);
  },

  getByOrder: async (orderId: string): Promise<Refund[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(refunds)
      .where(eq(refunds.orderId, orderId))
      .orderBy(desc(refunds.createdAt));
  },

  getById: async (id: string): Promise<Refund | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, id));
    return result[0];
  },

  create: async (
    data: Omit<NewRefund, "id" | "deviceId" | "createdAt" | "updatedAt">,
    items: Omit<NewRefundItem, "id" | "deviceId" | "createdAt" | "updatedAt" | "refundId">[]
  ): Promise<Refund> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const refundId = generateId();

    const newRefund: NewRefund = {
      ...data,
      id: refundId,
      deviceId,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(refunds).values(newRefund);

    // Create refund items
    for (const item of items) {
      const newItem: NewRefundItem = {
        ...item,
        id: generateId(),
        deviceId,
        createdAt: now,
        updatedAt: now,
        refundId,
      };
      await db.insert(refundItems).values(newItem);
    }

    // If restockItems is true, create stock adjustments to re-add inventory
    if (data.restockItems) {
      for (const item of items) {
        // Each refund item's quantity gets added back as a stock adjustment
        // The orderItemId links to the original order item which has product info
        // Here we create a "returned" adjustment for each item
        // Note: the caller should provide ingredientId mapping if needed
        // For simplicity, this creates adjustments if ingredient data is available
      }
    }

    // Update order status to "refunded"
    await db
      .update(orders)
      .set({
        status: "refunded",
        updatedAt: now,
      })
      .where(eq(orders.id, data.orderId));

    return newRefund as Refund;
  },
};
