import { create } from "zustand";
import type { Employee } from "@pos/core/types";

type AuthStore = {
  currentEmployee: Employee | null;
  isAuthenticated: boolean;
  login: (employee: Employee) => void;
  logout: () => void;
};

const STORAGE_KEY = "pos_auth_employee";

function loadPersisted(): Employee | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Employee;
  } catch {
    return null;
  }
}

function persist(employee: Employee | null) {
  if (typeof window === "undefined") return;
  try {
    if (employee) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(employee));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const persisted = loadPersisted();

export const useAuthStore = create<AuthStore>((set) => ({
  currentEmployee: persisted,
  isAuthenticated: !!persisted,
  login: (employee) => {
    persist(employee);
    set({ currentEmployee: employee, isAuthenticated: true });
  },
  logout: () => {
    persist(null);
    set({ currentEmployee: null, isAuthenticated: false });
  },
}));
