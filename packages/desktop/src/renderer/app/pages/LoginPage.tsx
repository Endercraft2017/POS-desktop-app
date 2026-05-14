import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/use-theme";
import { useAuthStore } from "../../stores/auth-store";
import { employeeRepo, settingsRepo } from "../../lib/repositories";

export function LoginPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    employeeRepo.ensureDefaultAdmin().catch(console.error);
    settingsRepo.initDefaults().catch(console.error);
    // Auto-focus the PIN input
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
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
          setError("Invalid PIN. Please try again.");
          setPin("");
          inputRef.current?.focus();
        }
      } catch (err) {
        console.error("Authentication error:", err);
        setError("Authentication failed. Please try again.");
        setPin("");
        inputRef.current?.focus();
      } finally {
        setIsAuthenticating(false);
      }
    },
    [pin, isAuthenticating, login, navigate]
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        backgroundColor: colors.background,
      }}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.lg,
          padding: `${spacing["2xl"]}px ${spacing["2xl"]}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: spacing.lg,
          width: 380,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Logo / Title */}
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontSize: fontSize["4xl"],
              fontWeight: 700,
              color: colors.primary,
              margin: 0,
            }}
          >
            POS System
          </h1>
          <p
            style={{
              fontSize: fontSize.md,
              color: colors.textSecondary,
              margin: `${spacing.xs}px 0 0`,
            }}
          >
            Sign in to continue
          </p>
        </div>

        {/* PIN Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: spacing.md,
          }}
        >
          <div>
            <label
              htmlFor="pin-input"
              style={{
                display: "block",
                fontSize: fontSize.sm,
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: spacing.xs,
              }}
            >
              Employee PIN
            </label>
            <input
              ref={inputRef}
              id="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              placeholder="Enter your PIN"
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setPin(val);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              style={{
                width: "100%",
                padding: `${spacing.sm + 2}px ${spacing.md}px`,
                fontSize: fontSize.xl,
                fontWeight: 600,
                letterSpacing: 8,
                textAlign: "center",
                border: `2px solid ${error ? colors.error : colors.border}`,
                borderRadius: borderRadius.md,
                backgroundColor: colors.background,
                color: colors.textPrimary,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                if (!error) e.target.style.borderColor = colors.primary;
              }}
              onBlur={(e) => {
                if (!error) e.target.style.borderColor = colors.border;
              }}
            />
          </div>

          {/* Error message */}
          <div
            style={{
              minHeight: 20,
              fontSize: fontSize.sm,
              color: colors.error,
              textAlign: "center",
            }}
          >
            {error}
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isAuthenticating || pin.length === 0}
            style={{
              width: "100%",
              minHeight: 44,
              fontSize: fontSize.md,
              fontWeight: 600,
              backgroundColor: colors.buttonPrimary,
              color: colors.textOnPrimary,
              border: "none",
              borderRadius: borderRadius.md,
              cursor: isAuthenticating || pin.length === 0 ? "not-allowed" : "pointer",
              opacity: isAuthenticating || pin.length === 0 ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {isAuthenticating ? "Signing in..." : "Sign In"}
          </button>
        </form>

      </div>
    </div>
  );
}
