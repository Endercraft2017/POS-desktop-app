import { ulid } from "ulidx";
import { dbRun, type BatchStmt } from "./db-bridge";

const IS_WEB = typeof window !== "undefined" && !window.electronAPI;
function getDeviceId(): string {
  if (!IS_WEB) return "desktop-001";
  let id = localStorage.getItem("web_device_id");
  if (!id) {
    id = "web-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("web_device_id", id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();

export const SYNC_LOG_SQL =
  `INSERT INTO sync_log (id, table_name, record_id, operation, payload, device_id, timestamp, synced)
   VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 0)`;

// Builds a sync-log statement for use inside a batch/transaction, so callers
// can atomically write domain rows and their sync log in a single IPC call.
export function syncLogStmt(
  tableName: string,
  recordId: string,
  operation: "insert" | "update" | "delete",
  payload: Record<string, any>
): BatchStmt {
  return {
    sql: SYNC_LOG_SQL,
    params: [ulid(), tableName, recordId, operation, JSON.stringify(payload), DEVICE_ID],
  };
}

export async function writeSyncLog(
  tableName: string,
  recordId: string,
  operation: "insert" | "update" | "delete",
  payload: Record<string, any>
): Promise<void> {
  try {
    await dbRun(
      SYNC_LOG_SQL,
      [ulid(), tableName, recordId, operation, JSON.stringify(payload), DEVICE_ID]
    );
  } catch (e) {
    console.warn("[SyncLog] Failed to write sync log:", e);
  }
}
