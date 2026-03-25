import { eq, and, isNull } from "drizzle-orm";
import { productIngredients, ingredients } from "@pos/core/schema";
import type { ProductIngredient, NewProductIngredient, Ingredient } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export type ProductIngredientWithDetails = ProductIngredient & {
  ingredient: Ingredient;
};

export const productIngredientRepository = {
  getByProduct: async (productId: string): Promise<ProductIngredientWithDetails[]> => {
    const db = getDatabase();
    const rows = await db
      .select({
        pi: productIngredients,
        ingredient: ingredients,
      })
      .from(productIngredients)
      .innerJoin(ingredients, eq(productIngredients.ingredientId, ingredients.id))
      .where(
        and(
          eq(productIngredients.productId, productId),
          isNull(productIngredients.deletedAt)
        )
      );

    return rows.map((row) => ({
      ...row.pi,
      ingredient: row.ingredient,
    }));
  },

  create: async (
    data: Omit<NewProductIngredient, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<ProductIngredient> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newPI: NewProductIngredient = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(productIngredients).values(newPI);
    return newPI as ProductIngredient;
  },

  update: async (id: string, quantity: number): Promise<void> => {
    const db = getDatabase();
    await db
      .update(productIngredients)
      .set({ quantity, updatedAt: new Date().toISOString() })
      .where(eq(productIngredients.id, id));
  },

  remove: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(productIngredients)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(productIngredients.id, id));
  },

  removeAllForProduct: async (productId: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(productIngredients)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(productIngredients.productId, productId));
  },
};
