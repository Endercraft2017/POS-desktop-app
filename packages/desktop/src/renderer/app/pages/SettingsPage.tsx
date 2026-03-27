import React from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { Tooltip } from "../../components/ui/Tooltip";

const SETTING_LINKS = [
  { label: "Categories", description: "Manage product categories" },
  { label: "Ingredients", description: "Manage ingredients and recipes" },
  { label: "Suppliers", description: "Manage suppliers" },
  { label: "Tax Rates", description: "Configure tax rates" },
  { label: "Employees", description: "Manage employee accounts and PINs" },
];

const THEME_OPTIONS: { value: "system" | "light" | "dark"; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPage() {
  const { colors, spacing, borderRadius, fontSize, isDark, themeMode, setThemeMode } =
    useTheme();
  const navigate = useNavigate();
  const { currentEmployee, logout } = useAuthStore();
  const { tooltipsEnabled, setTooltipsEnabled } = useSettingsStore();

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  const containerStyle: React.CSSProperties = {
    padding: spacing.lg,
    display: "flex",
    flexDirection: "column",
    gap: spacing.lg,
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
  };

  const headerStyle: React.CSSProperties = {
    fontSize: fontSize["3xl"],
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: fontSize.xl,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
    marginBottom: spacing.sm,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${spacing.sm}px 0`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: 600,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: 600,
  };

  const linkBtnStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: `${spacing.md}px`,
    fontSize: fontSize.md,
    fontWeight: 600,
    backgroundColor: "transparent",
    color: colors.textPrimary,
    border: "none",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
    textAlign: "left",
    minHeight: 48,
  };

  const signOutBtnStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 48,
    fontSize: fontSize.lg,
    fontWeight: 600,
    backgroundColor: colors.buttonDestructive,
    color: colors.textOnPrimary,
    border: "none",
    borderRadius: borderRadius.md,
    cursor: "pointer",
  };

  const themeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    backgroundColor: active ? colors.primary : colors.buttonSecondary,
    color: active ? colors.textOnPrimary : colors.buttonSecondaryText,
    border: `1px solid ${active ? colors.primary : colors.border}`,
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    minHeight: 32,
    transition: "all 0.15s ease",
  });

  const toggleTrackStyle = (on: boolean): React.CSSProperties => ({
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: on ? colors.primary : colors.border,
    position: "relative",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
    flexShrink: 0,
  });

  const toggleKnobStyle = (on: boolean): React.CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    position: "absolute",
    top: 3,
    left: on ? 23 : 3,
    transition: "left 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  });

  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>Settings</h1>

      {/* Current Session */}
      <div>
        <h2 style={sectionTitleStyle}>Current Session</h2>
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>Employee</span>
            <span style={valueStyle}>
              {currentEmployee?.name ?? "Unknown"}
            </span>
          </div>
          <div
            style={{
              ...rowStyle,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <span style={labelStyle}>Role</span>
            <span
              style={{
                ...valueStyle,
                textTransform: "capitalize",
              }}
            >
              {currentEmployee?.role ?? "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Management Links */}
      <div>
        <h2 style={sectionTitleStyle}>Management</h2>
        <div style={cardStyle}>
          {SETTING_LINKS.map((link, i) => (
            <Tooltip key={link.label} text={link.description} position="right">
              <button
                style={{
                  ...linkBtnStyle,
                  borderBottom:
                    i === SETTING_LINKS.length - 1
                      ? "none"
                      : linkBtnStyle.borderBottom,
                }}
                onClick={() => alert("Coming soon")}
              >
                <div>
                  <div>{link.label}</div>
                  <div
                    style={{
                      fontSize: fontSize.xs,
                      color: colors.textTertiary,
                      fontWeight: 400,
                      marginTop: 2,
                    }}
                  >
                    {link.description}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: fontSize.lg,
                    color: colors.textTertiary,
                  }}
                >
                  &rsaquo;
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div>
        <h2 style={sectionTitleStyle}>Appearance</h2>
        <div style={cardStyle}>
          {/* Theme Mode */}
          <div style={rowStyle}>
            <div>
              <span style={labelStyle}>Theme</span>
              <div
                style={{
                  fontSize: fontSize.xs,
                  color: colors.textTertiary,
                  marginTop: 2,
                }}
              >
                Currently {isDark ? "dark" : "light"}
                {themeMode === "system" ? " (following system)" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {THEME_OPTIONS.map((opt) => (
                <Tooltip
                  key={opt.value}
                  text={
                    opt.value === "system"
                      ? "Follow your OS theme preference"
                      : `Always use ${opt.value} mode`
                  }
                  position="top"
                >
                  <button
                    style={themeBtnStyle(themeMode === opt.value)}
                    onClick={() => setThemeMode(opt.value)}
                  >
                    {opt.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Tooltips Toggle */}
          <div
            style={{
              ...rowStyle,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <div>
              <span style={labelStyle}>Tooltips</span>
              <div
                style={{
                  fontSize: fontSize.xs,
                  color: colors.textTertiary,
                  marginTop: 2,
                }}
              >
                Show helpful hints when hovering over elements
              </div>
            </div>
            <Tooltip
              text={tooltipsEnabled ? "Click to disable tooltips" : "Click to enable tooltips"}
              position="left"
            >
              <div
                style={toggleTrackStyle(tooltipsEnabled)}
                onClick={() => setTooltipsEnabled(!tooltipsEnabled)}
                role="switch"
                aria-checked={tooltipsEnabled}
              >
                <div style={toggleKnobStyle(tooltipsEnabled)} />
              </div>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div>
        <h2 style={sectionTitleStyle}>System Info</h2>
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>Database</span>
            <span style={valueStyle}>Local SQLite</span>
          </div>
          <div
            style={{
              ...rowStyle,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <span style={labelStyle}>Version</span>
            <span style={valueStyle}>1.0.0</span>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <Tooltip text="Sign out of this session" position="top">
        <button style={signOutBtnStyle} onClick={handleSignOut}>
          Sign Out
        </button>
      </Tooltip>
    </div>
  );
}
