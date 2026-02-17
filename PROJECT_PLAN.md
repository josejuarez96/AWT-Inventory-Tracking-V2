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

### Phase 0: Project Bootstrap (Local Development Setup)
**Goal**: Initialize local development environment with test data.
- [ ] **Initialize Git Repository**: Create repo with proper .gitignore (node_modules, .env, dist/)
- [ ] **Create Project Structure**:
  ```
  /frontend    (React + Vite)
  /backend     (Node + Express)
  /docs        (Documentation)
  ```
- [ ] **Initialize Frontend**: `npm create vite@latest frontend -- --template react-ts`
- [ ] **Initialize Backend**: `npm init -y` + install dependencies (express, prisma, bcrypt, jsonwebtoken, cors)
- [ ] **Local PostgreSQL Setup**:
  - Option A: Install PostgreSQL locally (recommended for offline dev)
  - Option B: Use free Railway dev database (requires internet)
- [ ] **Configure Prisma**: Initialize with PostgreSQL, create initial schema
- [ ] **Environment Configuration**: Create .env files (DATABASE_URL, JWT_SECRET, PORT)
- [ ] **Seed Script with Test Data**:
  - 2 test users (Admin: Jose, User: Alix test account)
  - 5-10 sample vendors (DEXTER, LIPPERT, ACME PARTS, etc.)
  - 15-20 sample items (axles, brakes, lights, fasteners, etc.)
  - 10-15 sample transactions for both ADEL and CALHOUN locations
- [ ] **Basic README**: Setup instructions for local development

**Success Criteria**:
✅ Can run `npm run dev` in frontend and backend locally
✅ Frontend (localhost:5173) can make API calls to backend (localhost:3000)
✅ Backend can query PostgreSQL database
✅ Seed script populates database with realistic test data
✅ Can log in with test admin account and see sample inventory

**Deployment**: Not required for this phase - build locally first!

**Estimated Time**: 6-8 hours

### Phase 1: Foundation
**Goal**: Establish authentication, database, and application shell.
- [ ] **Database Migrations**: Run Prisma migrations to create Users, Vendors, Items, Transactions tables
- [ ] **Authentication System**:
  - JWT-based login/logout
  - Password hashing with bcrypt
  - Protected routes (middleware)
  - Session persistence
- [ ] **User Seed Script**: Create first admin user (Jose)
- [ ] **Base Layout**: Responsive sidebar navigation with links to all pages
- [ ] **Dashboard Page**: Landing page with welcome message and placeholder stat cards (Total Items, Transactions MTD, Active Vendors, Team Members) — placeholders upgraded to live data in Phase 2
- [ ] **User Management UI** (Admin only): Create/edit users, assign roles

**Success Criteria**:
✅ Admin can log in with username/password
✅ Invalid credentials show error message
✅ JWT token stored securely, persists on page reload
✅ Dashboard displays "Welcome [User Name]" and shows user role
✅ Navigation sidebar shows appropriate links based on role (admin vs user)
✅ Database contains all 4 core tables with proper relationships
✅ Admin can create a new user account (will be real Alix account later)
✅ Application runs smoothly on localhost

**Deployment**: Still local - no cloud deployment needed yet!

**Estimated Time**: 20-30 hours

### Phase 2: Core Transactions, CSV Import & Live Dashboard (The "Alix" Phase)
**Goal**: Enable receipt entry, bulk data loading via CSV, and upgrade the dashboard to a fully actionable operations hub.

**Note**: CSV imports are for future use when you have real vendor/item lists. For now, use test data from seed script.

- [ ] **CSV Import for Vendors** (Build feature now, use later):
  - Drag-and-drop file upload UI
  - Parse CSV (vendor_code, vendor_name, contact_person, phone, email, payment_terms)
  - Validation: unique codes, required fields
  - Preview table before import with error highlighting
  - Bulk insert into Vendors table
- [ ] **CSV Import for Items** (Build feature now, use later):
  - Upload UI for parts catalog
  - Parse CSV (item_code, description, category, unit_of_measure, min_quantity, max_quantity)
  - Validation: unique codes, required fields
  - Preview before import
  - Bulk insert into Items table
- [ ] **Receipt Entry Form**:
  - Fast data entry: select item (autocomplete), vendor, quantity, cost, date
  - Show "Last Paid Price" for reference (variance warning if cost differs >10%)
  - Create RECEIPT transaction in database
- [ ] **Stock Position View**:
  - Real-time table showing current quantity on hand per item per location
  - Search/filter by item code, description, category
  - Calculated from Transactions table
