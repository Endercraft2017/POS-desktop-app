import { eq, and, isNull } from "drizzle-orm";
import { operationalExpenses } from "@pos/core/schema";
import type { OperationalExpense, NewOperationalExpense } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const expenseRepository = {
  getAll: async (): Promise<OperationalExpense[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(operationalExpenses)
      .where(isNull(operationalExpenses.deletedAt))
      .orderBy(operationalExpenses.name);
  },

  getActive: async (): Promise<OperationalExpense[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(operationalExpenses)
      .where(
        and(
          eq(operationalExpenses.isActive, true),
          isNull(operationalExpenses.deletedAt)
        )
      )
      .orderBy(operationalExpenses.category);
  },

  getById: async (id: string): Promise<OperationalExpense | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(operationalExpenses)
      .where(
        and(eq(operationalExpenses.id, id), isNull(operationalExpenses.deletedAt))
      );
    return result[0];
  },

  create: async (
    data: Omit<NewOperationalExpense, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<OperationalExpense> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newExpense: NewOperationalExpense = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(operationalExpenses).values(newExpense);
    return newExpense as OperationalExpense;
  },

  update: async (
    id: string,
    data: Partial<NewOperationalExpense>
  ): Promise<void> => {
    const db = getDatabase();
    await db
      .update(operationalExpenses)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(operationalExpenses.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(operationalExpenses)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(operationalExpenses.id, id));
  },

  toggleActive: async (id: string, isActive: boolean): Promise<void> => {
    const db = getDatabase();
    await db
      .update(operationalExpenses)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(eq(operationalExpenses.id, id));
  },
};
