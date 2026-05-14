/**
 * Database repository layer for the desktop Electron POS app.
 * Uses raw SQL queries via IPC bridge to the main process SQLite database.
 */

import { ulid } from "ulidx";
import { dbQuery, dbRun, dbBatch, type BatchStmt } from "./db-bridge";
import { writeSyncLog, syncLogStmt } from "./sync-log-writer";

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
  markup_percent: number;
  category_ids: string;
  tags: string;
  image_uri: string | null;
  barcode: string | null;
  is_sub_product: number;
  parent_ids: string;
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
  cost_per_unit: number;
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
  due_date: string | null;
  paid_at: string | null;
  exclude_from_expenses: number;
}

export interface ExpensePaymentRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  expense_id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  notes: string | null;
}

export interface PayableSummary extends ExpenseRow {
  paid_total: number;
  remaining: number;
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
      `INSERT INTO products (id, device_id, created_at, updated_at, name, sku, description, price, cost_price, markup_percent, category_ids, tags, image_uri, barcode, is_sub_product, parent_ids, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.sku ?? null, data.description ?? null,
        data.price, data.cost_price ?? 0, data.markup_percent ?? 0,
        data.category_ids ?? "", data.tags ?? "",
        data.image_uri ?? null, data.barcode ?? null,
        data.is_sub_product ?? 0, data.parent_ids ?? "",
        data.is_active ?? 1, data.sort_order ?? 0,
      ]
    );
    await writeSyncLog("products", id, "insert", {
      id, name: data.name, sku: data.sku ?? null, description: data.description ?? null,
      price: data.price, cost_price: data.cost_price ?? 0, markup_percent: data.markup_percent ?? 0,
      category_ids: data.category_ids ?? "", tags: data.tags ?? "",
      image_uri: data.image_uri ?? null, barcode: data.barcode ?? null,
      is_sub_product: data.is_sub_product ?? 0, parent_ids: data.parent_ids ?? "",
      is_active: data.is_active ?? 1, sort_order: data.sort_order ?? 0,
    });
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
    await writeSyncLog("products", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("products", id, "delete", { id });
  },

  async getIngredientCost(productId: string): Promise<number> {
    const rows = await dbQuery<{ total_cost: number }>(
      `SELECT COALESCE(SUM(
        CASE WHEN pi.use_batch_mode = 1 AND pi.batch_yield > 0
          THEN (COALESCE(i.cost_per_unit, 0) * pi.batch_ingredient_qty / pi.batch_yield)
          ELSE (COALESCE(i.cost_per_unit, 0) * pi.quantity)
        END
      ), 0) as total_cost
      FROM product_ingredients pi
      LEFT JOIN ingredients i ON i.id = pi.ingredient_id AND i.deleted_at IS NULL
      WHERE pi.product_id = ? AND pi.deleted_at IS NULL`,
      [productId]
    );
    return rows[0]?.total_cost ?? 0;
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

  async existsByName(name: string): Promise<boolean> {
    const rows = await dbQuery<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM categories WHERE deleted_at IS NULL AND LOWER(name) = LOWER(?)`,
      [name.trim()]
    );
    return (rows[0]?.cnt ?? 0) > 0;
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
    await writeSyncLog("categories", id, "insert", {
      id, name: data.name, color: data.color ?? "#2563EB", icon: data.icon ?? null,
      sort_order: data.sort_order ?? 0, is_active: data.is_active ?? 1,
    });
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
    await writeSyncLog("categories", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("categories", id, "delete", { id });
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

  async existsByName(name: string): Promise<boolean> {
    const rows = await dbQuery<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM ingredients WHERE deleted_at IS NULL AND LOWER(name) = LOWER(?)`,
      [name.trim()]
    );
    return (rows[0]?.cnt ?? 0) > 0;
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
      `INSERT INTO ingredients (id, device_id, created_at, updated_at, name, unit, cost_per_unit, current_stock, min_stock, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        data.name, data.unit, data.cost_per_unit ?? 0,
        data.current_stock ?? 0, data.min_stock ?? 0,
        data.is_active ?? 1,
      ]
    );
    await writeSyncLog("ingredients", id, "insert", {
      id, name: data.name, unit: data.unit, cost_per_unit: data.cost_per_unit ?? 0,
      current_stock: data.current_stock ?? 0, min_stock: data.min_stock ?? 0,
      is_active: data.is_active ?? 1,
    });
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
    await writeSyncLog("ingredients", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE ingredients SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("ingredients", id, "delete", { id });
  },
};

// ---------------------------------------------------------------------------
// productIngredientRepo
// ---------------------------------------------------------------------------

export interface ProductIngredientRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  use_batch_mode: number;
  batch_ingredient_qty: number | null;
  batch_yield: number | null;
}

export const productIngredientRepo = {
  async getByProduct(productId: string): Promise<ProductIngredientRow[]> {
    return dbQuery<ProductIngredientRow>(
      `SELECT * FROM product_ingredients WHERE product_id = ? AND deleted_at IS NULL`,
      [productId]
    );
  },

  async add(productId: string, ingredientId: string, quantity: number): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO product_ingredients (id, device_id, created_at, updated_at, product_id, ingredient_id, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, DEVICE_ID, ts, ts, productId, ingredientId, quantity]
    );
    await writeSyncLog("product_ingredients", id, "insert", {
      id, product_id: productId, ingredient_id: ingredientId, quantity,
    });
    return id;
  },

  async updateQuantity(id: string, quantity: number): Promise<void> {
    await dbRun(
      `UPDATE product_ingredients SET quantity = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [quantity, now(), id]
    );
    await writeSyncLog("product_ingredients", id, "update", { id, quantity });
  },

  async remove(id: string): Promise<void> {
    await dbRun(
      `UPDATE product_ingredients SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("product_ingredients", id, "delete", { id });
  },
};

// ---------------------------------------------------------------------------
// ingredientPresetRepo
// ---------------------------------------------------------------------------

export interface IngredientPresetRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
}

export interface PresetItemRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  preset_id: string;
  ingredient_id: string;
  quantity: number;
}

