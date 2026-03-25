import { eq, and, isNull } from "drizzle-orm";
import { employees } from "@pos/core/schema";
import type { Employee, NewEmployee } from "@pos/core/types";
import { generateId, getDeviceId } from "@pos/core/utils";
import { getDatabase } from "../database";

// Simple hash for PIN - in production use bcrypt via native module
// This is a placeholder that should be replaced with expo-crypto or a native bcrypt binding
function hashPin(pin: string): string {
  // Using a simple approach for local-only mode
  // TODO: Replace with bcrypt when adding cloud sync
  let hash = 0;
  const salt = "pos-salt-2026";
  const salted = salt + pin + salt;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `hash:${Math.abs(hash).toString(36)}`;
}

function verifyPin(pin: string, hashedPin: string): boolean {
  return hashPin(pin) === hashedPin;
}

export const employeeRepository = {
  getAll: async (): Promise<Employee[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(employees)
      .where(isNull(employees.deletedAt))
      .orderBy(employees.name);
  },

  getActive: async (): Promise<Employee[]> => {
    const db = getDatabase();
    return db
      .select()
      .from(employees)
      .where(
        and(eq(employees.isActive, true), isNull(employees.deletedAt))
      )
      .orderBy(employees.name);
  },

  getById: async (id: string): Promise<Employee | undefined> => {
    const db = getDatabase();
    const result = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)));
    return result[0];
  },

  authenticate: async (pin: string): Promise<Employee | null> => {
    const db = getDatabase();
    const allActive = await db
      .select()
      .from(employees)
      .where(
        and(eq(employees.isActive, true), isNull(employees.deletedAt))
      );

    for (const emp of allActive) {
      if (verifyPin(pin, emp.pin)) {
        return emp;
      }
    }
    return null;
  },

  create: async (
    data: { name: string; pin: string; role?: "admin" | "manager" | "cashier" }
  ): Promise<Employee> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const newEmployee: NewEmployee = {
      id: generateId(),
      deviceId: getDeviceId(),
      createdAt: now,
      updatedAt: now,
      name: data.name,
      pin: hashPin(data.pin),
      role: data.role || "cashier",
      isActive: true,
    };
    await db.insert(employees).values(newEmployee);
    return newEmployee as Employee;
  },

  update: async (
    id: string,
    data: { name?: string; role?: string; isActive?: boolean }
  ): Promise<void> => {
    const db = getDatabase();
    await db
      .update(employees)
      .set({ ...data, updatedAt: new Date().toISOString() } as any)
      .where(eq(employees.id, id));
  },

  changePin: async (id: string, newPin: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(employees)
      .set({
        pin: hashPin(newPin),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(employees.id, id));
  },

  softDelete: async (id: string): Promise<void> => {
    const db = getDatabase();
    await db
      .update(employees)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(employees.id, id));
  },

  ensureDefaultAdmin: async (): Promise<void> => {
    const db = getDatabase();
    const all = await db
      .select()
      .from(employees)
      .where(isNull(employees.deletedAt));

    if (all.length === 0) {
      await employeeRepository.create({
        name: "Admin",
        pin: "1234",
        role: "admin",
      });
    }
  },
};
