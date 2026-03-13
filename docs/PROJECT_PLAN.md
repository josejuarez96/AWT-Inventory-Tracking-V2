# AWT Inventory Tracker - Strategy & Roadmap

## 🎯 Project Goal
Build a modern, proprietary web-based perpetual inventory management system for **All World Trailers (AWT)**.
**Key Objective**: Replace manual/mental tracking with a digital system to eliminate vendor payment holds, track costs accurately, and provide real-time stock visibility.

## 🛠️ Technical Strategy
We are building a **cloud-hosted web application** accessible from anywhere with an internet connection. No software installation required—just open a web browser.

### Technology Stack
*   **Frontend**: React (Vite) + Tailwind CSS + Shadcn/UI (Modern, responsive UI)
*   **Backend**: Node.js + Express (Robust API server)
*   **Database**: PostgreSQL + Prisma ORM (Cloud-ready, multi-user, production-grade)
*   **Authentication**: JWT tokens + HTTP-only cookies (Secure web access)
*   **Hosting**:
    - Frontend: Vercel (free tier, auto-deploys from GitHub, global CDN)
    - Backend API: Railway.app (free $5/month credit, includes PostgreSQL)
    - Alternative: Render.com (all-in-one backend + database)

### Architecture
- **Cloud-Hosted**: Application hosted on Railway/Vercel, accessible via URL from any device
- **Single Source of Truth**: PostgreSQL database holds all data with automatic backups
- **Client-Server Model**: Reactive React frontend communicates with Express REST API
- **Multi-User**: Concurrent access from office, home, warehouse—anywhere with internet
- **Mobile-Ready**: Responsive design works on desktops, tablets, and phones

---

## 📊 Database Schema

**Source of truth**: `backend/prisma/schema.prisma`

**Tables**: Users, Vendors, Items, Transactions, Boms, BomLines, ProductionOrders, CycleCounts, CycleCountLines

**Key design decisions**:
- All inventory movements stored as `Transaction` rows with `transactionType` discriminator (RECEIPT, ADJUSTMENT, TRANSFER, OPENING_BALANCE, CONSUMPTION, PRODUCTION)
- Transfers create atomic pairs (negative at source + positive at destination)
- Kitting creates CONSUMPTION transactions per component + PRODUCTION transaction for finished good
- Cycle count posting auto-creates ADJUSTMENT transactions for variances
- Items have `itemType` (RAW/FINISHED/OTHER) for BOM/kitting filtering
- `batchId` UUID groups related transactions (e.g., multi-item receipts)
- Composite index on `(itemId, location)` for stock position performance

---

## 📅 Phased Implementation Roadmap

### Phase 0: Project Bootstrap ✅ COMPLETE
**Goal**: Initialize local development environment with test data.
- [x] Initialize Git repository with proper .gitignore
- [x] Create project structure (frontend/, backend/)
- [x] Initialize React+Vite frontend with TypeScript
- [x] Initialize Node+Express backend
- [x] Configure Prisma with local PostgreSQL
- [x] Environment configuration (.env files)
- [x] Seed script with test data (2 users, sample vendors/items/transactions)
- [x] README with setup instructions

**Completed**: Phase 0 commit `c366173`

---

### Phase 1: Foundation ✅ COMPLETE
**Goal**: Establish authentication, database, and application shell.
- [x] Database migrations (Users, Vendors, Items, Transactions tables)
- [x] JWT authentication (login/logout, bcrypt hashing, 7-day token)
- [x] Protected route middleware (`authenticate`, `requireAdmin`)
- [x] Base layout with responsive sidebar navigation
- [x] Dashboard page with placeholder stat cards
- [x] User management UI (admin: create users, toggle active/inactive)
- [x] Role-based route visibility (admin vs user sidebar links)

**Completed**: Phase 1 commit `a67bff7` — 8/8 tests passing

---

