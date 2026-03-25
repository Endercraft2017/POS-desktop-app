/**
 * Database repository layer for the desktop Electron POS app.
 * Uses raw SQL queries via IPC bridge to the main process SQLite database.
 */

import { ulid } from "ulidx";
import { dbQuery, dbRun } from "./db-bridge";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const DEVICE_ID = "desktop-001";

function now(): string {
  return new Date().toISOString();
}

function hashPin(pin: string): string {
  let hash = 0;
  const salt = "pos-salt-2026";
  const salted = salt + pin + salt;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `hash:${Math.abs(hash).toString(36)}`;
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayEnd(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Type helpers – row shapes returned from SQLite
// ---------------------------------------------------------------------------

export interface ProductRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  price: number;
  cost_price: number;
  category_id: string | null;
  image_uri: string | null;
  barcode: string | null;
  is_active: number;
  sort_order: number;
}

export interface CategoryRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: number;
}

export interface IngredientRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  is_active: number;
}

export interface SupplierRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface OrderRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  order_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  discount_type: string;
  discount_value: number;
  notes: string | null;
  employee_id: string | null;
  customer_id: string | null;
  completed_at: string | null;
}

export interface OrderItemRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  notes: string | null;
}

export interface PaymentRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  order_id: string;
  method: string;
  amount: number;
  reference: string | null;
  change: number;
  notes: string | null;
}

export interface EmployeeRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  pin: string;
  role: string;
  is_active: number;
}

export interface TaxRateRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  rate: number;
  is_default: number;
  is_active: number;
}

export interface CustomerRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  loyalty_points: number;
  total_spent: number;
  visit_count: number;
  is_active: number;
}

export interface ExpenseRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  notes: string | null;
  is_active: number;
}

export interface CouponRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  code: string;
  name: string;
  type: string;
  value: number;
  min_order_amount: number;
  max_uses: number;
  current_uses: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: number;
  buy_product_id: string | null;
  get_product_id: string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
}

export interface SettingRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  key: string;
  value: string;
  group: string;
}

// ---------------------------------------------------------------------------
// productRepo
// ---------------------------------------------------------------------------

