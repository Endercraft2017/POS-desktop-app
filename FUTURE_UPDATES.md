# Future Updates — On Hold

> Features planned but not yet implemented. Revisit when current system is stable and in production use.
> Created: 2026-03-25

---

## Phase 3 — Cloud & Multi-Device

### Cloud Database Migration
- Migrate from local SQLite to PostgreSQL (cloud)
- Drizzle ORM already supports Postgres — same schema definitions, swap the dialect
- `sync_log` table is already in place for tracking unsynced changes

### Data Sync
- Implement sync worker that reads unsynced events from `sync_log`, pushes to cloud API
- Conflict resolution: last-write-wins with device priority
- Cloud becomes source of truth for shared data (products, categories)
- Device-local data (orders, payments) syncs upstream

### Multi-Device Support
- Each device has unique `device_id` (already implemented)
- ULIDs prevent ID collisions across devices (already implemented)
- Need: device registration, sync status dashboard, conflict resolution UI

### Cloud Backup/Restore
- Automated cloud backups on schedule
- Point-in-time restore capability
- Currently have local JSON export — extend to cloud storage

### Authentication Upgrade
- Replace local PIN-only auth with JWT + refresh tokens
- Offline mode: cache JWT locally, validate expiry, re-auth when online
- Libraries: `jose` for JWT validation, or tRPC auth middleware

### API Layer
- tRPC for end-to-end type safety (server ↔ client)
- Same service interfaces — swap local DB calls for API calls
- The `@pos/core` services layer is already designed for this swap

---

## Phase 4 — Advanced Features

### Receipt Printing (ESC/POS)
- Thermal printer support via USB/serial
- Mobile: use `react-native-esc-pos-printer` or similar native module
- Desktop: use `node-escpos` or `escpos` npm package in Electron main process
- `ReceiptView` component already generates the layout — need to convert to ESC/POS commands
- Support common printers: Epson TM-T88, Star TSP100, etc.

### Camera-Based Barcode Scanning
- Mobile: integrate `expo-camera` with `expo-barcode-scanner`
- Requires Expo dev build (not Expo Go) since it's a native module
- Current `barcode.tsx` screen has manual entry — add camera view above it
- Desktop: USB barcode scanners already work as keyboard input (no changes needed)

### Kitchen Display System (KDS)
- Separate screen/device showing incoming orders
- Order routing: send specific items to specific stations (drinks → bar, food → kitchen)
- Item status: pending → preparing → ready → served
- Priority flagging for rush orders
- Preparation time tracking
- Could be a separate Expo app or a web view on a tablet

### Multi-Location Support
- Per-location inventory tracking
- Stock transfers between locations
- Per-location reporting and comparison
- Centralized product catalog, location-specific pricing
- Requires cloud infrastructure (Phase 3)

### E-Commerce Integration
- Sync product catalog with online store (Shopify, WooCommerce)
- Unified inventory across physical and online
- Online orders appear in POS order queue
- Requires cloud API (Phase 3)

### Accounting Software Integration
- Export to QuickBooks, Xero, or similar
- Auto-sync daily sales summaries
- Map POS categories to accounting chart of accounts
- Tax report generation in accountant-friendly format

### Delivery Platform Integration
- UberEats, DoorDash, GrabFood, etc.
- Orders from platforms appear in POS
- Menu sync from POS to platforms
- Requires cloud API

### Table Management (if restaurant)
- Visual table map with drag-and-drop
- Table status: available, occupied, reserved
- Seat assignment per order
- Merge/split tables
- Reservation system with time slots

### Advanced Inventory
- Expiration date tracking per batch
- FIFO (first-in-first-out) stock usage
- Wastage tracking with reasons and cost impact
- Automated reorder points that generate draft POs

### Multi-Currency / Multi-Language
- Currency selection per transaction
- Exchange rate management
- Interface language switcher
- RTL layout support for applicable languages

### Customer-Facing Display
- Secondary screen showing items as scanned
- Running total visible to customer
- Promotional messages between transactions

### Tip Management
- Tip entry screen after payment
- Tip pooling across employees
- Tip reporting for payroll

---

## Technical Debt / Improvements

### Testing
- Unit tests for core services (cart, pricing, forecast, inventory)
- Integration tests for repositories
- E2E tests for critical flows (checkout → payment → order completion)
- Use Vitest for core/desktop, Jest for mobile

### Performance
- Virtual lists for large product catalogs (>500 items)
- Database query optimization with EXPLAIN
- Image caching and lazy loading for product images
- Bundle size optimization

### Security Hardening
- Replace simple PIN hash with bcrypt (via native module)
- SQLCipher encryption for database files
- Input sanitization audit
- Rate limiting on PIN attempts

### Developer Experience
- Storybook for UI components
- Database seeding script for development
- CI/CD pipeline (GitHub Actions)
- Automated linting and formatting (ESLint + Prettier)
