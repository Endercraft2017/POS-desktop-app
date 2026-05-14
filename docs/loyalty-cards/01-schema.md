# Step 01 — Database Schema

> Add a `loyalty_cards` table to the core Drizzle schema. New file, no migrations needed on existing tables.

---

## New file: `packages/core/src/schema/loyalty-cards.ts`

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns"; // existing convention: id, device_id, created_at, updated_at, deleted_at

export const loyaltyCards = sqliteTable(
  "loyalty_cards",
  {
    ...baseColumns,
    // The 5-digit "arbitrary number" encoded in the QR. Unique across all cards.
    // Stored as TEXT (not INTEGER) so leading zeros are preserved when printed.
    code: text("code").notNull().unique(),
    // Editable label set by the admin when the card is first scanned.
    // NULL until an employee types a name. Per Q3 (overview): name is the
    // ONLY customer field — no phone, no email.
    customer_name: text("customer_name"),
    // 0..9 — total stamps collected across all 3 rows (3 per row).
    stamps: integer("stamps").notNull().default(0),
    // 3-bit bitmask: bit 0 = row 1 reward claimed, bit 1 = row 2, bit 2 = row 3.
    // Value 0 = none claimed, 7 = all claimed.
    rewards_claimed_mask: integer("rewards_claimed_mask").notNull().default(0),
    // ISO timestamp of last interaction (scan, stamp, claim). Useful for analytics
    // and for ordering the admin list by recency.
    last_seen_at: text("last_seen_at"),
  },
  (table) => ({
    codeIdx: index("idx_loyalty_cards_code").on(table.code),
    lastSeenIdx: index("idx_loyalty_cards_last_seen").on(table.last_seen_at),
  }),
);

export type LoyaltyCard = typeof loyaltyCards.$inferSelect;
export type NewLoyaltyCard = typeof loyaltyCards.$inferInsert;
```

---

## Update barrel export

`packages/core/src/schema/index.ts`:

```ts
export * from "./loyalty-cards";
```

(Insert alphabetically near `loyalty_rewards` from `coupons.ts` so it's easy to find.)

---

## Update type re-export

`packages/core/src/types/index.ts`:

```ts
export type { LoyaltyCard, NewLoyaltyCard } from "../schema/loyalty-cards";
```

---

## Design decisions

### Why `code` is TEXT, not INTEGER

Leading-zero codes (`00347`) are visually nicer on a printed sticker, and the QR encodes a URL so the underlying type doesn't matter. INTEGER would silently truncate `00347` → `347`.

### Why `stamps` as one counter instead of three

A single counter from 0–9 is dramatically simpler than three independent counters and the linear-progression mental model (row 1 must fill before row 2). Row N is full when `stamps >= N * 3`. The UI computes per-row state from this single value.

If we ever switch to **independent rows** (Q1.B in overview), I'd refactor to `row1_stamps`, `row2_stamps`, `row3_stamps`.

### Why `rewards_claimed_mask` is a bitmask, not three booleans

Same data, smaller schema. Three boolean columns is fine too — bitmask is just slightly more compact and trivial to query (`mask & 1`, `mask & 2`, `mask & 4`).

### Why `last_seen_at` is separate from `updated_at`

`updated_at` (from `baseColumns`) tracks any row change including admin edits. `last_seen_at` only updates when a customer-facing action happens (scan, stamp, claim). This lets us sort by "most recently active customers" without polluting by admin edits.

---

## Migrations

Since the codebase uses `db.exec("CREATE TABLE IF NOT EXISTS ...")` at startup (see `packages/desktop/src/main/database.ts`), there's no migration system to run. Drizzle infers the table from the schema; on first launch, the table is created.

**Verify before implementation:** open `packages/desktop/src/main/database.ts` and confirm the CREATE TABLE statements are generated from the schema, not hand-coded. If hand-coded, I'll also add a matching `CREATE TABLE IF NOT EXISTS loyalty_cards (...)` there.

---

## Cloud sync

The existing sync logic (`packages/core/src/services/sync.service.ts` per CODE_REGISTRY) likely either:
1. **Iterates the entire schema barrel and replicates every table** → adding `loyalty_cards` to the barrel auto-syncs it.
2. **Has an explicit allowlist** of tables to sync → need to add `loyalty_cards` to that list AND ensure the server's `pos-cloud.db` runs the same CREATE TABLE.

**Verify before implementation:** grep for `sync.service.ts` and look for a `SYNC_TABLES = [...]` or similar constant. If found, add `loyalty_cards` to it.

---

## Validation rules (in step 02 / repository)

- `code`: required, exactly 5 digits, unique
- `stamps`: clamped 0..9
- `rewards_claimed_mask`: clamped 0..7
- Cannot mark `rewards_claimed_mask` bit N as 1 unless `stamps >= (N+1) * 3` (can't claim row 2 reward without filling row 2)
- Cannot decrement `stamps` past a row whose reward is already claimed (refund flow could undo this; will surface as a separate consideration if needed)

---

## Acceptance check for this step

- [ ] `pnpm --filter @pos/core typecheck` passes after schema + types added
- [ ] On a fresh local DB, `SELECT name FROM sqlite_master WHERE type='table' AND name='loyalty_cards';` returns one row
- [ ] `INSERT INTO loyalty_cards (id, device_id, code, stamps, rewards_claimed_mask, created_at, updated_at) VALUES (...)` works
- [ ] Existing tables / queries unchanged
