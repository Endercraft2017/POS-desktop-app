import { eq, and, isNull, like, or, desc } from "drizzle-orm";
import { customers } from "@pos/core/schema";
import type { Customer, NewCustomer } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const customerRepository = {
  getAll: async (): Promise<Customer[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(customers.name);
  },

  getActive: async (): Promise<Customer[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(customers)
      .where(
        and(eq(customers.isActive, true), isNull(customers.deletedAt))
      )
      .orderBy(customers.name);
  },

  getById: async (id: string): Promise<Customer | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)));
    return result[0];
  },

  search: async (query: string): Promise<Customer[]> => {
    const db = getDatabase();
    const pattern = `%${query}%`;
    return db
      .select()
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          or(
            like(customers.name, pattern),
            like(customers.phone, pattern),
            like(customers.email, pattern)
          )
        )
      )
      .orderBy(customers.name);
  },

  create: async (
    data: Omit<NewCustomer, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<Customer> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newCustomer: NewCustomer = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(customers).values(newCustomer);
    return newCustomer as Customer;
  },

  update: async (id: string, data: Partial<NewCustomer>): Promise<void> => {
    const db = getDatabase();
    await db
      .update(customers)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(customers.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(customers)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(customers.id, id));
  },

  updateStats: async (
    id: string,
    totalSpent: number,
    visitCount: number
  ): Promise<void> => {
    const db = getDatabase();
    await db
      .update(customers)
      .set({
        totalSpent,
        visitCount,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, id));
  },

  addLoyaltyPoints: async (id: string, points: number): Promise<void> => {
    const db = getDatabase();
    const customer = await customerRepository.getById(id);
    if (!customer) throw new Error(`Customer not found: ${id}`);
    const newPoints = customer.loyaltyPoints + points;
    await db
      .update(customers)
      .set({
        loyaltyPoints: newPoints,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, id));
  },

  redeemLoyaltyPoints: async (id: string, points: number): Promise<void> => {
    const db = getDatabase();
    const customer = await customerRepository.getById(id);
    if (!customer) throw new Error(`Customer not found: ${id}`);
    if (customer.loyaltyPoints < points) {
      throw new Error("Insufficient loyalty points");
    }
    const newPoints = customer.loyaltyPoints - points;
    await db
      .update(customers)
      .set({
        loyaltyPoints: newPoints,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, id));
  },
};