### Phase 2: Core Transactions, CSV Import & Live Dashboard ✅ COMPLETE
**Goal**: Enable receipt entry, bulk data loading via CSV, and live dashboard.
- [x] CSV import for Vendors (drag-drop upload, preview, validate, bulk insert)
- [x] CSV import for Items (same workflow)
- [x] Receipt entry form (item, vendor, location, qty, cost, date, invoice #)
- [x] Last Paid Price display with >10% variance warning
- [x] Stock position view (current qty by item × location, search/filter)
- [x] Transaction history (audit trail with date/type/location filters)
- [x] Live dashboard: stat cards, running low alerts, dead stock, valuation, activity feed
- [x] Dashboard endpoints: `/stats`, `/low-stock`, `/dead-stock`, `/valuation`, `/activity`

**Completed**: Phase 2 commits `983d404`, `34c52c9`, `1af53e8`
**Test Results**: 18/24 passing (75%) — 6 failures are test-code bugs, not API bugs
**Known limitations** (single-item receipts, no pagination, N+1 queries, disabled sidebar links) — all resolved in later phases.

---

### Phase 3A: Inventory Correction ✅ COMPLETE
**Goal**: Complete the transaction lifecycle — opening balances, adjustments, and transfers. This is the #1 blocker to go-live. Without these, warehouse staff cannot operate.

**Why first**: You need opening balances to load real inventory on day one. You need adjustments for damage/shrinkage/cycle counts. You need transfers because parts move between ADEL and CALHOUN regularly. All three transaction types already exist in the schema — we just need API endpoints and UI forms.

- [x] **Opening Balance Entry**:
  - Form: select item, location, quantity, optional unit cost
  - Creates `OPENING_BALANCE` transaction
  - CSV bulk upload option for day-one inventory load (reuse existing CSV import pattern)
  - Admin-only operation
- [x] **Adjustment Entry**:
  - Form: select item, location, quantity (+/-), reason category, notes
  - Reason categories: Damage, Shrinkage, Cycle Count, Correction, Other
  - Creates `ADJUSTMENT` transaction (no vendor, no cost)
  - Available to all authenticated users
- [x] **Transfer Entry**:
  - Form: select item, from location, to location, quantity, notes
  - Auto-creates two `TRANSFER` transactions atomically:
    - Negative qty at source location
    - Positive qty at destination location
  - Validates sufficient stock at source before allowing transfer
  - Available to all authenticated users
- [x] **Backend Endpoints**:
  - `POST /api/transactions/opening-balances` — create opening balance (admin only)
  - `POST /api/transactions/opening-balances/import/preview` — CSV preview for bulk load
  - `POST /api/transactions/opening-balances/import` — CSV commit for bulk load
  - `POST /api/transactions/adjustments` — create adjustment
  - `POST /api/transactions/transfers` — create transfer (atomic pair)
- [x] **Navigation Update**: Add Adjustments and Transfers to sidebar under a "Transactions" group

**Success Criteria**: All met ✅

---

### Phase 3B: Multi-Item Receipt Builder ✅ COMPLETE
**Goal**: Upgrade receipt entry from single-item form to a multi-line receipt builder that matches real-world receiving workflow (one invoice → many parts).

**Why here**: Receipts are the only transaction type where multi-item grouping is natural (shipments contain multiple parts on one invoice). Adjustments and transfers are inherently single-item operations, so they stay simple. Building this after Phase 3A means the full transaction lifecycle is already working, and this is a UX upgrade on top of a complete system.

**Approach**: No schema changes required. Each line item still creates a separate `Transaction` row. All transactions in a batch share the same `invoiceNumber`, linking them logically. This avoids a migration and keeps the existing stock calculation, history, and dashboard queries working unchanged.

- [x] **Receipt Builder UI** (replaces current single-item ReceiptPage):
  - **Header section** (entered once): Vendor, Invoice #, Transaction Date, Location, Notes
  - **Line items section**: Add rows with Item (autocomplete), Quantity, Unit Cost
  - Each line shows Last Paid Price and variance warning independently
  - Running total displayed (total items, total cost)
  - Add/remove line items before submission
  - **Review & Submit**: Show full receipt summary, then submit all lines at once
- [x] **Backend Endpoint**:
  - `POST /api/transactions/receipts/batch` — accepts array of line items + shared header fields
  - Wraps all inserts in a Prisma `$transaction` (atomic — all succeed or all fail)
  - Returns array of created transactions + lastPaidPrice per item
  - Validates all items and vendor exist before creating any rows
- [x] **Backward Compatibility**: Keep existing single-item `POST /api/transactions/receipts` working (used by tests and potential API consumers)

**Success Criteria**: All met ✅

**Bug fix**: Transaction history now sorts by `transactionDate` DESC then `id` DESC, so batch receipt line items appear together instead of scattered.

---

### Phase 4A: Item & Vendor CRUD ✅ COMPLETE
**Goal**: Enable day-to-day management of master data without CSV imports.

- [x] **Item Management Page** (Admin only):
  - Searchable/filterable table of all items (active and inactive via `?all=true`)
  - "Add Item" dialog with all fields (item_code, description, category, UOM, min/max qty, notes)
  - Edit button per row → same dialog pre-filled
  - Deactivate/Reactivate toggle (soft delete via `isActive` flag)
  - Validation: unique item_code (409 conflict), required fields
- [x] **Vendor Management Page** (Admin only):
  - Searchable/filterable table of all vendors (active and inactive)
  - "Add Vendor" dialog (vendor_code, name, contact, phone, email, payment terms, notes)
  - Edit/Deactivate via dropdown menu per row
  - Validation: unique vendor_code, required fields
- [x] **Backend Endpoints**:
  - `GET /api/items/:id` — single item detail
  - `POST /api/items` — create item (admin only)
  - `PUT /api/items/:id` — update item (admin only)
  - `PATCH /api/items/:id/status` — toggle active/inactive (admin only)
  - `GET /api/vendors/:id` — single vendor detail
  - `POST /api/vendors` — create vendor (admin only)
  - `PUT /api/vendors/:id` — update vendor (admin only)
  - `PATCH /api/vendors/:id/status` — toggle active/inactive (admin only)
- [x] **Navigation Update**: Enabled "Items" and "Vendors" sidebar links

**Success Criteria**: All met ✅

---

### Phase 4B: Technical Debt & Performance ✅ COMPLETE
**Goal**: Fix known performance issues and harden the system before scaling usage.

- [x] **Batch N+1 Queries**:
  - Low-stock endpoint: replaced per-item burn rate loop with single `groupBy` aggregate query
  - Valuation endpoint: replaced JS-side aggregation with raw SQL (`SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0)`)
- [x] **Pagination**:
  - Stock position: server-side pagination + debounced search (`?search=&page=&limit=`)
  - Transaction history: server-side pagination with prev/next controls (`?page=&limit=`)
  - Frontend pages updated with pagination controls and page indicators
- [x] **Rate Limiting**:
  - `express-rate-limit` installed and configured
  - Auth rate limit: 10 requests/minute/IP on `/api/auth`
  - General API rate limit: 100 requests/minute/IP on all `/api/*`
- [x] **Unused Schema Fields** — resolved:
  - `safetyStock`: wired into low-stock threshold (`currentStock < minQuantity + safetyStock`)
  - `maxQuantity`: wired into overstock count displayed on dashboard `/stats`
  - `referencePrice`: populated with lastPaidPrice on receipt creation (single + batch)
  - `leadTimeDays`: removed from schema (migration `20260217084836_remove_lead_time_days`)

**Success Criteria**: All met ✅

---

### Phase 4C: BOMs, Production/Kitting & Cycle Counts ✅ COMPLETE
**Goal**: Add manufacturing support — define how trailers are assembled from components, execute kitting orders that auto-consume stock, and provide a formal cycle count process for physical inventory verification.

**Why built**: AWT builds trailers from components (axles, tires, couplers, lights, bolt kits). Without BOMs and kitting, production consumption had to be entered as manual adjustments — error-prone and unauditable. Cycle counts were identified as critical for maintaining data integrity between physical and system inventory.

- [x] **Bill of Materials (BOM) Management** (Admin only):
  - Full CRUD: create, edit (DRAFT only), view list, view detail
  - Status lifecycle: DRAFT → ACTIVE → RETIRED
  - Auto-retire previous ACTIVE BOM when activating a new one for the same finished good
  - Duplicate existing BOM as new DRAFT (for version iterations)
  - Component lines with quantity-per and sort order
  - Validation: unique bomCode, no self-referencing, no duplicate components
  - Frontend: full-page BOM management with inline component editing
- [x] **Production / Kitting** (All authenticated users):
  - `POST /api/production/kit` — execute kitting order atomically:
    - Validates all components have sufficient stock at specified location
    - Creates CONSUMPTION transactions (negative qty) for each component
    - Creates PRODUCTION transaction (positive qty) for finished good
    - Cost rollup: weighted average cost per component, falls back to standardCost
    - Auto-generates order number (PRD-YYYYMMDD-XXXX)
  - `GET /api/production` — list with filters (location, date range, item) + pagination
  - `GET /api/production/:id` — detail with linked transactions
  - Frontend: kitting page with BOM template loading, real-time stock validation, cost preview
- [x] **Cycle Counts** (All authenticated users):
  - `POST /api/cycle-counts` — create count (snapshots system qty for selected location/category)
  - `GET /api/cycle-counts` — list with status/location filters + pagination
  - `GET /api/cycle-counts/:id` — detail with all count lines
  - `PUT /api/cycle-counts/:id/lines` — update counted quantities (bulk)
  - `POST /api/cycle-counts/:id/post` — post count: creates ADJUSTMENT transactions for variances
  - `POST /api/cycle-counts/:id/void` — void count (no stock changes)
  - `GET /api/cycle-counts/variance-history` — variance reporting with CSV export
  - Frontend: create counts, enter counts (blind count support), review variances, post/void, print count sheets
- [x] **Account Settings Page**:
  - Password change form (current + new password with strength validation)
  - Available to all authenticated users
- [x] **Database Migrations**:
  - `20260217163721_add_cycle_counts` — CycleCount and CycleCountLine tables
  - `20260217173519_add_item_cost_and_default_vendor` — standardCost, lastPurchaseCost, safetyStock, defaultVendorId on Items
  - `20260217200709_add_bom_and_production` — Bom, BomLine, ProductionOrder tables + production_order_id on Transactions

**Completed**: Phase 4C commit `575f4eb`
**Test Results**: 7/10 TestSprite tests passing (all APIs verified working — 3 failures are test-code issues)

**Success Criteria**: All met ✅

---

### Phase 4C-fixes: UX Fixes from Alix Testing ✅ COMPLETE
**Goal**: Fix issues found during manual testing with standard user account (Alix).

- [x] Block decimal quantities for EA (each) items on receipt lines
- [x] Fix Last Paid price text alignment under unit cost column
- [x] Clarify backdate message wording (admin workflow)
- [x] Redesign transaction history table (8 cols, colored badges, consolidated Details column)
- [x] Open BOM GET routes to standard users (needed for kitting page)
- [x] Improve cycle count empty state message for standard users
- [x] Item Master read-only access for standard users (route, sidebar, conditional UI)
- [x] Fix timezone bug in future date validation (date-string comparison)

**Completed**: Phase 4C-fixes commit `6107340`
**Test Results**: 6/8 TestSprite tests passing (2 failures: 1 timezone bug fixed post-test, 1 test-script assertion bug)

---

### Phase 4D: Role Permissions, Item Types, Admin Auth & Kitting Guardrails ✅ COMPLETE
**Goal**: Harden role permissions, add item type classification, admin authorization flow for variance overrides, and kitting safety guardrails — all based on Alix's testing feedback.

- [x] **Item Type Field** (RAW / FINISHED / OTHER):
  - Added `itemType` to Item schema with migration
  - Backend: validation on create/update, included in GET responses
  - Frontend: colored badges in item table, Select dropdown in create/edit form
  - Kitting page: finished good dropdown filters to FINISHED, component dropdown excludes FINISHED
  - BOMs page: same itemType-based filtering replaces old category heuristic
- [x] **Cycle Counts Open to Standard Users**:
  - Removed `requireAdmin` from cycle count creation endpoint
  - Standard users see counts they created OR are assigned to
  - "New Cycle Count" button visible to all users
  - Variance History tab remains admin-only
- [x] **Admin Authorization Popup** (reusable):
  - New `AdminAuthDialog` component (username/password modal)
  - Enhanced `api.ts`: custom headers support, `ApiError.data` for structured error responses
  - Per-line variance gate (>10% or >$500): instead of hard-blocking, prompts for admin credentials
  - Backend `verifyAdminCredentials` helper: decodes Basic auth, verifies admin role + password
  - Real-time line flagging during counting (red highlights for large variances)
- [x] **Kitting BOM Lock** (extras only):
  - Backend validates all BOM components present with correct quantities on submission
  - Missing/modified BOM components return 400 with detailed error
  - Extra components allowed, tracked as deviations (`hasDeviations`, `deviationNotes`)
  - Frontend: BOM component rows locked (disabled item/qty/delete), extras get amber "Extra" badge
  - Deviation banner when extras added: "This kit includes N extra component(s)..."

**Database Migration**: `20260218215737_add_item_type_and_production_deviations`

**Success Criteria**: All met ✅

---

### Phase 4E: UX Audit Fixes (P1 + P2) ✅ COMPLETE
**Goal**: Address high and medium priority findings from a comprehensive UX audit — server-side filtering, confirmation dialogs, dirty form guards, UI consistency, and shared utilities.

- [x] **Server-side Category Filtering** (HIGH-1):
  - New `GET /api/items/categories` endpoint for distinct active categories
  - Added `category` query param to stock-position endpoint
  - StockPositionPage now filters server-side instead of client-side on paginated data
- [x] **Transaction Confirmation Dialogs** (HIGH-2):
  - New reusable `ConfirmDialog` component built on existing Radix Dialog
  - ReceiptPage: confirmation with vendor, location, item count, total, invoice summary
  - AdjustmentPage: confirmation with item, direction, quantity, reason; destructive variant for removals
  - KittingPage: confirmation with finished good, BOM, quantity, location, component count, cost estimate
- [x] **Dirty Form Navigation Warning** (HIGH-3):
  - ReceiptPage and KittingPage warn on browser close/refresh via `beforeunload` when form has unsaved changes
  - Note: in-app navigation blocking requires `createBrowserRouter` migration (out of scope)
- [x] **BOM Status Filter** (MED-4):
  - Added status dropdown (All/Draft/Active/Retired) to BOMsPage
  - Leverages existing backend `?status=` param that wasn't being used
- [x] **Shadcn Select on UsersPage** (MED-1):
  - Replaced raw HTML `<select>` elements with Shadcn Select in create and edit dialogs
- [x] **Deactivation/Status Confirmations** (MED-2):
  - ItemsPage: confirm before deactivating/activating items
  - UsersPage: confirm before deactivating/activating users with name displayed
  - BOMsPage: confirm status transitions; extra warning for Active→Retired ("cannot be used for kitting")
- [x] **Shared Currency Formatting** (LOW-4):
  - `formatCurrency()` utility in `utils.ts` replaces 7 inline definitions across the app
  - Consistent `$X,XXX.XX` format with null handling

**Files modified**: 15 (2 backend, 1 new component, 12 frontend pages)

**Success Criteria**: All met ✅

---

### Bug Backlog (B-001 to B-038) ✅ COMPLETE
**Goal**: Resolve all 38 bugs identified across Excel Master Backlog, organized into 6 priority phases. All deploy-gate blockers, recommended fixes, and post-go-live polish items addressed.

#### Deploy-Gate Blockers (Phases 1-4) — 20 bugs
- [x] **B-001**: BOM creation broken on frontend (response handling fix)
- [x] **B-002**: Date timezone bug — `parseDate()` utility appends `T00:00:00` to date-only strings
- [x] **B-003**: Kitting admin approval — `AdminAuthDialog` pattern for all kitting operations
- [x] **B-004**: Adjustment role restriction — threshold-based admin approval (>10% or >$500)
- [x] **B-005**: Opening balance duplicate check — query existing for same item+location before insert
- [x] **B-006**: Batch receipt atomicity — Prisma `$transaction` block for receipt + price updates
- [x] **B-007**: Adjustment "Other" requires notes — conditional backend validation
- [x] **B-008**: Duplicate receipt detection — same vendor+date+item+qty within 24hrs warning
- [x] **B-009**: Item deactivation BOM check — query active BOMs containing item before deactivation
- [x] **B-010**: Confirmation dialogs for all stock-changing actions
- [x] **B-011**: Transaction history search/filter — search by item code, vendor, invoice number
- [x] **B-013**: Item code + description separation in tables
- [x] **B-015**: Standard user vendor read-only access
- [x] **B-016**: Inventory valuation mismatch — per-item rounding in dashboard `getWeightedAvgCostMap()`

#### Recommended Before Go-Live (Phase 5) — 6 bugs
- [x] **B-012**: Batch transaction grouping — `batchId` UUID column, visual grouping in history
- [x] **B-014**: Unsaved changes warning on logout — `FormDirtyContext` integrated across all form pages
- [x] **B-024**: Negative stock check before confirmation dialog in adjustments
- [x] **B-026**: JWT refresh token — `POST /api/auth/refresh` endpoint + auto-refresh in API client
- [x] **B-027**: Payment terms dropdown (COD, Net 15/30/45/60/90) + phone validation
- [x] **B-028**: Item code auto-generation — `GET /api/items/next-code` + wand button in create form

#### Post Go-Live Polish (Phase 6) — 12 bugs
- [x] **B-017**: Sidebar nav labels rename (Inventory → Stock Levels, Items → Item Master)
- [x] **B-018**: Sticky table headers on all list pages
- [x] **B-019**: Transfer counterpart location in transaction details
- [x] **B-020**: BOM modal click-outside protection
- [x] **B-021**: Qty Per decimal enforcement for EA items (BOMs + Kitting)
- [x] **B-022**: Transfer location picker logic (already implemented — read-only "To" field)
- [x] **B-023**: Cycle count live variance calculation — summary cards update in real-time
- [x] **B-025**: Stock position query performance — composite index + page-scoped raw SQL
- [x] **B-029**: Success confirmation toasts for Items and Vendors CRUD
- [x] **B-030**: Dashboard stat widget navigation — clickable cards link to relevant pages
- [x] **B-031**: Location-level valuation totals in Stock Position footer
- [x] **B-032**: Dead stock empty state message improvement
- [x] **B-033**: Warning icon vertical centering in Alert component
- [x] **B-034**: Last price hint alignment on receipt form
- [x] **B-035**: Inline validation animation — `animate-field-error` CSS keyframe
- [x] **B-036**: CSV export filename timestamp
- [x] **B-037**: Future date validation wording improvement
- [x] **B-038**: Date validation inline display (already resolved)

**Database Migrations**:
- `add_batch_id_to_transactions` — batchId UUID column + index
- `add_item_location_composite_index` — composite (itemId, location) index for stock position performance

**Key Architectural Additions**:
- `FormDirtyContext` — global dirty form tracking for logout warning
- JWT refresh token mechanism — sliding window refresh within 1 day of expiry
- Raw SQL stock position queries scoped to current page's items (vs full table scan)

**Success Criteria**: All 38 bugs resolved ✅

---

### Phase 5: Advanced Features & Optimization (Post Go-Live)
**Goal**: Enhancements driven by real-world usage feedback after the system is in production.

**Priority order** (re-evaluate after 2-4 weeks of live usage):

- [ ] **Mobile/Tablet Optimization**:
  - Touch-optimized UI for warehouse iPads/phones
  - Larger touch targets, simplified navigation
  - Receipt entry optimized for tablet in receiving dock
- [ ] **Reporting & Export for QuickBooks Alignment**:
  - Export current inventory valuation to align with QuickBooks.
  - Export logs of scrapped or damaged items to ensure they are properly recorded as expenses in QuickBooks.
  - "Spend by Vendor" report (monthly, yearly).
  - "Inventory Value Over Time" chart.
- [ ] **Barcode Scanning**:
  - Use device camera or USB scanner for item lookup
  - Quick-add to receipt builder by scanning item codes
- [ ] **Notifications & Automation**:
  - Email alerts for low stock items
  - Automated reorder suggestions based on min/max + lead time
  - Dashboard notification badges

**Success Criteria**:
- Application works smoothly on iPad in warehouse
- Users can export any list/report to CSV or PDF
- Barcode scanning speeds up item lookup during receiving
- Low stock email alerts reach admin before stockout

**Note**: Exact scope for Phase 5 will be determined by what Alix and warehouse staff actually request after using the system for a few weeks. Build what they need, not what we assume.

---

### Deferred / Out of Scope
The following ideas were evaluated and intentionally deferred. They can be revisited post-launch if business needs justify them.

| Idea | Reason Deferred |
|------|----------------|
| **Purchase Orders** | Full procurement workflow — significant scope beyond inventory tracking. Revisit if vendor ordering becomes a pain point. |
| **Locations as Data** (dynamic location table) | Only 2 locations (ADEL, CALHOUN). Hardcoded validation is simpler. If a 3rd location is added, it's a quick migration. |
| **System Settings UI** | Cost variance threshold (10%) works as-is. Low stock thresholds per category adds complexity without clear need. Defer until users request configurability. |
| **Manual DB Export UI** | Railway provides automatic daily backups. Manual .sql export button is low-value given hosting backup features. |
| **2FA / Advanced Auth** | 2-5 internal users on a private system. JWT + bcrypt is sufficient. Revisit if the system becomes externally accessible. |

---

## 👥 User Roles & Permissions

### Admin Role
**Who**: Jose (owner), IT support
**Permissions**: Full system access
- ✅ All transaction entry (receipts, adjustments, transfers, opening balances)
- ✅ Execute kitting/production orders
- ✅ View stock position, transaction history, dashboard
- ✅ Manage Items (add, edit, deactivate parts)
- ✅ Manage Vendors (add, edit, deactivate suppliers)
- ✅ Manage BOMs (create, edit, activate/retire, duplicate)
- ✅ Manage Users (create, edit, deactivate user accounts)
- ✅ Create and manage cycle counts (create, count, post, void)
- ✅ CSV import/export (items, vendors, opening balances)
- ✅ Account settings (change own password)

### User Role (Standard)
**Who**: Alix, warehouse staff (2-5 total users expected)
**Permissions**: Operational tasks only
- ✅ Create receipts (receive inventory from vendors)
- ✅ Create adjustments (damage, shrinkage, cycle counts)
- ✅ Create transfers (move items between ADEL and CALHOUN)
- ✅ Execute kitting/production orders
- ✅ Create and manage cycle counts (create, count, post, void)
- ✅ View stock position, transaction history, dashboard
- ✅ Account settings (change own password)
- ❌ Cannot add/edit/delete Items or Vendors
- ❌ Cannot manage BOMs
- ❌ Cannot manage users
- ❌ Cannot create opening balances
- ❌ Cannot perform CSV imports

### Implementation
- **Backend**: Express middleware checks `req.user.role` before allowing operations
- **Frontend**: Conditionally show/hide admin-only UI elements based on user role
- **Database**: `created_by` field in Transactions table tracks who created each entry

---

## ⏱️ Timeline & Progress

### Completed

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 0** | Project Bootstrap | ✅ Complete |
| **Phase 1** | Foundation & Auth | ✅ Complete (8/8 tests passing) |
| **Phase 2** | Core Transactions, CSV Import, Dashboard | ✅ Complete (18/24 tests passing — failures are test bugs, not API bugs) |
| **Phase 3A** | Opening Balances, Adjustments, Transfers | ✅ Complete — full transaction lifecycle |
| **Phase 3B** | Multi-Item Receipt Builder | ✅ Complete — batch receipts with atomic submission |
| **Phase 4A** | Item & Vendor CRUD | ✅ Complete — full CRUD with dialog-based UI |
| **Phase 4B** | Technical Debt & Performance | ✅ Complete — N+1 fixes, pagination, rate limiting, schema cleanup |
| **Phase 4C** | BOMs, Production/Kitting, Cycle Counts | ✅ Complete — manufacturing support, physical inventory verification |
| **Phase 4C-fixes** | UX Fixes from Alix Testing | ✅ Complete — 8 fixes from standard user testing |
| **Phase 4D** | Role Permissions, Item Types, Admin Auth, Kitting Guardrails | ✅ Complete — hardened permissions, item classification, admin override flow |
| **Phase 4E** | UX Audit Fixes (P1 + P2) | ✅ Complete — server-side filtering, confirmation dialogs, dirty form guards, UI consistency |
| **Bug Backlog** | B-001 to B-038 (all 38 bugs) | ✅ Complete — deploy blockers, recommended fixes, and polish items all resolved |

### Phase 4F: Stability & Adoption Hardening ⬜ IN PROGRESS
**Goal**: Fix data integrity gaps and UX friction discovered during comprehensive testing. These issues surfaced after the Zod v3→v4 migration and deeper manual testing. Must be resolved before deploy.

**Updated 2026-02-20**

#### Phase 4F-1: Data Integrity Fixes (deploy blockers)

**Backend — EA decimal validation (4 endpoints)**:
Server-side validation missing for whole-number enforcement on EA/SET/PAIR unit-of-measure items.
- [ ] `POST /api/transactions/adjustments` — block decimal qty for EA items
- [ ] `POST /api/transactions/receipts/batch` — block decimal qty per line for EA items
- [ ] `POST /api/transactions/opening-balances` — block decimal qty for EA items
- [ ] `POST /api/production/kit` — block decimal qty for both finished good and components

**Backend — Item deactivation logic gap**:
- [ ] `PATCH /api/items/:id/status` — block deactivation if item is a finished good in an ACTIVE BOM (currently only checks if item is a component)

**Frontend — Notes serialization (3 pages)**:
Notes field sends `undefined` instead of empty string, which omits the field from JSON and can bypass backend validation. AdjustmentPage already fixed.
- [x] AdjustmentPage — fixed (`notes: values.notes?.trim() || ''`)
- [ ] TransferPage — still uses `notes: pendingValues.notes || undefined`
- [ ] OpeningBalancePage — still uses `notes: pendingValues.notes || undefined`
- [ ] KittingPage — still uses `notes: values.notes || undefined`

#### Phase 4F-2: Adoption Friction Fixes (pre-deploy, high impact for non-tech users)

**Success message improvements** — workers entering multiple transactions in a row can't tell which one just saved:
- [ ] Auto-dismiss success messages after 5 seconds (all 5 form pages)
- [ ] Add context to success messages: item code, location, vendor where applicable
  - Receipt: include vendor name and location
  - Adjustment: include item code and location
  - Transfer: include item code
  - Opening Balance: include item code and location
  - Kitting: include finished good item code

**Submit button disabling** — buttons stay enabled when validation would clearly fail, causing click-nothing-happens confusion:
- [ ] AdjustmentPage: disable submit when qty exceeds available stock (decrease direction)
- [ ] TransferPage: disable submit when qty exceeds available stock

**Confirmation dialog enrichment** — workers can't verify what they're about to submit:
- [ ] AdjustmentPage: show notes in confirmation when reason is "Other"
- [ ] TransferPage: show current stock at source location in confirmation
- [ ] ReceiptPage: show line item details (item code, qty, cost) in confirmation

#### Phase 4F-3: Post-Deploy Polish (nice-to-have, not blocking go-live)

- [ ] Add active/inactive status filter to Items page
- [ ] Add active/inactive status filter to Vendors page
- [ ] Add item type filter (RAW/FINISHED/OTHER) to Stock Position page
- [ ] Add visual indicator for active date range filters on Transaction History
- [ ] Standardize empty state messaging across all pages
- [ ] Dashboard low-stock widget: sort by urgency (days remaining ascending)
- [ ] Table responsive improvements for tablet screens

---

### Remaining — Build Order

| Priority | Phase | Focus | What It Unlocks |
|----------|-------|-------|-----------------|
| **Now** | **4F-1** | Backend EA validation + notes serialization + item deactivation guard | Data integrity — prevents bad data from entering the system |
| **Next** | **4F-2** | Success messages, submit disabling, confirmation enrichment | Adoption — reduces confusion for non-tech warehouse staff |
| **Then** | **Deploy** | Push to Railway/Vercel | Cloud access for Alix and warehouse staff |
| **Post-deploy** | **4F-3** | Filters, empty states, table polish | Quality of life — driven by real usage feedback |
| **After feedback** | **Phase 5** | Mobile, Reporting, Barcode, Notifications | Enhancement: driven by real usage feedback |

### Key Milestones

- ✅ **Local MVP**: Phases 0-2 complete — receipt entry, CSV imports, live dashboard working on localhost
- ✅ **Go-Live Ready**: Phase 3A complete — can load real inventory and operate all transaction types
- ✅ **Operationally Complete**: Phase 4A complete — full master data CRUD without CSV dependency
- ✅ **Production Hardened**: Phase 4B complete — paginated endpoints, rate limiting, optimized queries
- ✅ **Manufacturing-Ready**: Phase 4C complete — BOMs, kitting with cost rollup, cycle counts with variance tracking
- ✅ **User-Tested & Hardened**: Phase 4D complete — role permissions, item types, admin auth popup, kitting guardrails
- ✅ **UX Audit Hardened**: Phase 4E complete — confirmation dialogs, server-side filtering, dirty form guards, UI consistency
- ✅ **Bug Backlog Clear**: B-001 through B-038 resolved
- 🔶 **Stability Pass**: Phase 4F — fixing Zod v4 regressions, backend validation gaps, adoption friction
- ⬜ **Deploy to Cloud**: Push to Railway/Vercel (~30 minutes)
- ⬜ **Feature Complete**: Phase 5 — based on real-world feedback post-launch

---

## 🚀 Deployment Strategy

Phase 4F (stability & adoption hardening) is in progress. Deploy after 4F-1 and 4F-2 are complete.

### Hosting Stack

**Frontend**: [Vercel](https://vercel.com)
- Free tier with generous limits
- Auto-deploys from GitHub
- Global CDN for fast loading
- Free SSL certificates (HTTPS)

**Backend + Database**: [Railway.app](https://railway.app)
- Free $5/month credit initially
- PostgreSQL database included
- Auto-deploys from GitHub
- Automatic backups included

**Alternative**: [Render.com](https://render.com) (all-in-one)

### Architecture

```
User Browser (anywhere with internet)
      ↓ HTTPS
Frontend (Vercel) → https://awt-inventory.vercel.app
      ↓ API calls
Backend (Railway) → https://api-awt-inventory.railway.app
      ↓ SQL queries
PostgreSQL Database (Railway)
```

### Deployment Process (~30 minutes)

1. **Push to GitHub**: `git push origin main`
2. **Connect Vercel**: Import repository, auto-detects Vite config
3. **Connect Railway**: Import repository, add PostgreSQL service
4. **Run Migrations**: `prisma migrate deploy` on Railway
5. **Clear Test Data**: Drop seed data, ready for real data
6. **Load Real Data**: Use CSV imports or manual entry
7. **Create Real Users**: Set up actual admin and Alix accounts
8. **Go Live**: Share URL with team

### Domain Options (Optional)
1. **Free**: Use auto-generated URLs (e.g., `awt-inventory.vercel.app`)
2. **Custom** (~$12/year): Point custom domain (e.g., `inventory.allworldtrailers.com`)

### Cost Estimate
- **Cloud Production**: $5-20/month (Railway backend + database, Vercel frontend free tier)

---

## 💾 Backup & Recovery Strategy

### Automatic Cloud Backups

**Railway PostgreSQL Backups**:
- Automatic daily snapshots (last 7-30 days depending on tier)
- Point-in-time recovery (restore to any moment in last 7 days)
- No manual scripts needed—handled by hosting provider
- Dashboard shows backup status and restore options

### Manual Backups (Optional but Recommended)

**Admin Export Feature** (Phase 4):
- Admin UI button: "Export Database"
- Downloads PostgreSQL dump (.sql file)
- Store in Google Drive, Dropbox, or local backup drive
- Frequency: Weekly or before major changes

### Disaster Recovery Procedures

**Scenario 1 - Data corruption or accidental deletion**:
1. Go to Railway dashboard
2. Select restore point from automated backups
3. Restore database (2-5 minutes downtime)

**Scenario 2 - Hosting provider failure** (extremely rare):
1. Set up new PostgreSQL database on alternative provider
2. Restore from manual .sql export
3. Update environment variables
4. Redeploy application

**Scenario 3 - Need to recover specific data**:
- Use point-in-time recovery to restore to exact timestamp
- Or query backup database directly without affecting production

### Monitoring
- Dashboard displays: "Last backup: 3 hours ago (automatic)"
- Email alerts if automatic backups fail (Railway feature)
- Admin can verify backup integrity by checking Railway dashboard

---

## ⚠️ Dependencies & Risk Mitigation

### Technical Dependencies

| Dependency | Status | Mitigation |
|------------|--------|------------|
| Railway/Render account | Free tier available | Start with free, upgrade if needed |
| PostgreSQL cloud database | Included with Railway | Well-supported, easy to manage |
| GitHub account | Free | Required for deployment auto-sync |
| Internet connectivity | Required | Ensure reliable internet at AWT locations |
| Modern web browser | Chrome, Firefox, Safari, Edge | Already in use at AWT |

### Business Risks

1. **Data Quality**: CSV imports may have inconsistent formats or duplicates
   - ✅ **Mitigation**: Build robust validation, preview before import, allow rollback

2. **User Adoption**: Alix may prefer manual/mental tracking
   - ✅ **Mitigation**: Involve Alix in Phase 2 design, prioritize speed of entry

3. **Internet Dependency**: Cloud hosting requires connectivity
   - ✅ **Mitigation**: Ensure reliable internet at office and warehouse; offline mode not feasible for multi-user

4. **Hosting Costs**: Free tiers have limits
   - ✅ **Mitigation**: Start free, monitor usage, budget $5-20/month if needed

5. **Scope Creep**: Additional features requested mid-development
   - ✅ **Mitigation**: Evaluate new ideas against go-live requirements. See "Deferred / Out of Scope" section for ideas intentionally tabled

### ✅ CONFIRMED Decisions

✅ **Development Approach**: Build locally first, deploy after Phase 4C
✅ **Test Data**: Seed scripts for development; real data loaded via Opening Balance + CSV import at go-live
✅ **Users**: 2-5 users total (Admin + Standard roles sufficient)
✅ **Locations**: ADEL and CALHOUN only (hardcoded — revisit only if a 3rd location is added)
✅ **Multi-Item Receipts**: No schema changes — batch creates multiple Transaction rows sharing the same invoiceNumber
✅ **BOMs & Kitting**: Single-level BOMs with status lifecycle; kitting creates atomic CONSUMPTION + PRODUCTION transactions with cost rollup
✅ **Cycle Counts**: Snapshot-based counting with blind count support; posting auto-creates ADJUSTMENT transactions for variances
✅ **Scope Control**: Purchase orders, dynamic locations, system settings UI, and DB export UI deferred (see Deferred section in roadmap)

### 🚨 Decisions Before Deploy

- Custom domain (e.g., `inventory.allworldtrailers.com`, ~$12/year) or free Railway/Vercel URLs?
- Which hosting tier (free vs paid)?
- When to load real vendor/item data (opening balances)?
- Seed data cleanup strategy (drop seed data before loading real data)

**Phase 5 scope** (determine after 2-4 weeks of live usage):
- Which advanced features do Alix and warehouse staff actually need?
- Mobile-first or reporting-first?

### Contingency Plans

- **If Railway too expensive**: Switch to Render.com (similar pricing and features)
- **If CSV parsing breaks on weird formats**: Provide strict Excel template with example data
