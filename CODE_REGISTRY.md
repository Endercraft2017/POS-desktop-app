# Code Registry - POS System

> Table of contents for all code modules. Check this before making changes to avoid duplicates.
> Updated: 2026-03-25

---

## Root Config Files
| File | Purpose |
|------|---------|
| `package.json` | Monorepo root — workspace scripts |
| `pnpm-workspace.yaml` | Workspace package definitions |
| `turbo.json` | Turborepo build orchestration |
| `.gitignore` | Git ignore rules |
| `SOURCE_OF_TRUTH.md` | Architecture, features, design specs |
| `CODE_REGISTRY.md` | This file — table of contents |

---

## packages/core — Shared Business Logic

### Schema (Drizzle ORM — 22 tables)
| File | Tables |
|------|--------|
| `src/schema/columns.ts` | Base columns template (id, device_id, timestamps, soft delete) |
| `src/schema/products.ts` | `products` |
| `src/schema/categories.ts` | `categories` |
| `src/schema/ingredients.ts` | `ingredients` |
| `src/schema/product-ingredients.ts` | `product_ingredients` (with batch mode fields) |
| `src/schema/ingredient-prices.ts` | `ingredient_prices` |
| `src/schema/suppliers.ts` | `suppliers` |
| `src/schema/orders.ts` | `orders`, `order_items` |
| `src/schema/payments.ts` | `payments` |
| `src/schema/employees.ts` | `employees` |
| `src/schema/tax-rates.ts` | `tax_rates` |
| `src/schema/settings.ts` | `settings` |
| `src/schema/sync-log.ts` | `sync_log` |
| `src/schema/audit-log.ts` | `audit_log` |
| `src/schema/operational-expenses.ts` | `operational_expenses` |
| `src/schema/customers.ts` | `customers` (with loyalty_points, total_spent, visit_count) |
| `src/schema/stock-adjustments.ts` | `stock_adjustments` |
| `src/schema/purchase-orders.ts` | `purchase_orders`, `purchase_order_items` |
| `src/schema/coupons.ts` | `coupons`, `loyalty_rewards`, `loyalty_transactions` |
| `src/schema/refunds.ts` | `refunds`, `refund_items` |
| `src/schema/index.ts` | Barrel export |

### Types
| File | Key Exports |
|------|-------------|
| `src/types/index.ts` | All model types (Product, Order, Customer, Refund, PurchaseOrder, Coupon, etc.), insert types, composite types (Cart, OrderWithItems, DailyForecastInput/Result, PricingCalcInput/Result), all enums |

### Validators (Zod)
| File | Key Schemas |
|------|-------------|
| `src/validators/index.ts` | createProduct, createCategory, createIngredient, createProductIngredient (with batch), createIngredientPrice, createSupplier, createOrder, createPayment, createEmployee, changePin, createTaxRate, createOperationalExpense, login + all inferred input types |

### Services (Pure business logic)
| File | Functions |
|------|-----------|
| `src/services/cart.service.ts` | createEmptyCart, addItemToCart, updateItemQuantity, removeItemFromCart, applyCartDiscount, clearCart |
| `src/services/pricing.service.ts` | calculateProductCost, calculateMargin, calculateMarkup, calculateTax, calculatePricePerUnit, calculateAutoPrice, calculateBatchQuantityPerProduct, calculateFullPricing, generateOrderNumber |
| `src/services/inventory.service.ts` | isLowStock, calculateMaxProducible, calculateStockDeductions |
| `src/services/forecast.service.ts` | calculateDailyForecast, calculateWeeklyForecast, calculateMonthlyForecast |
| `src/services/index.ts` | Barrel export |

### Utils
| File | Functions |
|------|-----------|
| `src/utils/ulid.ts` | generateId, getDeviceId, setDeviceId |

---

## packages/mobile — Expo/React Native Android App

