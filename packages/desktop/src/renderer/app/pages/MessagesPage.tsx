import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import {
  fetchThreads,
  fetchThreadMessages,
  isScrapedThread,
  displayName,
  sendMessage,
  triggerSync,
  parseAttachments,
  storeAttachment,
  downloadAttachment,
  type MessengerMessage,
  type MessengerAttachment,
} from "../../lib/messenger-api";

const FIVE_MIN_MS = 5 * 60 * 1000;

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function ScrapeBadge() {
  const { colors, borderRadius, fontSize } = useTheme();
  return (
    <span
      style={{
        fontSize: fontSize.xs,
        fontWeight: 600,
        color: colors.textOnPrimary,
        backgroundColor: colors.warning,
        padding: "1px 6px",
        borderRadius: borderRadius.sm,
        marginLeft: 6,
      }}
      title="Scraped via the messenger-watch headless watcher — replies aren't available."
    >
      scraped
    </span>
  );
}

// Width of the mobile drawer in px. min(85vw, 320). Computed lazily.
function getDrawerWidth(): number {
  if (typeof window === "undefined") return 320;
  return Math.min(window.innerWidth * 0.85, 320);
}

export function MessagesPage() {
  const { colors, spacing, borderRadius, fontSize, isMobile } = useTheme();
  const queryClient = useQueryClient();
  const [selectedPsid, setSelectedPsid] = useState<string | null>(null);
  const [hoveredPsid, setHoveredPsid] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Sidebar starts open — on mobile so the user immediately sees the thread list;
  // on desktop it stays open and the burger button is hidden, so this state is moot.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Live drag offset for the mobile drawer (px). Positive = pulling open;
  // negative = pushing closed. Resets to 0 after a touch ends (and the
  // committed sidebarOpen state takes over).
  const [swipeOffset, setSwipeOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const threadsQuery = useQuery({
    queryKey: ["messenger-threads"],
    queryFn: fetchThreads,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const messagesQuery = useQuery({
    queryKey: ["messenger-thread", selectedPsid],
    queryFn: () => (selectedPsid ? fetchThreadMessages(selectedPsid) : Promise.resolve({ messages: [], display_name: "" })),
    enabled: !!selectedPsid,
    refetchInterval: selectedPsid ? 3000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: ({ psid, text }: { psid: string; text: string }) => sendMessage(psid, text),
    onSuccess: () => {
      setDraft("");
      // Pull the new outbound row into the thread and refresh thread list ordering
      if (selectedPsid) queryClient.invalidateQueries({ queryKey: ["messenger-thread", selectedPsid] });
      queryClient.invalidateQueries({ queryKey: ["messenger-threads"] });
    },
  });

  // Reset the draft when switching threads + nudge the server to pull deltas now
  // so the user doesn't have to wait for the next 20s tick to see recent messages.
  useEffect(() => {
    setDraft("");
    sendMutation.reset();
    if (!selectedPsid) return;
    triggerSync().then(() => {
      queryClient.invalidateQueries({ queryKey: ["messenger-thread", selectedPsid] });
      queryClient.invalidateQueries({ queryKey: ["messenger-threads"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPsid]);

  // Auto-select first thread on first successful load — desktop only. On mobile,
  // the user should see the thread list first and pick a conversation themselves.
  useEffect(() => {
    if (isMobile) return;
    if (!selectedPsid && threadsQuery.data && threadsQuery.data.length > 0) {
      setSelectedPsid(threadsQuery.data[0].psid);
    }
  }, [threadsQuery.data, selectedPsid, isMobile]);

  // On mobile, if nothing is selected, make sure the drawer is open so the user
  // can pick something. Once they pick, we close it for them.
  useEffect(() => {
    if (isMobile && !selectedPsid) setSidebarOpen(true);
  }, [isMobile, selectedPsid]);

  // Scroll to newest message whenever the list grows
  const msgCount = messagesQuery.data?.messages.length ?? 0;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgCount, selectedPsid]);

  // Refs that mirror the latest state values so the long-lived touch listeners
  // always see fresh data without re-binding on every render.
  const sidebarOpenRef = useRef(sidebarOpen);
  const swipeOffsetRef = useRef(swipeOffset);
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);
  useEffect(() => { swipeOffsetRef.current = swipeOffset; }, [swipeOffset]);

  // Touch gestures for the mobile drawer.
  //   - Swipe from the left ~24 px edge while closed → drag open, snap at 40%
  //   - Swipe horizontally while open → drag closed, snap at 40%
  // React's synthetic touch events are passive, so preventDefault wouldn't work
  // for stopping the page from scrolling once we've committed to a horizontal
  // drag. Attaching native listeners with {passive: false} fixes that.
  useEffect(() => {
    if (!isMobile) return;
    const el = containerRef.current;
    if (!el) return;

    // Edge zone width for "swipe from left to open". Deliberately wider than
    // Android's system back-gesture zone (~16-24 dp) so a user who starts their
    // swipe a little inboard from the very edge lands in OUR zone, not the OS's.
    const EDGE_PX = 80;
    const AXIS_LOCK_PX = 8;
    let startX = 0;
    let startY = 0;
    let mode: "opening" | "closing" | null = null;
    let lockedHorizontal = false;
    // Snapshot of sidebarOpen at touch-start, captured via ref so the listener
    // closure doesn't go stale across renders.
    let openAtStart = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      openAtStart = sidebarOpenRef.current;
      if (openAtStart) {
        // Drag-to-close: start anywhere except deep inside the conversation list scroll
        startX = t.clientX;
        startY = t.clientY;
        mode = "closing";
        lockedHorizontal = false;
      } else if (t.clientX <= EDGE_PX) {
        // Drag-to-open: only from the left edge zone
        startX = t.clientX;
        startY = t.clientY;
        mode = "opening";
        lockedHorizontal = false;
      } else {
        mode = null;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!mode) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!lockedHorizontal) {
        if (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX) {
          if (Math.abs(dy) > Math.abs(dx)) {
            // User is scrolling vertically — abort the gesture
            mode = null;
            setSwipeOffset(0);
            return;
          }
          lockedHorizontal = true;
        } else {
          return;
        }
      }
      // We've committed to a horizontal drag: stop the page from also scrolling.
      e.preventDefault();
      const w = getDrawerWidth();
      if (mode === "opening") {
        setSwipeOffset(Math.max(0, Math.min(w, dx)));
      } else {
        setSwipeOffset(Math.max(-w, Math.min(0, dx)));
      }
    };

    const onEnd = () => {
      if (!mode || !lockedHorizontal) {
        mode = null;
        setSwipeOffset(0);
        return;
      }
      const w = getDrawerWidth();
      const threshold = w * 0.4;
      if (mode === "opening" && swipeOffsetRef.current > threshold) {
        setSidebarOpen(true);
      } else if (mode === "closing" && swipeOffsetRef.current < -threshold) {
        setSidebarOpen(false);
      }
      mode = null;
      setSwipeOffset(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [isMobile]);

  // OS / browser back-gesture → OPEN the drawer instead of leaving the page.
  //
  // We push a history sentinel so a back press fires popstate without changing
  // the route. Critical detail: HashRouter stores its own state object
  // (idx/key/usr) in window.history.state. If we replace it with a bare
  // sentinel, the router treats the next popstate as a corrupted location
  // and may navigate away anyway. So we SPREAD the router's existing state
  // and just tag it with our sentinel flag. That keeps the router happy
  // while still giving us a state we can recognize on the way back.
  useEffect(() => {
    if (!isMobile) return;

    function pushSentinel() {
      const cur = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...cur, __msgDrawerSentinel: true }, "");
    }
    pushSentinel();

    const onPop = () => {
      // The user pressed back. Always open the drawer (per design — close is
      // via tap-outside / tap-thread / burger) and re-arm the sentinel.
      setSidebarOpen(true);
      pushSentinel();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // If our sentinel is still on top of the history stack, pop it so we
      // don't pollute history. (If the user navigated forward via the global
      // nav, the top state belongs to that page and we must leave it alone.)
      const s = window.history.state as { __msgDrawerSentinel?: boolean } | null;
      if (s && s.__msgDrawerSentinel) {
        window.history.back();
      }
    };
  }, [isMobile]);

  const threads = threadsQuery.data ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const selectedDisplayName = messagesQuery.data?.display_name ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Page header is desktop-only; on mobile the per-thread header already shows what matters and we want every pixel for the conversation. */}
      {!isMobile && (
        <Header
          threadsCount={threads.length}
          loading={threadsQuery.isFetching}
          error={threadsQuery.error}
        />
      )}
      <div
        ref={containerRef}
        style={{ flex: 1, display: "flex", overflow: "hidden", borderTop: `1px solid ${colors.border}`, position: "relative" }}
      >
        {/* Backdrop opacity tracks the drawer's open progress so it fades in
            smoothly while the user drags the sheet. */}
        {isMobile && (() => {
          const w = typeof window !== "undefined" ? Math.min(window.innerWidth * 0.85, 320) : 320;
          const base = sidebarOpen ? 1 : 0;
          const progress = Math.max(0, Math.min(1, base + swipeOffset / w));
          if (progress <= 0) return null;
          return (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: `rgba(0,0,0,${0.4 * progress})`,
                zIndex: 5,
                // Don't intercept touches when the drawer is fully closed (progress 0 is skipped above)
                pointerEvents: sidebarOpen ? "auto" : "none",
              }}
            />
          );
        })()}
        {/* Thread list — inline on desktop, slide-in drawer on mobile.
            On mobile the transform combines the committed open state with the
            live drag offset so the drawer follows the finger. */}
        <aside
          style={
            isMobile
              ? (() => {
                  const w = typeof window !== "undefined" ? Math.min(window.innerWidth * 0.85, 320) : 320;
                  const baseX = sidebarOpen ? 0 : -w;
                  const x = Math.max(-w, Math.min(0, baseX + swipeOffset));
                  const dragging = swipeOffset !== 0;
                  return {
                    position: "absolute" as const,
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: w,
                    zIndex: 10,
                    borderRight: `1px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    overflowY: "auto" as const,
                    display: "flex" as const,
                    flexDirection: "column" as const,
                    boxShadow: x > -w ? "4px 0 16px rgba(0,0,0,0.3)" : "none",
                    transform: `translateX(${x}px)`,
                    // Disable the spring while the finger is moving — we want
                    // it to follow exactly — and re-enable for the snap.
                    transition: dragging ? "none" : "transform 0.2s ease",
                    // Prevent the OS from interpreting horizontal drags on the
                    // drawer itself as page-back navigation.
                    touchAction: "pan-y" as const,
                  };
                })()
              : {
                  width: 280,
                  flexShrink: 0,
                  borderRight: `1px solid ${colors.border}`,
                  backgroundColor: colors.surface,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                }
          }
        >
          {threads.length === 0 && !threadsQuery.isLoading && (
            <div style={{ padding: spacing.md, color: colors.textTertiary, fontSize: fontSize.sm }}>
              No conversations yet. New messages will appear here when the watcher detects them.
            </div>
          )}
          {threadsQuery.isLoading && (
            <div style={{ padding: spacing.md, color: colors.textTertiary, fontSize: fontSize.sm }}>Loading…</div>
          )}
          {threads.map((t) => {
            const active = t.psid === selectedPsid;
            const hovered = t.psid === hoveredPsid;
            const isNew = Date.now() - new Date(t.last_at).getTime() < FIVE_MIN_MS;
            return (
              <button
                key={t.psid}
                onClick={() => {
                  setSelectedPsid(t.psid);
                  if (isMobile) setSidebarOpen(false);
                }}
                onMouseEnter={() => setHoveredPsid(t.psid)}
                onMouseLeave={() => setHoveredPsid(null)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  border: "none",
                  borderBottom: `1px solid ${colors.border}`,
                  backgroundColor: active ? colors.primary : hovered ? colors.surfaceElevated : "transparent",
                  color: active ? colors.textOnPrimary : colors.textPrimary,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background-color 0.1s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", width: "100%", gap: spacing.xs }}>
                  {t.profile_pic ? (
                    <img
                      src={t.profile_pic}
                      alt=""
                      width={28}
                      height={28}
                      style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        flexShrink: 0,
                        backgroundColor: active ? colors.textOnPrimary : colors.surfaceElevated,
                        color: active ? colors.primary : colors.textSecondary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: fontSize.xs,
                        fontWeight: 700,
                      }}
                    >
                      {(t.display_name || t.psid).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: fontSize.sm, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName(t.psid, t.display_name)}
                  </span>
                  <span style={{ fontSize: fontSize.xs, color: active ? colors.textOnPrimary : colors.textTertiary, flexShrink: 0 }}>
                    {formatRelative(t.last_at)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, width: "100%" }}>
                  <span
                    style={{
                      fontSize: fontSize.xs,
                      color: active ? colors.textOnPrimary : colors.textSecondary,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.last_direction === "out" ? "You: " : ""}
                    {t.last_text || "(no preview)"}
                  </span>
                  {isNew && !active && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: colors.primary,
                        flexShrink: 0,
                      }}
                      title="New within the last 5 minutes"
                    />
                  )}
                </div>
                {isScrapedThread(t.psid) && (
                  <div style={{ marginTop: 2 }}>
                    <ScrapeBadge />
                  </div>
                )}
              </button>
            );
          })}
        </aside>

        {/* Selected thread messages */}
        <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: colors.background, minWidth: 0 }}>
          {!selectedPsid ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: spacing.sm, color: colors.textTertiary, fontSize: fontSize.sm, padding: spacing.md, textAlign: "center" }}>
              {isMobile && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Show conversations"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.xs,
                    padding: `${spacing.xs + 2}px ${spacing.md}px`,
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.md,
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    fontSize: fontSize.sm,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <BurgerIcon color={colors.textPrimary} /> Conversations
                </button>
              )}
              <span>{isMobile ? "Tap the menu to pick a conversation." : "Select a conversation to view messages."}</span>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.sm,
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderBottom: `1px solid ${colors.border}`,
                  backgroundColor: colors.surface,
                }}
              >
                {isMobile && (
                  <button
                    onClick={() => setSidebarOpen((o) => !o)}
                    aria-label={sidebarOpen ? "Hide conversations" : "Show conversations"}
                    style={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.surface,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <BurgerIcon color={colors.textPrimary} />
                  </button>
                )}
                <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {displayName(selectedPsid, selectedDisplayName)}
                </div>
                {isScrapedThread(selectedPsid) && <ScrapeBadge />}
                <div style={{ marginLeft: "auto", fontSize: fontSize.xs, color: colors.textTertiary, flexShrink: 0 }}>
                  {messages.length} messages
                  {messagesQuery.isFetching && " · refreshing…"}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: spacing.md, display: "flex", flexDirection: "column", gap: spacing.sm }}>
                {messagesQuery.isLoading && (
                  <div style={{ color: colors.textTertiary, fontSize: fontSize.sm }}>Loading messages…</div>
                )}
                {messages.length === 0 && !messagesQuery.isLoading && (
                  <div style={{ color: colors.textTertiary, fontSize: fontSize.sm }}>No messages in this thread.</div>
                )}
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    onStored={() => {
                      if (selectedPsid) {
                        queryClient.invalidateQueries({ queryKey: ["messenger-thread", selectedPsid] });
                      }
                    }}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {isScrapedThread(selectedPsid) ? (
                <div
                  style={{
                    padding: `${spacing.xs}px ${spacing.md}px`,
                    borderTop: `1px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    fontSize: fontSize.xs,
                    color: colors.textTertiary,
                  }}
                >
                  Read-only: this thread was detected by the headless watcher and has no Graph PSID. Reply in Meta Business Suite directly.
                </div>
              ) : (
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSend={() => {
                    const text = draft.trim();
                    if (!text || !selectedPsid || sendMutation.isPending) return;
                    sendMutation.mutate({ psid: selectedPsid, text });
                  }}
                  sending={sendMutation.isPending}
                  error={sendMutation.error instanceof Error ? sendMutation.error.message : null}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function BurgerIcon({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3, width: 16 }} aria-hidden="true">
      <span style={{ width: "100%", height: 2, backgroundColor: color, borderRadius: 1 }} />
      <span style={{ width: "100%", height: 2, backgroundColor: color, borderRadius: 1 }} />
      <span style={{ width: "100%", height: 2, backgroundColor: color, borderRadius: 1 }} />
    </span>
  );
}

function Header({ threadsCount, loading, error }: { threadsCount: number; loading: boolean; error: unknown }) {
  const { colors, spacing, fontSize } = useTheme();
  const errMsg = error ? (error instanceof Error ? error.message : String(error)) : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: colors.surface,
      }}
    >
      <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>Messages</div>
      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
        {threadsCount} {threadsCount === 1 ? "conversation" : "conversations"}
        {loading && " · refreshing…"}
      </div>
      {errMsg && (
        <div
          style={{
            marginLeft: "auto",
            fontSize: fontSize.xs,
            color: colors.error,
            maxWidth: 320,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={errMsg}
        >
          {errMsg}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, onStored }: { msg: MessengerMessage; onStored: () => void }) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const isOut = msg.direction === "out";
  const attachments = parseAttachments(msg.attachments);
  const hasText = !!(msg.text && msg.text.trim());
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOut ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          padding: `${spacing.xs + 2}px ${spacing.sm + 2}px`,
          borderRadius: borderRadius.md,
          backgroundColor: isOut ? colors.primary : colors.surface,
          color: isOut ? colors.textOnPrimary : colors.textPrimary,
          fontSize: fontSize.sm,
          border: isOut ? "none" : `1px solid ${colors.border}`,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          display: "flex",
          flexDirection: "column",
          gap: spacing.xs,
        }}
      >
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
            {attachments.map((a, i) => (
              <AttachmentView
                key={i}
                attachment={a}
                messageId={msg.id}
                index={i}
                isOut={isOut}
                onStored={onStored}
              />
            ))}
          </div>
        )}
        {hasText && <div>{msg.text}</div>}
        {!hasText && attachments.length === 0 && <div>(no text)</div>}
        <div
          style={{
            fontSize: fontSize.xs,
            opacity: 0.7,
            color: isOut ? colors.textOnPrimary : colors.textTertiary,
          }}
        >
          {new Date(msg.created_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function AttachmentView({
  attachment,
  messageId,
  index,
  isOut,
  onStored,
}: {
  attachment: MessengerAttachment;
  messageId: string;
  index: number;
  isOut: boolean;
  onStored: () => void;
}) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [storing, setStoring] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = attachment.payload?.url;
  const isStored = !!attachment.payload?.stored;

  async function handleDownload() {
    if (downloading) return;
    setErr(null);
    setDownloading(true);
    try {
      await downloadAttachment(messageId, index, attachment.payload?.name || undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function handleStore() {
    if (storing || isStored) return;
    setErr(null);
    setStoring(true);
    try {
      await storeAttachment(messageId, index);
      onStored();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStoring(false);
    }
  }

  // Pill colors flip based on inbound/outbound bubble so they stay legible.
  const pillBg = isOut ? "rgba(255,255,255,0.18)" : colors.surfaceElevated;
  const pillColor = isOut ? colors.textOnPrimary : colors.textPrimary;
  const pillBorder = isOut ? "rgba(255,255,255,0.25)" : colors.border;

  const buttonRow = (
    <div style={{ display: "flex", gap: spacing.xs, flexWrap: "wrap" }}>
      <button
        onClick={handleDownload}
        disabled={downloading || !url}
        style={pillStyle(pillBg, pillColor, pillBorder, borderRadius, fontSize, spacing, downloading)}
      >
        {downloading ? "Downloading…" : "Download"}
      </button>
      <button
        onClick={handleStore}
        disabled={storing || isStored || !url}
        title={isStored ? "Saved to server — won't expire" : "Save a permanent copy on the server"}
        style={pillStyle(pillBg, pillColor, pillBorder, borderRadius, fontSize, spacing, storing || isStored)}
      >
        {isStored ? "Stored" : storing ? "Storing…" : "Store"}
      </button>
    </div>
  );

  if (attachment.type === "image" && url) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
          <img
            src={url}
            alt={attachment.payload?.name || "attachment"}
            style={{
              maxWidth: "100%",
              maxHeight: 320,
              borderRadius: borderRadius.sm,
              display: "block",
              objectFit: "contain",
              backgroundColor: "rgba(0,0,0,0.05)",
            }}
            referrerPolicy="no-referrer"
          />
        </a>
        {buttonRow}
        {err && <div style={{ fontSize: fontSize.xs, color: colors.error }}>{err}</div>}
      </div>
    );
  }

  // Non-image (video / file / unknown) — show a labelled link + the same buttons.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: fontSize.sm,
            color: isOut ? colors.textOnPrimary : colors.primary,
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {attachment.type === "video" ? "🎬 " : attachment.type === "file" ? "📎 " : "📁 "}
          {attachment.payload?.name || `${attachment.type} attachment`}
        </a>
      ) : (
        <span style={{ fontSize: fontSize.xs, opacity: 0.7 }}>[unsupported attachment: {attachment.type}]</span>
      )}
      {url && buttonRow}
      {err && <div style={{ fontSize: fontSize.xs, color: colors.error }}>{err}</div>}
    </div>
  );
}

