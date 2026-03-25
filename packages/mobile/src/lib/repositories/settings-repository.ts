import { eq, and, isNull } from "drizzle-orm";
import { settings } from "@pos/core/schema";
import type { Setting, NewSetting } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

export const settingsRepository = {
  get: async (key: string): Promise<string | null> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(settings)
      .where(and(eq(settings.key, key), isNull(settings.deletedAt)));
    return result[0]?.value ?? null;
  },

  getByGroup: async (group: string): Promise<Setting[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(settings)
      .where(and(eq(settings.group, group), isNull(settings.deletedAt)));
  },

  set: async (key: string, value: string, group = "general"): Promise<void> => {
    const db = getDatabase();
    const existing = await db
      .select()
      .from(settings)
      .where(and(eq(settings.key, key), isNull(settings.deletedAt)));

    if (existing[0]) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(settings.id, existing[0].id));
    } else {
      const now = new Date().toISOString();
      await db.insert(settings).values({
        id: generateId(),
        deviceId: getDeviceId(),
        createdAt: now,
        updatedAt: now,
        key,
        value,
        group,
      });
    }
  },

  remove: async (key: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(settings)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(settings.key, key));
  },

  initializeDefaults: async (): Promise<void> => {
    const defaults: { key: string; value: string; group: string }[] = [
      { key: "business_name", value: "My Business", group: "general" },
      { key: "currency_symbol", value: "$", group: "general" },
      { key: "currency_code", value: "USD", group: "general" },
      { key: "receipt_footer", value: "Thank you for your purchase!", group: "receipt" },
      { key: "receipt_show_tax", value: "true", group: "receipt" },
      { key: "tax_inclusive", value: "false", group: "tax" },
    ];

    for (const d of defaults) {
      const existing = await settingsRepository.get(d.key);
      if (existing === null) {
        await settingsRepository.set(d.key, d.value, d.group);
      }
    }
  },
};
