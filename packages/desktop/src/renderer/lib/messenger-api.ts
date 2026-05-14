// Fetch helpers for the cloud Messenger API. Used by MessagesPage to render
// threads + history. Lives alongside messenger-notifications.ts (which polls
// only the /recent endpoint for toast popups).

const API_BASE = "https://3ks.afkcube.com/api";
const API_TOKEN = "afkcube_2017";

export interface MessengerThread {
  psid: string;
  display_name: string;
  profile_pic: string | null;
  last_at: string;
  last_text: string | null;
  last_direction: "in" | "out" | null;
  message_count: number;
}

export interface MessengerAttachment {
  type: "image" | "video" | "file" | "unknown" | string;
  payload: {
    url?: string;
    preview_url?: string | null;
    mime_type?: string | null;
    name?: string | null;
    // Set by /attachment/store after the server has persisted a local copy.
    // When true, payload.url points at /api/media/... instead of Facebook's CDN.
    stored?: boolean;
    stored_at?: string;
    original_url?: string;
  };
}

export interface MessengerMessage {
  id: string;
  psid: string;
  direction: "in" | "out";
  text: string;
  attachments: string | null;
  created_at: string;
  from_psid: string;
  from_name: string;
}

export function parseAttachments(json: string | null | undefined): MessengerAttachment[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as MessengerAttachment[];
    // Legacy shape from very early webhook entries: { data: [...] }
    if (parsed && Array.isArray(parsed.data)) return parsed.data as MessengerAttachment[];
    return [];
  } catch {
    return [];
  }
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = (parsed && (parsed.error || parsed.hint)) || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 200));
  }
  return parsed as T;
}

export async function fetchThreads(): Promise<MessengerThread[]> {
  const data = await api<{ success: boolean; threads: MessengerThread[] }>("/messenger/threads");
  return data.threads || [];
}

export interface ThreadHistory {
  messages: MessengerMessage[];
  display_name: string;
}

export async function fetchThreadMessages(psid: string): Promise<ThreadHistory> {
  const enc = encodeURIComponent(psid);
  const data = await api<{ success: boolean; messages: MessengerMessage[]; display_name: string }>(`/messenger/thread/${enc}`);
  return { messages: data.messages || [], display_name: data.display_name || "" };
}

// Scraped threads have psid 'scrape:<sender name>' and cannot be replied to
// via Graph API. The watcher path is currently disabled in favor of the Graph
// API poller, but we keep this helper for any legacy rows.
export function isScrapedThread(psid: string): boolean {
  return psid.startsWith("scrape:");
}

// Prefer the cached profile name from the API; fall back to a short PSID label.
export function displayName(psid: string, profileName?: string | null): string {
  if (profileName && profileName.trim()) return profileName.trim();
  if (psid.startsWith("scrape:")) return psid.slice("scrape:".length) || "(unknown)";
  return `User ${psid.slice(-6)}`;
}

// Send a reply via the Page's Graph API. The server inserts the outbound message
// using Graph's returned message_id, so the periodic poller does not duplicate it.
export async function sendMessage(psid: string, text: string): Promise<void> {
  await apiPost<{ success: boolean }>("/messenger/send", { psid, text });
}

// Force the server to pull deltas from Graph right now. Useful when a user
// opens a thread — they shouldn't wait for the next 20s tick to see new messages.
// Fire-and-forget; errors are swallowed because the periodic poller will catch up.
export function triggerSync(): Promise<void> {
  return apiPost<{ success: boolean }>("/messenger/sync", {}).then(() => undefined).catch(() => undefined);
}

// Persist a message attachment to the server so it survives Facebook CDN expiry.
// Returns the rewritten attachment (payload.url now points at /api/media/...).
export async function storeAttachment(messageId: string, index: number): Promise<MessengerAttachment> {
  const res = await apiPost<{ success: boolean; attachment: MessengerAttachment }>(
    "/messenger/attachment/store",
    { id: messageId, i: index },
  );
  return res.attachment;
}

// True when the page is loaded inside the React Native WebView shell.
function isWebView(): boolean {
  return typeof (window as any).ReactNativeWebView !== "undefined";
}

// Fetch an attachment as a Blob via the server proxy, then trigger a browser
// download. Going through the proxy is needed because Facebook's CDN doesn't
// honor the cross-origin <a download> attribute.
//
// In the mobile WebView, the <a download> trick silently fails (Android's
// WebView ignores it unless the host app wires setDownloadListener). So when
// running inside the RN shell we bridge to native: first ensure the attachment
// is persisted server-side (gives us a public /api/media/... URL with no
// Bearer-auth requirement), then postMessage to RN with {type:'download',url}.
// The shell's onMessage handler opens that URL via Linking.openURL so the
// system browser handles the actual download.
export async function downloadAttachment(messageId: string, index: number, fallbackName?: string): Promise<void> {
  if (isWebView()) {
    // storeAttachment is idempotent: if the attachment is already persisted,
    // the server returns the cached version cheaply.
    const stored = await storeAttachment(messageId, index);
    const publicUrl = stored.payload?.url;
    if (!publicUrl) {
      throw new Error("attachment has no URL after store");
    }
    const filename = fallbackName || stored.payload?.name || `attachment-${messageId}-${index}`;
    (window as any).ReactNativeWebView.postMessage(
      JSON.stringify({ type: "download", url: publicUrl, filename }),
    );
    return;
  }

  // Browser / desktop: fetch via the auth-protected proxy + standard <a download>.
  const url = `${API_BASE}/messenger/attachment/download?id=${encodeURIComponent(messageId)}&i=${index}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : fallbackName || `attachment-${messageId}-${index}`;
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}