function pillStyle(
  bg: string,
  fg: string,
  border: string,
  borderRadius: { sm: number },
  fontSize: { xs: number },
  spacing: { xs: number; sm: number },
  disabled: boolean,
): React.CSSProperties {
  return {
    padding: `2px ${spacing.sm}px`,
    border: `1px solid ${border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: bg,
    color: fg,
    fontSize: fontSize.xs,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function Composer({
  value,
  onChange,
  onSend,
  sending,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
}) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea up to ~5 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  }

  const canSend = value.trim().length > 0 && !sending;

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        padding: spacing.sm,
        display: "flex",
        flexDirection: "column",
        gap: spacing.xs,
      }}
    >
      {error && (
        <div
          style={{
            fontSize: fontSize.xs,
            color: colors.error,
            backgroundColor: colors.errorLight,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: borderRadius.sm,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: spacing.sm }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a reply… (Enter to send, Shift+Enter for a new line)"
          rows={1}
          disabled={sending}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 36,
            maxHeight: 120,
            padding: `${spacing.xs + 2}px ${spacing.sm}px`,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            backgroundColor: colors.background,
            color: colors.textPrimary,
            fontFamily: "inherit",
            fontSize: fontSize.sm,
            lineHeight: 1.4,
            outline: "none",
          }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          style={{
            padding: `${spacing.xs + 2}px ${spacing.md}px`,
            border: "none",
            borderRadius: borderRadius.md,
            backgroundColor: canSend ? colors.primary : colors.surfaceElevated,
            color: canSend ? colors.textOnPrimary : colors.textTertiary,
            fontSize: fontSize.sm,
            fontWeight: 600,
            cursor: canSend ? "pointer" : "not-allowed",
            transition: "background-color 0.1s",
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
