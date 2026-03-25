# POS System - Source of Truth

> This document is the single source of truth for architecture, features, design, and standards.
> Updated: 2026-03-24

---

## 1. Project Overview

A Point of Sale system for a product/ingredient-based business. Supports both Android (mobile) and Desktop platforms with shared business logic.

**Current Phase:** Phase 1 - Local-only, Mobile-first
**Future Phases:** Phase 2 - Desktop app, Phase 3 - Cloud sync, Phase 4 - Cross-platform unification

---

## 2. Architecture

### Monorepo Structure
```
pos-system/
├── packages/
│   ├── core/           # Shared business logic (zero platform deps)
│   │   ├── schema/     # Drizzle ORM schema definitions
│   │   ├── types/      # Shared TypeScript types/interfaces
│   │   ├── services/   # Business logic (cart, tax, pricing, inventory)
│   │   ├── validators/ # Zod validation schemas
│   │   └── utils/      # Pure utility functions (ULID, formatting)
│   ├── mobile/         # Expo/React Native Android app
│   └── desktop/        # Electron desktop app (future)
├── SOURCE_OF_TRUTH.md  # This file
├── CODE_REGISTRY.md    # Table of contents for all code modules
├── turbo.json          # Turborepo config
└── pnpm-workspace.yaml # Monorepo workspace config
```

### Tech Stack

| Layer | Mobile | Desktop | Shared |
|-------|--------|---------|--------|
| Framework | Expo SDK 52 / RN 0.76+ | Electron 33+ | — |
| Language | TypeScript 5.5+ | TypeScript 5.5+ | TypeScript 5.5+ |
| UI | React Native | React 19 + Vite | Design tokens |
| Database | op-sqlite (SQLCipher) | better-sqlite3 | — |
| ORM | Drizzle ORM | Drizzle ORM | Shared schema |
| State | Zustand 5 + TanStack Query 5 | Same | Same patterns |
| Navigation | Expo Router v4 | React Router v7 | — |
| Validation | Zod | Zod | Shared schemas |
| IDs | ULID (ulidx) | ULID (ulidx) | Shared in core |

### Database Design Principles
- **All tables** have: `id` (ULID), `device_id`, `created_at`, `updated_at`, `deleted_at` (soft delete)
- **Never** use auto-increment IDs (they collide across devices)
- **sync_log** table exists from day one for future cloud sync
- **Event sourcing pattern:** every write is logged for audit and future sync
- SQLCipher encryption enabled on all databases

### API Layer (Future-Ready)
- Business logic in `core/services` uses repository pattern
- Services accept a `db` instance parameter (dependency injection)
- When cloud API is added, swap local DB calls for API calls without UI changes
- Future API: tRPC for end-to-end type safety

---

## 3. Feature Roadmap

### Phase 1 - MVP (Current)
- [x] Project structure and shared core
- [x] Product management (CRUD, categories, images)
- [x] Ingredient management (CRUD, units, suppliers)
- [x] Recipe/product-ingredient linking with quantities + batch computation mode
- [x] Ingredient cost tracking and product cost calculation
- [x] Auto-price calculation from ingredient costs + desired markup %
- [x] Batch computation (X ingredient → Y products, auto-compute per-unit)
- [x] Operational expenses management (wages, gas, butane, rent, etc.)
- [x] Daily/weekly/monthly sales forecast with risk %, avg customers, expenses
- [x] Sales/order creation (cart, checkout flow)
- [x] Payment tracking (cash, card, split — method recording)
- [x] Tax configuration and calculation
- [x] Receipt generation (digital)
- [x] Basic inventory (stock levels, low-stock alerts)
- [x] Basic discounts (percentage, fixed amount)
- [x] Employee PIN login with roles (admin, manager, cashier)
- [x] End-of-day reports and basic dashboard
- [x] Order hold/park functionality
- [x] Desktop app foundation (Electron)
- [x] Returns/refunds full flow (full/partial, restock, method selection)
- [x] Inventory auto-deduction on order completion
- [x] Desktop app wired to real DB queries via IPC

