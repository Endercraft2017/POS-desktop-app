/**
 * Database bridge for the renderer.
 * - Desktop (Electron): IPC to better-sqlite3 in the main process.
 * - Web (browser): remote calls to the cloud API (/api/db/query, /api/db/exec).
 *   The web SPA has no local SQLite; it is online-only. The offline Android APK
 *   is a separate codebase (packages/mobile) and still has its own storage.
 */

declare global {
  interface Window {
    electronAPI?: {
      db: {
        query: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;
        exec: (sql: string) => Promise<{ success: boolean; error?: string }>;
        batch: (statements: { sql: string; params?: any[] }[]) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export type BatchStmt = { sql: string; params?: any[] };

const IS_WEB = typeof window !== "undefined" && !window.electronAPI;

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "/api";
const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || "afkcube_2017";

async function cloudQuery<T>(sql: string, params?: any[]): Promise<T[]> {
  const r = await fetch(`${API_BASE}/db/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ sql, params: params || [] }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "Cloud query failed");
  // /api/db/query returns either an array for SELECTs or a changes object for writes.
  // For writes we return []; callers use dbRun/dbExec which don't inspect rows.
  if (Array.isArray(j.data)) return j.data as T[];
  return [];
}

async function cloudExec(sql: string): Promise<void> {
  const r = await fetch(`${API_BASE}/db/exec`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ sql }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "Cloud exec failed");
}

export async function dbQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  if (IS_WEB) {
    return cloudQuery<T>(sql, params);
  }
  const result = await window.electronAPI!.db.query(sql, params);
  if (!result.success) throw new Error(result.error || "Database query failed");
  return result.data as T[];
}

export async function dbRun(sql: string, params?: any[]): Promise<void> {
  if (IS_WEB) {
    await cloudQuery(sql, params);
    return;
  }
  const result = await window.electronAPI!.db.query(sql, params);
  if (!result.success) throw new Error(result.error || "Database operation failed");
}

export async function dbExec(sql: string): Promise<void> {
  if (IS_WEB) {
    await cloudExec(sql);
    return;
  }
  const result = await window.electronAPI!.db.exec(sql);
  if (!result.success) throw new Error(result.error || "Database exec failed");
}

// Runs multiple statements atomically (single IPC + transaction) on desktop.
// On web there is no batch endpoint yet, so this falls back to serial calls.
export async function dbBatch(statements: BatchStmt[]): Promise<void> {
  if (statements.length === 0) return;
  if (IS_WEB) {
    for (const s of statements) await cloudQuery(s.sql, s.params);
    return;
  }
  const result = await window.electronAPI!.db.batch(statements);
  if (!result.success) throw new Error(result.error || "Database batch failed");
}