export const ingredientPresetRepo = {
  async getAll(): Promise<IngredientPresetRow[]> {
    return dbQuery<IngredientPresetRow>(
      `SELECT * FROM ingredient_presets WHERE deleted_at IS NULL ORDER BY name`
    );
  },

  async getItems(presetId: string): Promise<PresetItemRow[]> {
    return dbQuery<PresetItemRow>(
      `SELECT * FROM ingredient_preset_items WHERE preset_id = ? AND deleted_at IS NULL`,
      [presetId]
    );
  },

  async create(name: string): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO ingredient_presets (id, device_id, created_at, updated_at, name) VALUES (?, ?, ?, ?, ?)`,
      [id, DEVICE_ID, ts, ts, name]
    );
    await writeSyncLog("ingredient_presets", id, "insert", { id, name });
    return id;
  },

  async addItem(presetId: string, ingredientId: string, quantity: number): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO ingredient_preset_items (id, device_id, created_at, updated_at, preset_id, ingredient_id, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, DEVICE_ID, ts, ts, presetId, ingredientId, quantity]
    );
    await writeSyncLog("ingredient_preset_items", id, "insert", {
      id, preset_id: presetId, ingredient_id: ingredientId, quantity,
    });
    return id;
  },

  async removeItem(id: string): Promise<void> {
    await dbRun(
      `UPDATE ingredient_preset_items SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("ingredient_preset_items", id, "delete", { id });
  },

  async rename(id: string, name: string): Promise<void> {
    await dbRun(
      `UPDATE ingredient_presets SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [name, now(), id]
    );
    await writeSyncLog("ingredient_presets", id, "update", { id, name });
  },

  async softDelete(id: string): Promise<void> {
    const ts = now();
    await dbRun(`UPDATE ingredient_presets SET deleted_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, id]);
    await dbRun(`UPDATE ingredient_preset_items SET deleted_at = ?, updated_at = ? WHERE preset_id = ?`, [ts, ts, id]);
    await writeSyncLog("ingredient_presets", id, "delete", { id });
  },

  async saveFromProduct(name: string, productId: string): Promise<string> {
    const items = await dbQuery<ProductIngredientRow>(
      `SELECT * FROM product_ingredients WHERE product_id = ? AND deleted_at IS NULL`,
      [productId]
    );
    const presetId = await this.create(name);
    for (const item of items) {
      await this.addItem(presetId, item.ingredient_id, item.quantity);
    }
    return presetId;
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
    await writeSyncLog("suppliers", id, "insert", {
      id, name: data.name, contact_name: data.contact_name ?? null,
      phone: data.phone ?? null, email: data.email ?? null,
      address: data.address ?? null, notes: data.notes ?? null,
    });
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
    await writeSyncLog("suppliers", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE suppliers SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("suppliers", id, "delete", { id });
  },
};

// ---------------------------------------------------------------------------
// orderRepo
// ---------------------------------------------------------------------------

export interface OrderWithDetails extends OrderRow {
  items: OrderItemRow[];
  payments: PaymentRow[];
  employee_name?: string | null;
}

export interface TodayStats {
  total_orders: number;
  total_revenue: number;
  total_tax: number;
  total_discount: number;
  average_order: number;
}

