// Background poller that fetches new incoming Messenger messages from the
// cloud API and surfaces them as browser notifications + an in-app toast.
// No-ops on first run until the user grants notification permission.

const POLL_INTERVAL_MS = 15000;
const LAST_SEEN_KEY = "pos_messenger_last_seen";
const API_TOKEN = "afkcube_2017";
const API_BASE = "https://3ks.afkcube.com/api";

interface RecentMessage {
  id: string;
  psid: string;
  direction: string;
  text: string;
  created_at: string;
  display_name?: string;
}

type ToastFn = (args: { title: string; body: string; id: string }) => void;

let timer: number | null = null;
let onToast: ToastFn | null = null;

function getLastSeen(): string {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY) || new Date(Date.now() - 60 * 60 * 1000).toISOString();
  } catch {
    return new Date(Date.now() - 60 * 60 * 1000).toISOString();
  }
}

function setLastSeen(iso: string) {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, iso);
  } catch {}
}

async function requestPermissionOnce() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

function fireNotification(msg: RecentMessage) {
  const who = msg.display_name && msg.display_name.trim() ? msg.display_name.trim() : msg.psid.slice(-6);
  const title = `New message from ${who}`;
  const body = msg.text || "(no text — attachment)";
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        tag: msg.id,
        icon: "/app/icon-192.png",
      });
    } catch {}
  }
  if (onToast) {
    try {
      onToast({ title, body, id: msg.id });
    } catch {}
  }
}

async function pollOnce() {
  const since = getLastSeen();
  try {
    const res = await fetch(`${API_BASE}/messenger/messages/recent?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const messages: RecentMessage[] = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length > 0) {
      for (const m of messages) fireNotification(m);
      // Advance the marker to the newest message's timestamp
      const newest = messages[messages.length - 1];
      if (newest?.created_at) setLastSeen(newest.created_at);
    } else if (data.server_time) {
      // Keep the marker moving forward so we don't re-scan the whole day
      setLastSeen(data.server_time);
    }
  } catch {
    // Network blips are fine — next tick will try again
  }
}

export function startMessengerNotifications(toast?: ToastFn) {
  if (timer !== null) return;
  onToast = toast || null;
  requestPermissionOnce();
  // Run once immediately, then on interval
  pollOnce();
  timer = window.setInterval(pollOnce, POLL_INTERVAL_MS) as unknown as number;
}

export function stopMessengerNotifications() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  onToast = null;
}