export const productRepo = {
  async getAll(): Promise<ProductRow[]> {
    return dbQuery<ProductRow>(
      `SELECT * FROM products WHERE deleted_at IS NULL ORDER BY sort_order, name`
    );
  },

  async getActive(): Promise<ProductRow[]> {
    return dbQuery<ProductRow>(
      `SELECT * FROM products WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, name`
    );
  },

  async getById(id: string): Promise<ProductRow | null> {
    const rows = await dbQuery<ProductRow>(
      `SELECT * FROM products WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] ?? null;
  },

  async search(query: string): Promise<ProductRow[]> {
    const like = `%${query}%`;
    return dbQuery<ProductRow>(
      `SELECT * FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) ORDER BY name`,
      [like, like, like]
    );
  },

  async create(
    data: Omit<ProductRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO products (id, device_id, created_at, updated_at, name, sku, description, price, cost_price, category_id, image_uri, barcode, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.sku ?? null, data.description ?? null,
        data.price, data.cost_price ?? 0,
        data.category_id ?? null, data.image_uri ?? null, data.barcode ?? null,
        data.is_active ?? 1, data.sort_order ?? 0,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<ProductRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const entries = Object.entries(data);
    for (const [key, value] of entries) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// categoryRepo
// ---------------------------------------------------------------------------

export const categoryRepo = {
  async getAll(): Promise<CategoryRow[]> {
    return dbQuery<CategoryRow>(
      `SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name`
    );
  },

  async getActive(): Promise<CategoryRow[]> {
    return dbQuery<CategoryRow>(
      `SELECT * FROM categories WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, name`
    );
  },

  async create(
    data: Omit<CategoryRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO categories (id, device_id, created_at, updated_at, name, color, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.color ?? "#2563EB", data.icon ?? null,
        data.sort_order ?? 0, data.is_active ?? 1,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<CategoryRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// ingredientRepo
// ---------------------------------------------------------------------------

export const ingredientRepo = {
  async getAll(): Promise<IngredientRow[]> {
    return dbQuery<IngredientRow>(
      `SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async getActive(): Promise<IngredientRow[]> {
    return dbQuery<IngredientRow>(
      `SELECT * FROM ingredients WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name`
    );
  },

  async getLowStock(): Promise<IngredientRow[]> {
    return dbQuery<IngredientRow>(
      `SELECT * FROM ingredients WHERE deleted_at IS NULL AND is_active = 1 AND current_stock <= min_stock ORDER BY name`
    );
  },

  async create(
    data: Omit<IngredientRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO ingredients (id, device_id, created_at, updated_at, name, unit, current_stock, min_stock, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.unit,
        data.current_stock ?? 0, data.min_stock ?? 0,
        data.is_active ?? 1,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<IngredientRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE ingredients SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE ingredients SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// supplierRepo
// ---------------------------------------------------------------------------

export const supplierRepo = {
  async getAll(): Promise<SupplierRow[]> {
    return dbQuery<SupplierRow>(
      `SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async create(
    data: Omit<SupplierRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO suppliers (id, device_id, created_at, updated_at, name, contact_name, phone, email, address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.contact_name ?? null, data.phone ?? null,
        data.email ?? null, data.address ?? null, data.notes ?? null,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<SupplierRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE suppliers SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE suppliers SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// orderRepo
// ---------------------------------------------------------------------------

export interface OrderWithDetails extends OrderRow {
  items: OrderItemRow[];
  payments: PaymentRow[];
}

export interface TodayStats {
  total_orders: number;
  total_revenue: number;
  total_tax: number;
  total_discount: number;
  average_order: number;
}

export const orderRepo = {
  async getAll(limit: number = 50): Promise<OrderRow[]> {
    return dbQuery<OrderRow>(
      `SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
  },

  async getToday(): Promise<OrderRow[]> {
    return dbQuery<OrderRow>(
      `SELECT * FROM orders WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC`,
      [todayStart(), todayEnd()]
    );
  },

  async getById(id: string): Promise<OrderWithDetails | null> {
    const orders = await dbQuery<OrderRow>(
      `SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (!orders[0]) return null;

    const items = await dbQuery<OrderItemRow>(
      `SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL`,
      [id]
    );

    const payments = await dbQuery<PaymentRow>(
      `SELECT * FROM payments WHERE order_id = ? AND deleted_at IS NULL`,
      [id]
    );

    return { ...orders[0], items, payments };
  },

  async create(
    order: Omit<OrderRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">,
    items: Omit<OrderItemRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at" | "order_id">[]
  ): Promise<string> {
    const orderId = ulid();
    const ts = now();

    await dbRun(
      `INSERT INTO orders (id, device_id, created_at, updated_at, order_number, status, subtotal, tax_amount, discount_amount, total, discount_type, discount_value, notes, employee_id, customer_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId, DEVICE_ID, ts, ts,
        order.order_number, order.status ?? "pending",
        order.subtotal, order.tax_amount, order.discount_amount, order.total,
        order.discount_type ?? "none", order.discount_value ?? 0,
        order.notes ?? null, order.employee_id ?? null,
        order.customer_id ?? null, order.completed_at ?? null,
      ]
    );

    for (const item of items) {
      const itemId = ulid();
      await dbRun(
        `INSERT INTO order_items (id, device_id, created_at, updated_at, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId, DEVICE_ID, ts, ts,
          orderId, item.product_id, item.product_name,
          item.quantity, item.unit_price,
          item.discount_amount ?? 0, item.tax_amount ?? 0,
          item.total, item.notes ?? null,
        ]
      );
    }

    return orderId;
  },

  async addPayment(
    data: Omit<PaymentRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO payments (id, device_id, created_at, updated_at, order_id, method, amount, reference, change, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.order_id, data.method, data.amount,
        data.reference ?? null, data.change ?? 0, data.notes ?? null,
      ]
    );
    return id;
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const ts = now();
    const completedAt = status === "completed" ? ts : null;
    await dbRun(
      `UPDATE orders SET status = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ? AND deleted_at IS NULL`,
      [status, ts, completedAt, id]
    );
  },

  async getTodayStats(): Promise<TodayStats> {
    const rows = await dbQuery<{
      total_orders: number;
      total_revenue: number;
      total_tax: number;
      total_discount: number;
    }>(
      `SELECT
         COUNT(*) as total_orders,
         COALESCE(SUM(total), 0) as total_revenue,
         COALESCE(SUM(tax_amount), 0) as total_tax,
         COALESCE(SUM(discount_amount), 0) as total_discount
       FROM orders
       WHERE deleted_at IS NULL
         AND status = 'completed'
         AND created_at >= ?
         AND created_at <= ?`,
      [todayStart(), todayEnd()]
    );
    const r = rows[0];
    return {
      total_orders: r.total_orders,
      total_revenue: r.total_revenue,
      total_tax: r.total_tax,
      total_discount: r.total_discount,
      average_order: r.total_orders > 0 ? r.total_revenue / r.total_orders : 0,
    };
  },
};

// ---------------------------------------------------------------------------
// employeeRepo
// ---------------------------------------------------------------------------

export const employeeRepo = {
  async getAll(): Promise<EmployeeRow[]> {
    return dbQuery<EmployeeRow>(
      `SELECT * FROM employees WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async getActive(): Promise<EmployeeRow[]> {
    return dbQuery<EmployeeRow>(
      `SELECT * FROM employees WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name`
    );
  },

  async authenticate(pin: string): Promise<EmployeeRow | null> {
    const hashed = hashPin(pin);
    const rows = await dbQuery<EmployeeRow>(
      `SELECT * FROM employees WHERE pin = ? AND is_active = 1 AND deleted_at IS NULL`,
      [hashed]
    );
    return rows[0] ?? null;
  },

  async create(
    data: Omit<EmployeeRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at" | "pin"> & { pin: string }
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO employees (id, device_id, created_at, updated_at, name, pin, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, hashPin(data.pin),
        data.role ?? "cashier", data.is_active ?? 1,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<EmployeeRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">> & { pin?: string }
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === "pin") {
        fields.push("pin = ?");
        params.push(hashPin(value as string));
      } else {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE employees SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE employees SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },

  async ensureDefaultAdmin(): Promise<void> {
    const admins = await dbQuery<EmployeeRow>(
      `SELECT * FROM employees WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`
    );
    if (admins.length === 0) {
      const id = ulid();
      const ts = now();
      await dbRun(
        `INSERT INTO employees (id, device_id, created_at, updated_at, name, pin, role, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, DEVICE_ID, ts, ts, "Admin", hashPin("1234"), "admin", 1]
      );
    }
  },
};

// ---------------------------------------------------------------------------
// taxRateRepo
// ---------------------------------------------------------------------------

export const taxRateRepo = {
  async getAll(): Promise<TaxRateRow[]> {
    return dbQuery<TaxRateRow>(
      `SELECT * FROM tax_rates WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async getActive(): Promise<TaxRateRow[]> {
    return dbQuery<TaxRateRow>(
      `SELECT * FROM tax_rates WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name`
    );
  },

  async getDefault(): Promise<TaxRateRow | null> {
    const rows = await dbQuery<TaxRateRow>(
      `SELECT * FROM tax_rates WHERE deleted_at IS NULL AND is_active = 1 AND is_default = 1 LIMIT 1`
    );
    return rows[0] ?? null;
  },

  async create(
    data: Omit<TaxRateRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO tax_rates (id, device_id, created_at, updated_at, name, rate, is_default, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.rate,
        data.is_default ?? 0, data.is_active ?? 1,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<TaxRateRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE tax_rates SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE tax_rates SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// customerRepo
// ---------------------------------------------------------------------------

export const customerRepo = {
  async getAll(): Promise<CustomerRow[]> {
    return dbQuery<CustomerRow>(
      `SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async search(query: string): Promise<CustomerRow[]> {
    const like = `%${query}%`;
    return dbQuery<CustomerRow>(
      `SELECT * FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name`,
      [like, like, like]
    );
  },

  async create(
    data: Omit<CustomerRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO customers (id, device_id, created_at, updated_at, name, phone, email, address, notes, loyalty_points, total_spent, visit_count, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.phone ?? null, data.email ?? null,
        data.address ?? null, data.notes ?? null,
        data.loyalty_points ?? 0, data.total_spent ?? 0,
        data.visit_count ?? 0, data.is_active ?? 1,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<CustomerRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE customers SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// expenseRepo (operational_expenses)
// ---------------------------------------------------------------------------

export const expenseRepo = {
  async getAll(): Promise<ExpenseRow[]> {
    return dbQuery<ExpenseRow>(
      `SELECT * FROM operational_expenses WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async getActive(): Promise<ExpenseRow[]> {
    return dbQuery<ExpenseRow>(
      `SELECT * FROM operational_expenses WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name`
    );
  },

  async create(
    data: Omit<ExpenseRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO operational_expenses (id, device_id, created_at, updated_at, name, category, amount, frequency, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.category ?? "other",
        data.amount, data.frequency ?? "daily",
        data.notes ?? null, data.is_active ?? 1,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<ExpenseRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE operational_expenses SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE operational_expenses SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },
};

// ---------------------------------------------------------------------------
// couponRepo
// ---------------------------------------------------------------------------

export const couponRepo = {
  async getAll(): Promise<CouponRow[]> {
    return dbQuery<CouponRow>(
      `SELECT * FROM coupons WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async getActive(): Promise<CouponRow[]> {
    return dbQuery<CouponRow>(
      `SELECT * FROM coupons WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name`
    );
  },

  async getByCode(code: string): Promise<CouponRow | null> {
    const rows = await dbQuery<CouponRow>(
      `SELECT * FROM coupons WHERE code = ? AND deleted_at IS NULL`,
      [code]
    );
    return rows[0] ?? null;
  },

  async create(
    data: Omit<CouponRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO coupons (id, device_id, created_at, updated_at, code, name, type, value, min_order_amount, max_uses, current_uses, valid_from, valid_until, is_active, buy_product_id, get_product_id, buy_quantity, get_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.code, data.name, data.type, data.value,
        data.min_order_amount ?? 0, data.max_uses ?? 0,
        data.current_uses ?? 0,
        data.valid_from ?? null, data.valid_until ?? null,
        data.is_active ?? 1,
        data.buy_product_id ?? null, data.get_product_id ?? null,
        data.buy_quantity ?? null, data.get_quantity ?? null,
      ]
    );
    return id;
  },

  async update(
    id: string,
    data: Partial<Omit<CouponRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">>
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    fields.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await dbRun(
      `UPDATE coupons SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE coupons SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
  },

  async validateCoupon(
    code: string,
    orderTotal: number
  ): Promise<{ valid: boolean; coupon?: CouponRow; reason?: string }> {
    const coupon = await couponRepo.getByCode(code);

    if (!coupon) {
      return { valid: false, reason: "Coupon not found" };
    }

    if (!coupon.is_active) {
      return { valid: false, reason: "Coupon is inactive" };
    }

    if (coupon.max_uses > 0 && coupon.current_uses >= coupon.max_uses) {
      return { valid: false, reason: "Coupon has reached maximum uses" };
    }

    const currentDate = now();

    if (coupon.valid_from && currentDate < coupon.valid_from) {
      return { valid: false, reason: "Coupon is not yet valid" };
    }

    if (coupon.valid_until && currentDate > coupon.valid_until) {
      return { valid: false, reason: "Coupon has expired" };
    }

    if (coupon.min_order_amount > 0 && orderTotal < coupon.min_order_amount) {
      return {
        valid: false,
        reason: `Minimum order amount is ${coupon.min_order_amount}`,
      };
    }

    return { valid: true, coupon };
  },
};

// ---------------------------------------------------------------------------
// settingsRepo
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: { key: string; value: string; group: string }[] = [
  { key: "business_name", value: "My POS Business", group: "general" },
  { key: "currency", value: "USD", group: "general" },
  { key: "currency_symbol", value: "$", group: "general" },
  { key: "tax_inclusive", value: "false", group: "tax" },
  { key: "receipt_header", value: "Thank you for your purchase!", group: "receipt" },
  { key: "receipt_footer", value: "", group: "receipt" },
  { key: "receipt_show_logo", value: "true", group: "receipt" },
  { key: "low_stock_threshold", value: "10", group: "inventory" },
  { key: "loyalty_enabled", value: "false", group: "loyalty" },
  { key: "loyalty_points_per_currency", value: "1", group: "loyalty" },
];

export const settingsRepo = {
  async get(key: string): Promise<string | null> {
    const rows = await dbQuery<SettingRow>(
      `SELECT * FROM settings WHERE key = ? AND deleted_at IS NULL LIMIT 1`,
      [key]
    );
    return rows[0]?.value ?? null;
  },

  async set(key: string, value: string, group: string = "general"): Promise<void> {
    const existing = await dbQuery<SettingRow>(
      `SELECT * FROM settings WHERE key = ? AND deleted_at IS NULL LIMIT 1`,
      [key]
    );

    if (existing.length > 0) {
      await dbRun(
        `UPDATE settings SET value = ?, "group" = ?, updated_at = ? WHERE key = ? AND deleted_at IS NULL`,
        [value, group, now(), key]
      );
    } else {
      const id = ulid();
      const ts = now();
      await dbRun(
        `INSERT INTO settings (id, device_id, created_at, updated_at, key, value, "group")
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, DEVICE_ID, ts, ts, key, value, group]
      );
    }
  },

  async initDefaults(): Promise<void> {
    for (const setting of DEFAULT_SETTINGS) {
      const existing = await dbQuery<SettingRow>(
        `SELECT * FROM settings WHERE key = ? AND deleted_at IS NULL LIMIT 1`,
        [setting.key]
      );
      if (existing.length === 0) {
        const id = ulid();
        const ts = now();
        await dbRun(
          `INSERT INTO settings (id, device_id, created_at, updated_at, key, value, "group")
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, DEVICE_ID, ts, ts, setting.key, setting.value, setting.group]
        );
      }
    }
  },
};
