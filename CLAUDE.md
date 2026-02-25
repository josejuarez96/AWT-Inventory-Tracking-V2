# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWT Inventory Tracker — perpetual inventory management system for All World Trailers. Tracks stock across two warehouse locations (ADEL, CALHOUN) with receipts, adjustments, transfers, cycle counts, BOMs, and production/kitting.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS + Shadcn/UI, React Hook Form + Zod validation, React Router DOM
- **Backend**: Express 5 (Node.js), Prisma ORM + PostgreSQL, JWT auth + bcrypt
- **Path alias**: `@/` maps to `frontend/src/` (configured in vite.config.ts and tsconfig)

## Development Commands

### Backend (from `backend/`)
```bash
npm run dev                # Start with nodemon (port 3000)
npm run prisma:migrate     # Run migrations (prisma migrate dev)
npm run prisma:seed        # Seed test data (admin: jose/Password1, user: alix/Password1)
npx prisma studio          # Database GUI
npx prisma generate        # Regenerate client after schema changes
```

### Frontend (from `frontend/`)
```bash
npm run dev                # Vite dev server (port 5173)
npm run build              # tsc -b && vite build
npm run lint               # ESLint
```

### Database Reset
```bash
dropdb awt_inventory && createdb awt_inventory
cd backend && npx prisma migrate dev && npm run prisma:seed
```

## Architecture

### Backend Structure
- **Entry**: `backend/src/index.js` — Express app with CORS, rate limiting, route mounting
- **Routes** (9 files in `backend/src/routes/`): auth, users, vendors, items, transactions, dashboard, cycleCounts, boms, production
- **Middleware** (`backend/src/middleware/auth.js`): `authenticate` (JWT verification, attaches `req.user`) and `requireAdmin` (role check)
- **Shared** (`backend/src/lib/`): `prisma.js` (singleton client), `locations.js` (ADEL/CALHOUN array), `validatePassword.js`
- **Schema**: `backend/prisma/schema.prisma` — 9 models: User, Vendor, Item, Transaction, CycleCount, CycleCountLine, Bom, BomLine, ProductionOrder

### Frontend Structure
- **Entry**: `frontend/src/App.tsx` — BrowserRouter with AuthProvider > FormDirtyProvider > Routes
- **Pages** (18 in `frontend/src/pages/`): Each page is self-contained with its own API calls, state, and form logic
- **Components**: `frontend/src/components/ui/` (19 Shadcn components), `AdminAuthDialog.tsx` (credential prompt for variance approvals), `ProtectedRoute.tsx` (role-based route guard), `ImportTab.tsx` (CSV import with preview)
- **Context**: `AuthContext.tsx` (user state, login/logout), `FormDirtyContext.tsx` (unsaved changes warning)
- **API client**: `frontend/src/lib/api.ts` — wrapper with JWT auto-refresh, base URL `http://localhost:3000`

### Key Patterns

**Authentication**: JWT tokens stored in localStorage (`awt_token`), 7-day expiry, auto-refresh within 1 day of expiry. Backend `authenticate` middleware on all protected routes.

**RBAC**: Two roles — `admin` (full access) and `user` (operational tasks). Admin-only features: user management, BOMs, CSV imports, opening balances. Standard users require admin credential dialog for cycle count variances >10% or >$500.

**Transactions**: All inventory movements are Transaction records with types: RECEIPT, ADJUSTMENT, TRANSFER, OPENING_BALANCE, CONSUMPTION, PRODUCTION. Multi-line operations use `batchId` (UUID) for grouping. Transfers create atomic pairs (negative at source, positive at destination).

**API pagination**: All list endpoints use `?page=1&limit=20` query params with `skip`/`take` in Prisma.

**Date handling**: Date-only strings are parsed with `parseDate()` in `frontend/src/lib/utils.ts` which appends `T00:00:00` to prevent UTC timezone shift. This is critical — never use `new Date("YYYY-MM-DD")` directly.

**BOM lifecycle**: DRAFT → ACTIVE (auto-retires previous active BOM for same finished good) → RETIRED.

## Business Rules Enforced in Code

- No negative stock (adjustments/transfers validate available quantity)
- Future transaction dates blocked; receipts >31 days old blocked for non-admin
- Decimal quantities blocked for whole-unit UOMs (EA, BOX, BUNDLE, ROLL, PACK, BAG, SHEET, SPOOL, SET, PAIR); only FT, LB, GAL, KG, M, SQ FT allow decimals
- Duplicate receipt detection: same vendor+date+item+qty within 24hrs shows warning
- Cycle count variance >10% or >$500 requires admin credential approval
- Locations are hardcoded: `['ADEL', 'CALHOUN']` in both `backend/src/lib/locations.js` and `frontend/src/lib/locations.ts`

## Testing

Backend API tests are in `testsprite_tests/` (Python). The backend must be running on localhost:3000 to execute them. No automated frontend tests. Manual API test script at `test-comprehensive.js` (run with `node test-comprehensive.js` while backend is running).

## Change Propagation Rules

Before marking any fix as done, classify it: **is this code unique to one page, or a pattern that exists elsewhere?**

### Fix in isolation (single page, no propagation needed)
- Page-specific UI layout or copy changes
- Page-specific validation rules (e.g., "Other requires notes" is Adjustment-only)
- Page-specific API payload construction
- A bug that only manifests on one page due to that page's unique logic

### Fix holistically (grep first, fix all instances)
- Anything touching the dirty state / form reset pattern (see Shared Patterns below)
- Dependency upgrades (Zod, React, React Hook Form) — check every file that imports the changed package
- API client changes (`lib/api.ts`) — affects every page that makes API calls
- Auth/RBAC changes — check both middleware and every frontend route guard
- Changes to shared constants (LOCATIONS, UOM lists, transaction types)
- Validation rules that exist on BOTH frontend and backend — update both or document why only one

