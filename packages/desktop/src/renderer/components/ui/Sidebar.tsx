import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";

const NAV_ITEMS = [
  { path: "/", label: "Checkout", icon: "C" },
  { path: "/orders", label: "Orders", icon: "O" },
  { path: "/products", label: "Products", icon: "P" },
  { path: "/dashboard", label: "Dashboard", icon: "D" },
  { path: "/settings", label: "Settings", icon: "S" },
];

export function Sidebar() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const { currentEmployee, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside
      style={{
        width: 220,
        backgroundColor: colors.surface,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        padding: spacing.sm,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: spacing.md,
          marginBottom: spacing.md,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div
          style={{
            fontSize: fontSize["2xl"],
            fontWeight: 700,
            color: colors.primary,
          }}
        >
          POS System
        </div>
        {currentEmployee && (
          <div
            style={{
              fontSize: fontSize.xs,
              color: colors.textTertiary,
              marginTop: spacing.xs,
            }}
          >
            {currentEmployee.name} ({currentEmployee.role})
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: borderRadius.sm,
              textDecoration: "none",
              fontSize: fontSize.md,
              fontWeight: 500,
              color: isActive ? colors.textOnPrimary : colors.textSecondary,
              backgroundColor: isActive ? colors.primary : "transparent",
              transition: "all 0.15s ease",
            })}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: borderRadius.sm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: fontSize.sm,
                fontWeight: 600,
              }}
            >
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.sm,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: borderRadius.sm,
          fontSize: fontSize.md,
          fontWeight: 500,
          color: colors.error,
          backgroundColor: "transparent",
          width: "100%",
          textAlign: "left",
          marginTop: spacing.md,
          borderTop: `1px solid ${colors.border}`,
          paddingTop: spacing.md,
        }}
      >
        Sign Out
      </button>
    </aside>
  );
}
