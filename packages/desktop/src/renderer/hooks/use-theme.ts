import { useState, useEffect } from "react";
import {
  lightColors,
  darkColors,
  spacing,
  borderRadius,
  fontSize,
  type ThemeColors,
} from "../constants/theme";

export type Theme = {
  colors: ThemeColors;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  fontSize: typeof fontSize;
  isDark: boolean;
  toggle: () => void;
};

export function useTheme(): Theme {
  const [isDark, setIsDark] = useState(() => {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  return {
    colors: isDark ? darkColors : lightColors,
    spacing,
    borderRadius,
    fontSize,
    isDark,
    toggle: () => setIsDark((prev) => !prev),
  };
}
