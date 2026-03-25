/**
 * Database bridge for the renderer process.
 * Communicates with the main process via IPC to execute SQL queries
 * against the local better-sqlite3 database.
 */

declare global {
  interface Window {
    electronAPI: {
      db: {
        query: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;
        exec: (sql: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export async function dbQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await window.electronAPI.db.query(sql, params);
  if (!result.success) {
    throw new Error(result.error || "Database query failed");
  }
  return result.data as T[];
}

export async function dbRun(sql: string, params?: any[]): Promise<void> {
  const result = await window.electronAPI.db.query(sql, params);
  if (!result.success) {
    throw new Error(result.error || "Database operation failed");
  }
}

export async function dbExec(sql: string): Promise<void> {
  const result = await window.electronAPI.db.exec(sql);
  if (!result.success) {
    throw new Error(result.error || "Database exec failed");
  }
}