### Phase 2 - Enhanced (All Complete)
- [x] Desktop app (Electron) — fully wired to real DB
- [x] Supplier management
- [x] Barcode scanning (manual entry + product lookup + assign)
- [x] Customer management (CRUD + purchase history + loyalty points)
- [x] Advanced reporting (by product, category, time, employee + CSV export)
- [x] Purchase orders (create PO, receive items, auto-stock + price records)
- [x] Coupon codes and promotions (percentage, fixed, BOGO, date ranges, max uses)
- [x] Stock adjustments (waste, breakage, theft, count, other)
- [x] End-of-day Z report (cash drawer reconciliation, payment breakdown)
- [x] Data backup and export (JSON export, DB stats)

### Phase 3 - Cloud (Future)
- [ ] Cloud database (PostgreSQL)
- [ ] Data sync (sync_log based)
- [ ] Multi-device support
- [ ] Cloud backup/restore

### Phase 4 - Advanced (Partially Complete)
- [x] Loyalty programs (points system, rewards, earn/redeem)
- [ ] Multi-location support
- [ ] Kitchen display system (KDS)
- [ ] E-commerce integration
- [ ] Accounting software integration
- [ ] Receipt printing (ESC/POS thermal printers)
- [ ] Camera-based barcode scanning (expo-camera)

---

## 4. Database Schema (Tables)

### Core Tables
| Table | Purpose |
|-------|---------|
| `products` | Product catalog (name, SKU, price, category, image, active) |
| `categories` | Product categories (name, color, sort_order) |
| `ingredients` | Raw ingredients (name, unit, current_stock, min_stock) |
| `product_ingredients` | Recipe: links products to ingredients with quantity + batch mode (batch_ingredient_qty, batch_yield) |
| `ingredient_prices` | Price history for ingredients (supplier, price per qty, total cost, date) |
| `suppliers` | Supplier info (name, contact, address) |

### Business Operations Tables
| Table | Purpose |
|-------|---------|
| `operational_expenses` | Recurring expenses (wages, gas, butane, rent, etc.) with category, amount, frequency |
| `stock_adjustments` | Inventory adjustments (waste, breakage, theft, count, sale_deduction, received, returned) |
| `purchase_orders` | Purchase orders to suppliers (draft → sent → partial → received) |
| `purchase_order_items` | Line items per PO (ingredient, quantity, price, received_quantity) |

### Sales Tables
| Table | Purpose |
|-------|---------|
| `orders` | Sales transactions (status, total, tax, discount, payment_method) |
| `order_items` | Line items per order (product, quantity, unit_price, discount) |
| `payments` | Payment records linked to orders (method, amount, reference) |
| `refunds` | Refund records (full/partial, method, restock flag, reason) |
| `refund_items` | Individual items within a refund |
| `coupons` | Coupon codes (percentage, fixed, BOGO, date range, max uses) |

### Customer & Loyalty Tables
| Table | Purpose |
|-------|---------|
| `customers` | Customer database (name, contact, loyalty_points, total_spent, visit_count) |
| `loyalty_rewards` | Redeemable rewards (points cost, reward type/value) |
| `loyalty_transactions` | Points earned/redeemed/adjusted per customer |

### Configuration Tables
| Table | Purpose |
|-------|---------|
| `tax_rates` | Tax rate configurations (name, rate, active) |
| `employees` | Employee accounts (name, PIN hash, role) |
| `settings` | Key-value app settings |

### System Tables
| Table | Purpose |
|-------|---------|
| `sync_log` | Change log for future cloud sync |
| `audit_log` | Security audit trail (who did what, when) |

---

## 5. UI/UX Design Standards

### Layout Pattern
- **Two-zone split panel:** Product grid (60-70%) | Cart sidebar (30-40%)
- **Top bar:** Search, employee name, clock, quick actions
- **Bottom nav (mobile):** Checkout, Orders, Products, Settings
- **Flat navigation:** Max 2 levels deep, no breadcrumbs needed

