import { eq, and, isNull } from "drizzle-orm";
import { categories } from "@pos/core/schema";
import type { Category, NewCategory } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const categoryRepository = {
  getAll: async (): Promise<Category[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt))
      .orderBy(categories.sortOrder);
  },

  getActive: async (): Promise<Category[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(categories)
      .where(
        and(eq(categories.isActive, true), isNull(categories.deletedAt))
      )
      .orderBy(categories.sortOrder);
  },

  getById: async (id: string): Promise<Category | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)));
    return result[0];
  },

  create: async (data: Omit<NewCategory, "id" | "deviceId" | "createdAt" | "updatedAt">): Promise<Category> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newCategory: NewCategory = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(categories).values(newCategory);
    return newCategory as Category;
  },

  update: async (id: string, data: Partial<NewCategory>): Promise<void> => {
    const db = getDatabase();
    await db
      .update(categories)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(categories.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(categories)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(categories.id, id));
  },
};
