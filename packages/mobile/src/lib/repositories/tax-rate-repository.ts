import { eq, and, isNull } from "drizzle-orm";
import { taxRates } from "@pos/core/schema";
import type { TaxRate, NewTaxRate } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const taxRateRepository = {
  getAll: async (): Promise<TaxRate[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(taxRates)
      .where(isNull(taxRates.deletedAt))
      .orderBy(taxRates.name);
  },

  getActive: async (): Promise<TaxRate[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(taxRates)
      .where(
        and(eq(taxRates.isActive, true), isNull(taxRates.deletedAt))
      );
  },

  getDefault: async (): Promise<TaxRate | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(taxRates)
      .where(
        and(
          eq(taxRates.isDefault, true),
          eq(taxRates.isActive, true),
          isNull(taxRates.deletedAt)
        )
      );
    return result[0];
  },

  create: async (
    data: Omit<NewTaxRate, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<TaxRate> => {
    const db = getDatabase();
    const now = new Date().toISOString();

    // If setting as default, clear other defaults first
    if (data.isDefault) {
      await db
        .update(taxRates)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(taxRates.isDefault, true));
    }

    const newTaxRate: NewTaxRate = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(taxRates).values(newTaxRate);
    return newTaxRate as TaxRate;
  },

  update: async (id: string, data: Partial<NewTaxRate>): Promise<void> => {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (data.isDefault) {
      await db
        .update(taxRates)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(taxRates.isDefault, true));
    }

    await db
      .update(taxRates)
      .set({ ...data, updatedAt: now })
      .where(eq(taxRates.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(taxRates)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(taxRates.id, id));
  },
};
