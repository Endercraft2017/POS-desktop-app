/**
 * Platform-agnostic sync service for POS cloud sync.
 * Both mobile (Drizzle/op-sqlite) and desktop (IPC/better-sqlite3)
 * implement the SyncAdapter interface, then call pushChanges/pullChanges.
 */

export interface SyncLogRow {
  id: string;
  table_name: string;
  record_id: string;
  operation: string;
  payload: string;
  device_id: string;
  timestamp: string;
}

export interface SyncAdapter {
  getUnsyncedLogs(limit?: number): Promise<SyncLogRow[]>;
  markSynced(ids: string[]): Promise<void>;
  applyRemoteChange(change: SyncLogRow): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  error?: string;
}

const BATCH_SIZE = 100;

export async function pushChanges(
  adapter: SyncAdapter,
  serverUrl: string,
  deviceId: string
): Promise<number> {
  const unsynced = await adapter.getUnsyncedLogs(BATCH_SIZE);
  if (unsynced.length === 0) return 0;

  const response = await fetch(`${serverUrl}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, changes: unsynced }),
  });

  if (!response.ok) {
    throw new Error(`Sync push failed: ${response.status}`);
  }

  const result = (await response.json()) as { ok: boolean };
  if (result.ok) {
    await adapter.markSynced(unsynced.map((l) => l.id));
  }
  return unsynced.length;
}

export async function pullChanges(
  adapter: SyncAdapter,
  serverUrl: string,
  deviceId: string
): Promise<number> {
  const lastSync = await adapter.getSetting("last_sync_timestamp");
  const params = new URLSearchParams({ deviceId });
  if (lastSync) params.set("since", lastSync);

  const response = await fetch(`${serverUrl}/api/sync/pull?${params}`);
  if (!response.ok) {
    throw new Error(`Sync pull failed: ${response.status}`);
  }

  const { changes, serverTimestamp } = (await response.json()) as {
    changes: SyncLogRow[];
    serverTimestamp: string;
  };

  for (const change of changes) {
    try {
      await adapter.applyRemoteChange(change);
    } catch (e) {
      console.warn("[Sync] Failed to apply remote change:", change.id, e);
    }
  }

  if (serverTimestamp) {
    await adapter.setSetting("last_sync_timestamp", serverTimestamp);
  }

  return changes.length;
}

export async function syncAll(
  adapter: SyncAdapter,
  serverUrl: string,
  deviceId: string
): Promise<SyncResult> {
  try {
    const pushed = await pushChanges(adapter, serverUrl, deviceId);
    const pulled = await pullChanges(adapter, serverUrl, deviceId);
    return { pushed, pulled };
  } catch (e: any) {
    return { pushed: 0, pulled: 0, error: e.message };
  }
}
