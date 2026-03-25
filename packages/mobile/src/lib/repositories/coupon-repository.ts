import { eq, and, isNull } from "drizzle-orm";
import { coupons } from "@pos/core/schema";
import type { Coupon, NewCoupon } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const couponRepository = {
  getAll: async (): Promise<Coupon[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(coupons)
      .where(isNull(coupons.deletedAt))
      .orderBy(coupons.name);
  },

  getActive: async (): Promise<Coupon[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(coupons)
      .where(
        and(eq(coupons.isActive, true), isNull(coupons.deletedAt))
      )
      .orderBy(coupons.name);
  },

  getById: async (id: string): Promise<Coupon | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.id, id), isNull(coupons.deletedAt)));
    return result[0];
  },

  getByCode: async (code: string): Promise<Coupon | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code), isNull(coupons.deletedAt)));
    return result[0];
  },

  create: async (
    data: Omit<NewCoupon, "id" | "deviceId" | "createdAt" | "updatedAt">
  ): Promise<Coupon> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newCoupon: NewCoupon = {
      ...data,
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(coupons).values(newCoupon);
    return newCoupon as Coupon;
  },

  update: async (id: string, data: Partial<NewCoupon>): Promise<void> => {
    const db = getDatabase();
    await db
      .update(coupons)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(coupons.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(coupons)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(coupons.id, id));
  },

  validateCoupon: async (
    code: string,
    orderTotal: number
  ): Promise<{ valid: boolean; coupon?: Coupon; error?: string }> => {
    const coupon = await couponRepository.getByCode(code);

    if (!coupon) {
      return { valid: false, error: "Coupon not found" };
    }

    if (!coupon.isActive) {
      return { valid: false, error: "Coupon is not active" };
    }

    // Check expiration
    const now = new Date().toISOString();
    if (coupon.validFrom && now < coupon.validFrom) {
      return { valid: false, error: "Coupon is not yet valid" };
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      return { valid: false, error: "Coupon has expired" };
    }

    // Check max uses (0 = unlimited)
    if (coupon.maxUses && coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
      return { valid: false, error: "Coupon has exceeded maximum uses" };
    }

    // Check minimum order amount
    if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
      return {
        valid: false,
        error: `Minimum order amount of ${coupon.minOrderAmount} not met`,
      };
    }

    return { valid: true, coupon };
  },

  incrementUse: async (id: string): Promise<void> => {
    const db = getDatabase();
    const coupon = await couponRepository.getById(id);
    if (!coupon) throw new Error(`Coupon not found: ${id}`);
    await db
      .update(coupons)
      .set({
        currentUses: coupon.currentUses + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(coupons.id, id));
  },
};
