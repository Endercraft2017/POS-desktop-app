# Step 05 — Loyalty Card modal (UI)

> New component `LoyaltyCardModal`. Opens when a card is scanned, or when a row in the admin list is clicked. Shows: QR preview (top-left), editable name (bottom), 4×3 stamp / reward grid (right). Lets the staff add stamps and claim rewards.

---

## Layout (desktop / landscape)

```
+----------------------------------------------------------------+
|  [×]                                                            |
|                                                                 |
|  +-------------+    +-----+ +-----+ +-----+ +---------------+   |
|  |             |    | ✓   | | ✓   | | ✓   | | 🍟 CLAIMED   |   |
|  |    [QR]     |    +-----+ +-----+ +-----+ +---------------+   |
|  |             |    | ✓   | |     | |     | | 🥤 CLAIM     |   |
|  |  47391      |    +-----+ +-----+ +-----+ +---------------+   |
|  +-------------+    |     | |     | |     | | 🥟 LOCKED    |   |
|                     +-----+ +-----+ +-----+ +---------------+   |
|                                                                 |
|  Name: [____________________________________________]           |
|                                                                 |
|                              [Cancel]  [Save & close]           |
+----------------------------------------------------------------+
```

State per cell on the reward grid:
- **Empty stamp** (light circle): tapable → calls `loyaltyCardRepo.addStamp(id)`
- **Filled stamp** (✓): tapable → calls `removeStamp(id)` (admin only; cashiers see read-only)
- **Reward LOCKED**: greyed, shows reward icon + label, no action (row not yet full)
- **Reward CLAIM**: highlighted with the reward icon; tap → calls `claimReward(id, tier)`
- **Reward CLAIMED**: dim + check overlay; not interactive

The grid has **3 rows × 4 columns**. Row N's reward unlocks when `stamps >= N * 3`.

---

## Mobile / portrait layout

Stack vertically:

```
+-------------------------+
| [×]    Card 47391       |
|-------------------------|
|         [QR image]      |
|-------------------------|
| [stamp grid 4×3]        |
|-------------------------|
| Name: [____________]    |
|-------------------------|
| [Cancel] [Save & close] |
+-------------------------+
```

Switch via `useTheme().isMobile` / `isPortrait`.

---

## Component sketch

```tsx
// packages/desktop/src/renderer/components/ui/LoyaltyCardModal.tsx
interface Props {
  cardId: string;
  onClose: () => void;
}

export function LoyaltyCardModal({ cardId, onClose }: Props) {
  const { data: card } = useQuery({
    queryKey: ["loyalty-card", cardId],
    queryFn: () => loyaltyCardRepo.getById(cardId),
  });
  const queryClient = useQueryClient();
  const [nameDraft, setNameDraft] = useState(card?.customer_name ?? "");

  useEffect(() => { setNameDraft(card?.customer_name ?? ""); }, [card?.customer_name]);

  const addStamp = useMutation({
    mutationFn: () => loyaltyCardRepo.addStamp(cardId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loyalty-card", cardId] }),
  });
  const removeStamp = useMutation({ /* ... */ });
  const claimReward = useMutation({
    mutationFn: (tier: 1 | 2 | 3) => loyaltyCardRepo.claimReward(cardId, tier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loyalty-card", cardId] }),
  });
  const saveName = useMutation({
    mutationFn: () => loyaltyCardRepo.updateName(cardId, nameDraft.trim()),
    onSuccess: onClose,
  });

  if (!card) return null;

  return (
    <ModalShell onClose={onClose}>
      <div style={{ display: "flex", gap: spacing.lg }}>
        <QrPreview code={card.code} />
        <RewardGrid card={card} onStamp={addStamp.mutate} onUnstamp={removeStamp.mutate} onClaim={(t) => claimReward.mutate(t)} />
      </div>
      <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Customer name" />
      <button onClick={onClose}>Cancel</button>
      <button onClick={() => saveName.mutate()}>Save &amp; close</button>
    </ModalShell>
  );
}
```

---

## `RewardGrid` component

Per Q4 (overview), Kyle has already dropped four PNGs into [`User-made Resources/Loyalty Card pngs/`](../../User-made%20Resources/Loyalty%20Card%20pngs/):

| File | Used for |
|---|---|
| `Medium Fries.png` | Row 1 reward icon |
| `Large Shake.png` | Row 2 reward icon |
| `Empanada Special.png` | Row 3 reward icon |
| `Stamp.png` | **Replaces the filled-stamp visual** (instead of a plain gold circle) |

Import them in the modal — Vite will fingerprint + bundle them automatically:

```ts
import friesPng    from "../../../../User-made Resources/Loyalty Card pngs/Medium Fries.png";
import shakePng    from "../../../../User-made Resources/Loyalty Card pngs/Large Shake.png";
import empanadaPng from "../../../../User-made Resources/Loyalty Card pngs/Empanada Special.png";
import stampPng    from "../../../../User-made Resources/Loyalty Card pngs/Stamp.png";
```