### App Screens (26 screens)
| File | Route | Purpose |
|------|-------|---------|
| `src/app/_layout.tsx` | Root | DB init, device ID, default admin, QueryClient, all Stack routes |
| `src/app/login.tsx` | `/login` | PIN login with real DB auth |
| `src/app/(tabs)/_layout.tsx` | Tab nav | Bottom tabs: Checkout, Orders, Products, Settings |
| `src/app/(tabs)/index.tsx` | `/` | Checkout — product grid + cart + payment nav |
| `src/app/(tabs)/orders.tsx` | `/orders` | Orders with status filters |
| `src/app/(tabs)/products.tsx` | `/products` | Product CRUD |
| `src/app/(tabs)/settings.tsx` | `/settings` | Settings hub with all nav links |
| `src/app/payment.tsx` | `/payment` | Payment flow (cash/card/split) |
| `src/app/order-detail.tsx` | `/order-detail` | Order detail + receipt + actions |
| `src/app/refund.tsx` | `/refund` | Full/partial refund processing with restock |
| `src/app/categories.tsx` | `/categories` | Category CRUD |
| `src/app/ingredients.tsx` | `/ingredients` | Ingredient CRUD + price history |
| `src/app/suppliers.tsx` | `/suppliers` | Supplier CRUD |
| `src/app/employees.tsx` | `/employees` | Employee CRUD + PIN management |
| `src/app/tax-rates.tsx` | `/tax-rates` | Tax rate configuration |
| `src/app/recipe.tsx` | `/recipe` | Recipe linking + batch mode + auto-pricing |
| `src/app/dashboard.tsx` | `/dashboard` | KPI stats + low stock + recent orders |
| `src/app/expenses.tsx` | `/expenses` | Operational expenses CRUD |
| `src/app/forecast.tsx` | `/forecast` | Sales forecast (daily/weekly/monthly) |
| `src/app/stock-adjustments.tsx` | `/stock-adjustments` | Stock adjustment (waste/breakage/count) |
| `src/app/z-report.tsx` | `/z-report` | End-of-day Z report + cash drawer |
| `src/app/customers.tsx` | `/customers` | Customer CRUD + history |
| `src/app/purchase-orders.tsx` | `/purchase-orders` | PO create/receive flow |
| `src/app/coupons.tsx` | `/coupons` | Coupon/promotion management |
| `src/app/loyalty.tsx` | `/loyalty` | Loyalty program (rewards + settings) |
| `src/app/reports.tsx` | `/reports` | Advanced reporting + CSV export |
| `src/app/backup.tsx` | `/backup` | Data backup/export/restore |
| `src/app/barcode.tsx` | `/barcode` | Barcode scanning + product lookup |

### Components (12 components)
| File | Component |
|------|-----------|
| `src/components/ui/button.tsx` | `Button` |
| `src/components/ui/card.tsx` | `Card` |
| `src/components/ui/input.tsx` | `Input` |
| `src/components/ui/index.ts` | Barrel export |
| `src/components/products/product-card.tsx` | `ProductCard` |
| `src/components/products/product-list-item.tsx` | `ProductListItem` |
| `src/components/products/product-form.tsx` | `ProductForm` |
| `src/components/products/ingredient-typeahead.tsx` | `IngredientTypeahead` |
| `src/components/cart/cart-item-row.tsx` | `CartItemRow` |
| `src/components/cart/cart-summary.tsx` | `CartSummary` |
| `src/components/cart/numpad.tsx` | `Numpad` |
| `src/components/receipt/receipt-view.tsx` | `ReceiptView` |

### Hooks (14 hook files, 70+ hooks)
| File | Hooks |
|------|-------|
| `src/hooks/use-theme.ts` | useTheme |
| `src/hooks/use-products.ts` | useProducts, useActiveProducts, useProductsByCategory, useProduct, useSearchProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useToggleProduct |
| `src/hooks/use-categories.ts` | useCategories, useActiveCategories, useCreateCategory, useUpdateCategory, useDeleteCategory |
| `src/hooks/use-ingredients.ts` | useIngredients, useActiveIngredients, useLowStockIngredients, useIngredient, useIngredientPrices, useCreateIngredient, useUpdateIngredient, useDeleteIngredient, useAddIngredientPrice |
| `src/hooks/use-orders.ts` | useOrders, useTodayOrders, useOrdersByStatus, useOrder, useTodayStats, useCreateOrder, useAddPayment, useUpdateOrderStatus |
| `src/hooks/use-employees.ts` | useEmployees, useActiveEmployees, useCreateEmployee, useUpdateEmployee, useChangePin, useDeleteEmployee, useAuthenticate |
| `src/hooks/use-suppliers.ts` | useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier |
| `src/hooks/use-tax-rates.ts` | useTaxRates, useDefaultTaxRate, useCreateTaxRate, useUpdateTaxRate, useDeleteTaxRate |
| `src/hooks/use-expenses.ts` | useExpenses, useActiveExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense |
| `src/hooks/use-customers.ts` | useCustomers, useActiveCustomers, useCustomer, useSearchCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer |
| `src/hooks/use-stock-adjustments.ts` | useStockAdjustments, useIngredientAdjustments, useAdjustStock |
| `src/hooks/use-refunds.ts` | useRefunds, useOrderRefunds, useCreateRefund |
| `src/hooks/use-purchase-orders.ts` | usePurchaseOrders, usePurchaseOrder, usePurchaseOrdersByStatus, useCreatePurchaseOrder, useUpdatePOStatus, useReceivePOItems |
| `src/hooks/use-coupons.ts` | useCoupons, useActiveCoupons, useCreateCoupon, useUpdateCoupon, useDeleteCoupon, useValidateCoupon |
| `src/hooks/use-loyalty.ts` | useLoyaltyRewards, useCreateReward, useUpdateReward, useDeleteReward, useCustomerLoyalty, useEarnPoints, useRedeemPoints |

