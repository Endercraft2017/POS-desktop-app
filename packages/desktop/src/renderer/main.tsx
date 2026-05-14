import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { setSyncRefreshHook } from "./lib/sync-manager";
import { markStartupStart } from "./lib/startup-perf";
markStartupStart();

const IS_WEB = typeof window !== "undefined" && !(window as any).electronAPI;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Web (online-only): every query already fetches from the cloud; don't
      // refetch on every mount, treat results as fresh for a short window.
      staleTime: IS_WEB ? 1000 * 30 : 1000 * 60,
      refetchOnMount: IS_WEB ? true : true,
      // Previously `IS_WEB` (i.e. true on the APK), which made every app-resume
      // refetch *every* mounted query — 4–6 round-trips on Checkout alone, on
      // each resume. Android suspends the WebView aggressively, so this was a
      // real mobile-data sink. We rely on staleTime + explicit invalidate()
      // calls for freshness instead. Set to `true` again only if a specific
      // page needs it via its own useQuery({ refetchOnWindowFocus: true }).
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function showSplash(message: string) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#0f172a;color:#e2e8f0;font-family:sans-serif;gap:16px;">
        <div style="width:48px;height:48px;border:4px solid #1e293b;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;"></div>
        <p style="font-size:14px;color:#94a3b8;">${message}</p>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      </div>
    `;
  }
}

async function start() {
  if (IS_WEB) {
    // Online-only web: no local SQLite, no OPFS bootstrap.
    // Every query goes directly to the cloud API. The splash shows briefly
    // while the React bundle mounts, then the login screen appears.
    showSplash("Loading…");
  }

  setSyncRefreshHook(() => {
    console.log("[sync-refresh] resetting + refetching queries");
    queryClient.invalidateQueries();
    queryClient.refetchQueries({ type: "active" });
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pos-sync-pulled", () => {
      queryClient.invalidateQueries();
      queryClient.refetchQueries({ type: "active" });
    });
  }

  const root = createRoot(document.getElementById("root")!);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

start();
