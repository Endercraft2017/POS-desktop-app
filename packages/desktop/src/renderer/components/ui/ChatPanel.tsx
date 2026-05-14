import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth-store";
import { useTheme } from "../../hooks/use-theme";
import { useToday } from "../../hooks/use-today";
import { expenseRepo, settingsRepo, orderRepo, productRepo } from "../../lib/repositories";
import { useCartStore } from "../../stores/cart-store";
import { dbQuery } from "../../lib/db-bridge";
import { performSync } from "../../lib/sync-manager";

type Proposal = {
  tool:
    | "propose_expense"
    | "propose_edit_expense"
    | "propose_delete_expense"
    | "propose_add_stock_item"
    | "propose_edit_stock_item"
    | "propose_toggle_stock_item"
    | "propose_delete_stock_item"
    | "propose_bulk_edit_stock"
    | "propose_bulk_check_stock"
    | "propose_bulk_uncheck_stock"
    | "propose_bulk_add_stock_items"
    | "propose_toggle_opening_item"
    | "propose_bulk_check_opening"
    | "propose_bulk_uncheck_opening"
    | "propose_toggle_closing_item"
    | "propose_bulk_check_closing"
    | "propose_bulk_uncheck_closing"
    | "propose_refund_order"
    | "propose_restore_order"
    | "propose_delete_order"
    | "propose_update_order_customer"
    | "propose_update_order_notes"
    | "propose_set_order_status"
    | "propose_merge_customer_names"
    | "propose_add_to_cart"
    | "propose_update_cart_quantity"
    | "propose_remove_from_cart"
    | "propose_clear_cart"
    | "propose_set_customer_name"
    | "propose_update_order_item"
    | "propose_remove_order_item"
    | "propose_add_order_item";
  args: Record<string, any>;
  applied?: boolean;
  error?: string;
};

interface StockItem {
  id: string;
  label: string;
  qty: string;
  unit: string;
  notes?: string;
  checked: boolean;
  at?: string;
  by?: string;
}

async function readSchedulingStock(date: string): Promise<StockItem[]> {
  const raw = await settingsRepo.get(`scheduling_stock_${date}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSchedulingStock(date: string, items: StockItem[], queryClient: any): Promise<void> {
  const payload = JSON.stringify(items);
  await settingsRepo.set(`scheduling_stock_${date}`, payload, "scheduling");
  // Set the query data directly so the Stock tab updates immediately even if
  // a concurrent performSync() refetch returns stale cloud data first.
  queryClient.setQueryData(["scheduling-stock", date], payload);
  queryClient.invalidateQueries({ queryKey: ["scheduling-stock", date] });
}

// --- Opening / closing checklist helpers ---
// State is stored as a single JSON object per day at scheduling_state_<date>.
// Per-day item snapshots live in openingItems / closingItems; toggle state
// lives under opening / closing as { itemId: { checked, at, by } }.
type ChecklistItem = { id: string; label: string };
type ChecklistMap = Record<string, { checked: boolean; at?: string; by?: string }>;
type DayState = {
  openingItems?: ChecklistItem[];
  closingItems?: ChecklistItem[];
  opening: ChecklistMap;
  closing: ChecklistMap;
  notes: string;
};

async function readDayState(date: string): Promise<DayState> {
  const raw = await settingsRepo.get(`scheduling_state_${date}`);
  const empty: DayState = { opening: {}, closing: {}, notes: "" };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw);
    return {
      openingItems: p.openingItems,
      closingItems: p.closingItems,
      opening: p.opening || {},
      closing: p.closing || {},
      notes: p.notes || "",
    };
  } catch { return empty; }
}

async function writeDayState(date: string, state: DayState, queryClient: any): Promise<void> {
  const payload = JSON.stringify(state);
  await settingsRepo.set(`scheduling_state_${date}`, payload, "scheduling");
  queryClient.setQueryData(["scheduling-state", date], payload);
  queryClient.invalidateQueries({ queryKey: ["scheduling-state", date] });
}

async function readChecklistTemplate(tabKey: "opening" | "closing"): Promise<ChecklistItem[]> {
  const raw = await settingsRepo.get(`scheduling_${tabKey}_template`);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

function findChecklistItemByLabel(items: ChecklistItem[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return -1;
  const exact = items.findIndex((it) => (it.label || "").toLowerCase() === q);
  if (exact !== -1) return exact;
  const contains = items
    .map((it, i) => ({ i, match: (it.label || "").toLowerCase().includes(q) }))
    .filter((x) => x.match);
  if (contains.length === 1) return contains[0].i;
  return -1;
}

function newStockItemId(): string {
  return "stk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Compact token display: 1234567 → "1.23M", 12345 → "12.3K", 321 → "321"
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// Lightweight inline markdown renderer for chat output. Handles **bold**,
// *italic* / _italic_, and `code`. Bold is matched before italic so `**x**`
// is not misread as two single-asterisk runs.
function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const pattern = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_|`[^`\n]+?`)/g;
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.length >= 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.length >= 2 && part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.length >= 2 && part.startsWith("_") && part.endsWith("_")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "0.9em",
            padding: "1px 4px",
            borderRadius: 3,
            backgroundColor: "rgba(127,127,127,0.18)",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// Resize an image to fit OCR.space's 1MB limit. Strategy: scale longest edge
// down to maxDim (default 1600px), encode as JPEG at quality 0.85, retry with
// smaller dim/quality if still too big. Returns a base64 data URL.
// Pre-process a receipt image in-place on a canvas so OCR sees cleaner input:
//   1) convert to grayscale (drop colour noise, halves variance)
//   2) auto-contrast via 2/98 percentile clipping so faded receipts and
//      uneven lighting get pushed back toward solid black-on-white text.
// Improves OCR accuracy on dim / yellowed / shadowed receipts at no API cost.
function preprocessReceipt(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Pass 1 — grayscale + histogram for auto-level.
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    data[i] = data[i + 1] = data[i + 2] = gray;
    histogram[gray]++;
  }

  // Pass 2 — percentile clip endpoints (2% / 98%).
  const total = w * h;
  const lowCutoff = total * 0.02;
  const highCutoff = total * 0.02;
  let cum = 0, blackPoint = 0, whitePoint = 255;
  for (let i = 0; i < 256; i++) {
    cum += histogram[i];
    if (cum >= lowCutoff) { blackPoint = i; break; }
  }
  cum = 0;
  for (let i = 255; i >= 0; i--) {
    cum += histogram[i];
    if (cum >= highCutoff) { whitePoint = i; break; }
  }
  const range = Math.max(1, whitePoint - blackPoint);

  // Pass 3 — stretch contrast.
  for (let i = 0; i < data.length; i += 4) {
    let v = ((data[i] - blackPoint) * 255 / range) | 0;
    if (v < 0) v = 0; else if (v > 255) v = 255;
    data[i] = data[i + 1] = data[i + 2] = v;
  }

  ctx.putImageData(imgData, 0, 0);
}

async function compressImageForOcr(file: File, maxBytes = 950 * 1024): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let maxDim = 1600;
  let quality = 0.85;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(img, 0, 0, w, h);
    preprocessReceipt(canvas);
    const out = canvas.toDataURL("image/jpeg", quality);
    // base64 inflates by ~4/3; estimate raw byte size from string length.
    const rawBytes = Math.floor((out.length - "data:image/jpeg;base64,".length) * 0.75);
    if (rawBytes <= maxBytes) return out;
    // Too big — shrink and try again.
    maxDim = Math.round(maxDim * 0.8);
    quality = Math.max(0.5, quality - 0.1);
  }
  throw new Error("Could not compress image small enough");
}

