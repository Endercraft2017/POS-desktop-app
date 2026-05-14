// Measures the time from module execution (main.tsx) to the first full render
// of the app, and persists the most recent measurement so Settings can show it.

const START_KEY = "__startup_start_ts";
const LAST_MS_KEY = "pos_last_startup_ms";

export function markStartupStart() {
  try {
    (window as any)[START_KEY] = performance.now();
  } catch {}
}

export function markStartupReady(): number | null {
  try {
    const start = (window as any)[START_KEY] as number | undefined;
    if (typeof start !== "number") return null;
    const elapsed = Math.round(performance.now() - start);
    window.localStorage.setItem(LAST_MS_KEY, String(elapsed));
    window.localStorage.setItem(LAST_MS_KEY + "_at", new Date().toISOString());
    // Clear so a fresh in-tab navigation won't re-record the wrong delta
    delete (window as any)[START_KEY];
    console.log(`[startup] ready in ${elapsed} ms`);
    return elapsed;
  } catch {
    return null;
  }
}

export function getLastStartupMs(): { ms: number; at: string } | null {
  try {
    const raw = window.localStorage.getItem(LAST_MS_KEY);
    const at = window.localStorage.getItem(LAST_MS_KEY + "_at") || "";
    if (!raw) return null;
    const ms = parseInt(raw, 10);
    if (isNaN(ms)) return null;
    return { ms, at };
  } catch {
    return null;
  }
}
