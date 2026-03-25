import { useColorScheme } from "react-native";
import {
  lightColors,
  darkColors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  type ThemeColors,
} from "../constants/theme";

export type Theme = {
  colors: ThemeColors;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  isDark: boolean;
};

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return {
    colors: isDark ? darkColors : lightColors,
    spacing,
    borderRadius,
    fontSize,
    fontWeight,
    isDark,
  };
}