- [ ] **Transaction History**:
  - Audit trail of all movements (receipts, adjustments, transfers)
  - Filter by date range, item, transaction type
  - Shows who created each transaction and when
- [ ] **Live Dashboard Upgrade**:
  - **Stat Cards (live data)**: Replace placeholders with real counts — Total Items, Transactions (MTD), Active Vendors, Team Members
  - **Running Low Alerts**: Items at or below `min_quantity`, sorted by urgency
    - Burn rate calculated from last 30 days of outgoing usage (negative transactions) ÷ 30 = units/day
    - Days remaining = current stock ÷ burn rate (shown as "~X days left")
    - Empty state: "No low stock items detected" (expected until transaction history accumulates)
  - **Dead Stock**: Items with zero transaction activity in the last 90 days
    - Shows item code, description, qty on hand, last movement date
    - Empty state: "No dead stock detected"
  - **Inventory Valuation**: Total on-hand value = qty on hand × last known unit cost, per item
    - Broken down by ADEL total, CALHOUN total, and combined grand total
    - Used to cross-check against QuickBooks on-hand value
  - **Recent Activity Feed**: Last 20 transactions, newest first
    - Human-readable format: "Alix received 50 × Trailer Tires from Dexter at ADEL" or "Jose adjusted Highway Axle −2 at CALHOUN"
    - Empty state: "No recent activity"
  - **New backend endpoints required**:
    - `GET /api/dashboard/stats` — live counts for stat cards
    - `GET /api/dashboard/low-stock` — items below min_qty with burn rate + days remaining
    - `GET /api/dashboard/dead-stock` — items with no activity in last 90 days
    - `GET /api/dashboard/valuation` — on-hand inventory value by location
    - `GET /api/dashboard/activity` — last 20 transactions as human-readable strings

**Success Criteria**:
✅ Admin can upload Vendors CSV and see preview before importing (tested with sample CSV)
✅ Admin can upload Items CSV and see preview before importing (tested with sample CSV)
✅ Test user can create a receipt entry in under 30 seconds using test data
✅ Receipt form shows last paid price and warns if new price differs significantly
✅ Stock position view accurately reflects inventory after receipts
✅ Transaction history shows all movements with full audit trail
✅ All CSV imports validate data and show clear error messages for bad data
✅ Dashboard stat cards show live counts (not placeholders)
✅ Running Low widget shows burn rate and days remaining for items below min_quantity
✅ Dead Stock widget lists items with no activity in 90+ days
✅ Inventory Valuation shows on-hand value split by ADEL, CALHOUN, and combined
✅ Recent Activity Feed shows last 20 transactions in human-readable format
✅ All dashboard widgets handle empty state gracefully (no crashes when no data yet)
✅ Works perfectly with seed test data on localhost

**Deployment**: Still local development - can demo to Alix on your computer!

**Estimated Time**: 50-60 hours

### Phase 3: Inventory Correction
**Goal**: Handle adjustments, initial counts, and location transfers.
- [ ] **Opening Balance Tool**:
  - Form to input initial stock counts for go-live
  - Select item, location, quantity, optional cost
  - Creates OPENING_BALANCE transactions
  - Optional: CSV upload for bulk opening balances
- [ ] **Adjustment Entry**:
  - Form for damage, shrinkage, theft, cycle count corrections
  - Enter item, location, quantity adjustment (+/-), reason/notes
  - Creates ADJUSTMENT transaction (no vendor, no cost)
- [ ] **Transfer Entry**:
  - Move items between ADEL and CALHOUN locations
  - Creates two TRANSFER transactions (negative at source, positive at destination)
  - Maintains audit trail of location movements

**Success Criteria**:
✅ Admin can set opening balances for existing inventory
✅ Alix can create adjustment for damaged items (quantity decreases)
✅ Alix can transfer items between locations
✅ Stock position view accurately reflects all adjustments and transfers
✅ Transaction history clearly shows adjustment reasons and transfer movements

**Estimated Time**: 15-20 hours

### Phase 4: Administration & Master Data
**Goal**: Manage reference data and system configuration.
- [ ] **Item Catalog Management** (Admin only):
  - CRUD interface for parts (Create, Read, Update, Deactivate)
  - Edit item details: description, category, unit of measure, min/max quantities
  - Search and filter items
- [ ] **Vendor Management** (Admin only):
  - CRUD interface for suppliers
  - Edit vendor details: name, contact, phone, email, payment terms
  - Deactivate vendors (soft delete)
- [ ] **System Settings** (Admin only):
  - Configure cost variance threshold (e.g., warn if cost changes >10%)
  - Set low stock thresholds per category
  - Configure backup preferences
