import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { Tooltip } from "./Tooltip";

const NAV_ITEMS = [
  { path: "/", label: "Checkout", icon: "C", tip: "Ring up sales and manage the cart" },
  { path: "/orders", label: "Orders", icon: "O", tip: "View order history and manage held orders" },
  { path: "/products", label: "Products", icon: "P", tip: "Add, edit, or remove products" },
  { path: "/dashboard", label: "Dashboard", icon: "D", tip: "Sales overview and business metrics" },
  { path: "/settings", label: "Settings", icon: "S", tip: "Configure app preferences and manage data" },
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
          <Tooltip key={item.path} text={item.tip} position="right">
            <NavLink
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
                width: "100%",
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
          </Tooltip>
        ))}
      </nav>

      {/* Logout */}
      <Tooltip text="End your current session" position="right">
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
      </Tooltip>
    </aside>
  );
}
