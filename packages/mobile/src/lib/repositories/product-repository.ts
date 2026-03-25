import { eq, and, isNull, like, desc } from "drizzle-orm";
import { products, categories } from "@pos/core/schema";
import type { Product, NewProduct } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const productRepository = {
  getAll: async (): Promise<Product[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(products.sortOrder);
  },

  getActive: async (): Promise<Product[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(products)
      .where(
        and(eq(products.isActive, true), isNull(products.deletedAt))
      )
      .orderBy(products.sortOrder);
  },

  getByCategory: async (categoryId: string): Promise<Product[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(products)
      .where(
        and(
          eq(products.categoryId, categoryId),
          eq(products.isActive, true),
          isNull(products.deletedAt)
        )
      )
      .orderBy(products.sortOrder);
  },

  getById: async (id: string): Promise<Product | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)));
    return result[0];
  },

  search: async (query: string): Promise<Product[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(products)
      .where(
        and(
          like(products.name, `%${query}%`),
          isNull(products.deletedAt)
        )
      );
  },

  create: async (data: Omit<NewProduct, "id" | "deviceId" | "createdAt" | "updatedAt">): Promise<Product> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newProduct: NewProduct = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(products).values(newProduct);
    return newProduct as Product;
  },

  update: async (id: string, data: Partial<NewProduct>): Promise<void> => {
    const db = getDatabase();
    await db
      .update(products)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(products.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(products)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(products.id, id));
  },

  toggleActive: async (id: string, isActive: boolean): Promise<void> => {
    const db = getDatabase();
    await db
      .update(products)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(eq(products.id, id));
  },
};
