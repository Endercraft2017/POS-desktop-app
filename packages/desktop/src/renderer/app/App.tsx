import React, { useEffect, useState, Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "../hooks/use-theme";
import { useAuthStore } from "../stores/auth-store";
import { Sidebar } from "../components/ui/Sidebar";
import { TitleBar } from "../components/ui/TitleBar";
import { LoginPage } from "./pages/LoginPage";
import { CheckoutPage } from "./pages/CheckoutPage";
// Heavy/rarely-visited pages are lazy-loaded so they don't bloat the initial
// bundle. The first paint only costs ~Login + Checkout + Sidebar + TitleBar.
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const ProductsPage = lazy(() => import("./pages/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage").then((m) => ({ default: m.StatisticsPage })));
const SpreadsheetPage = lazy(() => import("./pages/SpreadsheetPage").then((m) => ({ default: m.SpreadsheetPage })));
const IngredientsPage = lazy(() => import("./pages/IngredientsPage").then((m) => ({ default: m.IngredientsPage })));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage").then((m) => ({ default: m.ExpensesPage })));
const SchedulingPage = lazy(() => import("./pages/SchedulingPage").then((m) => ({ default: m.SchedulingPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage").then((m) => ({ default: m.MessagesPage })));
import { startAutoSync, stopAutoSync } from "../lib/sync-manager";
import { startMessengerNotifications, stopMessengerNotifications } from "../lib/messenger-notifications";
import { markStartupReady } from "../lib/startup-perf";
import "./global.css";

interface Toast { id: string; title: string; body: string; }

function MessengerToasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1200, display: "flex", flexDirection: "column", gap: spacing.sm, maxWidth: 320 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderLeft: `4px solid ${colors.primary}`,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.textPrimary, marginBottom: 2 }}>{t.title}</div>
          <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: "pre-wrap" }}>{t.body}</div>
        </div>
      ))}
    </div>
  );
}

function ProtectedLayout() {
  const { colors } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        backgroundColor: colors.background,
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: colors.background,
        }}
      >
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/" element={<CheckoutPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/scheduling" element={<SchedulingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/spreadsheet" element={<SpreadsheetPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function PageLoadingFallback() {
  const { colors, fontSize } = useTheme();
  return (
    <div style={{ padding: 24, color: colors.textTertiary, fontSize: fontSize.sm }}>
      Loading…
    </div>
  );
}

export function App() {
  const { isAuthenticated } = useAuthStore();
  const { colors } = useTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      startAutoSync();
      startMessengerNotifications(({ id, title, body }) => {
        setToasts((prev) => [...prev, { id, title, body }]);
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 8000);
      });
    }
    return () => {
      stopAutoSync();
      stopMessengerNotifications();
    };
  }, [isAuthenticated]);

  // Record startup completion on the very first render (after paint settles)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      markStartupReady();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: colors.background,
        color: colors.textPrimary,
      }}
    >
      <TitleBar />
      {isAuthenticated && <MessengerToasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            isAuthenticated ? <ProtectedLayout /> : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </div>
  );
}