### Propagation checklist
When fixing a bug in a form page, always run: `grep -r "thePatternYouChanged" frontend/src/pages/` to find other instances. If the same pattern exists on other pages, fix all of them in the same pass.

## Shared Patterns Registry

These code patterns are duplicated across multiple pages. A bug in one means the same bug exists in all of them.

### Form dirty state tracking (5 pages)
**Pages**: AdjustmentPage, ReceiptPage, TransferPage, OpeningBalancePage, KittingPage
**Pattern**: `userInteracted` state + 3 effects (watch subscription, FormDirtyContext sync, beforeunload guard)
**Critical**: On successful submit, MUST call `setUserInteracted(false)` and `setFormDirty(false)` BEFORE `reset()`. Use `'' as unknown as number` for numeric field reset values (not `undefined`, which doesn't clear HTML inputs).

### Confirm dialog flow (5 pages)
**Pages**: AdjustmentPage, ReceiptPage, TransferPage, OpeningBalancePage, KittingPage
**Pattern**: `pendingValues` state + `confirmOpen` state + `onFormValid` → `onConfirmed` two-step submit

### Notes/optional field serialization
**Rule**: Send `notes: values.notes?.trim() || ''` (empty string), NOT `notes: values.notes || undefined`. The `undefined` pattern causes the field to be omitted from JSON.stringify, which can bypass backend validation that checks for the field's presence.

### Frontend ↔ Backend validation
Frontend Zod schemas and backend express-validator chains implement the same rules independently. There is no shared source of truth. When adding or changing a validation rule, update BOTH sides and note the corresponding location:
- Adjustment validation: frontend `AdjustmentPage.tsx` schema ↔ backend `routes/transactions.js` POST `/adjustments`
- Receipt validation: frontend `ReceiptPage.tsx` schema ↔ backend `routes/transactions.js` POST `/receipts/batch`
- Transfer validation: frontend `TransferPage.tsx` schema ↔ backend `routes/transactions.js` POST `/transfers`
- Opening balance: frontend `OpeningBalancePage.tsx` schema ↔ backend `routes/transactions.js` POST `/opening-balances`
- Kitting: frontend `KittingPage.tsx` schema ↔ backend `routes/production.js` POST `/kit`

### Item dropdown display format (7 pages, 2 component types)
**Combobox pages** (use `renderLabel` prop): ReceiptPage, AdjustmentPage, TransferPage, OpeningBalancePage
**Select/SelectItem pages** (render JSX children): BOMsPage, KittingPage, CreateProductionOrderPage
**Pattern**: Two-column layout — item code in `font-mono font-semibold` on left, description in `text-gray-500` on right. Never concatenate `${itemCode} — ${description}` as a plain string.
**Exception**: CycleCountDetailPage uses separate table columns (already correct).

### UOM decimal validation (all transaction pages + backend)
**Shared constants**: `backend/src/lib/uom.js` and `frontend/src/lib/uom.ts` — single source of truth.
**Decimal-allowed UOMs**: `['FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT']` — these allow fractional quantities.
**All other UOMs** (EA, BOX, BUNDLE, ROLL, PACK, BAG, SHEET, SPOOL, SET, PAIR) require whole numbers.
**Logic**: Use `allowsDecimals(unitOfMeasure)` helper. If `!allowsDecimals(uom)`, quantity must be integer (`Number.isInteger()`). Use `step="any"` on HTML inputs to prevent browser silent rounding — rely on validation messages instead.
**Frontend pages**: ReceiptPage, AdjustmentPage, TransferPage, OpeningBalancePage, KittingPage, BOMsPage
**Backend routes**: `transactions.js` (receipts, adjustments, transfers, opening-balances), `production.js` (kit, production orders)
**Items page UOM**: Dropdown (`<Select>`) using `ALL_UOMS` from `frontend/src/lib/uom.ts`. Not free-text.
**Standardized error message**: `"${itemCode} is measured in ${uom} — quantity must be a whole number."`
**Rule**: Validate on BOTH frontend (inline field error or `setSubmitError`) and backend (400 response).

### Date parsing — backend
**Rule**: Never use `new Date("YYYY-MM-DD")` on the backend — it interprets as UTC midnight which shifts the date backward in US timezones. Use `parseDateLocal(dateStr)` helper which appends `T12:00:00` to anchor at local noon. This mirrors the frontend `parseDate()` rule.
**Affected**: All `transactionDate: new Date(...)` calls in `transactions.js` and `production.js`.

### Currency/number onBlur formatting
**Pages with currency inputs**: ItemsPage (standardCost), ReceiptPage (lineItems unitCost), OpeningBalancePage (unitCost)
**Pattern**: `onBlur` handler formats to `.toFixed(2)` for currency fields. Prevents display of raw unformatted numbers.
**Rule**: Any new currency input field must include this onBlur handler.

### Transaction batch ID display
**Page**: TransactionHistoryPage
**Pattern**: For multi-line transactions sharing a `batchId`, display the lowest `t.id` in the batch as the reference for all lines. Uses `batchFirstIdMap` (useMemo). Search by displayed ID returns all batch members.

### Zod .refine() error display
**Rule**: Whenever a Zod schema uses `.refine()` with a `path` targeting a specific field, the JSX MUST include `{errors.fieldName && <p className="text-xs text-red-600">{errors.fieldName.message}</p>}` for that field. Otherwise validation silently blocks submission with no visible feedback to the user.