The path has spaces — Vite handles that fine. If the imports prove brittle (e.g., on a rename), step 07's deploy can include a copy-to-`packages/desktop/src/renderer/assets/loyalty/` step with cleaner kebab-case names, but starting with direct imports keeps things simple.

The PNGs are large (200–900 KB each). At build time Vite emits them as separate hashed assets; the modal `<img>` tags reference the bundled URLs. The reward grid renders them at 48–64 px so file size doesn't affect on-screen scale.

```tsx
import friesPng    from "../../../../User-made Resources/Loyalty Card pngs/Medium Fries.png";
import shakePng    from "../../../../User-made Resources/Loyalty Card pngs/Large Shake.png";
import empanadaPng from "../../../../User-made Resources/Loyalty Card pngs/Empanada Special.png";

const REWARDS: Array<{ tier: 1 | 2 | 3; label: string; icon: string }> = [
  { tier: 1, label: "Medium Fries",       icon: friesPng },
  { tier: 2, label: "Large Powder Shake", icon: shakePng },
  { tier: 3, label: "Empanada Special",   icon: empanadaPng },
];

function RewardGrid({ card, onStamp, onUnstamp, onClaim }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
      {REWARDS.map(({ tier, label, icon }) => {
        const rowStart = (tier - 1) * 3;
        const filledInRow = clamp(card.stamps - rowStart, 0, 3);
        const claimed = (card.rewards_claimed_mask & (1 << (tier - 1))) !== 0;
        const claimable = filledInRow === 3 && !claimed;
        return (
          <Fragment key={tier}>
            {[0, 1, 2].map((slot) => (
              <StampCell
                key={slot}
                filled={slot < filledInRow}
                onClick={
                  slot === filledInRow
                    ? onStamp                                  // first empty slot in row → add stamp
                    : slot === filledInRow - 1
                      ? onUnstamp                              // most-recent filled → undo
                      : undefined
                }
              />
            ))}
            <RewardCell
              label={label}
              icon={icon}
              state={claimed ? "claimed" : claimable ? "claimable" : "locked"}
              onClick={claimable ? () => onClaim(tier) : undefined}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
```

Visual sketch of the cells in the user's amber palette:

| state | visual | notes |
|---|---|---|
| empty stamp | dashed amber circle on `surfaceElevated` | tap inserts a stamp |
| filled stamp | **`Stamp.png` rendered inside the circle** | full-bleed, centered; no checkmark needed since the asset is self-evident |
| locked reward | reward PNG dimmed (opacity 0.4) on `surfaceElevated` | icon visible but desaturated; no action |
| claimable reward | reward PNG at full opacity on `#fcad1d` background | subtle pulse to draw the eye; tap claims it |
| claimed reward | reward PNG on `colors.success` background with "✓ Claimed" overlay | not interactive |

`StampCell` markup when filled:

```tsx
<div className="stamp-cell filled">
  <img src={stampPng} alt="" />
</div>
```

When empty, no `<img>` — just the dashed-circle CSS. CSS keeps it square (`aspect-ratio: 1`) and centers the stamp image with `object-fit: contain`.

---

## QR preview at top-left

Two options:
- **A. Embedded `<img>`** pointing at `/app/loyalty-cards/<code>.png` (the seed script already wrote it). Fastest, zero JS.
- **B. Live-rendered** with `qrcode` in the renderer (works offline too). Slightly more code.

*Recommendation: A.* If the PNG file doesn't exist (e.g., a card created manually in admin, not via the seed script), fall back to B with a small `useEffect` that lazy-loads `qrcode` and renders to a `<canvas>`.

---

## Save behavior

- **Stamp / claim** mutations save immediately (no "Save" button needed for those — they're durable on tap, and the user expects instant feedback).
- **Name input** saves on:
  - Clicking "Save & close"
  - Pressing Enter in the input
- "Cancel" discards the name draft but preserves stamps/claims (those already saved).

---

## Error handling

Inline error bar at the top of the modal when any mutation fails:

```
⚠ Cannot claim Tier 2: need 6 stamps (have 5)
```

Auto-dismisses after 5 s OR on the next successful mutation.

---

## Acceptance check for this step

- [ ] Opens via scanner OR via clicking a row in admin list
- [ ] Tapping an empty stamp slot fills it (visually + DB)
- [ ] Filling the 3rd slot in a row makes the row's reward cell "claimable" (visual change)
- [ ] Tapping a claimable reward marks it claimed; visual changes to "claimed"
- [ ] Cannot claim a locked reward (cell isn't tappable)
- [ ] Cannot un-claim once claimed (read-only after that for staff; admin can void via the admin list — out of scope for v1)
- [ ] Name input edits + saves; closing without saving discards
- [ ] All mutations are immediately reflected in the admin list (cache invalidation works)
- [ ] Mobile/portrait layout stacks vertically and is usable at 360 px width
