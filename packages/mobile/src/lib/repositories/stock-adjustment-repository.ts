import { eq, desc } from "drizzle-orm";
import { stockAdjustments, ingredients } from "@pos/core/schema";
import type { StockAdjustment, NewStockAdjustment } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const stockAdjustmentRepository = {
  getAll: async (limit = 50): Promise<StockAdjustment[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(stockAdjustments)
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(limit);
  },

  getByIngredient: async (
    ingredientId: string
  ): Promise<StockAdjustment[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(stockAdjustments)
      .where(eq(stockAdjustments.ingredientId, ingredientId))
      .orderBy(desc(stockAdjustments.createdAt));
  },

  create: async (
    data: Omit<NewStockAdjustment, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<StockAdjustment> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newAdjustment: NewStockAdjustment = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(stockAdjustments).values(newAdjustment);

    // Update the ingredient's current stock
    await db
      .update(ingredients)
      .set({
        currentStock: data.newStock,
        updatedAt: now,
      })
      .where(eq(ingredients.id, data.ingredientId));

    return newAdjustment as StockAdjustment;
  },

  adjustStock: async (
    ingredientId: string,
    type: "waste" | "breakage" | "theft" | "count" | "received" | "returned" | "sale_deduction" | "other",
    quantityChange: number,
    reason?: string,
    employeeId?: string
  ): Promise<StockAdjustment> => {
    const db = getDatabase();

    // Get current stock for the ingredient
    const ingredientResult = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, ingredientId));

    const ingredient = ingredientResult[0];
    if (!ingredient) throw new Error(`Ingredient not found: ${ingredientId}`);

    const previousStock = ingredient.currentStock ?? 0;
    const newStock = previousStock + quantityChange;

    return stockAdjustmentRepository.create({
      ingredientId,
      type,
      quantityChange,
      previousStock,
      newStock,
      reason: reason ?? null,
      employeeId: employeeId ?? null,
    });
  },
};
