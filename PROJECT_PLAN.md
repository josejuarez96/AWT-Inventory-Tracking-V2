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

### Core Tables

**Users**
```
id              SERIAL PRIMARY KEY
username        VARCHAR(50) UNIQUE NOT NULL
password_hash   TEXT NOT NULL
full_name       VARCHAR(100) NOT NULL
role            VARCHAR(20) NOT NULL  -- 'admin' or 'user'
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMP DEFAULT NOW()
last_login_at   TIMESTAMP
```

**Vendors**
```
id              SERIAL PRIMARY KEY
vendor_code     VARCHAR(50) UNIQUE NOT NULL
vendor_name     VARCHAR(200) NOT NULL
contact_person  VARCHAR(100)
phone           VARCHAR(20)
email           VARCHAR(100)
payment_terms   VARCHAR(50)
notes           TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMP DEFAULT NOW()
```

**Items** (Inventory Master)
```
id              SERIAL PRIMARY KEY
item_code       VARCHAR(50) UNIQUE NOT NULL
description     TEXT NOT NULL
category        VARCHAR(100)
unit_of_measure VARCHAR(20) DEFAULT 'EA'
min_quantity    DECIMAL(10,2)
max_quantity    DECIMAL(10,2)
is_active       BOOLEAN DEFAULT true
notes           TEXT
created_at      TIMESTAMP DEFAULT NOW()
```

**Transactions** (All Inventory Movements)
```
id                SERIAL PRIMARY KEY
transaction_type  VARCHAR(20) NOT NULL  -- 'RECEIPT', 'ADJUSTMENT', 'TRANSFER', 'OPENING_BALANCE'
item_id           INTEGER NOT NULL REFERENCES Items(id)
vendor_id         INTEGER REFERENCES Vendors(id)  -- Nullable for adjustments
location          VARCHAR(50) NOT NULL  -- 'ADEL' or 'CALHOUN'
quantity          DECIMAL(10,2) NOT NULL  -- Positive for in, negative for out
unit_cost         DECIMAL(10,2)  -- Price paid (nullable for adjustments)
reference_price   DECIMAL(10,2)  -- Last known price for variance detection
invoice_number    VARCHAR(100)
transaction_date  DATE NOT NULL
notes             TEXT
created_by        INTEGER REFERENCES Users(id)
created_at        TIMESTAMP DEFAULT NOW()
```

### Indexes for Performance
```sql
CREATE INDEX idx_transactions_item_id ON Transactions(item_id);
CREATE INDEX idx_transactions_date ON Transactions(transaction_date);
CREATE INDEX idx_transactions_type ON Transactions(transaction_type);
CREATE INDEX idx_items_code ON Items(item_code);
CREATE INDEX idx_vendors_code ON Vendors(vendor_code);
```

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

**Known limitations carried forward**:
- ~~Receipt form handles 1 item per submission~~ → ✅ Fixed in Phase 3B (multi-item receipt builder)
- ~~No pagination on list endpoints~~ → ✅ Fixed in Phase 4B (server-side pagination)
- ~~N+1 query in low-stock burn rate calculation~~ → ✅ Fixed in Phase 4B (single groupBy query)
- ~~Sidebar shows Vendors, Items, Settings links as disabled~~ → ✅ Fixed in Phase 4A (full CRUD pages)

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

### Phase 5: Advanced Features & Optimization (Post Go-Live)
**Goal**: Enhancements driven by real-world usage feedback after the system is in production.

**Priority order** (re-evaluate after 2-4 weeks of live usage):

- [ ] **Mobile/Tablet Optimization**:
  - Touch-optimized UI for warehouse iPads/phones
  - Larger touch targets, simplified navigation
  - Receipt entry optimized for tablet in receiving dock
- [ ] **Reporting & Export**:
  - CSV/PDF export of stock position, transaction history
  - "Spend by Vendor" report (monthly, yearly)
  - "Cost Variance Report" (items with frequent price changes)
  - "Inventory Value Over Time" chart
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
- ✅ All transaction entry (receipts, adjustments, transfers)
- ✅ View stock position, transaction history, reports
- ✅ Manage Items (add, edit, deactivate parts)
- ✅ Manage Vendors (add, edit, deactivate suppliers)
- ✅ Manage Users (create, edit, deactivate user accounts)
- ✅ System settings (cost thresholds, backup preferences)
- ✅ CSV import/export and database backups

