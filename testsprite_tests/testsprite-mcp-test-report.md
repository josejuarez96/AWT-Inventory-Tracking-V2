# AWT Inventory Tracker — Phase 2 Test Report

**Date:** 2026-02-17
**Phase:** 2 — Core Transactions, CSV Import & Live Dashboard
**Test Runner:** TestSprite MCP (backend)
**Backend URL:** http://localhost:3000
**Suite size:** 24 tests (TC001–TC024)

---

## 1️⃣ Document Metadata

| Field | Value |
|---|---|
| Project | AWT Inventory Tracking V2 |
| Phase | 2 (builds on Phase 1 foundation) |
| Total Tests | 24 |
| Passed | 18 |
| Failed | 6 |
| Pass Rate | 75% |
| Run Date | 2026-02-17 |
| Dashboard | https://www.testsprite.com/dashboard/mcp/tests/4e7aa9f8-7b1e-47bd-812a-993feecea897 |

---

## 2️⃣ Requirement Validation Summary

### Group A — Health Check & Authentication (TC001–TC006) — 6/6 ✅

| TC | Title | Status |
|---|---|---|
| TC001 | Health check returns status + timestamp | ✅ Passed |
| TC002 | Login with valid credentials returns token + user | ✅ Passed |
| TC003 | Login with invalid credentials returns 401 | ✅ Passed |
| TC004 | GET /api/auth/me returns user for valid token | ✅ Passed |
| TC005 | GET /api/auth/me without token returns 401 | ✅ Passed |
| TC006 | Logout acknowledges with message | ✅ Passed |

**All authentication flows verified clean.**

---

### Group B — User Management (TC007–TC010) — 1/4 ✅

| TC | Title | Status | Root Cause |
|---|---|---|---|
| TC007 | List users with admin token | ✅ Passed | — |
| TC008 | Create user with admin token | ❌ Failed | Test bug: response envelope not unwrapped (`resp.json()["id"]` instead of `resp.json()["user"]["id"]`) |
| TC009 | Update user fields with admin token | ❌ Failed | Test bug: same envelope issue on both create and update steps |
| TC010 | Deactivate / reactivate user account | ❌ Failed | Test bug: PATCH response envelope not unwrapped (`patched.get("isActive")` instead of `patched["user"]["isActive"]`) |

**Root cause:** TestSprite AI repeatedly generates code that accesses `resp.json()["id"]` directly instead of going through the `{"user": {...}}` response envelope, despite explicit instructions. API behavior is confirmed correct via manual verification.

---

### Group C — Vendor & Item Management (TC011–TC016) — 4/6 ✅

| TC | Title | Status | Root Cause |
|---|---|---|---|
| TC011 | List active vendors | ✅ Passed | — |
| TC012 | Vendor CSV import preview | ✅ Passed | — |
| TC013 | Vendor CSV import commit | ❌ Failed | Test bug: sends `{ confirm, previewId }` instead of `{ rows: [...] }`. Our API is stateless; no previewId exists. |
| TC014 | List active items | ✅ Passed | — |
| TC015 | Item CSV import preview | ✅ Passed | — |
| TC016 | Item CSV import commit | ❌ Failed | Test bug: same previewId assumption as TC013. Sends `{ confirm, previewId, rows: [{"item":"dummy"}] }` instead of correct `{ rows: [{ item_code, description, ... }] }`. |

**Root cause for TC013/TC016:** TestSprite AI defaults to a stateful "preview → previewId → commit" workflow from training data. Our two-step flow is stateless: preview returns `{ rows, errors }` (no previewId); commit takes `{ rows }` JSON directly. Manual curl verification confirms both commit endpoints work correctly.

---

### Group D — Transactions (TC017–TC019) — 2/3 ✅

| TC | Title | Status | Root Cause |
|---|---|---|---|
| TC017 | POST receipt creates transaction + returns lastPaidPrice | ❌ Failed | Test bug: CSV has mismatched column count (extra trailing comma), triggering parse error in preview step. Also uses wrong commit pattern (previewId) and wrong field names (`unit_cost` vs `unitCost`). |
| TC018 | Stock position returns aggregated qty by item + location | ✅ Passed | — |
| TC019 | Transaction history with filters | ✅ Passed | — |

