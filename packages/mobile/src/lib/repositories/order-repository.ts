import { eq, and, isNull, desc, between, sql } from "drizzle-orm";
import { orders, orderItems, payments, products } from "@pos/core/schema";
import type {
  Order,
  NewOrder,
  OrderItem,
  NewOrderItem,
  Payment,
  NewPayment,
  OrderWithItems,
} from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { generateOrderNumber } from "@pos/core/services";
import { getDatabase } from "../database";

export const orderRepository = {
  getAll: async (limit = 50): Promise<Order[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(orders)
      .where(isNull(orders.deletedAt))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  },

  getByStatus: async (status: string): Promise<Order[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, status as any),
          isNull(orders.deletedAt)
        )
      )
      .orderBy(desc(orders.createdAt));
  },

  getToday: async (): Promise<Order[]> => {
    const db = getDatabase();
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    return db
      .select()
      .from(orders)
      .where(
        and(
          between(orders.createdAt, start, end),
          isNull(orders.deletedAt)
        )
      )
      .orderBy(desc(orders.createdAt));
  },

  getById: async (id: string): Promise<OrderWithItems | undefined> => {
    const db = getDatabase();
    const orderResult = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), isNull(orders.deletedAt)));

    if (!orderResult[0]) return undefined;

    const items = await db
      .select({
        item: orderItems,
        product: products,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id));

    const paymentList = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, id));

    return {
      ...orderResult[0],
      items: items.map((r) => ({ ...r.item, product: r.product })),
      payments: paymentList,
      employee: null,
    };
  },

  getNextOrderNumber: async (): Promise<string> => {
    const db = getDatabase();
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(between(orders.createdAt, start, end));

    const count = result[0]?.count ?? 0;
    return generateOrderNumber(today, count + 1);
  },

  create: async (
    data: {
      subtotal: number;
      taxAmount: number;
      discountAmount: number;
      total: number;
      discountType?: string;
      discountValue?: number;
      notes?: string;
      employeeId?: string;
      customerId?: string;
    },
    items: Omit<NewOrderItem, "id" | "deviceId" | "createdAt" | "updatedAt" | "orderId">[]
  ): Promise<Order> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const orderId = generateId();
    const orderNumber = await orderRepository.getNextOrderNumber();

    const newOrder: NewOrder = {
      id: orderId,
      deviceId,
      createdAt: now,
      updatedAt: now,
      orderNumber,
      status: "pending",
      subtotal: data.subtotal,
      taxAmount: data.taxAmount,
      discountAmount: data.discountAmount,
      total: data.total,
      discountType: (data.discountType as any) || "none",
      discountValue: data.discountValue || 0,
      notes: data.notes,
      employeeId: data.employeeId,
      customerId: data.customerId,
    };

    await db.insert(orders).values(newOrder);

    for (const item of items) {
      const newItem: NewOrderItem = {
        ...item,
        id: generateId(),
        deviceId,
        createdAt: now,
        updatedAt: now,
        orderId,
      };
      await db.insert(orderItems).values(newItem);
    }

    return newOrder as Order;
  },

  addPayment: async (
    data: Omit<NewPayment, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<Payment> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newPayment: NewPayment = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(payments).values(newPayment);
    return newPayment as Payment;
  },

  updateStatus: async (
    id: string,
    status: "pending" | "held" | "completed" | "cancelled" | "refunded"
  ): Promise<void> => {
    const db = getDatabase();
    const updates: any = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === "completed") {
      updates.completedAt = new Date().toISOString();
    }
    await db.update(orders).set(updates).where(eq(orders.id, id));

    // Auto-deduct inventory when order is completed
    if (status === "completed") {
      try {
        const { deductInventoryForOrder } = await import("../services/inventory-deduction");
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, id));
        await deductInventoryForOrder(
          items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
        );
      } catch (e) {
        // Log but don't fail the order completion
        console.warn("Inventory deduction failed:", e);
      }
    }
  },

  getTodayStats: async (): Promise<{
    totalSales: number;
    orderCount: number;
    averageOrder: number;
  }> => {
    const db = getDatabase();
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const result = await db
      .select({
        totalSales: sql<number>`COALESCE(SUM(total), 0)`,
        orderCount: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "completed"),
          between(orders.createdAt, start, end),
          isNull(orders.deletedAt)
        )
      );

    const stats = result[0] || { totalSales: 0, orderCount: 0 };
    return {
      totalSales: stats.totalSales,
      orderCount: stats.orderCount,
      averageOrder: stats.orderCount > 0 ? stats.totalSales / stats.orderCount : 0,
    };
  },
};
