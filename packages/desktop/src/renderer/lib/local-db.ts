// Browser-side SQLite via @sqlite.org/sqlite-wasm.
// Uses OPFS for persistent storage when available, falls back to in-memory.
// Used by db-bridge.ts when running in web mode.

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { SCHEMA_SQL, SYNCED_TABLES } from "./schema-sql";

let db: any = null;
let initPromise: Promise<any> | null = null;

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "/api";
const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || "";

export function isLocalDbReady() {
  return db !== null;
}

export function getLocalDb() {
  if (!db) throw new Error("Local DB not initialized — call initLocalDb() first");
  return db;
}

export async function initLocalDb(): Promise<any> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("[local-db] Initializing sqlite-wasm…");
    const sqlite3 = await sqlite3InitModule({
      print: () => {},
      printErr: (msg: string) => console.error("[sqlite3]", msg),
    });
    console.log(`[local-db] sqlite3 version ${sqlite3.version.libVersion}`);

    // Try OPFS-backed (persistent) first, fall back to in-memory
    if ("opfs" in sqlite3) {
      try {
        db = new (sqlite3 as any).oo1.OpfsDb("/pos-local.db", "ct");
        console.log("[local-db] Using OPFS-backed persistent DB");
      } catch (e) {
        console.warn("[local-db] OPFS failed, falling back to in-memory:", e);
        db = new sqlite3.oo1.DB("/pos-local.db", "ct");
      }
    } else {
      console.warn("[local-db] OPFS not available — using in-memory DB (data won't persist)");
      db = new sqlite3.oo1.DB("/pos-local.db", "ct");
    }

    // Apply schema (idempotent)
    db.exec(SCHEMA_SQL);
    console.log("[local-db] Schema applied");

    // Column migrations for existing OPFS DBs that predate schema changes.
    // sqlite3.wasm throws on duplicate columns; swallow that specific error.
    // Returns true when the column was actually added.
    const tryAlter = (sql: string): boolean => {
      try { db!.exec(sql); return true; }
      catch (e: any) { if (/duplicate column/i.test(String(e?.message || e))) return false; throw e; }
    };
    tryAlter("ALTER TABLE orders ADD COLUMN customer_name TEXT");
    tryAlter("ALTER TABLE operational_expenses ADD COLUMN due_date TEXT");
    if (tryAlter("ALTER TABLE operational_expenses ADD COLUMN paid_at TEXT")) {
      db!.exec("UPDATE operational_expenses SET paid_at = created_at WHERE paid_at IS NULL");
    }
    tryAlter("ALTER TABLE operational_expenses ADD COLUMN exclude_from_expenses INTEGER NOT NULL DEFAULT 0");

    return db;
  })();

  return initPromise;
}

export async function isFirstLaunch(): Promise<boolean> {
  if (!db) return true;
  let count = 0;
  try {
    db.exec({
      sql: "SELECT COUNT(*) as cnt FROM products WHERE deleted_at IS NULL",
      rowMode: "object",
      callback: (row: any) => { count = row.cnt; },
    });
  } catch {
    return true;
  }
  return count === 0;
}

async function fetchCloudRows(table: string): Promise<any[]> {
  const r = await fetch(`${API_BASE}/db/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ sql: `SELECT * FROM ${table}` }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "fetch failed");
  return j.data || [];
}

/**
 * Pulls a full snapshot of every synced table from the cloud and inserts
 * into the local SQLite. Run only when the local DB is empty.
 */
export async function bootstrapFromCloud(onProgress?: (table: string, n: number) => void): Promise<void> {
  if (!db) throw new Error("Local DB not initialized");
  console.log("[local-db] Bootstrapping from cloud…");

  // 1) Fetch all tables in parallel — the network is fast, the worker's
  //    per-statement overhead is the actual bottleneck.
  const fetched = await Promise.all(
    SYNCED_TABLES.map(async (table) => {
      try {
        const rows = await fetchCloudRows(table);
        return { table, rows };
      } catch (e: any) {
        console.warn(`[local-db] Fetch failed for ${table}:`, e.message);
        return { table, rows: [] as any[] };
      }
    })
  );

  // 2) Batch-insert using multi-row VALUES so we minimize worker round-trips.
  //    Sqlite's default SQLITE_MAX_VARIABLE_NUMBER is 32766 in recent builds,
  //    but we stay well below with a 100-row chunk.
  const CHUNK = 100;

  for (const { table, rows } of fetched) {
    if (rows.length === 0) {
      onProgress?.(table, 0);
      continue;
    }
    const t0 = performance.now();
    try {
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => (c === "group" ? `"${c}"` : c)).join(",");
      const rowPlaceholder = "(" + cols.map(() => "?").join(",") + ")";

      db.exec("BEGIN");
      try {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          const sql =
            `INSERT OR REPLACE INTO ${table} (${colList}) VALUES ` +
            slice.map(() => rowPlaceholder).join(",");
          const bind: any[] = [];
          for (const row of slice) {
            for (const c of cols) bind.push(row[c] ?? null);
          }
          db.exec({ sql, bind });
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      const ms = Math.round(performance.now() - t0);
      console.log(`[local-db] Bootstrapped ${rows.length} rows from ${table} in ${ms} ms`);
      onProgress?.(table, rows.length);
    } catch (e: any) {
      console.warn(`[local-db] Insert failed for ${table}:`, e.message);
    }
  }

  // Mark bootstrap done
  db.exec({
    sql: `INSERT OR REPLACE INTO settings (id, device_id, key, value, "group") VALUES (?, ?, 'web_bootstrap_at', ?, 'sync')`,
    bind: [`bootstrap_${Date.now()}`, "web", new Date().toISOString()],
  });
  console.log("[local-db] Bootstrap complete");
}
