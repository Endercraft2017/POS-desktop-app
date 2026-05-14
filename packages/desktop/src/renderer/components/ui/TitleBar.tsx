import React from "react";
import { useTheme } from "../../hooks/use-theme";

export function TitleBar() {
  const { colors, fontSize } = useTheme();

  // Hide in web mode (no Electron IPC available)
  if (typeof window !== "undefined" && !window.electronAPI) return null;

  return (
    <div
      style={{
        height: 36,
        backgroundColor: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        display: "flex",
        alignItems: "center",
        paddingLeft: 16,
        WebkitAppRegion: "drag" as any,
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: fontSize.sm,
          fontWeight: 600,
          color: colors.textSecondary,
          letterSpacing: 0.5,
        }}
      >
        POS System
      </span>
    </div>
  );
}
