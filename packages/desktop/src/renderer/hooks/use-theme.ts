import { useState, useEffect } from "react";
import {
  lightColors,
  darkColors,
  spacing,
  borderRadius,
  fontSize,
  type ThemeColors,
} from "../constants/theme";
import { useSettingsStore } from "../stores/settings-store";

export type Theme = {
  colors: ThemeColors;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  fontSize: typeof fontSize;
  isDark: boolean;
  themeMode: "system" | "light" | "dark";
  setThemeMode: (mode: "system" | "light" | "dark") => void;
};

export function useTheme(): Theme {
  const { themeMode, setThemeMode } = useSettingsStore();
  const [systemDark, setSystemDark] = useState(() => {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const isDark =
    themeMode === "system" ? systemDark : themeMode === "dark";

  return {
    colors: isDark ? darkColors : lightColors,
    spacing,
    borderRadius,
    fontSize,
    isDark,
    themeMode,
    setThemeMode,
  };
}
