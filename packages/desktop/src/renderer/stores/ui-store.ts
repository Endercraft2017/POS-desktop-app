import { create } from "zustand";

type UiStore = {
  // Hides sidebar + search bar + category filter pills for a clean POS view
  compactMode: boolean;
  toggleCompact: () => void;
  setCompact: (v: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  compactMode: false,
  toggleCompact: () => set((s) => ({ compactMode: !s.compactMode })),
  setCompact: (v) => set({ compactMode: v }),
}));
