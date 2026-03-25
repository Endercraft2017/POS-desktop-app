import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { employeeRepo, settingsRepo } from "../../lib/repositories";

const MAX_PIN_LENGTH = 6;

export function LoginPage() {
  const theme = useTheme();
  const { colors, spacing, borderRadius, fontSize } = theme;
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Ensure default admin and settings on app load
  useEffect(() => {
    employeeRepo.ensureDefaultAdmin().catch(console.error);
    settingsRepo.initDefaults().catch(console.error);
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      setError("");
      setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev));
    },
    []
  );

  const handleBackspace = useCallback(() => {
    setError("");
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError("");
    setPin("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length === 0 || isAuthenticating) return;

    setIsAuthenticating(true);
    try {
      const found = await employeeRepo.authenticate(pin);
      if (found) {
        login({
          id: found.id,
          name: found.name,
          role: found.role as "admin" | "cashier",
          pin: found.pin,
          isActive: found.is_active === 1,
          createdAt: found.created_at,
          updatedAt: found.updated_at,
        } as any);
        navigate("/");
      } else {
        setError("Invalid PIN. Try again.");
        setPin("");
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setError("Authentication failed. Please try again.");
      setPin("");
    } finally {
      setIsAuthenticating(false);
    }
  }, [pin, isAuthenticating, login, navigate]);

  const numpadButtons = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["C", "0", "\u232B"],
  ];

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    backgroundColor: colors.background,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.lg,
    padding: spacing["2xl"],
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.lg,
    minWidth: 320,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: fontSize["4xl"],
    fontWeight: 700,
    color: colors.primary,
    margin: 0,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    margin: 0,
  };

  const dotsContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: spacing.sm,
    padding: `${spacing.md}px 0`,
  };

  const dotStyle = (filled: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: borderRadius.full,
    backgroundColor: filled ? colors.primary : "transparent",
    border: `2px solid ${filled ? colors.primary : colors.borderStrong}`,
    transition: "background-color 0.15s",
  });

  const numpadGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: spacing.sm,
    width: "100%",
  };

  const numpadBtnStyle = (key: string): React.CSSProperties => ({
    minHeight: 56,
    fontSize: fontSize["2xl"],
    fontWeight: 600,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: key === "C" || key === "\u232B" ? colors.surfaceElevated : colors.surface,
    color: colors.textPrimary,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.1s",
  });

  const submitBtnStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 48,
    fontSize: fontSize.lg,
    fontWeight: 600,
    backgroundColor: colors.buttonPrimary,
    color: colors.textOnPrimary,
    border: "none",
    borderRadius: borderRadius.md,
    cursor: "pointer",
    opacity: isAuthenticating ? 0.6 : 1,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: fontSize.sm,
    color: colors.error,
    margin: 0,
    minHeight: 20,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    margin: 0,
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>POS System</h1>
        <p style={subtitleStyle}>Enter your PIN to sign in</p>

        <div style={dotsContainerStyle}>
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
            <div key={i} style={dotStyle(i < pin.length)} />
          ))}
        </div>

        <p style={errorStyle}>{error || ""}</p>

        <div style={numpadGridStyle}>
          {numpadButtons.flat().map((key) => (
            <button
              key={key}
              style={numpadBtnStyle(key)}
              onClick={() => {
                if (key === "C") handleClear();
                else if (key === "\u232B") handleBackspace();
                else handleDigit(key);
              }}
            >
              {key}
            </button>
          ))}
        </div>

        <button style={submitBtnStyle} onClick={handleSubmit} disabled={isAuthenticating}>
          {isAuthenticating ? "Signing In..." : "Sign In"}
        </button>

        <p style={hintStyle}>Default admin PIN: 1234</p>
      </div>
    </div>
  );
}
