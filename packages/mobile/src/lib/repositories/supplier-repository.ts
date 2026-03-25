import { eq, and, isNull } from "drizzle-orm";
import { suppliers } from "@pos/core/schema";
import type { Supplier, NewSupplier } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const supplierRepository = {
  getAll: async (): Promise<Supplier[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .orderBy(suppliers.name);
  },

  getById: async (id: string): Promise<Supplier | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
    return result[0];
  },

  create: async (
    data: Omit<NewSupplier, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<Supplier> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newSupplier: NewSupplier = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(suppliers).values(newSupplier);
    return newSupplier as Supplier;
  },

  update: async (id: string, data: Partial<NewSupplier>): Promise<void> => {
    const db = getDatabase();
    await db
      .update(suppliers)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(suppliers.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(suppliers)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(suppliers.id, id));
  },
};