export const orderRepo = {
  async getAll(limit: number = 50): Promise<(OrderRow & { employee_name: string | null })[]> {
    return dbQuery(
      `SELECT o.*, e.name AS employee_name
       FROM orders o
       LEFT JOIN employees e ON e.id = o.employee_id AND e.deleted_at IS NULL
       WHERE o.deleted_at IS NULL
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [limit]
    );
  },

  async getToday(): Promise<(OrderRow & { employee_name: string | null })[]> {
    return dbQuery(
      `SELECT o.*, e.name AS employee_name
       FROM orders o
       LEFT JOIN employees e ON e.id = o.employee_id AND e.deleted_at IS NULL
       WHERE o.deleted_at IS NULL AND o.created_at >= ? AND o.created_at <= ?
       ORDER BY o.created_at DESC`,
      [todayStart(), todayEnd()]
    );
  },

  async getById(id: string): Promise<OrderWithDetails | null> {
    const [orders, items, payments] = await Promise.all([
      dbQuery<OrderRow & { employee_name: string | null }>(
        `SELECT o.*, e.name AS employee_name
         FROM orders o
         LEFT JOIN employees e ON e.id = o.employee_id AND e.deleted_at IS NULL
         WHERE o.id = ? AND o.deleted_at IS NULL`,
        [id]
      ),
      dbQuery<OrderItemRow>(
        `SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL`,
        [id]
      ),
      dbQuery<PaymentRow>(
        `SELECT * FROM payments WHERE order_id = ? AND deleted_at IS NULL`,
        [id]
      ),
    ]);
    if (!orders[0]) return null;
    return { ...orders[0], items, payments };
  },

  async create(
    order: Omit<OrderRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at">,
    items: Omit<OrderItemRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at" | "order_id">[]
  ): Promise<string> {
    const orderId = ulid();
    const ts = now();

    await dbRun(
      `INSERT INTO orders (id, device_id, created_at, updated_at, order_number, status, subtotal, tax_amount, discount_amount, total, discount_type, discount_value, notes, customer_name, employee_id, customer_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId, DEVICE_ID, ts, ts,
        order.order_number, order.status ?? "pending",
        order.subtotal, order.tax_amount, order.discount_amount, order.total,
        order.discount_type ?? "none", order.discount_value ?? 0,
        order.notes ?? null, (order as any).customer_name ?? null,
        order.employee_id ?? null,
        order.customer_id ?? null, order.completed_at ?? null,
      ]
    );
    await writeSyncLog("orders", orderId, "insert", {
      id: orderId, order_number: order.order_number, status: order.status ?? "pending",
      subtotal: order.subtotal, tax_amount: order.tax_amount, discount_amount: order.discount_amount,
      total: order.total, discount_type: order.discount_type ?? "none", discount_value: order.discount_value ?? 0,
      notes: order.notes ?? null, customer_name: (order as any).customer_name ?? null,
      employee_id: order.employee_id ?? null,
      customer_id: order.customer_id ?? null, completed_at: order.completed_at ?? null,
    });

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
      await writeSyncLog("order_items", itemId, "insert", {
        id: itemId, order_id: orderId, product_id: item.product_id, product_name: item.product_name,
        quantity: item.quantity, unit_price: item.unit_price,
        discount_amount: item.discount_amount ?? 0, tax_amount: item.tax_amount ?? 0,
        total: item.total, notes: item.notes ?? null,
      });
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
    await writeSyncLog("payments", id, "insert", {
      id, order_id: data.order_id, method: data.method, amount: data.amount,
      reference: data.reference ?? null, change: data.change ?? 0, notes: data.notes ?? null,
    });
    return id;
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const ts = now();
    const completedAt = status === "completed" ? ts : null;
    await dbRun(
      `UPDATE orders SET status = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ? AND deleted_at IS NULL`,
      [status, ts, completedAt, id]
    );
    await writeSyncLog("orders", id, "update", { id, status, completed_at: completedAt });
  },

  async updateNotes(id: string, notes: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE orders SET notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [notes || null, ts, id]
    );
    await writeSyncLog("orders", id, "update", { id, notes });
  },

  async updateCustomerName(id: string, name: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE orders SET customer_name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [name || null, ts, id]
    );
    await writeSyncLog("orders", id, "update", { id, customer_name: name || null });
  },

  async softDelete(id: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE orders SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, id]
    );
    await writeSyncLog("orders", id, "delete", { id });
  },

  async updateCreatedAt(orderId: string, newCreatedAt: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE orders SET created_at = ?, updated_at = ? WHERE id = ?`,
      [newCreatedAt, ts, orderId]
    );
    await writeSyncLog("orders", orderId, "update", { id: orderId, created_at: newCreatedAt });
  },

  async updatePayment(paymentId: string, data: { method?: string; reference?: string | null }): Promise<void> {
    const ts = now();
    const sets: string[] = [];
    const vals: any[] = [];
    if (data.method !== undefined) { sets.push('method = ?'); vals.push(data.method); }
    if (data.reference !== undefined) { sets.push('reference = ?'); vals.push(data.reference); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(ts, paymentId);
    await dbRun(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, vals);
    const payload: any = { id: paymentId };
    if (data.method !== undefined) payload.method = data.method;
    if (data.reference !== undefined) payload.reference = data.reference;
    await writeSyncLog("payments", paymentId, "update", payload);
  },

  async updateItem(itemId: string, quantity: number, unitPrice: number): Promise<void> {
    const ts = now();
    const total = quantity * unitPrice;
    await dbRun(
      `UPDATE order_items SET quantity = ?, total = ?, updated_at = ? WHERE id = ?`,
      [quantity, total, ts, itemId]
    );
    await writeSyncLog("order_items", itemId, "update", { id: itemId, quantity, total });
  },

  async removeItem(itemId: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE order_items SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, itemId]
    );
    await writeSyncLog("order_items", itemId, "delete", { id: itemId });
  },

  async addItem(orderId: string, item: { product_id: string; product_name: string; quantity: number; unit_price: number; total: number }): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO order_items (id, device_id, created_at, updated_at, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [id, DEVICE_ID, ts, ts, orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.total]
    );
    await writeSyncLog("order_items", id, "insert", {
      id, order_id: orderId, product_id: item.product_id, product_name: item.product_name,
      quantity: item.quantity, unit_price: item.unit_price, total: item.total,
    });
    return id;
  },

  async recalculate(orderId: string): Promise<void> {
    const ts = now();
    const items = await dbQuery<{ total: number }>(
      `SELECT total FROM order_items WHERE order_id = ? AND deleted_at IS NULL`,
      [orderId]
    );
    const subtotal = items.reduce((s, i) => s + (i.total || 0), 0);
    await dbRun(
      `UPDATE orders SET subtotal = ?, total = subtotal + tax_amount - discount_amount, updated_at = ? WHERE id = ?`,
      [subtotal, ts, orderId]
    );
    // Re-read the actual total
    const rows = await dbQuery<{ total: number; subtotal: number }>(
      `SELECT subtotal, total FROM orders WHERE id = ?`, [orderId]
    );
    if (rows[0]) {
      await writeSyncLog("orders", orderId, "update", { id: orderId, subtotal: rows[0].subtotal, total: rows[0].total });
    }
  },

  async getTodayStats(): Promise<TodayStats> {
    // Local-day window is computed in JS so this works on any backend TZ
    // (desktop SQLite in user's TZ, cloud SQLite in UTC — both give the same
    // answer because created_at is stored as UTC ISO strings).
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
         AND created_at >= ? AND created_at <= ?`,
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

  async createFull(data: {
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    total: number;
    employee_id: string | null;
    notes?: string | null;
    payment_method: string;
    payment_amount: number;
    change_amount: number;
    payment_reference?: string | null;
    payments?: { method: string; amount: number; reference?: string | null; change?: number }[];
    items: { product_id: string; product_name: string; quantity: number; unit_price: number; total: number }[];
  }): Promise<string> {
    // All INSERTs (order row + items + payments + sync_log rows) are collected
    // and sent as ONE IPC call wrapped in a better-sqlite3 transaction. This
    // replaces ~14 sequential round-trips for a 5-item cart with a single one.
    const orderId = ulid();
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const ts = now();
    const completedAt = ts;

    const stmts: BatchStmt[] = [];

    stmts.push({
      sql: `INSERT INTO orders (id, device_id, created_at, updated_at, order_number, status, subtotal, tax_amount, discount_amount, total, discount_type, discount_value, notes, customer_name, employee_id, customer_id, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        orderId, DEVICE_ID, ts, ts,
        orderNumber, "completed",
        data.subtotal, data.tax_amount, data.discount_amount, data.total,
        "none", 0,
        data.notes ?? null, (data as any).customer_name ?? null,
        data.employee_id ?? null, null, completedAt,
      ],
    });
    stmts.push(syncLogStmt("orders", orderId, "insert", {
      id: orderId, order_number: orderNumber, status: "completed",
      subtotal: data.subtotal, tax_amount: data.tax_amount,
      discount_amount: data.discount_amount, total: data.total,
      discount_type: "none", discount_value: 0,
      notes: data.notes ?? null, customer_name: (data as any).customer_name ?? null,
      employee_id: data.employee_id ?? null,
      customer_id: null, completed_at: completedAt,
    }));

    for (const item of data.items) {
      const itemId = ulid();
      stmts.push({
        sql: `INSERT INTO order_items (id, device_id, created_at, updated_at, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, total, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          itemId, DEVICE_ID, ts, ts,
          orderId, item.product_id, item.product_name,
          item.quantity, item.unit_price, 0, 0, item.total, null,
        ],
      });
      stmts.push(syncLogStmt("order_items", itemId, "insert", {
        id: itemId, order_id: orderId, product_id: item.product_id,
        product_name: item.product_name, quantity: item.quantity,
        unit_price: item.unit_price, discount_amount: 0, tax_amount: 0,
        total: item.total, notes: null,
      }));
    }

    const payments = data.payments && data.payments.length > 0
      ? data.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
          change: p.change ?? 0,
        }))
      : [{
          method: data.payment_method,
          amount: data.payment_amount,
          reference: data.payment_reference ?? null,
          change: data.change_amount,
        }];

    for (const p of payments) {
      const payId = ulid();
      stmts.push({
        sql: `INSERT INTO payments (id, device_id, created_at, updated_at, order_id, method, amount, reference, change, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [payId, DEVICE_ID, ts, ts, orderId, p.method, p.amount, p.reference, p.change, null],
      });
      stmts.push(syncLogStmt("payments", payId, "insert", {
        id: payId, order_id: orderId, method: p.method, amount: p.amount,
        reference: p.reference, change: p.change, notes: null,
      }));
    }

    await dbBatch(stmts);
    return orderId;
  },

  async getDailySales(days: number = 30): Promise<{ date: string; total: number; count: number }[]> {
    return dbQuery(
      `SELECT DATE(created_at) as date,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as count
       FROM orders
       WHERE deleted_at IS NULL AND status = 'completed'
         AND created_at >= DATE('now', ?)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [`-${days} days`]
    );
  },

  async getMonthlySales(months: number = 12): Promise<{ month: string; total: number; count: number }[]> {
    return dbQuery(
      `SELECT STRFTIME('%Y-%m', created_at) as month,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as count
       FROM orders
       WHERE deleted_at IS NULL AND status = 'completed'
         AND created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y-%m', created_at)
       ORDER BY month ASC`,
      [`-${months} months`]
    );
  },

  async getAnnualSales(years: number = 5): Promise<{ year: string; total: number; count: number }[]> {
    return dbQuery(
      `SELECT STRFTIME('%Y', created_at) as year,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as count
       FROM orders
       WHERE deleted_at IS NULL AND status = 'completed'
         AND created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y', created_at)
       ORDER BY year ASC`,
      [`-${years} years`]
    );
  },

  async getCumulativeByMethodUntil(untilDate: string): Promise<{ cash: number; gcash: number }> {
    // untilDate: YYYY-MM-DD (inclusive). Sums all completed orders on/before that date.
    const rows = await dbQuery<{ method: string; total: number }>(
      `SELECT p.method as method, COALESCE(SUM(p.amount - COALESCE(p.change, 0)), 0) as total
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND DATE(o.created_at) <= DATE(?)
       GROUP BY p.method`,
      [untilDate]
    );
    const out = { cash: 0, gcash: 0 };
    for (const r of rows) {
      if (r.method === "cash") out.cash = r.total;
      else if (r.method === "gcash") out.gcash = r.total;
    }
    return out;
  },

  async getTodayByMethod(): Promise<{ cash: number; gcash: number }> {
    const rows = await dbQuery<{ method: string; total: number }>(
      `SELECT p.method as method, COALESCE(SUM(p.amount - COALESCE(p.change, 0)), 0) as total
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= ? AND o.created_at <= ?
       GROUP BY p.method`,
      [todayStart(), todayEnd()]
    );
    const out = { cash: 0, gcash: 0 };
    for (const r of rows) {
      if (r.method === "cash") out.cash = r.total;
      else if (r.method === "gcash") out.gcash = r.total;
    }
    return out;
  },

  async getDailySalesByMethod(days: number = 30): Promise<{ date: string; cash: number; gcash: number; count: number }[]> {
    const methodRows = await dbQuery<{ date: string; method: string; total: number }>(
      `SELECT DATE(o.created_at) as date,
              p.method as method,
              COALESCE(SUM(p.amount - COALESCE(p.change, 0)), 0) as total
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= DATE('now', ?)
       GROUP BY DATE(o.created_at), p.method
       ORDER BY date ASC`,
      [`-${days} days`]
    );
    const countRows = await dbQuery<{ date: string; count: number }>(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM orders
       WHERE deleted_at IS NULL AND status = 'completed'
         AND created_at >= DATE('now', ?)
       GROUP BY DATE(created_at)`,
      [`-${days} days`]
    );
    const map = new Map<string, { date: string; cash: number; gcash: number; count: number }>();
    for (const r of methodRows) {
      const cur = map.get(r.date) || { date: r.date, cash: 0, gcash: 0, count: 0 };
      if (r.method === "cash") cur.cash = r.total;
      else if (r.method === "gcash") cur.gcash = r.total;
      map.set(r.date, cur);
    }
    for (const r of countRows) {
      const cur = map.get(r.date) || { date: r.date, cash: 0, gcash: 0, count: 0 };
      cur.count = r.count;
      map.set(r.date, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  },

  async getMonthlySalesByMethod(months: number = 12): Promise<{ month: string; cash: number; gcash: number; count: number }[]> {
    const methodRows = await dbQuery<{ month: string; method: string; total: number }>(
      `SELECT STRFTIME('%Y-%m', o.created_at) as month,
              p.method as method,
              COALESCE(SUM(p.amount - COALESCE(p.change, 0)), 0) as total
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y-%m', o.created_at), p.method
       ORDER BY month ASC`,
      [`-${months} months`]
    );
    const countRows = await dbQuery<{ month: string; count: number }>(
      `SELECT STRFTIME('%Y-%m', created_at) as month, COUNT(*) as count
       FROM orders
       WHERE deleted_at IS NULL AND status = 'completed'
         AND created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y-%m', created_at)`,
      [`-${months} months`]
    );
    const map = new Map<string, { month: string; cash: number; gcash: number; count: number }>();
    for (const r of methodRows) {
      const cur = map.get(r.month) || { month: r.month, cash: 0, gcash: 0, count: 0 };
      if (r.method === "cash") cur.cash = r.total;
      else if (r.method === "gcash") cur.gcash = r.total;
      map.set(r.month, cur);
    }
    for (const r of countRows) {
      const cur = map.get(r.month) || { month: r.month, cash: 0, gcash: 0, count: 0 };
      cur.count = r.count;
      map.set(r.month, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  },

  async getAnnualSalesByMethod(years: number = 5): Promise<{ year: string; cash: number; gcash: number; count: number }[]> {
    const methodRows = await dbQuery<{ year: string; method: string; total: number }>(
      `SELECT STRFTIME('%Y', o.created_at) as year,
              p.method as method,
              COALESCE(SUM(p.amount - COALESCE(p.change, 0)), 0) as total
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y', o.created_at), p.method
       ORDER BY year ASC`,
      [`-${years} years`]
    );
    const countRows = await dbQuery<{ year: string; count: number }>(
      `SELECT STRFTIME('%Y', created_at) as year, COUNT(*) as count
       FROM orders
       WHERE deleted_at IS NULL AND status = 'completed'
         AND created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y', created_at)`,
      [`-${years} years`]
    );
    const map = new Map<string, { year: string; cash: number; gcash: number; count: number }>();
    for (const r of methodRows) {
      const cur = map.get(r.year) || { year: r.year, cash: 0, gcash: 0, count: 0 };
      if (r.method === "cash") cur.cash = r.total;
      else if (r.method === "gcash") cur.gcash = r.total;
      map.set(r.year, cur);
    }
    for (const r of countRows) {
      const cur = map.get(r.year) || { year: r.year, cash: 0, gcash: 0, count: 0 };
      cur.count = r.count;
      map.set(r.year, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year));
  },

  async getTodayProfit(): Promise<{ revenue: number; cogs: number; gross: number; expenses: number; net: number }> {
    const start = todayStart();
    const end = todayEnd();
    const [rev, exp] = await Promise.all([
      dbQuery<{ revenue: number; cogs: number }>(
        `SELECT COALESCE(SUM(o.total), 0) as revenue,
                COALESCE(SUM(
                  (SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)
                   FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
                   WHERE oi.order_id = o.id AND oi.deleted_at IS NULL)
                ), 0) as cogs
         FROM orders o
         WHERE o.deleted_at IS NULL AND o.status = 'completed'
           AND o.created_at >= ? AND o.created_at <= ?`,
        [start, end]
      ),
      dbQuery<{ expenses: number }>(
        // Sum from two sources: (a) one-shot expenses with no payment ledger
        // entries — use paid_at on the parent row; (b) ledger payments —
        // each contributes on its paid_on date.
        `SELECT COALESCE(SUM(amount), 0) as expenses FROM (
           SELECT oe.amount AS amount, oe.paid_at AS dt
           FROM operational_expenses oe
           WHERE oe.deleted_at IS NULL AND oe.paid_at IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM expense_payments ep
                             WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL)
           UNION ALL
           SELECT ep.amount AS amount, ep.paid_on AS dt
           FROM expense_payments ep
           WHERE ep.deleted_at IS NULL
         ) WHERE dt >= ? AND dt <= ?`,
        [start, end]
      ),
    ]);
    const revenue = rev[0]?.revenue ?? 0;
    const cogs = rev[0]?.cogs ?? 0;
    const expenses = exp[0]?.expenses ?? 0;
    const gross = revenue - cogs;
    return { revenue, cogs, gross, expenses, net: gross - expenses };
  },

  async getDailyProfitBuckets(days: number = 30): Promise<{ date: string; revenue: number; cogs: number; gross: number; expenses: number; net: number; count: number }[]> {
    const buckets = await dbQuery<{ date: string; revenue: number; cogs: number; count: number }>(
      `SELECT DATE(o.created_at) as date,
              SUM(o.total) as revenue,
              SUM((SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)
                   FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
                   WHERE oi.order_id = o.id AND oi.deleted_at IS NULL)) as cogs,
              COUNT(*) as count
       FROM orders o
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= DATE('now', ?)
       GROUP BY DATE(o.created_at)
       ORDER BY date ASC`,
      [`-${days} days`]
    );
    const expenses = await dbQuery<{ date: string; expenses: number }>(
      `SELECT DATE(dt) as date, COALESCE(SUM(amount), 0) as expenses FROM (
         SELECT oe.amount AS amount, oe.paid_at AS dt
         FROM operational_expenses oe
         WHERE oe.deleted_at IS NULL AND oe.paid_at IS NOT NULL
           AND COALESCE(oe.exclude_from_expenses, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM expense_payments ep
                           WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL)
         UNION ALL
         SELECT ep.amount AS amount, ep.paid_on AS dt
         FROM expense_payments ep
         JOIN operational_expenses oe2 ON oe2.id = ep.expense_id
         WHERE ep.deleted_at IS NULL
           AND COALESCE(oe2.exclude_from_expenses, 0) = 0
       )
       WHERE dt >= DATE('now', ?)
       GROUP BY DATE(dt)`,
      [`-${days} days`]
    );
    const expMap = new Map(expenses.map((e) => [e.date, e.expenses]));
    return buckets.map((b) => {
      const gross = (b.revenue || 0) - (b.cogs || 0);
      const exp = expMap.get(b.date) || 0;
      return { date: b.date, revenue: b.revenue || 0, cogs: b.cogs || 0, gross, expenses: exp, net: gross - exp, count: b.count || 0 };
    });
  },

  async getMonthlyProfitBuckets(months: number = 12): Promise<{ month: string; revenue: number; cogs: number; gross: number; expenses: number; net: number; count: number }[]> {
    const buckets = await dbQuery<{ month: string; revenue: number; cogs: number; count: number }>(
      `SELECT STRFTIME('%Y-%m', o.created_at) as month,
              SUM(o.total) as revenue,
              SUM((SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)
                   FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
                   WHERE oi.order_id = o.id AND oi.deleted_at IS NULL)) as cogs,
              COUNT(*) as count
       FROM orders o
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y-%m', o.created_at)
       ORDER BY month ASC`,
      [`-${months} months`]
    );
    const expenses = await dbQuery<{ month: string; expenses: number }>(
      `SELECT STRFTIME('%Y-%m', dt) as month, COALESCE(SUM(amount), 0) as expenses FROM (
         SELECT oe.amount AS amount, oe.paid_at AS dt
         FROM operational_expenses oe
         WHERE oe.deleted_at IS NULL AND oe.paid_at IS NOT NULL
           AND COALESCE(oe.exclude_from_expenses, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM expense_payments ep
                           WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL)
         UNION ALL
         SELECT ep.amount AS amount, ep.paid_on AS dt
         FROM expense_payments ep
         JOIN operational_expenses oe2 ON oe2.id = ep.expense_id
         WHERE ep.deleted_at IS NULL
           AND COALESCE(oe2.exclude_from_expenses, 0) = 0
       )
       WHERE dt >= DATE('now', ?)
       GROUP BY STRFTIME('%Y-%m', dt)`,
      [`-${months} months`]
    );
    const expMap = new Map(expenses.map((e) => [e.month, e.expenses]));
    return buckets.map((b) => {
      const gross = (b.revenue || 0) - (b.cogs || 0);
      const exp = expMap.get(b.month) || 0;
      return { month: b.month, revenue: b.revenue || 0, cogs: b.cogs || 0, gross, expenses: exp, net: gross - exp, count: b.count || 0 };
    });
  },

  async getAnnualProfitBuckets(years: number = 5): Promise<{ year: string; revenue: number; cogs: number; gross: number; expenses: number; net: number; count: number }[]> {
    const buckets = await dbQuery<{ year: string; revenue: number; cogs: number; count: number }>(
      `SELECT STRFTIME('%Y', o.created_at) as year,
              SUM(o.total) as revenue,
              SUM((SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)
                   FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
                   WHERE oi.order_id = o.id AND oi.deleted_at IS NULL)) as cogs,
              COUNT(*) as count
       FROM orders o
       WHERE o.deleted_at IS NULL AND o.status = 'completed'
         AND o.created_at >= DATE('now', ?)
       GROUP BY STRFTIME('%Y', o.created_at)
       ORDER BY year ASC`,
      [`-${years} years`]
    );
    const expenses = await dbQuery<{ year: string; expenses: number }>(
      `SELECT STRFTIME('%Y', dt) as year, COALESCE(SUM(amount), 0) as expenses FROM (
         SELECT oe.amount AS amount, oe.paid_at AS dt
         FROM operational_expenses oe
         WHERE oe.deleted_at IS NULL AND oe.paid_at IS NOT NULL
           AND COALESCE(oe.exclude_from_expenses, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM expense_payments ep
                           WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL)
         UNION ALL
         SELECT ep.amount AS amount, ep.paid_on AS dt
         FROM expense_payments ep
         JOIN operational_expenses oe2 ON oe2.id = ep.expense_id
         WHERE ep.deleted_at IS NULL
           AND COALESCE(oe2.exclude_from_expenses, 0) = 0
       )
       WHERE dt >= DATE('now', ?)
       GROUP BY STRFTIME('%Y', dt)`,
      [`-${years} years`]
    );
    const expMap = new Map(expenses.map((e) => [e.year, e.expenses]));
    return buckets.map((b) => {
      const gross = (b.revenue || 0) - (b.cogs || 0);
      const exp = expMap.get(b.year) || 0;
      return { year: b.year, revenue: b.revenue || 0, cogs: b.cogs || 0, gross, expenses: exp, net: gross - exp, count: b.count || 0 };
    });
  },

  async getBucketBestSeller(
    start: string,
    end: string
  ): Promise<{ name: string; qty: number; revenue: number } | null> {
    const rows = await dbQuery<{ name: string; qty: number; revenue: number }>(
      `SELECT oi.product_name as name,
              COALESCE(SUM(oi.quantity), 0) as qty,
              COALESCE(SUM(oi.total), 0) as revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.deleted_at IS NULL AND oi.deleted_at IS NULL
         AND o.status = 'completed'
         AND o.created_at >= ? AND o.created_at < ?
       GROUP BY oi.product_name
       ORDER BY qty DESC
       LIMIT 1`,
      [start, end]
    );
    return rows[0] ?? null;
  },

  // Per-product breakdown for a given bucket — used by the Statistics page
  // "Specifics" popup. Profit is (revenue − cost*qty) using the product's
  // current cost_price. Falls back to LEFT JOIN so items whose product was
  // deleted still show up (their cost is treated as 0).
  async getBucketProductBreakdown(
    start: string,
    end: string
  ): Promise<{ name: string; qty: number; revenue: number; cost: number; profit: number }[]> {
    return dbQuery<{ name: string; qty: number; revenue: number; cost: number; profit: number }>(
      `SELECT oi.product_name as name,
              COALESCE(SUM(oi.quantity), 0) as qty,
              COALESCE(SUM(oi.total), 0) as revenue,
              COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as cost,
              COALESCE(SUM(oi.total) - SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as profit
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.deleted_at IS NULL AND oi.deleted_at IS NULL
         AND o.status = 'completed'
         AND o.created_at >= ? AND o.created_at < ?
       GROUP BY oi.product_name
       ORDER BY qty DESC, revenue DESC`,
      [start, end]
    );
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
    await writeSyncLog("employees", id, "insert", {
      id, name: data.name, role: data.role ?? "cashier", is_active: data.is_active ?? 1,
    });
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
    const { pin, ...safeData } = data;
    await writeSyncLog("employees", id, "update", { id, ...safeData, ...(pin ? { pin_changed: true } : {}) });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE employees SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("employees", id, "delete", { id });
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
        [id, DEVICE_ID, ts, ts, "Admin", hashPin("kylereneg1234"), "admin", 1]
      );
      await writeSyncLog("employees", id, "insert", { id, name: "Admin", role: "admin", is_active: 1 });
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
    await writeSyncLog("tax_rates", id, "insert", {
      id, name: data.name, rate: data.rate,
      is_default: data.is_default ?? 0, is_active: data.is_active ?? 1,
    });
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
    await writeSyncLog("tax_rates", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE tax_rates SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("tax_rates", id, "delete", { id });
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
    await writeSyncLog("customers", id, "insert", {
      id, name: data.name, phone: data.phone ?? null, email: data.email ?? null,
      address: data.address ?? null, notes: data.notes ?? null,
      loyalty_points: data.loyalty_points ?? 0, total_spent: data.total_spent ?? 0,
      visit_count: data.visit_count ?? 0, is_active: data.is_active ?? 1,
    });
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
    await writeSyncLog("customers", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("customers", id, "delete", { id });
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
    data: Omit<ExpenseRow, "id" | "device_id" | "created_at" | "updated_at" | "deleted_at" | "due_date" | "paid_at"> & { created_at?: string; due_date?: string | null; paid_at?: string | null }
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    const createdAt = data.created_at ?? ts;
    // paid_at defaults to the create timestamp so existing call sites
    // (the Expenses tab) treat newly-added rows as already-paid. The
    // Payables tab passes paid_at: null explicitly to create an unpaid bill.
    const paidAt = data.paid_at === undefined ? ts : data.paid_at;
    const dueDate = data.due_date ?? null;
    await dbRun(
      `INSERT INTO operational_expenses (id, device_id, created_at, updated_at, name, category, amount, frequency, notes, is_active, due_date, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, createdAt, ts,
        data.name, data.category ?? "other",
        data.amount, data.frequency ?? "daily",
        data.notes ?? null, data.is_active ?? 1,
        dueDate, paidAt,
      ]
    );
    await writeSyncLog("operational_expenses", id, "insert", {
      id, created_at: createdAt, updated_at: ts,
      name: data.name, category: data.category ?? "other",
      amount: data.amount, frequency: data.frequency ?? "daily",
      notes: data.notes ?? null, is_active: data.is_active ?? 1,
      due_date: dueDate, paid_at: paidAt,
    });
    return id;
  },

  async createPayable(data: { name: string; amount: number; due_date?: string | null; notes?: string | null; category?: string; created_at?: string }): Promise<string> {
    return expenseRepo.create({
      name: data.name,
      amount: data.amount,
      category: data.category ?? "other",
      frequency: "per_use",
      notes: data.notes ?? null,
      is_active: 1,
      due_date: data.due_date ?? null,
      paid_at: null,
      ...(data.created_at ? { created_at: data.created_at } : {}),
    });
  },

  async markPaid(id: string, paidAt?: string): Promise<void> {
    await expenseRepo.update(id, { paid_at: paidAt ?? now() });
  },

  async getPayables(): Promise<PayableSummary[]> {
    // Include any row that's either still unpaid OR has any ledger payment —
    // that scopes the result to bills entered through the Payables flow
    // (vs. one-shot expenses), so paid-off payables stay visible as history.
    const rows = await dbQuery<PayableSummary>(
      `SELECT oe.*,
              COALESCE((SELECT SUM(ep.amount) FROM expense_payments ep
                        WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL), 0) AS paid_total,
              (oe.amount - COALESCE((SELECT SUM(ep.amount) FROM expense_payments ep
                                     WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL), 0)) AS remaining
       FROM operational_expenses oe
       WHERE oe.deleted_at IS NULL
         AND (oe.paid_at IS NULL
              OR EXISTS (SELECT 1 FROM expense_payments ep
                         WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL))
       ORDER BY (oe.paid_at IS NOT NULL) ASC,
                oe.created_at DESC`
    );
    return rows;
  },

  async getPayments(expenseId: string): Promise<ExpensePaymentRow[]> {
    return dbQuery<ExpensePaymentRow>(
      `SELECT * FROM expense_payments
       WHERE deleted_at IS NULL AND expense_id = ?
       ORDER BY paid_on ASC, created_at ASC`,
      [expenseId]
    );
  },

  async recordPayment(
    expenseId: string,
    data: { amount: number; paid_on: string; method?: string | null; notes?: string | null }
  ): Promise<string> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO expense_payments (id, device_id, created_at, updated_at, expense_id, amount, paid_on, method, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, DEVICE_ID, ts, ts,
        expenseId, data.amount, data.paid_on,
        data.method ?? null, data.notes ?? null,
      ]
    );
    await writeSyncLog("expense_payments", id, "insert", {
      id, created_at: ts, updated_at: ts,
      expense_id: expenseId, amount: data.amount, paid_on: data.paid_on,
      method: data.method ?? null, notes: data.notes ?? null,
    });
    // If cumulative payments fully cover the bill, close it out by stamping
    // paid_at on the parent so it leaves the Payables list. Use the latest
    // payment date for accurate report bucketing.
    const totals = await dbQuery<{ amount: number; paid: number; latest: string | null }>(
      `SELECT oe.amount AS amount,
              COALESCE((SELECT SUM(ep.amount) FROM expense_payments ep
                        WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL), 0) AS paid,
              (SELECT MAX(ep.paid_on) FROM expense_payments ep
               WHERE ep.expense_id = oe.id AND ep.deleted_at IS NULL) AS latest
       FROM operational_expenses oe WHERE oe.id = ?`,
      [expenseId]
    );
    const t = totals[0];
    // Close out when cumulative payments equal the bill (within rounding).
    // Using abs() handles negative-amount payables (credits/refunds) correctly:
    // for amount=-100, paid=-100 means fully settled, not over-paid.
    if (t && Math.abs(t.amount - t.paid) < 0.005 && t.latest) {
      await expenseRepo.update(expenseId, { paid_at: t.latest });
    }
    return id;
  },

  async deletePayment(id: string): Promise<void> {
    await dbRun(
      `UPDATE expense_payments SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("expense_payments", id, "delete", { id });
  },

  async update(
    id: string,
    data: Partial<Omit<ExpenseRow, "id" | "device_id" | "updated_at" | "deleted_at">>
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
    await writeSyncLog("operational_expenses", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE operational_expenses SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("operational_expenses", id, "delete", { id });
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
    await writeSyncLog("coupons", id, "insert", {
      id, code: data.code, name: data.name, type: data.type, value: data.value,
      min_order_amount: data.min_order_amount ?? 0, max_uses: data.max_uses ?? 0,
      current_uses: data.current_uses ?? 0,
      valid_from: data.valid_from ?? null, valid_until: data.valid_until ?? null,
      is_active: data.is_active ?? 1,
      buy_product_id: data.buy_product_id ?? null, get_product_id: data.get_product_id ?? null,
      buy_quantity: data.buy_quantity ?? null, get_quantity: data.get_quantity ?? null,
    });
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
    await writeSyncLog("coupons", id, "update", { id, ...data });
  },

  async softDelete(id: string): Promise<void> {
    await dbRun(
      `UPDATE coupons SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), id]
    );
    await writeSyncLog("coupons", id, "delete", { id });
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

// --- Stock Adjustments (restocks, manual adjustments) ---

export interface StockAdjustmentRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  ingredient_id: string;
  type: string; // 'restock' | 'manual' | 'usage' | 'waste'
  quantity_change: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null; // JSON: { cost?, supplier?, notes? }
  employee_id: string | null;
}

export interface StockAdjustmentWithIngredient extends StockAdjustmentRow {
  ingredient_name: string;
  ingredient_unit: string;
}

export const stockAdjustmentRepo = {
  async create(data: {
    ingredient_id: string;
    type: string;
    quantity_change: number;
    previous_stock: number;
    new_stock: number;
    cost?: number;
    supplier?: string;
    notes?: string;
    employee_id?: string | null;
    created_at?: string;
  }): Promise<string> {
    const id = ulid();
    const ts = now();
    const createdAt = data.created_at ?? ts;
    const reasonObj: any = {};
    if (data.cost != null) reasonObj.cost = data.cost;
    if (data.supplier) reasonObj.supplier = data.supplier;
    if (data.notes) reasonObj.notes = data.notes;
    const reason = Object.keys(reasonObj).length > 0 ? JSON.stringify(reasonObj) : null;

    await dbRun(
      `INSERT INTO stock_adjustments (id, device_id, created_at, updated_at, ingredient_id, type, quantity_change, previous_stock, new_stock, reason, employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, DEVICE_ID, createdAt, ts, data.ingredient_id, data.type, data.quantity_change, data.previous_stock, data.new_stock, reason, data.employee_id ?? null]
    );
    await writeSyncLog("stock_adjustments", id, "insert", {
      id, created_at: createdAt, ingredient_id: data.ingredient_id, type: data.type,
      quantity_change: data.quantity_change, previous_stock: data.previous_stock,
      new_stock: data.new_stock, reason, employee_id: data.employee_id ?? null,
    });

    // Also update the ingredient's current_stock
    await dbRun(
      `UPDATE ingredients SET current_stock = ?, updated_at = ? WHERE id = ?`,
      [data.new_stock, ts, data.ingredient_id]
    );
    await writeSyncLog("ingredients", data.ingredient_id, "update", {
      id: data.ingredient_id, current_stock: data.new_stock,
    });

    return id;
  },

  async getAll(limit = 200): Promise<StockAdjustmentWithIngredient[]> {
    return dbQuery<StockAdjustmentWithIngredient>(
      `SELECT sa.*, i.name as ingredient_name, i.unit as ingredient_unit
       FROM stock_adjustments sa
       LEFT JOIN ingredients i ON i.id = sa.ingredient_id
       WHERE sa.deleted_at IS NULL
       ORDER BY sa.created_at DESC
       LIMIT ?`,
      [limit]
    );
  },

  async getByIngredient(ingredientId: string): Promise<StockAdjustmentRow[]> {
    return dbQuery<StockAdjustmentRow>(
      `SELECT * FROM stock_adjustments WHERE ingredient_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [ingredientId]
    );
  },

  async softDelete(id: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE stock_adjustments SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, id]
    );
    await writeSyncLog("stock_adjustments", id, "delete", { id });
  },
};

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
      await writeSyncLog("settings", existing[0].id, "update", { id: existing[0].id, key, value, group });
    } else {
      const id = ulid();
      const ts = now();
      await dbRun(
        `INSERT INTO settings (id, device_id, created_at, updated_at, key, value, "group")
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, DEVICE_ID, ts, ts, key, value, group]
      );
      await writeSyncLog("settings", id, "insert", { id, key, value, group });
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
        await writeSyncLog("settings", id, "insert", { id, key: setting.key, value: setting.value, group: setting.group });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// loyaltyCardRepo (physical punch-card QR program)
// ---------------------------------------------------------------------------

export interface LoyaltyCardRow {
  id: string;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  code: string;
  customer_name: string | null;
  stamps: number;
  rewards_claimed_mask: number;
  last_seen_at: string | null;
}

export const loyaltyCardRepo = {
  async listAll(): Promise<LoyaltyCardRow[]> {
    return dbQuery<LoyaltyCardRow>(
      `SELECT * FROM loyalty_cards
        WHERE deleted_at IS NULL
        ORDER BY (last_seen_at IS NULL), last_seen_at DESC, code ASC`
    );
  },

  async getById(id: string): Promise<LoyaltyCardRow | null> {
    const rows = await dbQuery<LoyaltyCardRow>(
      `SELECT * FROM loyalty_cards WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  },

  async getByCode(code: string): Promise<LoyaltyCardRow | null> {
    const rows = await dbQuery<LoyaltyCardRow>(
      `SELECT * FROM loyalty_cards WHERE code = ? AND deleted_at IS NULL LIMIT 1`,
      [code]
    );
    return rows[0] ?? null;
  },

  async create(args: { code: string; customer_name?: string | null }): Promise<LoyaltyCardRow> {
    const id = ulid();
    const ts = now();
    await dbRun(
      `INSERT INTO loyalty_cards
         (id, device_id, created_at, updated_at, code, customer_name, stamps, rewards_claimed_mask)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [id, DEVICE_ID, ts, ts, args.code, args.customer_name ?? null]
    );
    await writeSyncLog("loyalty_cards", id, "insert", {
      id,
      code: args.code,
      customer_name: args.customer_name ?? null,
      stamps: 0,
      rewards_claimed_mask: 0,
    });
    return (await loyaltyCardRepo.getById(id))!;
  },

  async updateName(id: string, name: string): Promise<void> {
    const ts = now();
    const trimmed = name.trim();
    await dbRun(
      `UPDATE loyalty_cards
          SET customer_name = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      [trimmed || null, ts, id]
    );
    await writeSyncLog("loyalty_cards", id, "update", {
      id,
      customer_name: trimmed || null,
    });
  },

  // Increments stamps by 1, clamped at 9. Also bumps last_seen_at.
  async addStamp(id: string): Promise<LoyaltyCardRow> {
    const card = await loyaltyCardRepo.getById(id);
    if (!card) throw new Error("loyalty card not found");
    if (card.stamps >= 9) return card; // already maxed
    const newStamps = card.stamps + 1;
    const ts = now();
    await dbRun(
      `UPDATE loyalty_cards
          SET stamps = ?, last_seen_at = ?, updated_at = ?
        WHERE id = ?`,
      [newStamps, ts, ts, id]
    );
    await writeSyncLog("loyalty_cards", id, "update", {
      id,
      stamps: newStamps,
      last_seen_at: ts,
    });
    return { ...card, stamps: newStamps, last_seen_at: ts, updated_at: ts };
  },

  // Decrements stamps by 1, clamped at 0. Allowed even if a reward in a higher
  // row has been claimed — that's a refund/correction surface decision; we just
  // keep the mask intact. (Future: clear bit if its row drops below 3 stamps.)
  async removeStamp(id: string): Promise<LoyaltyCardRow> {
    const card = await loyaltyCardRepo.getById(id);
    if (!card) throw new Error("loyalty card not found");
    if (card.stamps <= 0) return card;
    const newStamps = card.stamps - 1;
    const ts = now();
    await dbRun(
      `UPDATE loyalty_cards
          SET stamps = ?, last_seen_at = ?, updated_at = ?
        WHERE id = ?`,
      [newStamps, ts, ts, id]
    );
    await writeSyncLog("loyalty_cards", id, "update", {
      id,
      stamps: newStamps,
      last_seen_at: ts,
    });
    return { ...card, stamps: newStamps, last_seen_at: ts, updated_at: ts };
  },

  // tier is 1, 2, or 3. Validates that stamps >= tier * 3 and that the bit
  // isn't already set.
  async claimReward(id: string, tier: 1 | 2 | 3): Promise<LoyaltyCardRow> {
    const card = await loyaltyCardRepo.getById(id);
    if (!card) throw new Error("loyalty card not found");
    const required = tier * 3;
    if (card.stamps < required) {
      throw new Error(`need ${required} stamps to claim tier ${tier}, have ${card.stamps}`);
    }
    const bit = 1 << (tier - 1);
    if ((card.rewards_claimed_mask & bit) !== 0) {
      throw new Error(`tier ${tier} reward already claimed`);
    }
    const newMask = card.rewards_claimed_mask | bit;
    const ts = now();
    await dbRun(
      `UPDATE loyalty_cards
          SET rewards_claimed_mask = ?, last_seen_at = ?, updated_at = ?
        WHERE id = ?`,
      [newMask, ts, ts, id]
    );
    await writeSyncLog("loyalty_cards", id, "update", {
      id,
      rewards_claimed_mask: newMask,
      last_seen_at: ts,
    });
    return { ...card, rewards_claimed_mask: newMask, last_seen_at: ts, updated_at: ts };
  },

  async softDelete(id: string): Promise<void> {
    const ts = now();
    await dbRun(
      `UPDATE loyalty_cards SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, id]
    );
    await writeSyncLog("loyalty_cards", id, "delete", { id });
  },
};
