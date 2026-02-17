# AWT Inventory Tracker — Phase 2 Test Report

**Date:** 2026-02-16
**Phase:** 2 — Core Transactions, CSV Import & Live Dashboard
**Test Runner:** TestSprite MCP (backend)
**Backend URL:** http://localhost:3000

---

## 1. Document Metadata

| Field | Value |
|---|---|
| Project | AWT Inventory Tracking V2 |
| Phase | 2 (builds on Phase 1 foundation) |
| Test Suite ID | 37d76cfb-9d4b-448d-a0c1-f4c19bca5301 |
| Total Tests Executed | 8 |
| Passed | 8 |
| Failed | 0 |
| Skipped | 0 |
| Run Date | 2026-02-17T03:10–03:11 UTC |

---

## 2. Requirement Validation Summary

### Phase 1 Regressions (TC001–TC008) — All Green

| TC | Title | Status | Notes |
|---|---|---|---|
| TC001 | Health check returns status + timestamp | **PASSED** | GET /api/health → 200, {status, message, timestamp} |
| TC002 | Login returns token + user on valid credentials | **PASSED** | POST /api/auth/login → 200, {token, user{id,username,fullName,role}} |
| TC003 | GET /api/auth/me returns user for valid token | **PASSED** | Bearer token accepted, user object returned |
| TC004 | POST /api/auth/logout acknowledges logout | **PASSED** | 200 + {message} |
| TC005 | List users requires admin token | **PASSED** | GET /api/users → 200, users array, no password field |
| TC006 | Create user with admin token | **PASSED** | POST /api/users → 201, {user{id,username,fullName,role}} |
| TC007 | Update user fields with admin token (fullName, role, password) | **PASSED** | PUT /api/users/:id → 200, {user} — envelope unwrapping fix applied |
| TC008 | Activate / deactivate user (not self) | **PASSED** | PATCH /api/users/:id/status → 200, {user{isActive}} — envelope unwrapping fix applied |

**Phase 1 regression status: CLEAN. All 8 tests pass after TC007/TC008 envelope-unwrap fixes.**

---

### Phase 2 New Endpoints — Manual Verification

TestSprite did not generate automated tests for the Phase 2 endpoints in this run (code_summary.yaml was updated mid-session; the tool reused the cached Phase 1 test plan). The following endpoints were verified manually by reviewing implementation code and Prisma query logic:

#### Vendor Management (`/api/vendors`)

| Endpoint | Implementation | Verified |
|---|---|---|
| GET /api/vendors | findMany isActive=true, orderBy vendorName asc | ✓ Code review |
| POST /api/vendors/import/preview | multer memoryStorage, csv-parse/sync, header normalize, validate vendor_code+vendor_name, returns {rows, errors} — no DB write | ✓ Code review |
| POST /api/vendors/import | createMany({ skipDuplicates: true }), returns {inserted: count} | ✓ Code review |

#### Item Management (`/api/items`)

| Endpoint | Implementation | Verified |
|---|---|---|
| GET /api/items | findMany isActive=true, Decimal .toNumber() on all numeric fields | ✓ Code review |
| POST /api/items/import/preview | CSV parse, validate item_code+description, numeric coercion, returns {rows, errors} — no DB write | ✓ Code review |
| POST /api/items/import | createMany({ skipDuplicates: true }), returns {inserted: count} | ✓ Code review |

#### Transaction API (`/api/transactions`)

| Endpoint | Implementation | Verified |
|---|---|---|
| POST /api/transactions/receipts | Validates itemId/vendorId/location/qty/unitCost/date; creates RECEIPT; queries lastPaidPrice excluding current; returns {transaction, lastPaidPrice} | ✓ Code review |
| GET /api/transactions/stock-position | groupBy itemId+location _sum quantity; joins with active items in app; returns {positions[{item,adelQty,calhounQty,totalQty}]} | ✓ Code review |
| GET /api/transactions | Dynamic where from query params (itemId, location, type, from, to); includes item/vendor/user; Decimal .toNumber() | ✓ Code review |

#### Dashboard API (`/api/dashboard`)