- [ ] **Manual Database Export**:
  - Admin UI button to download PostgreSQL dump (.sql file)
  - Backup all data for offline storage

**Success Criteria**:
✅ Admin can manually add/edit/deactivate items and vendors
✅ Admin can configure cost variance warning threshold
✅ Admin can export full database backup
✅ Standard users cannot access admin functions
✅ Changes to master data are logged (audit trail)

**Estimated Time**: 20-25 hours

### Phase 5: Advanced Features & Optimization
**Goal**: Enhanced functionality and intelligence.
- [ ] **Mobile/Tablet Optimization**:
  - Touch-optimized UI for warehouse iPads
  - Larger buttons, simplified navigation for tablets
- [ ] **Barcode Scanning Integration**:
  - Use device camera or USB scanner
  - Quick lookup/entry by scanning item codes
- [ ] **Reporting & Analytics**:
  - "Spend by Vendor" report (monthly, yearly)
  - "Inventory Value Over Time" chart
  - "Low Stock Items" alert dashboard
  - "Cost Variance Report" (items with frequent price changes)
- [ ] **Advanced Features**:
  - Email notifications for low stock items
  - Automated reorder suggestions based on min/max levels
  - Export reports to PDF/Excel
  - Multi-location inventory summary

**Success Criteria**:
✅ Application works smoothly on iPad in warehouse
✅ Barcode scanning speeds up item lookup
✅ Reports provide actionable insights (spend trends, low stock alerts)
✅ Managers can export reports for review

**Estimated Time**: 20-30 hours

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

## ⏱️ Timeline Estimates

### Assumptions
- Part-time development (~10-15 hours/week)
- Single developer with learning curve for new technologies
- Includes time for testing, debugging, and refinement

### Phase Breakdown

| Phase | Focus | Hours | Calendar Time |
|-------|-------|-------|---------------|
| **Phase 0** | Project Bootstrap | 6-8 hours | 1 week |
| **Phase 1** | Foundation & Auth | 20-30 hours | 2-3 weeks |
| **Phase 2** | Transactions & CSV Import | 40-50 hours | 4-5 weeks |
| **Phase 3** | Adjustments & Transfers | 15-20 hours | 2 weeks |
| **Phase 4** | Administration | 20-25 hours | 2-3 weeks |
| **Phase 5** | Advanced Features | 20-30 hours | 2-4 weeks |

### Key Milestones (Local Development)

- **Week 2**: Phase 0+1 complete → Login works on localhost ✅
- **Week 7**: Phase 2 complete → Receipt entry + CSV imports work with test data → **LOCAL MVP** ✅
- **Week 9**: Phase 3 complete → Adjustments/transfers work → **READY FOR TESTING** ✅
- **Week 14**: Phase 4 complete → Full admin capabilities → **READY TO DEPLOY** ✅
- **Week 15**: Deploy to cloud (30 minutes) → **PRODUCTION LIVE** ✅
- **Week 18**: Phase 5 complete → Advanced features → **FEATURE COMPLETE** ✅

### Total Estimates
- **Local MVP (Phases 0-2)**: ~75 hours, 7-9 weeks (localhost testing)
- **Ready to Deploy (Phases 0-4)**: ~130 hours, 13-16 weeks (local complete, cloud deployment optional)
- **Full System + Deployed**: ~150 hours, 15-18 weeks

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
   - ✅ **Mitigation**: Strict phase boundaries, defer non-critical features to Phase 5

### ✅ CONFIRMED Decisions

✅ **Development Approach**: Build locally first, deploy when ready (Phases 0-4 local)
✅ **Test Data**: Use seed scripts with sample vendors/items (no CSV files needed initially)
✅ **Users**: 2-5 users total (Admin role + Standard user role sufficient)
✅ **Locations**: ADEL and CALHOUN only (confirmed - no additional locations)
✅ **CSV Import**: Build feature in Phase 2, but use with real data later (not blocker)

### 🚨 Future Decisions (Not Blocking Development)

**When Ready to Deploy** (after Phase 4):
- Custom domain or free Railway URL?
- Which hosting tier (free vs paid)?
- When to load real vendor/item data?

**No decisions needed to start coding!** Begin Phase 0 whenever ready.

### Contingency Plans

- **If Railway too expensive**: Switch to Render.com (similar pricing and features)
- **If PostgreSQL too complex**: Use Supabase (managed PostgreSQL with GUI)
- **If React too difficult**: Fall back to server-rendered HTML (Express + EJS, but loses modern UX)
- **If CSV parsing breaks on weird formats**: Provide strict Excel template with example data
