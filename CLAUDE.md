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

**TestSprite archival**: After every TestSprite test run, execute `cd testsprite_tests && ./archive-run.sh "short-description"` to move generated TC*.py files into `runs/` and update `TEST_REGISTRY.md`. Never leave TC*.py files in the `testsprite_tests/` root.

## Change Propagation Rules

Before marking any fix as done, classify it: **is this code unique to one page, or a pattern that exists elsewhere?**

### Fix in isolation (single page, no propagation needed)
- Page-specific UI layout or copy changes
- Page-specific validation rules (e.g., "Other requires notes" is Adjustment-only)
- Page-specific API payload construction
- A bug that only manifests on one page due to that page's unique logic

### Fix holistically (grep first, fix all instances)
- Anything touching the dirty state / form reset pattern (see `PATTERNS.md`)
- Dependency upgrades (Zod, React, React Hook Form) — check every file that imports the changed package
- API client changes (`lib/api.ts`) — affects every page that makes API calls
- Auth/RBAC changes — check both middleware and every frontend route guard
- Changes to shared constants (LOCATIONS, UOM lists, transaction types)
- Validation rules that exist on BOTH frontend and backend — update both or document why only one

### Propagation checklist
When fixing a bug in a form page, always run: `grep -r "thePatternYouChanged" frontend/src/pages/` to find other instances. If the same pattern exists on other pages, fix all of them in the same pass.

**Before modifying form pages, transaction routes, or validation logic, read `PATTERNS.md`** for shared patterns that must be updated consistently across all instances.

## Efficiency Notes

- **Targeted file reads**: When reading large page components (300+ lines), use the `offset`/`limit` parameters on the Read tool to read only the relevant section instead of the entire file. Search with Grep first to find the line numbers you need.
- **Avoid redundant reads**: Do not re-read files already in context. Check conversation history before issuing duplicate Read calls.
