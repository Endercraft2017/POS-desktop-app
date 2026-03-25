import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { loyaltyRewards, loyaltyTransactions, customers } from "@pos/core/schema";
import type {
  LoyaltyReward,
  NewLoyaltyReward,
  LoyaltyTransaction,
  NewLoyaltyTransaction,
} from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const loyaltyRepository = {
  // Rewards
  getRewards: async (): Promise<LoyaltyReward[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(loyaltyRewards)
      .where(
        and(eq(loyaltyRewards.isActive, true), isNull(loyaltyRewards.deletedAt))
      )
      .orderBy(loyaltyRewards.pointsCost);
  },

  createReward: async (
    data: Omit<NewLoyaltyReward, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<LoyaltyReward> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newReward: NewLoyaltyReward = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(loyaltyRewards).values(newReward);
    return newReward as LoyaltyReward;
  },

  updateReward: async (
    id: string,
    data: Partial<NewLoyaltyReward>
  ): Promise<void> => {
    const db = getDatabase();
    await db
      .update(loyaltyRewards)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(loyaltyRewards.id, id));
  },

  deleteReward: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(loyaltyRewards)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(loyaltyRewards.id, id));
  },

  // Transactions
  getTransactions: async (
    customerId: string
  ): Promise<LoyaltyTransaction[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customerId))
      .orderBy(desc(loyaltyTransactions.createdAt));
  },

  earnPoints: async (
    customerId: string,
    orderId: string,
    points: number,
    description?: string
  ): Promise<LoyaltyTransaction> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const newTransaction: NewLoyaltyTransaction = {
      id: generateId(),
      deviceId,
      createdAt: now,
      updatedAt: now,
      customerId,
      orderId,
      points,
      type: "earned",
      description: description ?? null,
    };
    await db.insert(loyaltyTransactions).values(newTransaction);

    // Update customer's loyalty points
    const customerResult = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));

    if (customerResult[0]) {
      await db
        .update(customers)
        .set({
          loyaltyPoints: customerResult[0].loyaltyPoints + points,
          updatedAt: now,
        })
        .where(eq(customers.id, customerId));
    }

    return newTransaction as LoyaltyTransaction;
  },

  redeemPoints: async (
    customerId: string,
    orderId: string,
    points: number,
    description?: string
  ): Promise<LoyaltyTransaction> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    // Verify sufficient balance
    const customerResult = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));

    if (!customerResult[0]) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    if (customerResult[0].loyaltyPoints < points) {
      throw new Error("Insufficient loyalty points");
    }

    const newTransaction: NewLoyaltyTransaction = {
      id: generateId(),
      deviceId,
      createdAt: now,
      updatedAt: now,
      customerId,
      orderId,
      points: -points, // negative for redemption
      type: "redeemed",
      description: description ?? null,
    };
    await db.insert(loyaltyTransactions).values(newTransaction);

    // Update customer's loyalty points
    await db
      .update(customers)
      .set({
        loyaltyPoints: customerResult[0].loyaltyPoints - points,
        updatedAt: now,
      })
      .where(eq(customers.id, customerId));

    return newTransaction as LoyaltyTransaction;
  },

  getBalance: async (customerId: string): Promise<number> => {
    const db = getDatabase();
    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${loyaltyTransactions.points}), 0)`,
      })
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customerId));
    return result[0]?.total ?? 0;
  },
};
