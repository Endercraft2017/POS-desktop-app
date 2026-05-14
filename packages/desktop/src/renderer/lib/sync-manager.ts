import { syncAll } from "@pos/core/services";
import type { SyncResult } from "@pos/core/services";
import { desktopSyncAdapter, webSyncAdapter, WEB_DEVICE_ID } from "./sync-client";

// Use protocol-relative URL so the page's own scheme (http/https) is used.
// In web mode, prefer same-origin so HTTPS pages don't trigger mixed-content blocks.
const DEFAULT_SERVER_URL =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "https://3ks.afkcube.com";
const DEFAULT_INTERVAL_MS = 5000; // poll every 5s for near-realtime cross-device updates
const DESKTOP_DEVICE_ID = "desktop-001";

const IS_WEB = typeof window !== "undefined" && !(window as any).electronAPI;
const adapter = IS_WEB ? webSyncAdapter : desktopSyncAdapter;
const myDeviceId = IS_WEB ? WEB_DEVICE_ID : DESKTOP_DEVICE_ID;

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastSyncResult: SyncResult | null = null;

// Hook used to refresh React Query cache after a sync.
// main.tsx wires this up at startup to avoid a circular import.
let refreshHook: (() => void) | null = null;
export function setSyncRefreshHook(fn: () => void) {
  refreshHook = fn;
}

export async function performSync(serverUrl?: string): Promise<SyncResult> {
  // Web: no local DB, nothing to reconcile. Callers just want queries refreshed.
  if (IS_WEB) {
    try {
      if (refreshHook) refreshHook();
    } catch {}
    return { pushed: 0, pulled: 0 };
  }
  // Offline: skip remote calls, writes are still queued locally via sync_log
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { pushed: 0, pulled: 0, error: "offline" };
  }
  if (isSyncing) return { pushed: 0, pulled: 0, error: "Sync already in progress" };

  isSyncing = true;
  try {
    const url = serverUrl || (await adapter.getSetting("sync_server_url")) || DEFAULT_SERVER_URL;
    const result = await syncAll(adapter, url, myDeviceId);
    lastSyncResult = result;

    if (!result.error) {
      await adapter.setSetting("last_sync_success", new Date().toISOString());
    }

    // Always refresh the UI after sync (success or partial). The hook is set
    // by main.tsx at startup and refetches all active React Query subscriptions.
    try {
      if (refreshHook) refreshHook();
    } catch (e) {
      console.warn("[Sync] refresh hook failed:", e);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pos-sync-pulled", { detail: result }));
    }

    return result;
  } finally {
    isSyncing = false;
  }
}

export function startAutoSync(intervalMs?: number): void {
  // Web is online-only now — every query hits the cloud directly, no
  // reconciliation needed. Skip sync entirely.
  if (IS_WEB) return;

  stopAutoSync();
  const interval = intervalMs || DEFAULT_INTERVAL_MS;

  syncInterval = setInterval(async () => {
    try {
      await performSync();
    } catch (e) {
      console.warn("[Sync] Auto-sync failed:", e);
    }
  }, interval);

  // Trigger an immediate sync, plus on reconnect
  performSync().catch(() => {});
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      performSync().catch(() => {});
    });
  }
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function getLastSyncResult(): SyncResult | null {
  return lastSyncResult;
}

export function isSyncRunning(): boolean {
  return isSyncing;
}

export function isAutoSyncActive(): boolean {
  return syncInterval !== null;
}