### Touch Targets
- Minimum: 48x48dp
- Recommended for POS: 56-64px
- Spacing between targets: 12-16px
- Grid system: 8px base grid (all spacing multiples of 8)

### Typography
- **Font:** Inter (primary), system fallback
- Page title: 24-28px SemiBold
- Section heading: 18-20px Medium
- Product name: 14-16px Medium
- Product price: 16-18px SemiBold
- Cart line item: 14-15px Regular
- Cart total: 20-24px Bold
- Button label: 14-16px SemiBold

### Spacing Tokens
| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |

### Border Radius
| Token | Value |
|-------|-------|
| sm | 6px |
| md | 8px |
| lg | 12px |
| full | 9999px |

### Color Palette - Light Theme
| Token | Hex | Usage |
|-------|-----|-------|
| background | #F8FAFB | Main app background |
| surface | #FFFFFF | Cards, panels, sidebar |
| surfaceElevated | #F1F5F9 | Hover/selected states |
| border | #E2E8F0 | Borders, dividers |
| borderStrong | #CBD5E1 | Active inputs |
| primary | #2563EB | Primary buttons, links |
| primaryHover | #1D4ED8 | Primary hover |
| primaryLight | #DBEAFE | Selected badges |
| secondary | #475569 | Secondary buttons |
| accent | #8B5CF6 | Highlights, promos |
| textPrimary | #0F172A | Headings, prices |
| textSecondary | #475569 | Descriptions |
| textTertiary | #94A3B8 | Placeholders |
| success | #16A34A | Confirmed, in-stock |
| successLight | #DCFCE7 | Success background |
| warning | #D97706 | Low stock, pending |
| warningLight | #FEF3C7 | Warning background |
| error | #DC2626 | Failed, void |
| errorLight | #FEE2E2 | Error background |
| info | #0891B2 | Info banners |
| infoLight | #CFFAFE | Info background |

### Color Palette - Dark Theme
| Token | Hex | Usage |
|-------|-----|-------|
| background | #0F172A | Main app background |
| surface | #1E293B | Cards, panels, sidebar |
| surfaceElevated | #334155 | Hover/selected states |
| border | #334155 | Borders, dividers |
| borderStrong | #475569 | Active inputs |
| primary | #3B82F6 | Primary buttons, links |
| primaryHover | #60A5FA | Primary hover |
| primaryLight | #1E3A5F | Selected badges |
| secondary | #94A3B8 | Secondary buttons |
| accent | #A78BFA | Highlights, promos |
| textPrimary | #F1F5F9 | Headings, prices |
| textSecondary | #94A3B8 | Descriptions |
| textTertiary | #475569 | Placeholders |
| success | #22C55E | Confirmed, in-stock |
| successLight | #14532D | Success background |
| warning | #F59E0B | Low stock, pending |
| warningLight | #713F12 | Warning background |
| error | #EF4444 | Failed, void |
| errorLight | #7F1D1D | Error background |
| info | #22D3EE | Info banners |
| infoLight | #164E63 | Info background |

---

## 6. Security Standards

- **Database:** SQLCipher AES-256 encryption at rest
- **Secrets:** expo-secure-store (mobile), electron safeStorage (desktop)
- **PINs:** bcrypt hashed, never stored in plaintext
- **Payment data:** NEVER store full card numbers, CVV, or magnetic stripe data
- **Audit trail:** All sensitive operations logged
- **IDs:** ULID (globally unique, time-sortable)
- **Future:** TLS 1.3, JWT auth, certificate pinning

---

## 7. Conventions

- **File naming:** kebab-case for files, PascalCase for components
- **Exports:** Named exports preferred over default exports
- **Error handling:** At system boundaries only (user input, external APIs)
- **Comments:** Only where logic is non-obvious
- **Tests:** Co-located with source files (`*.test.ts`)
