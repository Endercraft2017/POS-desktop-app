import { create } from "zustand";
import type { Employee } from "@pos/core/types";

type AuthStore = {
  currentEmployee: Employee | null;
  isAuthenticated: boolean;
  login: (employee: Employee) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  currentEmployee: null,
  isAuthenticated: false,

  login: (employee) =>
    set({ currentEmployee: employee, isAuthenticated: true }),

  logout: () =>
    set({ currentEmployee: null, isAuthenticated: false }),
}));
