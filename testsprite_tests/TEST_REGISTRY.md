# TestSprite Test Registry — AWT Inventory Tracking V2

> Master log of all TestSprite test runs. Each run is stored in `runs/<run_id>/` with its test scripts, results, and report.

---

## How to Use This Registry

1. **After each TestSprite run**, create a new folder under `runs/` using the format: `NNN_YYYY-MM-DD_short-description`
2. Move all generated `TC*.py` files from the root `testsprite_tests/` into the new run folder
3. Copy `tmp/raw_report.md` and `tmp/test_results.json` into the run folder
4. Add a new row to the table below

---

## Test Runs

| Run | Date | Phase | Scope | Tests | Passed | Failed | Description | Notes |
|-----|------|-------|-------|------:|-------:|-------:|-------------|-------|
| 001 | 2026-02-17 | Phase 2-3 | codebase | 10 | — | — | Early API tests: auth, users, vendors, opening balances | No report preserved (overwritten by later runs) |
| 002 | 2026-02-17 | Phase 2-3 | codebase | 8 | — | — | Auth, users, vendors focused | No report preserved |
| 003 | 2026-02-17 | Phase 3 | codebase | 23 | — | — | Full API suite: auth through dashboard (TC002-TC024) | Largest single run; no report preserved |
| 004 | 2026-02-17 | Phase 3 | codebase | 10 | — | — | Consolidated tests: health, auth, users, items, vendors, receipts | No report preserved |
| 005 | 2026-02-17 | Phase 3 | codebase | 3 | — | — | User management + change password | Partial rerun; no report preserved |
| 006 | 2026-02-17 | Phase 3 | codebase | 9 | — | — | Auth deep dive: login, me, password, logout | No report preserved |
| 007 | 2026-02-17 | Phase 3 | codebase | 10 | 7 | 3 | Phase 3 validation: health, auth, users, items, receipts, kitting | 7/10 passing per git commit message |
| 008 | 2026-02-17 | Phase 3 | codebase | 10 | 7 | 3 | Phase 3 final: full API coverage with production/kitting | Final Phase 3 run; results in commit `7d9eed4` |
| 009 | 2026-02-18 | Phase 4C-fixes | diff | 8 | 6 | 2 | Date validation (5 tests) + BOM read access (3 tests) | TC001: timezone bug (fixed). TC005: test script bug. Effective 7/8. |
| 010 | 2026-02-18 | Hardening | diff | 6 | 6 | 0 | Scenario audit fixes: stock floor, deactivation guard, transfer atomicity, BOM status, reason cleanup | 100% pass |

---

## Coverage Summary by Feature Area

| Feature Area | Last Tested | Run | Status |
|-------------|-------------|-----|--------|
| Health Check (GET /api/health) | 2026-02-17 | 008 | Passing |
| Auth: Login | 2026-02-17 | 008 | Passing |
| Auth: Me | 2026-02-17 | 008 | Passing |
| Auth: Change Password | 2026-02-17 | 008 | Passing |
| Auth: Logout | 2026-02-17 | 007 | Passing |
| Auth: Rate Limiting | 2026-02-17 | 008 | Passing |
| User Management (CRUD) | 2026-02-17 | 008 | Passing |
| Item Management (CRUD) | 2026-02-17 | 008 | Passing |
| Item CSV Import | 2026-02-17 | 008 | Passing |
| Vendor Management (CRUD) | 2026-02-17 | 008 | Passing |
| Vendor CSV Import | 2026-02-17 | 004 | Passing |
| Receipts (single + batch) | 2026-02-17 | 008 | Passing |
| Receipt Date Validation | 2026-02-18 | 009 | Passing (after fix) |
| Opening Balances | 2026-02-17 | 003 | Passing |
| Adjustments | 2026-02-17 | 003 | Passing |
| Transfers | 2026-02-17 | 008 | Passing |
| Stock Position | 2026-02-17 | 008 | Passing |
| Transaction History | 2026-02-17 | 003 | Passing |
| Dashboard Stats | 2026-02-17 | 003 | Passing |
| BOM Read Access (standard user) | 2026-02-18 | 009 | Passing |
| BOM Write (admin only) | 2026-02-18 | 009 | Passing |
| Production/Kitting | 2026-02-17 | 008 | Passing |

---

## Not Yet Tested (Phase 4D)

These features were implemented after the last test run and need validation:

- [ ] Item type classification (RAW, FINISHED, OTHER) — CRUD + filtering
- [ ] Cycle count creation by standard user
- [ ] Cycle count per-line variance gate (>10% or >$500)
- [ ] Admin authorization popup flow on cycle count post
- [ ] Kitting BOM lock (prevent component removal/modification)
- [ ] Kitting extras with deviation tracking
- [ ] BOM/Kitting dropdown filtering by itemType
