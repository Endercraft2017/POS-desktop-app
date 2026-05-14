# Step 02 — Repository (renderer)

> Add `loyaltyCardRepo` to `packages/desktop/src/renderer/lib/repositories.ts`, following the existing pattern (raw SQL via the IPC bridge — see how `customerRepo` and `orderRepo` are structured).

---

## Repository surface

```ts
// packages/desktop/src/renderer/lib/repositories.ts

export interface LoyaltyCardRow {
  id: string;
  code: string;
  customer_name: string | null;
  stamps: number;
  rewards_claimed_mask: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const loyaltyCardRepo = {
  // Admin list view — newest activity first.
  listAll(): Promise<LoyaltyCardRow[]>;

  // Scanner path — single round-trip lookup by the QR-embedded code.
  // Returns null if no card with that code exists (e.g., someone scanned
  // a foreign QR; the modal opens with a "not found" state).
  getByCode(code: string): Promise<LoyaltyCardRow | null>;

  getById(id: string): Promise<LoyaltyCardRow | null>;

  // Used once by the bulk-seed script (Step 03).
  create(args: { code: string; customer_name?: string | null }): Promise<LoyaltyCardRow>;

  // Admin edits the customer's display name.
  updateName(id: string, name: string): Promise<void>;

  // Cashier ticks an empty stamp slot. Clamps at 9.
  // Also bumps last_seen_at.
  addStamp(id: string): Promise<LoyaltyCardRow>;

  // Cashier undoes an accidental stamp.
  removeStamp(id: string): Promise<LoyaltyCardRow>;

  // tier is 1, 2, or 3. Validates that stamps >= tier * 3.
  // Sets the corresponding bit in rewards_claimed_mask.
  claimReward(id: string, tier: 1 | 2 | 3): Promise<LoyaltyCardRow>;

  // Soft-delete (sets deleted_at). Cloud-sync treats this as a tombstone.
  // Use case: a physical card is lost / reissued.
  softDelete(id: string): Promise<void>;
};
```

---

## Implementation notes

### SQL pattern (mirrors `customerRepo` / `orderRepo`)

```ts
listAll: async () => {
  return dbQuery<LoyaltyCardRow>(
    `SELECT * FROM loyalty_cards
     WHERE deleted_at IS NULL
     ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
  );
},

getByCode: async (code: string) => {
  const rows = await dbQuery<LoyaltyCardRow>(
    `SELECT * FROM loyalty_cards WHERE code = ? AND deleted_at IS NULL LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
},

create: async ({ code, customer_name }: { code: string; customer_name?: string | null }) => {
  const id = ulid();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO loyalty_cards
       (id, device_id, code, customer_name, stamps, rewards_claimed_mask,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, getDeviceId(), code, customer_name ?? null, now, now],
  );
  return (await loyaltyCardRepo.getById(id))!;
},

addStamp: async (id: string) => {
  const now = new Date().toISOString();
  // Clamp at 9 and bump last_seen_at atomically.
  await dbRun(
    `UPDATE loyalty_cards
        SET stamps = MIN(stamps + 1, 9),
            last_seen_at = ?,
            updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [now, now, id],
  );
  return (await loyaltyCardRepo.getById(id))!;
},

claimReward: async (id, tier) => {
  const card = await loyaltyCardRepo.getById(id);
  if (!card) throw new Error("card not found");
  const required = tier * 3;
  if (card.stamps < required) {
    throw new Error(`need ${required} stamps to claim tier ${tier}, have ${card.stamps}`);
  }
  const bit = 1 << (tier - 1);
  if (card.rewards_claimed_mask & bit) {
    throw new Error(`tier ${tier} reward already claimed`);
  }
  const newMask = card.rewards_claimed_mask | bit;
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE loyalty_cards
        SET rewards_claimed_mask = ?, last_seen_at = ?, updated_at = ?
      WHERE id = ?`,
    [newMask, now, now, id],
  );
  return (await loyaltyCardRepo.getById(id))!;
},
```

`getDeviceId()` and `ulid()` are already used by other repos in this file.

---

## Validation policy (where it lives)

All validation happens **inside the repo functions**, not in the UI. The modal calls `addStamp(id)` and trusts the repo to clamp / reject. This keeps the rules in one place.

The UI handles the *error display* — wraps each call in try/catch and shows an inline error if the repo throws ("Tier 2 reward already claimed", "Already at 9 stamps", etc.).

---

## React Query keys

Match the existing convention from `orderRepo`:

```ts
queryKey: ["loyalty-cards", "all"]              // list view
queryKey: ["loyalty-card", id]                  // single card
queryKey: ["loyalty-card", "by-code", code]     // scan lookup
```

After every mutation (addStamp, claimReward, updateName), invalidate `["loyalty-cards"]` (with prefix invalidation) so list + detail both refresh.

---

## Acceptance check for this step

- [ ] Renderer compiles after adding repo
- [ ] `await loyaltyCardRepo.create({ code: "47391" })` inserts a row and returns it
- [ ] `getByCode("47391")` returns the same row
- [ ] `addStamp(id)` increments and clamps at 9 (call 10× → stamps = 9)
- [ ] `claimReward(id, 1)` throws when stamps < 3
- [ ] `claimReward(id, 1)` twice in a row throws on the second call
- [ ] `softDelete(id)` makes `listAll()` and `getByCode()` exclude the row
