import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { useUiStore } from "../../stores/ui-store";

const NAV_ITEMS = [
  { path: "/", label: "Checkout", icon: "C" },
  { path: "/orders", label: "Orders", icon: "O" },
  { path: "/products", label: "Products", icon: "P" },
  { path: "/ingredients", label: "Ingredients", icon: "I" },
  { path: "/scheduling", label: "Scheduling", icon: "T" },
  { path: "/dashboard", label: "Dashboard", icon: "D" },
  { path: "/messages", label: "Messages", icon: "M" },
  { path: "/settings", label: "Settings", icon: "S" },
];

// Full sidebar for desktop landscape
function DesktopSidebar() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const { currentEmployee, logout } = useAuthStore();
  const navigate = useNavigate();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [logoutHovered, setLogoutHovered] = useState(false);

  return (
    <aside
      style={{
        width: 200,
        backgroundColor: colors.surface,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        padding: spacing.sm,
        flexShrink: 0,
      }}
    >
      <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, marginBottom: spacing.sm, borderBottom: `1px solid ${colors.border}`, paddingBottom: spacing.sm }}>
        <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.primary }}>POS System</div>
        {currentEmployee && (
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
            {currentEmployee.name} ({currentEmployee.role})
          </div>
        )}
      </div>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            onMouseEnter={() => setHoveredPath(item.path)}
            onMouseLeave={() => setHoveredPath(null)}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              padding: `${spacing.xs + 2}px ${spacing.sm}px`,
              borderRadius: borderRadius.sm,
              textDecoration: "none",
              fontSize: fontSize.sm,
              fontWeight: 500,
              color: isActive ? colors.textOnPrimary : colors.textSecondary,
              backgroundColor: isActive ? colors.primary : hoveredPath === item.path ? colors.surfaceElevated : "transparent",
              transition: "background-color 0.1s",
              width: "100%",
            })}
          >
            <span style={{ width: 22, height: 22, borderRadius: borderRadius.sm, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fontSize.xs, fontWeight: 600 }}>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={() => { logout(); navigate("/login"); }}
        onMouseEnter={() => setLogoutHovered(true)}
        onMouseLeave={() => setLogoutHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: spacing.sm,
          padding: `${spacing.xs + 2}px ${spacing.sm}px`, borderRadius: borderRadius.sm,
          fontSize: fontSize.sm, fontWeight: 500, color: colors.error,
          backgroundColor: logoutHovered ? colors.errorLight : "transparent",
          width: "100%", textAlign: "left", marginTop: spacing.sm,
          borderTop: `1px solid ${colors.border}`, paddingTop: spacing.sm,
          transition: "background-color 0.1s",
        }}
      >
        Sign Out
      </button>
    </aside>
  );
}

// Burger menu overlay for portrait/mobile
function BurgerMenu() {
  const { colors, spacing, borderRadius, fontSize, isMobile } = useTheme();
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const btnSize = isMobile ? 44 : 38;

  return (
    <>
      {/* Burger button — fixed top-left */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: 8,
          left: 8,
          width: btnSize,
          height: btnSize,
          borderRadius: borderRadius.sm,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          cursor: "pointer",
          zIndex: 900,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <span style={{ width: 18, height: 2, backgroundColor: colors.textPrimary, borderRadius: 1 }} />
        <span style={{ width: 18, height: 2, backgroundColor: colors.textPrimary, borderRadius: 1 }} />
        <span style={{ width: 18, height: 2, backgroundColor: colors.textPrimary, borderRadius: 1 }} />
      </button>

      {/* Overlay + drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 950,
            display: "flex",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 260,
              backgroundColor: colors.surface,
              display: "flex",
              flexDirection: "column",
              padding: spacing.md,
              boxShadow: "4px 0 16px rgba(0,0,0,0.3)",
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.primary, marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottom: `1px solid ${colors.border}` }}>
              POS System
            </div>

            <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: spacing.xs }}>
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  onClick={() => setOpen(false)}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.sm,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: borderRadius.sm,
                    textDecoration: "none",
                    fontSize: fontSize.md,
                    fontWeight: 600,
                    color: isActive ? colors.textOnPrimary : colors.textPrimary,
                    backgroundColor: isActive ? colors.primary : "transparent",
                  })}
                >
                  <span style={{ width: 28, height: 28, borderRadius: borderRadius.sm, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fontSize.sm, fontWeight: 700 }}>
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <button
              onClick={() => { setOpen(false); logout(); navigate("/login"); }}
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                fontSize: fontSize.md,
                fontWeight: 600,
                color: colors.error,
                backgroundColor: "transparent",
                border: "none",
                borderTop: `1px solid ${colors.border}`,
                marginTop: spacing.md,
                paddingTop: spacing.md,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar() {
  const { isMobile, isPortrait } = useTheme();
  const compactMode = useUiStore((s) => s.compactMode);

  // In compact mode, burger menu or portrait mobile: use the burger drawer
  if (compactMode || (isMobile && isPortrait)) {
    return <BurgerMenu />;
  }

  return <DesktopSidebar />;
}
