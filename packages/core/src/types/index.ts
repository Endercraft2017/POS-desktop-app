// Inferred types from Drizzle schema
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { products } from "../schema/products";
import type { categories } from "../schema/categories";
import type { ingredients } from "../schema/ingredients";
import type { productIngredients } from "../schema/product-ingredients";
import type { ingredientPrices } from "../schema/ingredient-prices";
import type { suppliers } from "../schema/suppliers";
import type { orders, orderItems } from "../schema/orders";
import type { payments } from "../schema/payments";
import type { employees } from "../schema/employees";
import type { taxRates } from "../schema/tax-rates";
import type { settings } from "../schema/settings";
import type { operationalExpenses } from "../schema/operational-expenses";
import type { customers } from "../schema/customers";
import type { stockAdjustments } from "../schema/stock-adjustments";
import type { purchaseOrders, purchaseOrderItems } from "../schema/purchase-orders";
import type { coupons, loyaltyRewards, loyaltyTransactions } from "../schema/coupons";
import type { refunds, refundItems } from "../schema/refunds";

// Select types (reading from DB)
export type Product = InferSelectModel<typeof products>;
export type Category = InferSelectModel<typeof categories>;
export type Ingredient = InferSelectModel<typeof ingredients>;
export type ProductIngredient = InferSelectModel<typeof productIngredients>;
export type IngredientPrice = InferSelectModel<typeof ingredientPrices>;
export type Supplier = InferSelectModel<typeof suppliers>;
export type Order = InferSelectModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type Payment = InferSelectModel<typeof payments>;
export type Employee = InferSelectModel<typeof employees>;
export type TaxRate = InferSelectModel<typeof taxRates>;
export type Setting = InferSelectModel<typeof settings>;
export type OperationalExpense = InferSelectModel<typeof operationalExpenses>;
export type Customer = InferSelectModel<typeof customers>;
export type StockAdjustment = InferSelectModel<typeof stockAdjustments>;
export type PurchaseOrder = InferSelectModel<typeof purchaseOrders>;
export type PurchaseOrderItem = InferSelectModel<typeof purchaseOrderItems>;
export type Coupon = InferSelectModel<typeof coupons>;
export type LoyaltyReward = InferSelectModel<typeof loyaltyRewards>;
export type LoyaltyTransaction = InferSelectModel<typeof loyaltyTransactions>;
export type Refund = InferSelectModel<typeof refunds>;
export type RefundItem = InferSelectModel<typeof refundItems>;

// Insert types (writing to DB)
export type NewProduct = InferInsertModel<typeof products>;
export type NewCategory = InferInsertModel<typeof categories>;
export type NewIngredient = InferInsertModel<typeof ingredients>;
export type NewProductIngredient = InferInsertModel<typeof productIngredients>;
export type NewIngredientPrice = InferInsertModel<typeof ingredientPrices>;
export type NewSupplier = InferInsertModel<typeof suppliers>;
export type NewOrder = InferInsertModel<typeof orders>;
export type NewOrderItem = InferInsertModel<typeof orderItems>;
export type NewPayment = InferInsertModel<typeof payments>;
export type NewEmployee = InferInsertModel<typeof employees>;
export type NewTaxRate = InferInsertModel<typeof taxRates>;
export type NewSetting = InferInsertModel<typeof settings>;
export type NewOperationalExpense = InferInsertModel<typeof operationalExpenses>;
export type NewCustomer = InferInsertModel<typeof customers>;
export type NewStockAdjustment = InferInsertModel<typeof stockAdjustments>;
export type NewPurchaseOrder = InferInsertModel<typeof purchaseOrders>;
export type NewPurchaseOrderItem = InferInsertModel<typeof purchaseOrderItems>;
export type NewCoupon = InferInsertModel<typeof coupons>;
export type NewLoyaltyReward = InferInsertModel<typeof loyaltyRewards>;
export type NewLoyaltyTransaction = InferInsertModel<typeof loyaltyTransactions>;
export type NewRefund = InferInsertModel<typeof refunds>;
export type NewRefundItem = InferInsertModel<typeof refundItems>;

// Composite types for UI consumption
export type ProductWithCategory = Product & {
  category: Category | null;
};

export type ProductWithIngredients = Product & {
  ingredients: (ProductIngredient & {
    ingredient: Ingredient;
  })[];
};

export type OrderWithItems = Order & {
  items: (OrderItem & {
    product: Product;
  })[];
  payments: Payment[];
  employee: Employee | null;
};

export type CartItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  notes?: string;
};

export type Cart = {
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  discountType: "percentage" | "fixed" | "none";
  discountValue: number;
  notes?: string;
};

// Enums
export type OrderStatus = "pending" | "held" | "completed" | "cancelled" | "refunded";
export type PaymentMethod = "cash" | "card" | "mobile_pay" | "gift_card" | "store_credit" | "other";
export type EmployeeRole = "admin" | "manager" | "cashier";
export type DiscountType = "percentage" | "fixed" | "none";
export type SyncOperation = "insert" | "update" | "delete";
export type ExpenseCategory = "labor" | "utilities" | "supplies" | "rent" | "transport" | "marketing" | "other";
export type ExpenseFrequency = "daily" | "weekly" | "monthly" | "per_use";

// Forecast types
export type DailyForecastInput = {
  avgCustomersPerDay: number;
  avgSpendPerCustomer: number;
  riskPercentage: number; // 0-100, reduces projected revenue
  operationalExpenses: {
    name: string;
    amount: number;
    frequency: ExpenseFrequency;
  }[];
  productMix?: {
    productId: string;
    productName: string;
    estimatedDailySales: number;
    sellingPrice: number;
    costPrice: number;
  }[];
};

export type DailyForecastResult = {
  projectedGrossRevenue: number;
  riskAdjustedRevenue: number;
  totalDailyExpenses: number;
  projectedNetProfit: number;
  breakEvenCustomers: number;
  profitMargin: number;
  expenseBreakdown: {
    name: string;
    dailyCost: number;
    category: string;
  }[];
  productForecast: {
    productName: string;
    estimatedDailySales: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
};

// Pricing calculator types
export type PricingCalcInput = {
  ingredientCosts: {
    ingredientName: string;
    quantityPerProduct: number;
    pricePerUnit: number;
    unit: string;
  }[];
  desiredMarkupPercent: number; // e.g., 60 for 60% markup
  additionalCostsPerUnit?: number; // packaging, labor per unit, etc.
};

export type PricingCalcResult = {
  totalIngredientCost: number;
  additionalCosts: number;
  totalCostPerUnit: number;
  suggestedPrice: number;
  actualMarkupPercent: number;
  profitPerUnit: number;
  profitMarginPercent: number;
};
