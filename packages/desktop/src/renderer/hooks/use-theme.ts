import { useState, useEffect, useMemo } from "react";
import {
  lightColors,
  darkColors,
  spacing,
  borderRadius,
  fontSize,
  type ThemeColors,
} from "../constants/theme";
import { useSettingsStore } from "../stores/settings-store";

// Detect Android / mobile-sized device for responsive scaling
function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return window.innerWidth < 768;
}

function scaleObj<T extends Record<string, number>>(obj: T, factor: number): T {
  const out: any = {};
  for (const k in obj) out[k] = Math.round(obj[k] * factor);
  return out;
}

export type Theme = {
  colors: ThemeColors;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  fontSize: typeof fontSize;
  isDark: boolean;
  isMobile: boolean;
  isPortrait: boolean;
  themeMode: "system" | "light" | "dark";
  setThemeMode: (mode: "system" | "light" | "dark") => void;
};

export function useTheme(): Theme {
  const { themeMode, setThemeMode } = useSettingsStore();
  const [systemDark, setSystemDark] = useState(() => {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight > window.innerWidth : false
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", handler);
    const onResize = () => {
      setIsMobile(detectMobile());
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    return () => {
      media.removeEventListener("change", handler);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const isDark =
    themeMode === "system" ? systemDark : themeMode === "dark";

  // Portrait mobile: scale DOWN fonts to fit narrow boxes
  // Landscape mobile: scale UP for touch-friendly UI
  const scaledSpacing = useMemo(
    () => (isMobile ? scaleObj(spacing, isPortrait ? 0.8 : 1.25) : spacing),
    [isMobile, isPortrait]
  );
  const scaledFontSize = useMemo(
    () => (isMobile ? scaleObj(fontSize, isPortrait ? 0.8 : 1.2) : fontSize),
    [isMobile, isPortrait]
  );

  return {
    colors: isDark ? darkColors : lightColors,
    spacing: scaledSpacing as typeof spacing,
    borderRadius,
    fontSize: scaledFontSize as typeof fontSize,
    isDark,
    isMobile,
    isPortrait,
    themeMode,
    setThemeMode,
  };
}
