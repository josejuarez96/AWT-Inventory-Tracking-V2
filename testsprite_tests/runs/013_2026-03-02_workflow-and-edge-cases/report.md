
# Edge Case & Negative Test Report — AWT Inventory Tracking V2

---

## 1. Document Metadata
- **Project Name:** AWT Inventory Tracking V2
- **Date:** 2026-02-19
- **Prepared by:** TestSprite AI + Claude Code Review
- **Test Scope:** 12 edge case / negative / boundary condition tests targeting known issues, missing guards, and data integrity risks
- **Backend URL:** http://localhost:3002/api
- **Total Test Cases:** 12 (TC013–TC024)
- **Pass Rate:** 11/12 passed (91.7%)
- **Tests that exposed bugs needing fixes:** 4 out of 12

---

## 2. Results Summary

| # | Test ID | Scenario | TestSprite Result | Current Behavior | Expected Behavior | Bug? |
|---|---------|----------|-------------------|------------------|-------------------|------|
| 1 | TC013 | Standard user POST /api/production/kit | PASSED | 201 — standard user CAN create kitting orders | 201 — kitting is operational (admin approval needed only for extra components) | No |
| 2 | TC014 | Standard user POST /api/transactions/adjustments | PASSED | 201 — standard user CAN create adjustments | 201 — adjustments are operational tasks | No |
| 3 | TC015 | Receipt with unitCost = 0 | PASSED | 400 — zero cost blocked by `isFloat({ gt: 0 })` | 400 — correctly rejected | No |
| 4 | TC016 | Adjustment reason='Other' + empty notes | PASSED | 201 — accepted without notes | 400 — 'Other' should require notes | **YES — AUDIT GAP** |
| 5 | TC017 | Duplicate receipt (same vendor+item+date) | PASSED | 201 — duplicate created, stock doubled | 400/409 or at least a warning | **YES — DATA INTEGRITY GAP** |
| 6 | TC018 | Opening balance import run twice | **FAILED** | 201 both times — stock doubled (adelQty=39 vs expected=20) | Should block or warn on duplicate import | **YES — DATA INTEGRITY GAP** |
| 7 | TC019 | Item deactivation when in ACTIVE BOM | PASSED | 200 — deactivation succeeds (stock was zeroed out) | 400 — should block if component in ACTIVE BOM | **YES — DATA INTEGRITY GAP** |
| 8 | TC020 | Standard user posts cycle count (small variance) | PASSED | 200 — standard user CAN post with small variances | 200 — correct, threshold logic works | No |
| 9 | TC021 | Receipt with future date | PASSED | 400 — "Transaction date cannot be in the future" | 400 — correctly rejected | No |
| 10 | TC022 | Receipt with date 31+ days ago | PASSED | 400 — "Transaction date cannot be more than 30 days in the past" | 400 — correctly rejected | No |
| 11 | TC023 | Transfer same source and destination | PASSED | 400 — "From and To locations must be different" | 400 — correctly rejected | No |
| 12 | TC024 | Adjustment that would make stock negative | PASSED | 400 — "Adjustment would result in negative stock" | 400 — correctly rejected | No |

---

## 3. Detailed Findings

### BUGS FOUND (4 issues requiring fixes)

#### BUG 1: Adjustment with reason='Other' Accepts Empty Notes (TC016)
- **File:** `backend/src/routes/transactions.js`, line 476
- **Severity:** MEDIUM — Audit trail gap
- **Current:** `body('notes').optional().trim()` — notes are completely optional regardless of reason
- **Expected:** When `reason='Other'`, notes should be required to explain the adjustment
- **Impact:** Adjustments with no explanation undermine the audit trail. "Other" without context is meaningless for compliance review
- **Fix:** Add conditional validation: if `reason === 'Other'`, require `notes` to be non-empty

#### BUG 2: No Duplicate Receipt Detection (TC017)
- **File:** `backend/src/routes/transactions.js`, lines 60-152
- **Severity:** MEDIUM — Data integrity risk
- **Current:** No uniqueness check. Identical receipts (same item, vendor, date, quantity, cost) are accepted without warning
- **Expected:** At minimum, a warning. Ideally, block exact duplicates or require confirmation
- **Impact:** Accidental double-entry inflates stock and cost data. In testing, stock increased by 14 (2x7) instead of 7
- **Fix:** Add duplicate detection: check for existing transaction with same `itemId + vendorId + location + quantity + unitCost + transactionDate` within a time window

#### BUG 3: Opening Balance Import Allows Duplicate Runs (TC018)
- **File:** `backend/src/routes/transactions.js`, lines 405-457
- **Severity:** HIGH — Data integrity gap
- **Current:** No duplicate detection on import. Running the same CSV import twice creates double opening balances
- **Expected:** Block if opening balances for the same item+location already exist, or at least warn
- **Impact:** Test showed `adelQty=39` instead of expected `20` after double import — stock was inflated
- **Fix:** Before creating opening balances, check if `OPENING_BALANCE` transactions already exist for the same `itemId + location` combination

