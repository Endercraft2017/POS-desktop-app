import { eq, desc } from "drizzle-orm";
import {
  purchaseOrders,
  purchaseOrderItems,
  ingredients,
  ingredientPrices,
} from "@pos/core/schema";
import type {
  PurchaseOrder,
  NewPurchaseOrder,
  PurchaseOrderItem,
  NewPurchaseOrderItem,
  NewIngredientPrice,
} from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";
import { stockAdjustmentRepository } from "./stock-adjustment-repository";

export const purchaseOrderRepository = {
  getAll: async (limit = 50): Promise<PurchaseOrder[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(purchaseOrders)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(limit);
  },

  getById: async (
    id: string
  ): Promise<(PurchaseOrder & { items: PurchaseOrderItem[] }) | undefined> => {
    const db = getDatabase();
    const poResult = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id));

    if (!poResult[0]) return undefined;

    const items = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, id));

    return {
      ...poResult[0],
      items,
    };
  },

  getByStatus: async (status: string): Promise<PurchaseOrder[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, status as any))
      .orderBy(desc(purchaseOrders.createdAt));
  },

  create: async (
    data: Omit<NewPurchaseOrder, "id" | "deviceId" | "createdAt" | "updatedAt">,
    items: Omit<NewPurchaseOrderItem, "id" | "deviceId" | "createdAt" | "updatedAt" | "purchaseOrderId">[]
  ): Promise<PurchaseOrder> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const poId = generateId();

    const newPO: NewPurchaseOrder = {
      ...data,
      id: poId,
      deviceId,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(purchaseOrders).values(newPO);

    for (const item of items) {
      const newItem: NewPurchaseOrderItem = {
        ...item,
        id: generateId(),
        deviceId,
        createdAt: now,
        updatedAt: now,
        purchaseOrderId: poId,
      };
      await db.insert(purchaseOrderItems).values(newItem);
    }

    return newPO as PurchaseOrder;
  },

  updateStatus: async (
    id: string,
    status: "draft" | "sent" | "partial" | "received" | "cancelled"
  ): Promise<void> => {
    const db = getDatabase();
    const updates: any = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === "received") {
      updates.receivedDate = new Date().toISOString();
    }
    await db
      .update(purchaseOrders)
      .set(updates)
      .where(eq(purchaseOrders.id, id));
  },

  receiveItems: async (
    poId: string,
    receivedItems: { itemId: string; receivedQty: number }[]
  ): Promise<void> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    // Get all PO items
    const poItems = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, poId));

    let allFullyReceived = true;

    for (const received of receivedItems) {
      // Find the matching PO item
      const poItem = poItems.find((item) => item.id === received.itemId);
      if (!poItem) continue;

      const newReceivedQty =
        (poItem.receivedQuantity ?? 0) + received.receivedQty;

      // Update received quantity on the PO item
      await db
        .update(purchaseOrderItems)
        .set({
          receivedQuantity: newReceivedQty,
          updatedAt: now,
        })
        .where(eq(purchaseOrderItems.id, received.itemId));

      // Update ingredient stock via stock adjustment
      await stockAdjustmentRepository.adjustStock(
        poItem.ingredientId,
        "received",
        received.receivedQty,
        `Received from PO ${poId}`
      );

      // Auto-create ingredient price record
      // Get the PO to find the supplier
      const poResult = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId));
      const supplierId = poResult[0]?.supplierId ?? null;

      const newPrice: NewIngredientPrice = {
        id: generateId(),
        deviceId,
        createdAt: now,
        updatedAt: now,
        ingredientId: poItem.ingredientId,
        supplierId,
        price: poItem.unitPrice,
        quantity: received.receivedQty,
        totalCost: poItem.unitPrice * received.receivedQty,
        purchaseDate: now,
      };
      await db.insert(ingredientPrices).values(newPrice);

      // Check if this item is fully received
      if (newReceivedQty < poItem.quantity) {
        allFullyReceived = false;
      }
    }

    // Check items not in receivedItems list to see if they were already fully received
    for (const poItem of poItems) {
      const received = receivedItems.find((r) => r.itemId === poItem.id);
      if (!received) {
        const currentReceived = poItem.receivedQuantity ?? 0;
        if (currentReceived < poItem.quantity) {
          allFullyReceived = false;
        }
      }
    }

    // Update PO status
    const newStatus = allFullyReceived ? "received" : "partial";
    await purchaseOrderRepository.updateStatus(poId, newStatus);
  },
};
