import { z } from "zod";

// Product validators
export const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required").max(200),
  sku: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  price: z.number().min(0, "Price must be positive"),
  costPrice: z.number().min(0).optional(),
  categoryId: z.string().optional(),
  imageUri: z.string().optional(),
  barcode: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

// Category validators
export const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// Ingredient validators
export const createIngredientSchema = z.object({
  name: z.string().min(1, "Ingredient name is required").max(200),
  unit: z.string().min(1, "Unit is required").max(20),
  currentStock: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
});

export const updateIngredientSchema = createIngredientSchema.partial();

// Product-Ingredient link
export const createProductIngredientSchema = z.object({
  productId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantity: z.number().positive("Quantity must be positive"),
  useBatchMode: z.boolean().optional(),
  batchIngredientQty: z.number().positive().optional(),
  batchYield: z.number().int().positive().optional(),
});

// Ingredient price
export const createIngredientPriceSchema = z.object({
  ingredientId: z.string().min(1),
  supplierId: z.string().optional(),
  price: z.number().min(0, "Price must be positive"),
  quantity: z.number().positive("Quantity must be positive"),
  totalCost: z.number().min(0),
  purchaseDate: z.string().min(1),
  notes: z.string().max(500).optional(),
});

// Supplier validators
export const createSupplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required").max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

// Order validators
export const createOrderItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  unitPrice: z.number().min(0),
  discountAmount: z.number().min(0).optional(),
  taxAmount: z.number().min(0).optional(),
  total: z.number().min(0),
  notes: z.string().max(500).optional(),
});

export const createOrderSchema = z.object({
  items: z.array(createOrderItemSchema).min(1, "Order must have at least one item"),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  discountAmount: z.number().min(0).optional(),
  total: z.number().min(0),
  discountType: z.enum(["percentage", "fixed", "none"]).optional(),
  discountValue: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
  employeeId: z.string().optional(),
  customerId: z.string().optional(),
});

// Payment validators
export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(["cash", "card", "mobile_pay", "gift_card", "store_credit", "other"]),
  amount: z.number().positive("Payment amount must be positive"),
  reference: z.string().max(200).optional(),
  change: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

// Employee validators
export const createEmployeeSchema = z.object({
  name: z.string().min(1, "Employee name is required").max(200),
  pin: z
    .string()
    .min(4, "PIN must be at least 4 digits")
    .max(6, "PIN must be at most 6 digits")
    .regex(/^\d+$/, "PIN must contain only digits"),
  role: z.enum(["admin", "manager", "cashier"]).optional(),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["admin", "manager", "cashier"]).optional(),
  isActive: z.boolean().optional(),
});

export const changePinSchema = z.object({
  currentPin: z.string().min(4).max(6),
  newPin: z
    .string()
    .min(4, "PIN must be at least 4 digits")
    .max(6, "PIN must be at most 6 digits")
    .regex(/^\d+$/, "PIN must contain only digits"),
});

// Tax rate validators
export const createTaxRateSchema = z.object({
  name: z.string().min(1, "Tax name is required").max(100),
  rate: z.number().min(0).max(1, "Rate must be between 0 and 1 (e.g., 0.08 for 8%)"),
  isDefault: z.boolean().optional(),
});

// Settings validator
export const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  group: z.string().optional(),
});

// Operational expense validators
export const createOperationalExpenseSchema = z.object({
  name: z.string().min(1, "Expense name is required").max(200),
  category: z.enum(["labor", "utilities", "supplies", "rent", "transport", "marketing", "other"]).optional(),
  amount: z.number().min(0, "Amount must be positive"),
  frequency: z.enum(["daily", "weekly", "monthly", "per_use"]),
  notes: z.string().max(500).optional(),
});

export const updateOperationalExpenseSchema = createOperationalExpenseSchema.partial();

// Login
export const loginSchema = z.object({
  pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must contain only digits"),
});

// Inferred types from validators
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type CreateProductIngredientInput = z.infer<typeof createProductIngredientSchema>;
export type CreateIngredientPriceInput = z.infer<typeof createIngredientPriceSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type CreateOperationalExpenseInput = z.infer<typeof createOperationalExpenseSchema>;
export type UpdateOperationalExpenseInput = z.infer<typeof updateOperationalExpenseSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