| Endpoint | Implementation | Verified |
|---|---|---|
| GET /api/dashboard/stats | Promise.all([item.count, txMTD.count, vendor.count, user.count]) → {totalItems, transactionsMTD, activeVendors, teamMembers} | ✓ Code review |
| GET /api/dashboard/low-stock | groupBy stock, filter <= minQuantity, burnRate=abs(30d outgoing)/30 (null guard), sort daysRemaining asc nulls last | ✓ Code review |
| GET /api/dashboard/dead-stock | Find itemIds active last 90 days; filter items NOT in set with stock > 0 | ✓ Code review |
| GET /api/dashboard/valuation | lastCost map from RECEIPT history; multiply by qty; sum ADEL/CALHOUN/total; $0 for items without cost data | ✓ Code review |
| GET /api/dashboard/activity | last 20 tx, includes item/vendor/user, human-readable description per type | ✓ Code review |

---

## 3. Coverage & Matching Metrics

| Area | Endpoints Implemented | Automated Tests | Manual Review |
|---|---|---|---|
| Health Check | 1 | 1 | — |
| Authentication | 3 | 3 | — |
| User Management | 5 | 4 | — |
| Vendor Management | 3 | 0 | 3 |
| Item Management | 3 | 0 | 3 |
| Transaction API | 3 | 0 | 3 |
| Dashboard API | 5 | 0 | 5 |
| **Total** | **23** | **8 (35%)** | **14 (61%)** |

**Automated coverage: 35% of endpoints (all Phase 1)**
**Total reviewed (automated + code review): 96%**
**1 endpoint not yet verified end-to-end: self-deactivation guard (400 path on PATCH /api/users/:id/status)**

---

## 4. Key Gaps & Risks

### Gaps

| Gap | Description | Severity |
|---|---|---|
| No automated Phase 2 tests | TestSprite regenerated Phase 1 suite; Phase 2 endpoints have code-review verification only | Medium |
| Self-deactivation 400 path | The guard `cannot deactivate own account` exists in code but has no automated test verifying the 400 response and error message | Low |
| CSV import end-to-end | Preview + commit two-step flow verified by code review only; no automated file-upload test | Medium |
| Cost variance warning (frontend) | >10% unit cost deviation alert shown in ReceiptPage — UI-only logic, no backend test applicable | Low |

### Risks

| Risk | Mitigation |
|---|---|
| Prisma Decimal serialization | All Decimal fields call `.toNumber()` before JSON response — enforced in code review |
| Negative stock positions (over-adjust) | Backend returns true sum; frontend shows the negative value (intentional — visible to operator) |
| Burn rate cold start | New deployments have no 30-day history → burnRate=null, daysRemaining=null → UI displays "No usage data" |
| File upload Content-Type conflict | ImportPage uses raw `fetch()` for multipart preview (not `api.ts`) — enforced in code review |

### Recommended Next Actions

1. **Write Phase 2 automated tests** once TestSprite refreshes its test plan from the updated code_summary.yaml — target: vendors, items, receipts, stock-position, dashboard stats
2. **Load sample data** (vendors + items CSV, a few receipts) to validate dashboard widgets end-to-end in the browser
3. **Verify self-deactivation 400** manually via Postman/curl: `PATCH /api/users/{own-id}/status` → expect `{"error":"Cannot deactivate your own account"}`

---

## 5. Phase 2 Completion Checklist

- [x] Backend dependencies installed (multer, csv-parse)
- [x] Frontend shadcn components installed (select, textarea, tabs, alert)
- [x] vendors.js route (GET list, POST preview, POST import)
- [x] items.js route (GET list, POST preview, POST import)
- [x] transactions.js route (POST receipts, GET stock-position, GET history)
- [x] dashboard.js route (stats, low-stock, dead-stock, valuation, activity)
- [x] index.js updated with all 4 new route registrations
- [x] StockPositionPage.tsx (search, low-stock badge)
- [x] TransactionHistoryPage.tsx (date/type/location filters)
- [x] ReceiptPage.tsx (RHF+Zod, cost variance alert, lastPaidPrice)
- [x] ImportPage.tsx (drag-and-drop, preview table, confirm import)
- [x] DashboardPage.tsx (5 live widgets: stats, running low, dead stock, valuation, activity)
- [x] Sidebar.tsx updated (Inventory, Transactions enabled; Receipts, Import added)
- [x] App.tsx updated (4 new routes registered)
- [x] TypeScript compiles with zero errors
- [x] Phase 1 regression suite: 8/8 PASSED
- [ ] Phase 2 automated test suite (pending TestSprite plan refresh)
- [ ] End-to-end browser smoke test with sample data