#### BUG 4: Item Deactivation Not Blocked by Active BOM Usage (TC019)
- **File:** `backend/src/routes/items.js`, lines 375-387
- **Severity:** HIGH — Data integrity gap
- **Current:** Deactivation only checks if `totalStock > 0`. Does NOT check if item is referenced as a component in any ACTIVE BOM
- **Expected:** Block deactivation if item is a component in any BOM with status='ACTIVE'
- **Impact:** Deactivating a component breaks all active BOMs that reference it, causing kitting failures
- **Fix:** Before deactivation, query `bomLines` where `itemId` matches AND parent BOM `status='ACTIVE'`. If found, return 400 with "Item is a component in active BOM(s)"

---

### GUARDS WORKING CORRECTLY (8 scenarios)

#### TC013: Standard User Kitting Access — CORRECT
- Standard users CAN create kitting/production orders (201). This is expected — building finished goods is operational. Creating BOMs is admin-only, but executing production against an active BOM is a standard user task. If extra components are added beyond the BOM, admin approval would be needed.

#### TC014: Standard User Adjustment Access — CORRECT
- Standard users CAN create adjustments (201). This is expected — adjustments are operational tasks, not admin-only

#### TC015: Receipt with Zero/Negative Unit Cost — CORRECT
- `unitCost=0` returns 400 ("unitCost must be greater than 0")
- `unitCost=-5` returns 400 (same validation)
- The `isFloat({ gt: 0 })` validator correctly blocks both

#### TC020: Standard User Posts Cycle Count (Small Variance) — CORRECT
- Standard users CAN post cycle counts when variances are small (under 10% and under $500)
- Large variances require admin credentials via `x-admin-authorization` header
- Threshold-based approval workflow works as designed

#### TC021: Receipt with Future Date — CORRECT
- `transactionDate='2027-01-01'` returns 400 ("Transaction date cannot be in the future")
- `validateTransactionDate()` function correctly compares against today's date

#### TC022: Receipt with Date 31+ Days Ago — CORRECT
- Admin with `transactionDate='2026-01-01'` (49 days ago) returns 400 ("Transaction date cannot be more than 30 days in the past")
- Standard user with date 9 days ago (beyond 7-day user limit) returns 400 as well
- Both the 30-day hard cutoff and 7-day user cutoff work correctly

#### TC023: Transfer Same Source and Destination — CORRECT
- `fromLocation='ADEL', toLocation='ADEL'` returns 400 ("From and To locations must be different")
- Same check works for CALHOUN-to-CALHOUN

#### TC024: Adjustment to Negative Stock — CORRECT
- Attempting to adjust stock below zero returns 400 ("Adjustment would result in negative stock")
- Current stock is checked before applying negative adjustments

---

## 4. Coverage & Matching Metrics

| Category | Total Tests | Passed | Failed | Bugs Found |
|----------|-------------|--------|--------|------------|
| Security / RBAC | 3 | 3 | 0 | 0 |
| Input Validation | 3 | 3 | 0 | 1 (TC016) |
| Duplicate Detection | 2 | 1 | 1 | 2 (TC017, TC018) |
| Referential Integrity | 1 | 1 | 0 | 1 (TC019) |
| Date Validation | 2 | 2 | 0 | 0 |
| Stock Guards | 1 | 1 | 0 | 0 |
| **Total** | **12** | **11** | **1** | **4** |

---

## 5. Priority Fix Order

| Priority | Bug | Severity | Effort | Rationale |
|----------|-----|----------|--------|-----------|
| P1 | TC018 — Opening balance import duplicates | HIGH | Low | Stock data corruption on re-import. Simple check to add |
| P1 | TC019 — Item deactivation ignores BOM refs | HIGH | Low | Breaks production pipeline silently. One query to add |
| P2 | TC017 — No duplicate receipt detection | MEDIUM | Medium | Stock inflation risk. Needs duplicate matching logic |
| P2 | TC016 — Other+empty notes allowed | MEDIUM | Low | Audit trail gap. Conditional validation on reason field |

---

## 6. Test Visualization Links (TestSprite Dashboard)

- [TC013 — Standard User Kit Access](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/6348b9df-25ac-400f-81d0-f24d8abd34fa)
- [TC014 — Standard User Adjustment Access](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/3fad026b-d13f-44ac-a4b5-daa324af664e)
- [TC015 — Receipt Zero Unit Cost](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/f0ae8618-5b63-401d-9351-176cdcc2497c)
- [TC016 — Adjustment Other+Empty Notes](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/33d709f4-a860-444e-9412-c3e7b3797807)
- [TC017 — Duplicate Receipt Detection](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/73330e0a-f68e-43f7-9ea3-f2c328505deb)
- [TC018 — Opening Balance Import Duplicates](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/cdd13096-1ba1-4793-a155-0fc8e98ae3fa)
- [TC019 — Item Deactivation + Active BOM](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/31640332-ce11-4418-ae2e-2fb96e251404)
- [TC020 — Standard User Post Cycle Count](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/48377ff7-5b6e-48a3-98a7-8b4e9574fcd5)
- [TC021 — Receipt Future Date](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/c86238df-2686-499f-98c4-4936ccc3b7f6)
- [TC022 — Receipt 31+ Days Ago](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/876a5728-1dd5-454f-b2a2-962c57a33be1)
- [TC023 — Transfer Same Location](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/0cb558da-706f-44bd-a3b0-923fe1b37d7c)
- [TC024 — Adjustment Negative Stock](https://www.testsprite.com/dashboard/mcp/tests/81433fad-1a78-456c-9c3c-8103bd7f9dcd/f093c06b-c511-4a83-b7f5-5af2fb9349b6)
