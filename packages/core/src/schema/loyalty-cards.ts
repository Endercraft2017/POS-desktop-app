import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns";

/**
 * Loyalty cards — physical punch cards, one row per printed QR.
 *
 * Each card holds up to 9 stamps in 3 reward tiers (3 stamps each). Tier 1
 * reward is unlocked at 3 stamps, tier 2 at 6, tier 3 at 9. `rewards_claimed_mask`
 * is a 3-bit field: bit 0 = tier 1 claimed, bit 1 = tier 2, bit 2 = tier 3.
 *
 * The 5-digit `code` is the value embedded in the QR (as part of the URL
 * `https://3ks.afkcube.com/?card=<CODE>`). Stored as TEXT so leading zeros
 * are preserved when printed.
 */
export const loyaltyCards = sqliteTable(
  "loyalty_cards",
  {
    ...baseColumns,
    code: text("code").notNull().unique(),
    customerName: text("customer_name"),
    stamps: integer("stamps").notNull().default(0),
    rewardsClaimedMask: integer("rewards_claimed_mask").notNull().default(0),
    lastSeenAt: text("last_seen_at"),
  },
  (table) => ({
    codeIdx: index("idx_loyalty_cards_code").on(table.code),
    lastSeenIdx: index("idx_loyalty_cards_last_seen").on(table.lastSeenAt),
  }),
);

export type LoyaltyCard = typeof loyaltyCards.$inferSelect;
export type NewLoyaltyCard = typeof loyaltyCards.$inferInsert;