**Root cause for TC017:** Multi-step test with compounding bugs (CSV column mismatch, wrong field names, previewId assumption). All three endpoints work correctly per manual verification.

---

### Group E — Dashboard (TC020–TC024) — 5/5 ✅

| TC | Title | Status |
|---|---|---|
| TC020 | Stats returns totalItems, transactionsMTD, activeVendors, teamMembers | ✅ Passed |
| TC021 | Low-stock returns flat items with burnRate + daysRemaining | ✅ Passed |
| TC022 | Dead-stock returns flat items with no recent activity | ✅ Passed |
| TC023 | Valuation returns adel + calhoun + total | ✅ Passed |
| TC024 | Activity feed returns ≤20 entries with transactionType | ✅ Passed |

**All 5 dashboard widgets fully verified. 🎉**

---

## 3️⃣ Coverage & Matching Metrics

| Requirement Group | Tests | Passed | Failed | Coverage |
|---|---|---|---|---|
| Health Check & Auth | 6 | 6 | 0 | 100% |
| User Management | 4 | 1 | 3 | 25% (test bugs, not API bugs) |
| Vendor Management | 3 | 2 | 1 | 67% (test bug) |
| Item Management | 3 | 2 | 1 | 67% (test bug) |
| Transactions | 3 | 2 | 1 | 67% (test bug) |
| Dashboard | 5 | 5 | 0 | 100% |
| **Total** | **24** | **18** | **6** | **75%** |

**Important distinction:** All 6 failures are test-code bugs (response envelope mishandling, assumed previewId workflow). Zero failures indicate actual API regressions. All Phase 2 endpoints were manually verified to return correct responses.

---

## 4️⃣ Key Gaps / Risks

### Test-Side Bugs (not API bugs)

| TC | Bug Type | Fix Needed |
|---|---|---|
| TC008, TC009, TC010 | Response envelope | Use `resp.json()["user"]["id"]` not `resp.json()["id"]` |
| TC013, TC016 | PreviewId assumption | Commit endpoint takes `{ rows: [...] }` JSON directly, no previewId |
| TC017 | CSV column mismatch + previewId + wrong field names | Fix CSV trailing comma; use camelCase `unitCost`/`transactionDate`; skip previewId |

### API Gaps / Known Limitations

| Gap | Description | Severity |
|---|---|---|
| No vendor/item DELETE | Test cleanup for receipts test (TC017) cannot remove seed data | Low |
| No CSV column strict mode | Trailing commas cause parse errors (TC017); consider lenient parsing | Low |
| Self-deactivation guard | 400 error path not covered by any test | Low |

### Recommendations

1. **Fix the 6 failing tests manually** using TestSprite dashboard or direct .py file edits — all require trivial code changes (3–5 lines each)
2. **Load real operational data** — import vendors + items CSV, enter a few receipts — to validate burn rate, dead stock, and valuation widgets with live numbers
3. **TC017 is the highest priority fix** — it's the only test covering the receipt entry flow (the core daily-use action in Phase 2)
4. **Consider adding DELETE endpoints for vendor/item** in a future phase to support proper test cleanup

---

## Phase 2 Completion Checklist

- [x] Backend: vendors.js, items.js, transactions.js, dashboard.js routes
- [x] Backend: index.js route registration
- [x] Frontend: StockPositionPage, TransactionHistoryPage, ReceiptPage, ImportPage
- [x] Frontend: DashboardPage live rebuild (5 widgets)
- [x] Frontend: Sidebar + App.tsx routing
- [x] TypeScript: zero compilation errors
- [x] Phase 1 regression suite: 7/7 PASSED (TC001–TC007)
- [x] Phase 2 automated suite: 18/24 PASSED (75%)
- [x] All 6 failures root-caused to test-code bugs (not API bugs)
- [ ] TC008/TC009/TC010 test fixes (envelope unwrap)
- [ ] TC013/TC016/TC017 test fixes (stateless commit flow)
