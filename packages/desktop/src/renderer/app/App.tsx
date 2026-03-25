import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "../hooks/use-theme";
import { useAuthStore } from "../stores/auth-store";
import { Sidebar } from "../components/ui/Sidebar";
import { LoginPage } from "./pages/LoginPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import "./global.css";

function ProtectedLayout() {
  const { colors } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
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
        <Routes>
          <Route path="/" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const { isAuthenticated } = useAuthStore();
  const { colors } = useTheme();

  return (
    <div
      style={{
        height: "100vh",
        backgroundColor: colors.background,
        color: colors.textPrimary,
      }}
    >
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
