import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { loyaltyCardRepo } from "../../lib/repositories";
import type { LoyaltyCardRow } from "../../lib/repositories";

// Optimized 192×192 PNGs auto-generated from the originals in
// User-made Resources/Loyalty Card pngs/ (~1.78 MB) → ~150 KB total.
// Regenerate via packages/desktop/scripts/optimize-loyalty-assets.ps1.
import friesPng from "../../assets/loyalty/medium-fries.png";
import shakePng from "../../assets/loyalty/large-shake.png";
import empanadaPng from "../../assets/loyalty/empanada-special.png";
import stampPng from "../../assets/loyalty/stamp.png";

const REWARDS: Array<{ tier: 1 | 2 | 3; label: string; icon: string }> = [
  { tier: 1, label: "Medium Fries", icon: friesPng },
  { tier: 2, label: "Large Powder Shake", icon: shakePng },
  { tier: 3, label: "Empanada Special", icon: empanadaPng },
];

interface Props {
  cardId: string;
  onClose: () => void;
}

export function LoyaltyCardModal({ cardId, onClose }: Props) {
  const { colors, spacing, borderRadius, fontSize, isMobile, isPortrait } = useTheme();
  const queryClient = useQueryClient();
  const [nameDraft, setNameDraft] = useState("");
  const [error, setError] = useState("");

  const { data: card, isLoading } = useQuery({
    queryKey: ["loyalty-card", cardId],
    queryFn: () => loyaltyCardRepo.getById(cardId),
  });

  // Sync the draft when the underlying card name changes
  const cardName = card?.customer_name ?? null;
  const cardNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (cardName !== cardNameRef.current) {
      setNameDraft(cardName ?? "");
      cardNameRef.current = cardName;
    }
  }, [cardName]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["loyalty-card", cardId] });
    queryClient.invalidateQueries({ queryKey: ["loyalty-cards", "all"] });
  }

  const addStamp = useMutation({
    mutationFn: () => loyaltyCardRepo.addStamp(cardId),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const removeStamp = useMutation({
    mutationFn: () => loyaltyCardRepo.removeStamp(cardId),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const claimReward = useMutation({
    mutationFn: (tier: 1 | 2 | 3) => loyaltyCardRepo.claimReward(cardId, tier),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const saveName = useMutation({
    mutationFn: () => loyaltyCardRepo.updateName(cardId, nameDraft),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  if (isLoading || !card) {
    return (
      <Backdrop onClose={onClose}>
        <div style={{ padding: spacing.lg, color: colors.textTertiary, fontSize: fontSize.sm }}>
          Loading card…
        </div>
      </Backdrop>
    );
  }

  // QR PNG is served from /app/loyalty-cards/<code>.png after deploy-web.bat
  const qrSrc = `/app/loyalty-cards/${encodeURIComponent(card.code)}.png`;
  const stack = isMobile && isPortrait;

  return (
    <Backdrop onClose={onClose}>
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          width: stack ? "min(420px, 100%)" : "min(720px, 95vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
        }}
      >
        <ModalHeader code={card.code} onClose={onClose} />

        {error && (
          <div
            onClick={() => setError("")}
            style={{
              fontSize: fontSize.xs,
              color: colors.error,
              backgroundColor: colors.errorLight,
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
            }}
          >
            {error} <span style={{ opacity: 0.6 }}>(tap to dismiss)</span>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: stack ? "column" : "row",
            gap: spacing.lg,
            alignItems: stack ? "stretch" : "flex-start",
          }}
        >
          <QrPreview src={qrSrc} code={card.code} stack={stack} />
          <RewardGrid
            card={card}
            onStamp={() => addStamp.mutate()}
            onUnstamp={() => removeStamp.mutate()}
            onClaim={(t) => claimReward.mutate(t)}
            busy={addStamp.isPending || removeStamp.isPending || claimReward.isPending}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
          <label style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
            Customer name
          </label>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName.mutate();
            }}
            placeholder="e.g. Cheng De Leon"
            style={{
              padding: `${spacing.xs + 2}px ${spacing.sm}px`,
              fontSize: fontSize.md,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
              backgroundColor: colors.background,
              color: colors.textPrimary,
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing.sm }}>
          <button
            onClick={onClose}
            style={{
              padding: `${spacing.xs + 2}px ${spacing.md}px`,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
              backgroundColor: colors.surface,
              color: colors.textSecondary,
              fontSize: fontSize.sm,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => saveName.mutate()}
            disabled={saveName.isPending}
            style={{
              padding: `${spacing.xs + 2}px ${spacing.md}px`,
              border: "none",
              borderRadius: borderRadius.md,
              backgroundColor: colors.primary,
              color: colors.textOnPrimary,
              fontSize: fontSize.sm,
              fontWeight: 600,
              cursor: saveName.isPending ? "wait" : "pointer",
              opacity: saveName.isPending ? 0.7 : 1,
            }}
          >
            {saveName.isPending ? "Saving…" : "Save & close"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        backgroundColor: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ModalHeader({ code, onClose }: { code: string; onClose: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
          Loyalty card
        </div>
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontFamily: "monospace" }}>
          #{code}
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          border: "none",
          background: "transparent",
          color: colors.textTertiary,
          fontSize: fontSize.xl,
          cursor: "pointer",
          padding: spacing.xs,
        }}
      >
        ✕
      </button>
    </div>
  );
}

function QrPreview({ src, code, stack }: { src: string; code: string; stack: boolean }) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const [errored, setErrored] = useState(false);
  return (
    <div
      style={{
        flexShrink: 0,
        width: stack ? "100%" : 220,
        backgroundColor: colors.background,
        borderRadius: borderRadius.md,
        padding: spacing.sm,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: spacing.xs,
        border: `1px solid ${colors.border}`,
      }}
    >
      {errored ? (
        <div
          style={{
            width: stack ? 200 : "100%",
            aspectRatio: "1 / 1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.textTertiary,
            fontSize: fontSize.xs,
            textAlign: "center",
            padding: spacing.sm,
          }}
        >
          QR PNG not deployed yet. Run the seed script + deploy-web.bat.
        </div>
      ) : (
        <img
          src={src}
          alt={`QR for card ${code}`}
          onError={() => setErrored(true)}
          style={{
            width: stack ? 200 : "100%",
            height: "auto",
            display: "block",
            imageRendering: "pixelated",
          }}
        />
      )}
      <div style={{ fontFamily: "monospace", fontSize: fontSize.sm, color: colors.textSecondary }}>
        #{code}
      </div>
    </div>
  );
}

function RewardGrid({
  card,
  onStamp,
  onUnstamp,
  onClaim,
  busy,
}: {
  card: LoyaltyCardRow;
  onStamp: () => void;
  onUnstamp: () => void;
  onClaim: (tier: 1 | 2 | 3) => void;
  busy: boolean;
}) {
  const { spacing } = useTheme();
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: spacing.xs,
      }}
    >
      {REWARDS.map(({ tier, label, icon }) => {
        const rowStart = (tier - 1) * 3;
        const filled = Math.max(0, Math.min(card.stamps - rowStart, 3));
        const claimed = (card.rewards_claimed_mask & (1 << (tier - 1))) !== 0;
        const claimable = filled === 3 && !claimed;
        return (
          <React.Fragment key={tier}>
            {[0, 1, 2].map((slot) => (
              <StampCell
                key={slot}
                filled={slot < filled}
                isNextEmpty={slot === filled}
                isMostRecentFilled={slot === filled - 1}
                onStamp={onStamp}
                onUnstamp={onUnstamp}
                disabled={busy}
              />
            ))}
            <RewardCell
              label={label}
              icon={icon}
              state={claimed ? "claimed" : claimable ? "claimable" : "locked"}
              onClick={claimable && !busy ? () => onClaim(tier) : undefined}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StampCell({
  filled,
  isNextEmpty,
  isMostRecentFilled,
  onStamp,
  onUnstamp,
  disabled,
}: {
  filled: boolean;
  isNextEmpty: boolean;
  isMostRecentFilled: boolean;
  onStamp: () => void;
  onUnstamp: () => void;
  disabled: boolean;
}) {
  const { colors, borderRadius } = useTheme();
  const interactive = !disabled && (isNextEmpty || isMostRecentFilled);
  const onClick = interactive ? (filled ? onUnstamp : onStamp) : undefined;
  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      style={{
        aspectRatio: "1 / 1",
        borderRadius: "50%",
        border: filled ? `2px solid #6b2e00` : `2px dashed #b08550`,
        backgroundColor: filled ? colors.surface : "transparent",
        cursor: interactive ? "pointer" : "default",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: "background-color 0.1s",
      }}
    >
      {filled ? (
        <img
          src={stampPng}
          alt=""
          style={{ width: "85%", height: "85%", objectFit: "contain" }}
        />
      ) : null}
    </button>
  );
}

function RewardCell({
  label,
  icon,
  state,
  onClick,
}: {
  label: string;
  icon: string;
  state: "locked" | "claimable" | "claimed";
  onClick?: () => void;
}) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const bg =
    state === "claimable" ? "#fcad1d" : state === "claimed" ? colors.success : colors.surfaceElevated;
  const fg = state === "claimable" ? "#3d1f00" : state === "claimed" ? colors.textOnPrimary : colors.textSecondary;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        aspectRatio: "1 / 1",
        borderRadius: borderRadius.md,
        border: "none",
        padding: spacing.xs,
        backgroundColor: bg,
        color: fg,
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        textAlign: "center",
        opacity: state === "locked" ? 0.55 : 1,
        animation: state === "claimable" ? "loyalty-pulse 1.4s ease-in-out infinite" : "none",
      }}
    >
      <img
        src={icon}
        alt=""
        style={{
          width: "55%",
          maxHeight: "55%",
          objectFit: "contain",
          filter: state === "claimed" ? "grayscale(0.3)" : "none",
        }}
      />
      <span style={{ fontSize: fontSize.xs, fontWeight: 600, lineHeight: 1.1 }}>{label}</span>
      <span style={{ fontSize: fontSize.xs, opacity: 0.85, lineHeight: 1 }}>
        {state === "claimed" ? "✓ Claimed" : state === "claimable" ? "Tap to claim" : "Locked"}
      </span>
    </button>
  );
}