// Case-insensitive match on a stock item's label. Tries exact match first,
// then substring containment. Returns -1 if no match or multiple ambiguous
// matches (caller shows a helpful error).
function findStockItemByLabel(items: StockItem[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return -1;
  const exact = items.findIndex((it) => (it.label || "").toLowerCase() === q);
  if (exact !== -1) return exact;
  const contains = items
    .map((it, i) => ({ i, match: (it.label || "").toLowerCase().includes(q) }))
    .filter((x) => x.match);
  if (contains.length === 1) return contains[0].i;
  return -1;
}

// Back-dated entries use (target date) + (current wall-clock time-of-day)
// so they sort naturally within that day's bucket. Matches how SchedulingPage
// stamps expenses added on a non-today date.
function backdatedIsoFromDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const nowLocal = new Date();
  const dt = new Date(
    y, (m || 1) - 1, d || 1,
    nowLocal.getHours(), nowLocal.getMinutes(), nowLocal.getSeconds()
  );
  return dt.toISOString();
}

type Message = {
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  // True when the user's prior message was OCR-derived. Auto-approve skips
  // these because OCR can misread amounts/items — always require manual review.
  fromOcr?: boolean;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "/api";
const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || "afkcube_2017";

function encodeExpenseNotes(method: "cash" | "gcash", notes: string): string {
  const tag = method === "gcash" ? "[GCASH]" : "[CASH]";
  const body = (notes || "").trim();
  return body ? `${tag} ${body}` : tag;
}

type ChatPage = "scheduling" | "checkout" | "orders" | "history";

export function ChatPanel({ page = "scheduling" }: { page?: ChatPage } = {}) {
  const { colors, spacing, borderRadius, fontSize, isMobile } = useTheme();
  const today = useToday();
  const queryClient = useQueryClient();
  const { currentEmployee } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensLeft, setTokensLeft] = useState<number | null>(null);
  // Auto-approve: when on, any incoming proposals are applied without waiting
  // for a Confirm click. Persisted in localStorage so it survives reloads.
  const [autoApprove, setAutoApprove] = useState<boolean>(() => {
    try { return localStorage.getItem("pos_chat_auto_approve") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pos_chat_auto_approve", autoApprove ? "1" : "0"); } catch {}
  }, [autoApprove]);

  // Multi-model selector — populated from /api/chat/models on mount.
  type ModelEntry = { id: string; label: string; provider: string; note?: string; available: boolean };
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem("pos_chat_model") || ""; } catch { return ""; }
  });
  useEffect(() => {
    try { localStorage.setItem("pos_chat_model", selectedModel); } catch {}
  }, [selectedModel]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/chat/models`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.models) return;
        setModels(j.models);
        if (!selectedModel && j.default) setSelectedModel(j.default);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // FIFO queue of messages typed while a previous request is in flight.
  // Auto-drained after the current request completes.
  const [sendQueue, setSendQueue] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // STT state — recording → transcribing → done. Click 🎤 to start, click
  // again to stop. Audio is recorded via MediaRecorder, posted to /api/stt
  // (Groq Whisper turbo), and the transcript is appended to the input.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  // Two-stage progress: "reading" (OCR.space) → "cleaning" (LLM extracts
  // line items from raw OCR) → null (input is ready). Shown to the user.
  const [ocrStage, setOcrStage] = useState<null | "reading" | "cleaning">(null);
  // Holds the cleaned (or raw-fallback) OCR text after upload. If the next
  // send still contains this text, the user message is flagged as fromOcr so
  // auto-approve skips its proposals — OCR misreads must never silently
  // mutate the books.
  const ocrTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/chat/quota`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    })
      .then((r) => r.json())
      .then((j) => {
        const q = j?.quota;
        if (q?.tokens_used != null && q?.tokens_limit != null) {
          setTokensLeft(Math.max(0, q.tokens_limit - q.tokens_used));
        }
      })
      .catch(() => {});
  }, [open]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    // If user clicks Send while a request is in flight, queue the new message
    // and clear the input. The queue effect below auto-drains once loading
    // flips to false. Avoids hammering the per-minute rate limit.
    if (loading && textOverride === undefined) {
      setSendQueue((q) => [...q, text]);
      setInput("");
      return;
    }
    if (textOverride === undefined) setInput("");
    setError(null);
    // Detect OCR-derived sends: if the raw OCR text is still embedded in the
    // outgoing message, mark it. Cleared after this send regardless.
    const fromOcr = !!ocrTextRef.current && text.includes(ocrTextRef.current);
    ocrTextRef.current = null;
    const recent = [...messages, { role: "user" as const, content: text, fromOcr }];
    setMessages(recent);
    setLoading(true);
    try {
      // Push any pending local writes to the cloud before asking the AI.
      // Without this, rapid "check all / uncheck meat" sequences let the AI
      // see stale stock state because the previous applyProposal's
      // fire-and-forget sync hasn't landed yet.
      try { await performSync(); } catch {}
      // Drop the server's canned "Proposed N changes — confirm below." ack
      // from history. It's a UI placeholder, not a real reply, and including
      // it in the next turn confuses the model — it tries to continue the
      // previous proposal instead of answering the new question.
      const isProposalAck = (m: Message) =>
        m.role === "assistant" &&
        /^Proposed \d+ changes? — confirm below\.$/.test((m.content || "").trim());
      const payload = {
        // Cap history at 6 turns to keep each request's input-token cost small.
        messages: recent
          .filter((m) => !isProposalAck(m))
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
        localDate: today,
        page,
        ...(selectedModel ? { model: selectedModel } : {}),
      };
      const controller = new AbortController();
      abortRef.current = controller;
      const r = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      // Non-JSON error bodies (HTML 502/504 from upstream proxies, truncated
      // responses) used to surface as "Unexpected token <" SyntaxErrors.
      // Read as text first, then attempt JSON.parse, so we can show a useful
      // message regardless of what the gateway returned.
      const raw = await r.text();
      let j: any;
      try { j = JSON.parse(raw); }
      catch {
        if (!r.ok) throw new Error(`Chat request failed (HTTP ${r.status}). Try again.`);
        throw new Error("Chat returned an unexpected response. Try again.");
      }
      if (!j.success) throw new Error(j.error || "Chat request failed");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: j.text || "",
          proposals: (j.proposals || []).map((p: any) => ({ ...p })),
          fromOcr,
        },
      ]);
      if (j?.quota?.tokens_used != null && j?.quota?.tokens_limit != null) {
        setTokensLeft(Math.max(0, j.quota.tokens_limit - j.quota.tokens_used));
      }
    } catch (e: any) {
      // AbortError fires when the user clicks Cancel. Treat it as intentional:
      // show a brief note, not a scary error.
      if (e?.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "(Cancelled by user.)" },
        ]);
      } else {
        setError(e.message || String(e));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const cancelSend = () => {
    // Cancel both the in-flight request and any queued follow-ups —
    // otherwise a queued message would auto-fire right after the abort.
    setSendQueue([]);
    if (abortRef.current) abortRef.current.abort();
  };

  const startRecording = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      // Pick a MIME the browser supports; Whisper accepts webm/opus, ogg, wav, m4a.
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/wav"];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        // Stop the stream so the browser's mic indicator goes away.
        audioStreamRef.current?.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size === 0) {
          setError("No audio captured.");
          return;
        }
        setTranscribing(true);
        try {
          const r = await fetch(`${API_BASE}/stt`, {
            method: "POST",
            headers: { "Content-Type": mime, Authorization: `Bearer ${API_TOKEN}` },
            body: blob,
          });
          const j = await r.json();
          if (!j.success) throw new Error(j.error || "STT failed");
          const text = (j.text || "").trim();
          if (!text) {
            setError("Couldn't make out any words. Try again, closer to the mic.");
            return;
          }
          // Append to the existing input rather than overwriting — lets the
          // user combine typed context with spoken orders.
          setInput((prev) => (prev ? prev.replace(/\s+$/, "") + " " : "") + text);
        } catch (e: any) {
          setError("STT error: " + (e.message || String(e)));
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Mic error: " + (e.message || String(e))
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const handleOcrFile = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    setOcrStage("reading");
    try {
      const dataUrl = await compressImageForOcr(file);
      // Stage 1: image → raw text via OCR.space
      const r = await fetch(`${API_BASE}/ocr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify({ image: dataUrl, filetype: "image/jpeg" }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "OCR failed");
      const rawText = (j.text || "").trim();
      if (!rawText) {
        setError("OCR returned no text. Try a clearer photo.");
        return;
      }

      // Stage 2: raw OCR → cleaned "item - amount" lines via Cerebras.
      // If cleanup fails (rate limit, model error), fall back to the raw text
      // so the user still gets something usable in the input.
      setOcrStage("cleaning");
      let finalText = rawText;
      try {
        const c = await fetch(`${API_BASE}/ocr/cleanup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_TOKEN}`,
          },
          body: JSON.stringify({ text: rawText }),
        });
        const cj = await c.json();
        if (cj.success && cj.cleaned) {
          finalText = cj.cleaned.trim();
        } else {
          console.warn("[ocr-cleanup] failed, using raw:", cj?.error);
        }
      } catch (cleanupErr) {
        console.warn("[ocr-cleanup] threw, using raw:", cleanupErr);
      }

      const hint = `Apply this to expenses as CASH in ${today}\n\n`;
      ocrTextRef.current = finalText;
      setInput((prev) => (prev ? prev + "\n" : "") + hint + finalText);
    } catch (e: any) {
      setError("OCR error: " + (e.message || String(e)));
    } finally {
      setOcrStage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Drain the send queue when the previous request finishes. Uses a small
  // delay between sends to avoid tripping the per-minute rate limit.
  useEffect(() => {
    if (loading || sendQueue.length === 0) return;
    const next = sendQueue[0];
    const t = setTimeout(() => {
      setSendQueue((q) => q.slice(1));
      send(next);
    }, 750);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sendQueue]);

  const applyProposal = async (msgIdx: number, propIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg || !msg.proposals) return;
    const proposal = msg.proposals[propIdx];
    if (!proposal || proposal.applied) return;
    try {
      if (proposal.tool === "propose_expense") {
        const { name, amount, notes, date, quantity, unit } = proposal.args;
        if (!name || !amount) throw new Error("Missing required fields (name or amount)");
        // Gemini sometimes omits method when the user didn't say cash/gcash.
        // Default to cash, matching how the Expenses form's new-row default works.
        const method = (proposal.args.method === "gcash" ? "gcash" : "cash") as "cash" | "gcash";
        const encoded = encodeExpenseNotes(method, notes || "");
        await expenseRepo.create({
          name: String(name),
          amount: Number(amount),
          category: unit ? String(unit) : "pcs",
          frequency: quantity != null && Number(quantity) > 0 ? String(quantity) : "",
          notes: encoded,
          is_active: 1,
          ...(date ? { created_at: backdatedIsoFromDate(String(date)) } : {}),
        });
      } else if (proposal.tool === "propose_edit_expense") {
        const { id, name, amount, method, notes, date, quantity, unit } = proposal.args;
        if (!id) throw new Error("Missing expense id");
        const patch: Record<string, any> = {};
        if (name !== undefined) patch.name = String(name);
        if (amount !== undefined) patch.amount = Number(amount);
        if (quantity !== undefined) patch.frequency = Number(quantity) > 0 ? String(quantity) : "";
        if (unit !== undefined) patch.category = String(unit);
        // If method is changing, re-encode notes with the new tag.
        // If only notes are changing, preserve whatever method was already encoded.
        if (method !== undefined || notes !== undefined) {
          // We need the current method if only notes are provided
          const all = await expenseRepo.getAll();
          const existing = all.find((e) => e.id === id);
          const existingMethod = (() => {
            const raw = existing?.notes || "";
            const m = raw.match(/^\[(CASH|GCASH)\]\s?(.*)$/s);
            return m && m[1] === "GCASH" ? "gcash" : "cash";
          })();
          const existingNotesBody = (() => {
            const raw = existing?.notes || "";
            const m = raw.match(/^\[(CASH|GCASH)\]\s?(.*)$/s);
            return m ? m[2] : raw;
          })();
          const finalMethod = (method ?? existingMethod) as "cash" | "gcash";
          const finalNotes = notes !== undefined ? String(notes) : existingNotesBody;
          patch.notes = encodeExpenseNotes(finalMethod, finalNotes);
        }
        if (date !== undefined) patch.created_at = backdatedIsoFromDate(String(date));
        if (Object.keys(patch).length === 0) throw new Error("Nothing to update");
        await expenseRepo.update(String(id), patch);
      } else if (proposal.tool === "propose_delete_expense") {
        const { id } = proposal.args;
        if (!id) throw new Error("Missing expense id");
        await expenseRepo.softDelete(String(id));
      } else if (proposal.tool === "propose_add_stock_item") {
        const { date, label, qty, unit, notes } = proposal.args;
        if (!date || !label) throw new Error("Missing date or label");
        const items = await readSchedulingStock(String(date));
        items.push({
          id: newStockItemId(),
          label: String(label),
          qty: qty != null ? String(qty) : "",
          unit: unit ? String(unit) : "pcs",
          notes: notes ? String(notes) : undefined,
          checked: false,
        });
        await writeSchedulingStock(String(date), items, queryClient);
      } else if (proposal.tool === "propose_edit_stock_item") {
        const { date, match_label, label, qty, unit, notes } = proposal.args;
        if (!date || !match_label) throw new Error("Missing date or match_label");
        const items = await readSchedulingStock(String(date));
        const idx = findStockItemByLabel(items, String(match_label));
        if (idx === -1) throw new Error(`Stock item "${match_label}" not found on ${date}`);
        const next = { ...items[idx] };
        if (label !== undefined) next.label = String(label);
        if (qty !== undefined) next.qty = String(qty);
        if (unit !== undefined) next.unit = String(unit);
        if (notes !== undefined) next.notes = notes ? String(notes) : undefined;
        items[idx] = next;
        await writeSchedulingStock(String(date), items, queryClient);
      } else if (proposal.tool === "propose_toggle_stock_item") {
        const { date, match_label } = proposal.args;
        if (!date || !match_label) throw new Error("Missing date or match_label");
        const items = await readSchedulingStock(String(date));
        const idx = findStockItemByLabel(items, String(match_label));
        if (idx === -1) throw new Error(`Stock item "${match_label}" not found on ${date}`);
        const current = items[idx].checked;
        const nextChecked = proposal.args.checked != null ? !!proposal.args.checked : !current;
        items[idx] = nextChecked
          ? { ...items[idx], checked: true, at: new Date().toISOString(), by: currentEmployee?.name || "unknown" }
          : { ...items[idx], checked: false, at: undefined, by: undefined };
        await writeSchedulingStock(String(date), items, queryClient);
      } else if (proposal.tool === "propose_delete_stock_item") {
        const { date, match_label } = proposal.args;
        if (!date || !match_label) throw new Error("Missing date or match_label");
        const items = await readSchedulingStock(String(date));
        const idx = findStockItemByLabel(items, String(match_label));
        if (idx === -1) throw new Error(`Stock item "${match_label}" not found on ${date}`);
        const next = items.filter((_, i) => i !== idx);
        await writeSchedulingStock(String(date), next, queryClient);
      } else if (proposal.tool === "propose_bulk_edit_stock") {
        const { date, qty, unit } = proposal.args;
        if (!date) throw new Error("Missing date");
        if (qty === undefined && unit === undefined) throw new Error("Provide qty and/or unit");
        const items = await readSchedulingStock(String(date));
        if (items.length === 0) throw new Error(`No stock items on ${date}`);
        const next = items.map((it) => ({
          ...it,
          ...(qty !== undefined ? { qty: String(qty) } : {}),
          ...(unit !== undefined ? { unit: String(unit) } : {}),
        }));
        await writeSchedulingStock(String(date), next, queryClient);
      } else if (proposal.tool === "propose_bulk_check_stock") {
        const { date } = proposal.args;
        if (!date) throw new Error("Missing date");
        const items = await readSchedulingStock(String(date));
        if (items.length === 0) throw new Error(`No stock items on ${date}`);
        const ts = new Date().toISOString();
        const by = currentEmployee?.name || "unknown";
        const next = items.map((it) =>
          it.checked ? it : { ...it, checked: true, at: ts, by }
        );
        await writeSchedulingStock(String(date), next, queryClient);
      } else if (proposal.tool === "propose_bulk_uncheck_stock") {
        const { date } = proposal.args;
        if (!date) throw new Error("Missing date");
        const items = await readSchedulingStock(String(date));
        if (items.length === 0) throw new Error(`No stock items on ${date}`);
        const next = items.map((it) =>
          !it.checked ? it : { ...it, checked: false, at: undefined, by: undefined }
        );
        await writeSchedulingStock(String(date), next, queryClient);
      } else if (proposal.tool === "propose_refund_order") {
        const { id } = proposal.args;
        if (!id) throw new Error("Missing order id");
        await orderRepo.updateStatus(String(id), "refunded");
      } else if (proposal.tool === "propose_restore_order") {
        const { id } = proposal.args;
        if (!id) throw new Error("Missing order id");
        await orderRepo.updateStatus(String(id), "completed");
      } else if (proposal.tool === "propose_delete_order") {
        const { id } = proposal.args;
        if (!id) throw new Error("Missing order id");
        await orderRepo.softDelete(String(id));
      } else if (proposal.tool === "propose_update_order_customer") {
        const { id, customer_name } = proposal.args;
        if (!id) throw new Error("Missing order id");
        await orderRepo.updateCustomerName(String(id), String(customer_name ?? ""));
      } else if (proposal.tool === "propose_update_order_notes") {
        const { id, notes } = proposal.args;
        if (!id) throw new Error("Missing order id");
        await orderRepo.updateNotes(String(id), String(notes ?? ""));
      } else if (proposal.tool === "propose_set_order_status") {
        const { id, status } = proposal.args;
        if (!id || !status) throw new Error("Missing order id or status");
        const allowed = new Set(["pending", "held", "completed", "cancelled", "refunded"]);
        if (!allowed.has(String(status))) throw new Error(`Invalid status: ${status}`);
        await orderRepo.updateStatus(String(id), String(status));
      } else if (proposal.tool === "propose_merge_customer_names") {
        // Bulk-rename customer name across orders matching from_pattern
        // (case-insensitive substring) and optionally a date range. The query
        // happens in the renderer DB so the change is immediately visible
        // before sync push.
        const { from_pattern, to, start_date, end_date } = proposal.args;
        if (!from_pattern || to == null) throw new Error("Missing from_pattern or to");
        const like = `%${String(from_pattern).trim()}%`;
        const newName = String(to).trim();
        const params: any[] = [like];
        let where = "deleted_at IS NULL AND LOWER(customer_name) LIKE LOWER(?)";
        if (start_date) {
          where += " AND created_at >= ?";
          params.push(`${start_date}T00:00:00`);
        }
        if (end_date) {
          where += " AND created_at <= ?";
          params.push(`${end_date}T23:59:59.999`);
        }
        // Find affected ids first so we can write per-row sync logs.
        const idsRows = await dbQuery<{ id: string }>(
          `SELECT id FROM orders WHERE ${where}`,
          params,
        );
        for (const row of idsRows) {
          await orderRepo.updateCustomerName(row.id, newName);
        }
      } else if (proposal.tool === "propose_bulk_add_stock_items") {
        const { date, items } = proposal.args;
        if (!date || !Array.isArray(items) || items.length === 0)
          throw new Error("Missing date or items");
        const existing = await readSchedulingStock(String(date));
        const next = [...existing];
        for (const it of items) {
          if (!it?.label) continue;
          next.push({
            id: newStockItemId(),
            label: String(it.label).trim(),
            qty: it.qty != null ? String(it.qty) : "",
            unit: it.unit ? String(it.unit) : "pcs",
            notes: it.notes ? String(it.notes) : undefined,
            checked: false,
          });
        }
        await writeSchedulingStock(String(date), next, queryClient);
      } else if (
        proposal.tool === "propose_toggle_opening_item" ||
        proposal.tool === "propose_toggle_closing_item"
      ) {
        const tabKey: "opening" | "closing" =
          proposal.tool === "propose_toggle_opening_item" ? "opening" : "closing";
        const itemsField: "openingItems" | "closingItems" =
          tabKey === "opening" ? "openingItems" : "closingItems";
        const { date, match_label } = proposal.args;
        if (!date || !match_label) throw new Error("Missing date or match_label");
        const state = await readDayState(String(date));
        const template = state[itemsField]?.length
          ? state[itemsField]!
          : await readChecklistTemplate(tabKey);
        const idx = findChecklistItemByLabel(template, String(match_label));
        if (idx === -1) throw new Error(`Checklist item "${match_label}" not found on ${date}`);
        const item = template[idx];
        const current = state[tabKey][item.id]?.checked === true;
        const next = proposal.args.checked != null ? !!proposal.args.checked : !current;
        const newMap: ChecklistMap = {
          ...state[tabKey],
          [item.id]: next
            ? { checked: true, at: new Date().toISOString(), by: currentEmployee?.name || "unknown" }
            : { checked: false },
        };
        const nextState: DayState = {
          ...state,
          [itemsField]: state[itemsField] || template,
          [tabKey]: newMap,
        };
        await writeDayState(String(date), nextState, queryClient);
      } else if (
        proposal.tool === "propose_bulk_check_opening" ||
        proposal.tool === "propose_bulk_uncheck_opening" ||
        proposal.tool === "propose_bulk_check_closing" ||
        proposal.tool === "propose_bulk_uncheck_closing"
      ) {
        const tabKey: "opening" | "closing" =
          proposal.tool.includes("opening") ? "opening" : "closing";
        const itemsField: "openingItems" | "closingItems" =
          tabKey === "opening" ? "openingItems" : "closingItems";
        const checked = proposal.tool.startsWith("propose_bulk_check_");
        const { date } = proposal.args;
        if (!date) throw new Error("Missing date");
        const state = await readDayState(String(date));
        const template = state[itemsField]?.length
          ? state[itemsField]!
          : await readChecklistTemplate(tabKey);
        const ts = new Date().toISOString();
        const by = currentEmployee?.name || "unknown";
        const newMap: ChecklistMap = {};
        for (const it of template) {
          newMap[it.id] = checked ? { checked: true, at: ts, by } : { checked: false };
        }
        const nextState: DayState = {
          ...state,
          [itemsField]: template,
          [tabKey]: newMap,
        };
        await writeDayState(String(date), nextState, queryClient);
      } else if (proposal.tool === "propose_add_to_cart") {
        const items = Array.isArray(proposal.args?.items) ? proposal.args.items : [];
        if (items.length === 0) throw new Error("No items to add");
        const products = await productRepo.getActive();
        const cartStore = useCartStore.getState();
        const failed: string[] = [];
        for (const it of items) {
          const match = it?.product_match as string | undefined;
          if (!match) continue;
          const q = String(match).toLowerCase();
          const p =
            products.find((x) => x.name?.toLowerCase() === q) ||
            products.find((x) => x.name?.toLowerCase().includes(q));
          if (!p) { failed.push(match); continue; }
          const qty = Math.max(1, Math.floor(Number(it.quantity ?? 1)));
          cartStore.addItem({ id: p.id, name: p.name, price: p.price }, qty);
        }
        if (failed.length === items.length) throw new Error(`No products matched: ${failed.join(", ")}`);
        if (failed.length > 0) throw new Error(`Added some, failed: ${failed.join(", ")}`);
      } else if (proposal.tool === "propose_update_cart_quantity") {
        const { product_match, quantity } = proposal.args;
        if (!product_match || quantity == null) throw new Error("Missing product_match or quantity");
        const cartStore = useCartStore.getState();
        const q = String(product_match).toLowerCase();
        const line =
          cartStore.cart.items.find((i) => i.productName.toLowerCase() === q) ||
          cartStore.cart.items.find((i) => i.productName.toLowerCase().includes(q));
        if (!line) throw new Error(`"${product_match}" not in cart`);
        cartStore.updateQuantity(line.productId, Math.max(0, Math.floor(Number(quantity))));
      } else if (proposal.tool === "propose_remove_from_cart") {
        const { product_match } = proposal.args;
        if (!product_match) throw new Error("Missing product_match");
        const cartStore = useCartStore.getState();
        const q = String(product_match).toLowerCase();
        const line =
          cartStore.cart.items.find((i) => i.productName.toLowerCase() === q) ||
          cartStore.cart.items.find((i) => i.productName.toLowerCase().includes(q));
        if (!line) throw new Error(`"${product_match}" not in cart`);
        cartStore.removeItem(line.productId);
      } else if (proposal.tool === "propose_clear_cart") {
        useCartStore.getState().clear();
      } else if (proposal.tool === "propose_set_customer_name") {
        const { name } = proposal.args;
        if (typeof name !== "string") throw new Error("Missing name");
        useCartStore.getState().setCustomerName(name);
      } else if (proposal.tool === "propose_update_order_item") {
        const { order_id, product_match, quantity, unit_price } = proposal.args;
        if (!order_id || !product_match) throw new Error("Missing order_id or product_match");
        if (quantity == null && unit_price == null) throw new Error("Provide quantity and/or unit_price");
        const order = await orderRepo.getById(String(order_id));
        if (!order) throw new Error("Order not found");
        const q = String(product_match).toLowerCase();
        const line =
          order.items.find((i) => (i.product_name || "").toLowerCase() === q) ||
          order.items.find((i) => (i.product_name || "").toLowerCase().includes(q));
        if (!line) throw new Error(`Item "${product_match}" not on order`);
        const nextQty = quantity != null ? Math.max(0, Number(quantity)) : line.quantity;
        const nextPrice = unit_price != null ? Number(unit_price) : line.unit_price;
        if (nextQty === 0) {
          await orderRepo.removeItem(line.id);
        } else {
          await orderRepo.updateItem(line.id, nextQty, nextPrice);
        }
        await orderRepo.recalculate(String(order_id));
      } else if (proposal.tool === "propose_remove_order_item") {
        const { order_id, product_match } = proposal.args;
        if (!order_id || !product_match) throw new Error("Missing order_id or product_match");
        const order = await orderRepo.getById(String(order_id));
        if (!order) throw new Error("Order not found");
        const q = String(product_match).toLowerCase();
        const line =
          order.items.find((i) => (i.product_name || "").toLowerCase() === q) ||
          order.items.find((i) => (i.product_name || "").toLowerCase().includes(q));
        if (!line) throw new Error(`Item "${product_match}" not on order`);
        await orderRepo.removeItem(line.id);
        await orderRepo.recalculate(String(order_id));
      } else if (proposal.tool === "propose_add_order_item") {
        const { order_id, product_match, quantity, unit_price } = proposal.args;
        if (!order_id || !product_match) throw new Error("Missing order_id or product_match");
        const products = await productRepo.getActive();
        const q = String(product_match).toLowerCase();
        const p =
          products.find((x) => (x.name || "").toLowerCase() === q) ||
          products.find((x) => (x.name || "").toLowerCase().includes(q));
        if (!p) throw new Error(`Product "${product_match}" not found`);
        const qty = Math.max(1, Math.floor(Number(quantity ?? 1)));
        const price = unit_price != null ? Number(unit_price) : p.price;
        await orderRepo.addItem(String(order_id), {
          product_id: p.id,
          product_name: p.name,
          quantity: qty,
          unit_price: price,
          total: qty * price,
        });
        await orderRepo.recalculate(String(order_id));
      } else {
        throw new Error("Unknown proposal tool");
      }
      setMessages((prev) => {
        const copy = [...prev];
        const m = { ...copy[msgIdx] };
        const props = (m.proposals || []).slice();
        props[propIdx] = { ...proposal, applied: true };
        m.proposals = props;
        copy[msgIdx] = m;
        return copy;
      });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      performSync().catch(() => {});
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev];
        const m = { ...copy[msgIdx] };
        const props = (m.proposals || []).slice();
        props[propIdx] = { ...proposal, error: e.message || String(e) };
        m.proposals = props;
        copy[msgIdx] = m;
        return copy;
      });
    }
  };

  const applyAllInMessage = async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg || !msg.proposals) return;
    // Apply each pending proposal sequentially. applyProposal is idempotent
    // on already-applied/errored ones — it returns early.
    for (let i = 0; i < msg.proposals.length; i++) {
      const p = msg.proposals[i];
      if (p.applied || p.error) continue;
      await applyProposal(msgIdx, i);
    }
  };

  // Auto-approve: when the toggle is on and a new assistant message arrives
  // with pending proposals, apply them all without waiting for Confirm.
  const autoApprovedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!autoApprove) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (!last || last.role !== "assistant") return;
    // OCR-derived proposals always require manual review — never silently
    // apply, even if the auto-approve toggle is on. OCR misreads (wrong
    // amounts, missed decimal points) could otherwise mutate the books.
    if (last.fromOcr) return;
    if (autoApprovedRef.current.has(lastIdx)) return;
    const hasPending = (last.proposals || []).some((p) => !p.applied && !p.error);
    if (!hasPending) return;
    autoApprovedRef.current.add(lastIdx);
    applyAllInMessage(lastIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, autoApprove]);

  const cancelProposal = (msgIdx: number, propIdx: number) => {
    setMessages((prev) => {
      const copy = [...prev];
      const m = { ...copy[msgIdx] };
      const props = (m.proposals || []).slice();
      props[propIdx] = { ...props[propIdx], applied: true, error: "Cancelled" };
      m.proposals = props;
      copy[msgIdx] = m;
      return copy;
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="AI assistant"
        style={{
          position: "fixed",
          bottom: spacing.lg,
          right: spacing.lg,
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          backgroundColor: colors.primary,
          color: colors.textOnPrimary,
          fontSize: 22,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          zIndex: 200,
        }}
      >
        AI
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: spacing.lg,
        right: spacing.lg,
        width: "min(420px, 92vw)",
        height: "min(600px, 80vh)",
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        zIndex: 200,
      }}
    >
      <div style={{
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderBottom: `1px solid ${colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary }}>
            AI Assistant · Stocks &amp; Expenses
          </div>
          {tokensLeft != null && (
            <div style={{
              fontSize: fontSize.xs,
              color: tokensLeft < 20000 ? colors.warning : colors.textTertiary,
              marginTop: 2,
            }}>
              {formatTokens(tokensLeft)} tokens left today
              {(() => {
                const m = models.find((x) => x.id === selectedModel);
                return m && m.provider !== "cerebras"
                  ? <span style={{ marginLeft: spacing.xs, opacity: 0.7 }}>(Cerebras quota — switch back to use)</span>
                  : null;
              })()}
            </div>
          )}
          {models.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              title="Switch AI model"
              style={{
                marginTop: spacing.xs,
                padding: `2px ${spacing.xs}px`,
                fontSize: fontSize.xs,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.surfaceElevated,
                color: colors.textPrimary,
                outline: "none",
                cursor: "pointer",
                maxWidth: 240,
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.label}{!m.available ? " (no key)" : ""}
                </option>
              ))}
            </select>
          )}
          <label
            onClick={() => setAutoApprove((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: spacing.xs + 2,
              fontSize: fontSize.xs,
              color: autoApprove ? colors.textPrimary : colors.textTertiary,
              marginTop: spacing.xs,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span
              role="switch"
              aria-checked={autoApprove}
              style={{
                position: "relative",
                width: 32,
                height: 18,
                borderRadius: borderRadius.full,
                backgroundColor: autoApprove ? colors.primary : colors.surfaceElevated,
                border: `1px solid ${autoApprove ? colors.primary : colors.border}`,
                transition: "background-color 0.15s, border-color 0.15s",
                flexShrink: 0,
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 1,
                  left: autoApprove ? 15 : 1,
                  width: 14,
                  height: 14,
                  borderRadius: borderRadius.full,
                  backgroundColor: colors.surface,
                  transition: "left 0.15s",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                }}
              />
            </span>
            Auto-approve proposals
          </label>
        </div>
        <button
          title="Reset conversation"
          onClick={() => {
            // Abort any in-flight request, clear queues, drop history.
            // Keeps autoApprove (it's a user preference) but resets everything
            // chat-history-related so the next message starts fresh.
            if (abortRef.current) abortRef.current.abort();
            setMessages([]);
            setSendQueue([]);
            setError(null);
            setOcrStage(null);
            ocrTextRef.current = "";
            autoApprovedRef.current = new Set();
          }}
          style={{
            border: "none",
            background: "transparent",
            color: colors.textSecondary,
            fontSize: fontSize.md,
            cursor: "pointer",
            padding: 0,
            width: 24,
            height: 24,
            marginRight: 4,
          }}
          disabled={loading && messages.length === 0}
        >↻</button>
        <button
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            color: colors.textSecondary,
            fontSize: fontSize.lg,
            cursor: "pointer",
            padding: 0,
            width: 24,
            height: 24,
          }}
        >×</button>
      </div>

      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: "auto",
        padding: spacing.md,
        display: "flex",
        flexDirection: "column",
        gap: spacing.sm,
      }}>
        {messages.length === 0 && (
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, textAlign: "center", marginTop: spacing.md }}>
            Ask about expenses, stock, or daily profit. Try:<br />
            <i>"how much gcash did I spend this week?"</i><br />
            <i>"which ingredients are low?"</i><br />
            <i>"log 450 cash for coffee beans"</i>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: m.role === "user" ? "flex-end" : "flex-start",
            gap: spacing.xs,
          }}>
            <div style={{
              maxWidth: "85%",
              padding: `${spacing.xs + 2}px ${spacing.sm + 2}px`,
              borderRadius: borderRadius.md,
              backgroundColor: m.role === "user" ? colors.primary : colors.surfaceElevated,
              color: m.role === "user" ? colors.textOnPrimary : colors.textPrimary,
              fontSize: fontSize.sm,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {m.role === "assistant" ? renderInlineMarkdown(m.content) : m.content}
            </div>
            {(m.proposals || []).map((p, j) => (
              <ProposalCard
                key={j}
                proposal={p}
                onConfirm={() => applyProposal(i, j)}
                onCancel={() => cancelProposal(i, j)}
              />
            ))}
            {(() => {
              const pending = (m.proposals || []).filter((p) => !p.applied && !p.error);
              if (pending.length < 2) return null;
              return (
                <button
                  onClick={() => applyAllInMessage(i)}
                  style={{
                    alignSelf: "flex-start",
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    fontWeight: 700,
                    backgroundColor: colors.primary,
                    color: colors.textOnPrimary,
                    border: "none",
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                  }}
                >
                  Approve all ({pending.length})
                </button>
              );
            })()}
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontStyle: "italic" }}>
            Thinking…
          </div>
        )}
        {ocrStage && (
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontStyle: "italic", display: "flex", alignItems: "center", gap: spacing.xs }}>
            <span
              style={{
                width: 12, height: 12,
                border: `2px solid ${colors.border}`,
                borderTopColor: colors.primary,
                borderRadius: "50%",
                display: "inline-block",
                animation: "chat-spin 0.8s linear infinite",
              }}
            />
            <span>{ocrStage === "reading" ? "Reading image…" : "Cleaning up text…"}</span>
            <style>{"@keyframes chat-spin { to { transform: rotate(360deg); } }"}</style>
          </div>
        )}
        {recording && (
          <div style={{ fontSize: fontSize.xs, color: colors.error, fontStyle: "italic", display: "flex", alignItems: "center", gap: spacing.xs }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", backgroundColor: colors.error,
              animation: "chat-mic-pulse 1.1s ease-in-out infinite",
            }} />
            <span>Recording — click ■ to stop</span>
          </div>
        )}
        {transcribing && (
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontStyle: "italic", display: "flex", alignItems: "center", gap: spacing.xs }}>
            <span
              style={{
                width: 12, height: 12,
                border: `2px solid ${colors.border}`,
                borderTopColor: colors.primary,
                borderRadius: "50%",
                display: "inline-block",
                animation: "chat-spin 0.8s linear infinite",
              }}
            />
            <span>Transcribing…</span>
          </div>
        )}
        {error && (
          <div style={{ fontSize: fontSize.xs, color: colors.error }}>
            {error}
          </div>
        )}
      </div>

      {sendQueue.length > 0 && (
        <div style={{
          padding: `${spacing.xs}px ${spacing.sm}px`,
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          backgroundColor: colors.surfaceElevated,
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.xs,
        }}>
          <span>{sendQueue.length} message{sendQueue.length === 1 ? "" : "s"} queued</span>
          <button
            onClick={() => setSendQueue([])}
            style={{
              padding: `0 ${spacing.xs}px`,
              fontSize: fontSize.xs,
              backgroundColor: "transparent",
              color: colors.textTertiary,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
            }}
          >
            Clear queue
          </button>
        </div>
      )}
      <div style={{
        padding: spacing.sm,
        borderTop: `1px solid ${colors.border}`,
        display: "flex",
        alignItems: "flex-end",
        gap: spacing.xs,
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleOcrFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!ocrStage}
          title="Attach receipt image (OCR)"
          aria-label="Attach receipt image"
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.md,
            backgroundColor: colors.surfaceElevated,
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            cursor: ocrStage ? "wait" : "pointer",
            opacity: ocrStage ? 0.6 : 1,
            minHeight: 32,
            lineHeight: 1,
          }}
        >
          📷
        </button>
        <button
          onClick={toggleRecording}
          disabled={transcribing}
          title={recording ? "Stop recording" : "Speak (Whisper)"}
          aria-label={recording ? "Stop recording" : "Start voice recording"}
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.md,
            backgroundColor: recording ? colors.error : colors.surfaceElevated,
            color: recording ? "#fff" : colors.textSecondary,
            border: `1px solid ${recording ? colors.error : colors.border}`,
            borderRadius: borderRadius.sm,
            cursor: transcribing ? "wait" : "pointer",
            opacity: transcribing ? 0.6 : 1,
            minHeight: 32,
            lineHeight: 1,
            // Pulse the button while recording so it's obvious it's hot.
            animation: recording ? "chat-mic-pulse 1.1s ease-in-out infinite" : undefined,
          }}
        >
          {recording ? "■" : "🎤"}
          <style>{"@keyframes chat-mic-pulse { 50% { transform: scale(0.94); } }"}</style>
        </button>
        <textarea
          ref={(el) => {
            if (!el) return;
            el.style.height = "auto";
            const next = Math.min(el.scrollHeight, 140);
            el.style.height = next + "px";
          }}
          value={input}
          placeholder={
            isMobile
              ? (loading ? "Type to queue… (tap ▶ to send)" : "Ask something… (tap ▶ to send)")
              : (loading ? "Type to queue (Enter to add)…" : "Ask something… (Shift+Enter for a new line)")
          }
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // On mobile, Enter inserts a newline (default behavior). Sending
            // happens only via the Send button. On desktop, Enter sends and
            // Shift+Enter inserts a newline.
            if (isMobile) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          style={{
            flex: 1,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            outline: "none",
            resize: "none",
            fontFamily: "inherit",
            lineHeight: 1.35,
            minHeight: 32,
            maxHeight: 140,
            overflowY: "auto",
          }}
        />
        {loading ? (
          <button
            onClick={cancelSend}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 700,
              backgroundColor: colors.error,
              color: "#fff",
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={() => send()}
            disabled={!input.trim()}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 700,
              backgroundColor: colors.primary,
              color: colors.textOnPrimary,
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: !input.trim() ? "not-allowed" : "pointer",
              opacity: !input.trim() ? 0.6 : 1,
            }}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  onConfirm,
  onCancel,
}: {
  proposal: Proposal;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const title = describeProposal(proposal);
  const status = proposal.error
    ? { label: proposal.error === "Cancelled" ? "Cancelled" : `Error: ${proposal.error}`, color: colors.error }
    : proposal.applied
    ? { label: "Applied", color: colors.success }
    : null;
  return (
    <div style={{
      width: "85%",
      border: `1px solid ${colors.primary}`,
      backgroundColor: colors.primaryLight,
      borderRadius: borderRadius.sm,
      padding: `${spacing.xs + 2}px ${spacing.sm + 2}px`,
      display: "flex",
      flexDirection: "column",
      gap: spacing.xs,
    }}>
      <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textPrimary }}>
        {title}
      </div>
      {status ? (
        <div style={{ fontSize: fontSize.xs, color: status.color, fontWeight: 600 }}>
          {status.label}
        </div>
      ) : (
        <div style={{ display: "flex", gap: spacing.xs }}>
          <button
            onClick={onConfirm}
            style={{
              padding: `2px ${spacing.sm}px`,
              fontSize: fontSize.xs,
              fontWeight: 700,
              backgroundColor: colors.primary,
              color: colors.textOnPrimary,
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: "pointer",
            }}
          >Confirm</button>
          <button
            onClick={onCancel}
            style={{
              padding: `2px ${spacing.sm}px`,
              fontSize: fontSize.xs,
              backgroundColor: "transparent",
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
            }}
          >Cancel</button>
        </div>
      )}
    </div>
  );
}

