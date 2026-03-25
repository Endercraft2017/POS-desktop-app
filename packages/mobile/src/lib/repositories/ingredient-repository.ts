import { eq, and, isNull, lte } from "drizzle-orm";
import { ingredients, ingredientPrices } from "@pos/core/schema";
import type {
  Ingredient,
  NewIngredient,
  IngredientPrice,
  NewIngredientPrice,
} from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const ingredientRepository = {
  getAll: async (): Promise<Ingredient[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(ingredients)
      .where(isNull(ingredients.deletedAt))
      .orderBy(ingredients.name);
  },

  getActive: async (): Promise<Ingredient[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(ingredients)
      .where(
        and(eq(ingredients.isActive, true), isNull(ingredients.deletedAt))
      )
      .orderBy(ingredients.name);
  },

  getById: async (id: string): Promise<Ingredient | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.id, id), isNull(ingredients.deletedAt)));
    return result[0];
  },

  getLowStock: async (): Promise<Ingredient[]> => {
    const db = getDatabase();
    // Get ingredients where current_stock <= min_stock
    const all = await db
      .select()
      .from(ingredients)
      .where(
        and(eq(ingredients.isActive, true), isNull(ingredients.deletedAt))
      );
    return all.filter(
      (i) =>
        i.currentStock !== null &&
        i.minStock !== null &&
        i.currentStock <= i.minStock
    );
  },

  create: async (
    data: Omit<NewIngredient, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<Ingredient> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newIngredient: NewIngredient = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(ingredients).values(newIngredient);
    return newIngredient as Ingredient;
  },

  update: async (id: string, data: Partial<NewIngredient>): Promise<void> => {
    const db = getDatabase();
    await db
      .update(ingredients)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(ingredients.id, id));
  },

  updateStock: async (id: string, newStock: number): Promise<void> => {
    const db = getDatabase();
    await db
      .update(ingredients)
      .set({
        currentStock: newStock,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ingredients.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(ingredients)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(ingredients.id, id));
  },

  // Price history
  getPrices: async (ingredientId: string): Promise<IngredientPrice[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(ingredientPrices)
      .where(
        and(
          eq(ingredientPrices.ingredientId, ingredientId),
          isNull(ingredientPrices.deletedAt)
        )
      )
      .orderBy(ingredientPrices.purchaseDate);
  },

  addPrice: async (
    data: Omit<NewIngredientPrice, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<IngredientPrice> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newPrice: NewIngredientPrice = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(ingredientPrices).values(newPrice);
    return newPrice as IngredientPrice;
  },

  getLatestPrice: async (
    ingredientId: string
  ): Promise<IngredientPrice | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(ingredientPrices)
      .where(
        and(
          eq(ingredientPrices.ingredientId, ingredientId),
          isNull(ingredientPrices.deletedAt)
        )
      )
      .orderBy(ingredientPrices.purchaseDate)
      .limit(1);
    return result[0];
  },
};
