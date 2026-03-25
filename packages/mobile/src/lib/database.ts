import { open, type DB } from "@op-engineering/op-sqlite";
import { drizzle } from "drizzle-orm/op-sqlite";
import * as schema from "@pos/core/schema";

let db: DB | null = null;
let drizzleDb: ReturnType<typeof drizzle> | null = null;

export function getDatabase() {
  if (!db) {
    db = open({ name: "pos.db" });
    drizzleDb = drizzle(db, { schema });
  }
  return drizzleDb!;
}

export function getRawDatabase() {
  if (!db) {
    getDatabase();
  }
  return db!;
}

export async function initializeDatabase() {
  const rawDb = getRawDatabase();

  // Enable WAL mode for better concurrent read/write performance
  rawDb.execute("PRAGMA journal_mode = WAL;");
  rawDb.execute("PRAGMA foreign_keys = ON;");

  // Create all tables
  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#2563EB',
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      sku TEXT,
      description TEXT,
      price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      category_id TEXT REFERENCES categories(id),
      image_uri TEXT,
      barcode TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS product_ingredients (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      product_id TEXT NOT NULL REFERENCES products(id),
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      quantity REAL NOT NULL,
      use_batch_mode INTEGER NOT NULL DEFAULT 0,
      batch_ingredient_qty REAL,
      batch_yield INTEGER
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS ingredient_prices (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      supplier_id TEXT REFERENCES suppliers(id),
      price REAL NOT NULL,
      quantity REAL NOT NULL,
      total_cost REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      notes TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS tax_rates (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      order_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      discount_type TEXT DEFAULT 'none',
      discount_value REAL DEFAULT 0,
      notes TEXT,
      employee_id TEXT REFERENCES employees(id),
      customer_id TEXT,
      completed_at TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      notes TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      change REAL DEFAULT 0,
      notes TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      "group" TEXT DEFAULT 'general'
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT,
      device_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      employee_id TEXT,
      details TEXT,
      device_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS operational_expenses (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      amount REAL NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Migrations for existing DBs: add batch columns if missing
  try {
    rawDb.execute("ALTER TABLE product_ingredients ADD COLUMN use_batch_mode INTEGER NOT NULL DEFAULT 0;");
  } catch (_) { /* column already exists */ }
  try {
    rawDb.execute("ALTER TABLE product_ingredients ADD COLUMN batch_ingredient_qty REAL;");
  } catch (_) { /* column already exists */ }
  try {
    rawDb.execute("ALTER TABLE product_ingredients ADD COLUMN batch_yield INTEGER;");
  } catch (_) { /* column already exists */ }

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      visit_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      type TEXT NOT NULL,
      quantity_change REAL NOT NULL,
      previous_stock REAL NOT NULL,
      new_stock REAL NOT NULL,
      reason TEXT,
      employee_id TEXT REFERENCES employees(id)
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      po_number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'draft',
      total_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      expected_date TEXT,
      received_date TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      received_quantity REAL DEFAULT 0
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 0,
      current_uses INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      buy_product_id TEXT,
      get_product_id TEXT,
      buy_quantity INTEGER,
      get_quantity INTEGER
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      name TEXT NOT NULL,
      description TEXT,
      points_cost INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_value REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      customer_id TEXT NOT NULL,
      order_id TEXT,
      points INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_amount REAL NOT NULL,
      refund_method TEXT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      employee_id TEXT REFERENCES employees(id),
      restock_items INTEGER NOT NULL DEFAULT 1,
      completed_at TEXT
    );
  `);

  rawDb.execute(`
    CREATE TABLE IF NOT EXISTS refund_items (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      refund_id TEXT NOT NULL REFERENCES refunds(id),
      order_item_id TEXT NOT NULL REFERENCES order_items(id),
      quantity INTEGER NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create indexes for common queries
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_product_ingredients_product ON product_ingredients(product_id);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_sync_log_synced ON sync_log(synced);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_stock_adjustments_ingredient ON stock_adjustments(ingredient_id);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);"
  );
  rawDb.execute(
    "CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);"
  );
}