function describeProposal(p: Proposal): string {
  const a = p.args || {};
  if (p.tool === "propose_expense") {
    const method = (a.method || "cash").toUpperCase();
    const notes = a.notes ? ` (${a.notes})` : "";
    const when = a.date ? ` · on ${a.date}` : "";
    const qty = a.quantity != null ? ` · ${a.quantity}${a.unit ? ` ${a.unit}` : ""}` : "";
    return `Log expense: ${a.name} · ₱${Number(a.amount).toFixed(2)}${qty} · ${method}${when}${notes}`;
  }
  if (p.tool === "propose_edit_expense") {
    const parts: string[] = [];
    if (a.name !== undefined) parts.push(`name → "${a.name}"`);
    if (a.amount !== undefined) parts.push(`amount → ₱${Number(a.amount).toFixed(2)}`);
    if (a.quantity !== undefined) parts.push(`qty → ${a.quantity}`);
    if (a.unit !== undefined) parts.push(`unit → ${a.unit}`);
    if (a.method !== undefined) parts.push(`method → ${String(a.method).toUpperCase()}`);
    if (a.notes !== undefined) parts.push(`notes → "${a.notes}"`);
    if (a.date !== undefined) parts.push(`date → ${a.date}`);
    return `Edit expense ${String(a.id).slice(-6)}: ${parts.join(", ") || "(no changes)"}`;
  }
  if (p.tool === "propose_delete_expense") {
    return `Delete expense ${String(a.id).slice(-6)}`;
  }
  if (p.tool === "propose_add_stock_item") {
    const q = a.qty ? ` · ${a.qty}${a.unit ? ` ${a.unit}` : ""}` : (a.unit ? ` · ${a.unit}` : "");
    const n = a.notes ? ` (${a.notes})` : "";
    return `Add stock item [${a.date}]: ${a.label}${q}${n}`;
  }
  if (p.tool === "propose_edit_stock_item") {
    const parts: string[] = [];
    if (a.label !== undefined) parts.push(`label → "${a.label}"`);
    if (a.qty !== undefined) parts.push(`qty → "${a.qty}"`);
    if (a.unit !== undefined) parts.push(`unit → ${a.unit}`);
    if (a.notes !== undefined) parts.push(`notes → "${a.notes}"`);
    return `Edit stock item [${a.date}] "${a.match_label}": ${parts.join(", ") || "(no changes)"}`;
  }
  if (p.tool === "propose_toggle_stock_item") {
    const label = a.checked === true ? "mark done" : a.checked === false ? "mark not done" : "toggle";
    return `Stock item [${a.date}] "${a.match_label}": ${label}`;
  }
  if (p.tool === "propose_delete_stock_item") {
    return `Remove stock item [${a.date}]: ${a.match_label}`;
  }
  if (p.tool === "propose_bulk_edit_stock") {
    const parts: string[] = [];
    if (a.qty !== undefined) parts.push(`qty → "${a.qty}"`);
    if (a.unit !== undefined) parts.push(`unit → ${a.unit}`);
    return `Apply to ALL stock items [${a.date}]: ${parts.join(", ") || "(no changes)"}`;
  }
  if (p.tool === "propose_bulk_check_stock") {
    return `Check off ALL stock items [${a.date}]`;
  }
  if (p.tool === "propose_bulk_uncheck_stock") {
    return `Uncheck ALL stock items [${a.date}]`;
  }
  if (p.tool === "propose_refund_order") {
    return `Refund order ${String(a.id).slice(-6)}`;
  }
  if (p.tool === "propose_restore_order") {
    return `Restore order ${String(a.id).slice(-6)} to completed`;
  }
  if (p.tool === "propose_delete_order") {
    return `Delete order ${String(a.id).slice(-6)}`;
  }
  if (p.tool === "propose_update_order_customer") {
    const name = String(a.customer_name ?? "").trim();
    return `Set customer on order ${String(a.id).slice(-6)} → "${name || "(cleared)"}"`;
  }
  if (p.tool === "propose_update_order_notes") {
    const note = String(a.notes ?? "").trim();
    return `Set note on order ${String(a.id).slice(-6)} → "${note || "(cleared)"}"`;
  }
  if (p.tool === "propose_set_order_status") {
    return `Set order ${String(a.id).slice(-6)} status → "${a.status}"`;
  }
  if (p.tool === "propose_merge_customer_names") {
    const range = a.start_date || a.end_date
      ? ` [${a.start_date || "…"} → ${a.end_date || "…"}]`
      : "";
    return `Rename customer "${a.from_pattern}" → "${a.to}"${range}`;
  }
  if (p.tool === "propose_bulk_add_stock_items") {
    const labels = (Array.isArray(a.items) ? a.items.map((it: any) => it?.label).filter(Boolean) : []).join(", ");
    return `Add ${a.items?.length ?? 0} stock items [${a.date}]: ${labels}`;
  }
  if (p.tool === "propose_toggle_opening_item") {
    const label = a.checked === true ? "mark done" : a.checked === false ? "mark not done" : "toggle";
    return `Opening item [${a.date}] "${a.match_label}": ${label}`;
  }
  if (p.tool === "propose_toggle_closing_item") {
    const label = a.checked === true ? "mark done" : a.checked === false ? "mark not done" : "toggle";
    return `Closing item [${a.date}] "${a.match_label}": ${label}`;
  }
  if (p.tool === "propose_bulk_check_opening") {
    return `Check ALL opening items [${a.date}]`;
  }
  if (p.tool === "propose_bulk_uncheck_opening") {
    return `Uncheck ALL opening items [${a.date}]`;
  }
  if (p.tool === "propose_bulk_check_closing") {
    return `Check ALL closing items [${a.date}]`;
  }
  if (p.tool === "propose_bulk_uncheck_closing") {
    return `Uncheck ALL closing items [${a.date}]`;
  }
  if (p.tool === "propose_add_to_cart") {
    const items = Array.isArray(a.items) ? a.items : [];
    if (items.length === 0) return "Add to cart: (no items)";
    if (items.length === 1) {
      const it = items[0];
      const qty = it.quantity ?? 1;
      return `Add to cart: ${qty}× ${it.product_match}${it.notes ? ` (${it.notes})` : ""}`;
    }
    const lines = items
      .map((it: any) => `${it.quantity ?? 1}× ${it.product_match}${it.notes ? ` (${it.notes})` : ""}`)
      .join(", ");
    return `Add to cart (${items.length} items): ${lines}`;
  }
  if (p.tool === "propose_update_cart_quantity") {
    return `Set cart qty: ${a.product_match} → ${a.quantity}`;
  }
  if (p.tool === "propose_remove_from_cart") {
    return `Remove from cart: ${a.product_match}`;
  }
  if (p.tool === "propose_clear_cart") {
    return `Clear the cart`;
  }
  if (p.tool === "propose_set_customer_name") {
    return `Set customer name: "${a.name}"`;
  }
  if (p.tool === "propose_update_order_item") {
    const parts: string[] = [];
    if (a.quantity != null) parts.push(`qty → ${a.quantity}`);
    if (a.unit_price != null) parts.push(`price → ₱${Number(a.unit_price).toFixed(2)}`);
    return `Order ${String(a.order_id).slice(-6)} · ${a.product_match}: ${parts.join(", ") || "(no changes)"}`;
  }
  if (p.tool === "propose_remove_order_item") {
    return `Order ${String(a.order_id).slice(-6)} · remove ${a.product_match}`;
  }
  if (p.tool === "propose_add_order_item") {
    const price = a.unit_price != null ? ` @ ₱${Number(a.unit_price).toFixed(2)}` : "";
    return `Order ${String(a.order_id).slice(-6)} · add ${a.quantity ?? 1}× ${a.product_match}${price}`;
  }
  return "Unknown proposal";
}
