import { create } from "zustand";

interface SettingsState {
  tooltipsEnabled: boolean;
  themeMode: "system" | "light" | "dark";
  setTooltipsEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: "system" | "light" | "dark") => void;
}

const STORAGE_KEY = "pos-settings";

function loadSettings(): Pick<SettingsState, "tooltipsEnabled" | "themeMode"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { tooltipsEnabled: true, themeMode: "system" };
}

function saveSettings(s: Pick<SettingsState, "tooltipsEnabled" | "themeMode">) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = loadSettings();
  return {
    ...initial,
    setTooltipsEnabled: (enabled) => {
      set({ tooltipsEnabled: enabled });
      saveSettings({ ...get(), tooltipsEnabled: enabled });
    },
    setThemeMode: (mode) => {
      set({ themeMode: mode });
      saveSettings({ ...get(), themeMode: mode });
    },
  };
});