### User Role (Standard)
**Who**: Alix, warehouse staff (2-5 total users expected)
**Permissions**: Operational tasks only
- ✅ Create receipts (receive inventory from vendors)
- ✅ Create adjustments (damage, shrinkage, cycle counts)
- ✅ Create transfers (move items between ADEL and CALHOUN)
- ✅ View stock position (read-only)
- ✅ View transaction history (read-only)
- ❌ Cannot add/edit/delete Items or Vendors
- ❌ Cannot manage users or change system settings
- ❌ Cannot perform CSV imports or database exports

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

### Remaining — Build Order

| Priority | Phase | Focus | What It Unlocks |
|----------|-------|-------|-----------------|
| **Next** | **Deploy** | Push to Railway/Vercel | Cloud access for Alix and warehouse staff |
| **After deploy** | **Phase 5** | Mobile, Reporting, Barcode, Notifications | Enhancement: driven by real usage feedback |

### Key Milestones

- ✅ **Local MVP**: Phases 0-2 complete — receipt entry, CSV imports, live dashboard working on localhost
- ✅ **Go-Live Ready**: Phase 3A complete — can load real inventory and operate all transaction types
- ✅ **Operationally Complete**: Phase 4A complete — full master data CRUD without CSV dependency
- ✅ **Production Hardened**: Phase 4B complete — paginated endpoints, rate limiting, optimized queries
- ⬜ **Deploy to Cloud**: Push to Railway/Vercel (~30 minutes)
- ⬜ **Feature Complete**: Phase 5 — based on real-world feedback post-launch

---

## 🚀 Deployment Strategy

**IMPORTANT**: Deployment is OPTIONAL and only needed when you're ready to go live. Build and test everything locally first!

### Local Development (Phases 0-4)
**Recommended Approach**: Build entirely on your machine
- Run PostgreSQL locally (or use free Railway dev database)
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Test with seed data, perfect the features
- Demo to Alix on your computer or local network
- **Cost**: $0
- **Internet**: Not required (if using local PostgreSQL)

### Cloud Deployment (When Ready for Production)

**When to Deploy**:
- ✅ After Phase 4 is complete (all core features working)
- ✅ When you want Alix to access from warehouse/home
- ✅ When you're ready to load real data
- ✅ Estimated: ~13-16 weeks into development

**Recommended Hosting Stack**:

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

### Deployment Architecture (When You Deploy)

```
User Browser (anywhere with internet)
      ↓ HTTPS
Frontend (Vercel) → https://awt-inventory.vercel.app
      ↓ API calls
Backend (Railway) → https://api-awt-inventory.railway.app
      ↓ SQL queries
PostgreSQL Database (Railway)
```

### Quick Deployment Process (Takes ~30 minutes)

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
- **Local Development (Phases 0-4)**: $0
- **Cloud Production (when deployed)**: $5-20/month

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

### Knowledge Dependencies

| Technology | Complexity | Mitigation |
|------------|-----------|------------|
| React | Medium | Use Vite template, follow official tutorials |
| Prisma ORM | Low-Medium | Excellent documentation, abstracts SQL complexity |
| JWT Authentication | Medium | Use proven libraries (jsonwebtoken, bcrypt) |
| PostgreSQL | Low | Prisma handles most SQL, similar to SQLite syntax |
| Cloud Deployment | Low | Railway/Vercel well-documented, simpler than AWS |

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

✅ **Development Approach**: Build locally first, deploy after Phase 4B
✅ **Test Data**: Seed scripts for development; real data loaded via Opening Balance + CSV import at go-live
✅ **Users**: 2-5 users total (Admin + Standard roles sufficient)
✅ **Locations**: ADEL and CALHOUN only (hardcoded — revisit only if a 3rd location is added)
✅ **Multi-Item Receipts**: No schema changes — batch creates multiple Transaction rows sharing the same invoiceNumber
✅ **Scope Control**: Purchase orders, dynamic locations, system settings UI, and DB export UI deferred (see Deferred section in roadmap)

### 🚨 Future Decisions (Not Blocking Development)

**When Ready to Deploy** (after Phase 4B):
- Custom domain or free Railway URL?
- Which hosting tier (free vs paid)?
- When to load real vendor/item data (opening balances)?

**Phase 5 scope** (after 2-4 weeks of live usage):
- Which advanced features do Alix and warehouse staff actually need?
- Mobile-first or reporting-first?

### Contingency Plans

- **If Railway too expensive**: Switch to Render.com (similar pricing and features)
- **If PostgreSQL too complex**: Use Supabase (managed PostgreSQL with GUI)
- **If React too difficult**: Fall back to server-rendered HTML (Express + EJS, but loses modern UX)
- **If CSV parsing breaks on weird formats**: Provide strict Excel template with example data