### Stores (Zustand)
| File | Store |
|------|-------|
| `src/stores/cart-store.ts` | useCartStore |
| `src/stores/auth-store.ts` | useAuthStore |

### Repositories (16 repositories)
| File | Entity | Key Operations |
|------|--------|----------------|
| `product-repository.ts` | Product | CRUD, search, toggleActive |
| `category-repository.ts` | Category | CRUD |
| `ingredient-repository.ts` | Ingredient | CRUD, getLowStock, price history |
| `supplier-repository.ts` | Supplier | CRUD |
| `product-ingredient-repository.ts` | ProductIngredient | CRUD with join |
| `order-repository.ts` | Order | CRUD, getTodayStats, auto-deducts inventory on completion |
| `employee-repository.ts` | Employee | CRUD, authenticate, ensureDefaultAdmin |
| `tax-rate-repository.ts` | TaxRate | CRUD with default management |
| `settings-repository.ts` | Setting | get/set, initDefaults |
| `expense-repository.ts` | OperationalExpense | CRUD |
| `customer-repository.ts` | Customer | CRUD, search, updateStats, loyalty points |
| `stock-adjustment-repository.ts` | StockAdjustment | adjustStock (auto-updates ingredient) |
| `refund-repository.ts` | Refund | create (with restock + order status update) |
| `purchase-order-repository.ts` | PurchaseOrder | create, receiveItems (auto stock + price records) |
| `coupon-repository.ts` | Coupon | CRUD, validateCoupon |
| `loyalty-repository.ts` | Loyalty | rewards CRUD, earn/redeem points, balance |

### Services
| File | Functions |
|------|-----------|
| `src/lib/services/inventory-deduction.ts` | deductInventoryForOrder, restockForRefund |

### Constants & Lib
| File | Purpose |
|------|---------|
| `src/constants/theme.ts` | Light/dark color palettes, spacing, typography |
| `src/lib/database.ts` | SQLite init with all 22 tables + indexes + migrations |

---

## packages/desktop — Electron Desktop App

### Main Process
| File | Purpose |
|------|---------|
| `src/main/index.ts` | Window creation, IPC handlers (db:query, db:exec) |
| `src/main/database.ts` | better-sqlite3 init, all 22 tables + indexes |

### Preload
| File | Purpose |
|------|---------|
| `src/preload/index.ts` | Context bridge for electronAPI.db |

### Renderer
| File | Purpose |
|------|---------|
| `src/renderer/index.html` | Entry HTML |
| `src/renderer/main.tsx` | React root + QueryClient + Router |
| `src/renderer/app/global.css` | Global styles |
| `src/renderer/app/App.tsx` | Routes + auth guard + sidebar layout |

### Renderer Pages (all wired to real DB)
| File | Route | Purpose |
|------|-------|---------|
| `pages/LoginPage.tsx` | `/login` | PIN login (real DB auth) |
| `pages/CheckoutPage.tsx` | `/` | Product grid + cart (real products/categories) |
| `pages/OrdersPage.tsx` | `/orders` | Orders with filters (real orders) |
| `pages/ProductsPage.tsx` | `/products` | Product CRUD (real DB mutations) |
| `pages/DashboardPage.tsx` | `/dashboard` | KPI stats + low stock (real data) |
| `pages/SettingsPage.tsx` | `/settings` | Config + sign out |

### Renderer Infrastructure
| File | Purpose |
|------|---------|
| `components/ui/Sidebar.tsx` | Navigation sidebar |
| `hooks/use-theme.ts` | Theme hook (system dark/light) |
| `stores/cart-store.ts` | Cart state (shared @pos/core logic) |
| `stores/auth-store.ts` | Auth state |
| `lib/db-bridge.ts` | IPC bridge (dbQuery, dbRun, dbExec) |
| `lib/repositories.ts` | All 11 repository objects (raw SQL via IPC) |
| `constants/theme.ts` | Theme tokens (matches mobile) |
