# Shared Patterns Registry

These code patterns are duplicated across multiple pages. A bug in one means the same bug exists in all of them. **Always grep before fixing** — if the same pattern exists on other pages, fix all of them in the same pass.

## Form dirty state tracking (5 pages)
**Pages**: AdjustmentPage, ReceiptPage, TransferPage, OpeningBalancePage, KittingPage
**Pattern**: `userInteracted` state + 3 effects (watch subscription, FormDirtyContext sync, beforeunload guard)
**Critical**: On successful submit, MUST call `setUserInteracted(false)` and `setFormDirty(false)` BEFORE `reset()`. Use `'' as unknown as number` for numeric field reset values (not `undefined`, which doesn't clear HTML inputs).

## Confirm dialog flow (5 pages)
**Pages**: AdjustmentPage, ReceiptPage, TransferPage, OpeningBalancePage, KittingPage
**Pattern**: `pendingValues` state + `confirmOpen` state + `onFormValid` → `onConfirmed` two-step submit

## Notes/optional field serialization
**Rule**: Send `notes: values.notes?.trim() || ''` (empty string), NOT `notes: values.notes || undefined`. The `undefined` pattern causes the field to be omitted from JSON.stringify, which can bypass backend validation that checks for the field's presence.

## Frontend ↔ Backend validation
Frontend Zod schemas and backend express-validator chains implement the same rules independently. There is no shared source of truth. When adding or changing a validation rule, update BOTH sides and note the corresponding location:
- Adjustment validation: frontend `AdjustmentPage.tsx` schema ↔ backend `routes/transactions.js` POST `/adjustments`
- Receipt validation: frontend `ReceiptPage.tsx` schema ↔ backend `routes/transactions.js` POST `/receipts/batch`
- Transfer validation: frontend `TransferPage.tsx` schema ↔ backend `routes/transactions.js` POST `/transfers`
- Opening balance: frontend `OpeningBalancePage.tsx` schema ↔ backend `routes/transactions.js` POST `/opening-balances`
- Kitting: frontend `KittingPage.tsx` schema ↔ backend `routes/production.js` POST `/kit`

## Item dropdown display format (7 pages, 2 component types)
**Combobox pages** (use `renderLabel` prop): ReceiptPage, AdjustmentPage, TransferPage, OpeningBalancePage
**Select/SelectItem pages** (render JSX children): BOMsPage, KittingPage, CreateProductionOrderPage
**Pattern**: Two-column layout — item code in `font-mono font-semibold` on left, description in `text-gray-500` on right. Never concatenate `${itemCode} — ${description}` as a plain string.
**Exception**: CycleCountDetailPage uses separate table columns (already correct).

## UOM decimal validation (all transaction pages + backend)
**Shared constants**: `backend/src/lib/uom.js` and `frontend/src/lib/uom.ts` — single source of truth.
**Decimal-allowed UOMs**: `['FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT']` — these allow fractional quantities.
**All other UOMs** (EA, BOX, BUNDLE, ROLL, PACK, BAG, SHEET, SPOOL, SET, PAIR) require whole numbers.
**Logic**: Use `allowsDecimals(unitOfMeasure)` helper. If `!allowsDecimals(uom)`, quantity must be integer (`Number.isInteger()`). Use `step="any"` on HTML inputs to prevent browser silent rounding — rely on validation messages instead.
**Frontend pages**: ReceiptPage, AdjustmentPage, TransferPage, OpeningBalancePage, KittingPage, BOMsPage
**Backend routes**: `transactions.js` (receipts, adjustments, transfers, opening-balances), `production.js` (kit, production orders)
**Items page UOM**: Dropdown (`<Select>`) using `ALL_UOMS` from `frontend/src/lib/uom.ts`. Not free-text.
**Standardized error message**: `"${itemCode} is measured in ${uom} — quantity must be a whole number."`
**Rule**: Validate on BOTH frontend (inline field error or `setSubmitError`) and backend (400 response).

## Date parsing — backend
**Rule**: Never use `new Date("YYYY-MM-DD")` on the backend — it interprets as UTC midnight which shifts the date backward in US timezones. Use `parseDateLocal(dateStr)` helper which appends `T12:00:00` to anchor at local noon. This mirrors the frontend `parseDate()` rule.
**Affected**: All `transactionDate: new Date(...)` calls in `transactions.js` and `production.js`.

## Currency/number onBlur formatting
**Pages with currency inputs**: ItemsPage (standardCost), ReceiptPage (lineItems unitCost), OpeningBalancePage (unitCost)
**Pattern**: `onBlur` handler formats to `.toFixed(2)` for currency fields. Prevents display of raw unformatted numbers.
**Rule**: Any new currency input field must include this onBlur handler.

## Transaction batch ID display
**Page**: TransactionHistoryPage
**Pattern**: For multi-line transactions sharing a `batchId`, display the lowest `t.id` in the batch as the reference for all lines. Uses `batchFirstIdMap` (useMemo). Search by displayed ID returns all batch members.

## Zod .refine() error display
**Rule**: Whenever a Zod schema uses `.refine()` with a `path` targeting a specific field, the JSX MUST include `{errors.fieldName && <p className="text-xs text-red-600">{errors.fieldName.message}</p>}` for that field. Otherwise validation silently blocks submission with no visible feedback to the user.

## BOM resolution rounding policy
**File**: `backend/src/lib/resolveBom.js` — `round4()`
**Rule**: All `effectiveQty` values are rounded to 4 decimal places (`Decimal(10,4)`) at resolution time via `Math.round(value * 10000) / 10000`. This same precision is used for stock checks and transaction posting. No further rounding occurs downstream.
**Formula**: `effectiveQty = quantityPer * (1 + scrapPercent / 100)`, rounded to 4 decimals.
**Where used**: `resolveBom.js` (resolution), `production.js` (kit posting — re-resolves inside transaction).

## allowDecimalQty bypass (cut materials)
**Item field**: `allowDecimalQty` (boolean) on `Item` model — allows fractional quantities even for whole-unit UOMs (e.g., EA items that represent cut bar stock).
**Validation logic**: `if (!allowsDecimals(uom) && !item.allowDecimalQty && !Number.isInteger(qty))` — the `allowDecimalQty` flag bypasses the UOM integer check.
**Backend locations** (11): `options.js` (add/edit option lines), `boms.js` (BOM line validation), `production.js` (kit components, deviations, finished good), `transactions.js` (receipts, adjustments, transfers, opening balances, cycle count entry).
**Frontend**: ItemsPage (checkbox to toggle), KittingPage/CreateProductionOrderPage (no client-side integer check for `allowDecimalQty` items).
**Companion field**: `stockLength` (Decimal, nullable) — standard bar/roll length in the item's UOM. Only valid when `allowDecimalQty = true`. Backend enforces this cross-validation in `items.js` POST/PUT.

## Option sidebar patterns (kitting pages)
**Component**: `frontend/src/components/OptionSelectorSidebar.tsx` — reusable across KittingPage and CreateProductionOrderPage.
**Selection types**: PICK_ONE uses radio buttons with "None (use base)" for optional groups. PICK_MANY uses checkboxes with qty spinner for `allowQuantity` packages.
**Defaults**: Only PICK_ONE groups support `isDefault`. PICK_MANY groups do not auto-select defaults. Backend blocks `isDefault: true` on PICK_MANY packages.
**Resolution flow**: Selection changes trigger debounced (300ms) `POST /api/boms/:bomId/resolve` call. Response populates the resolved component table with `source` column (SourceBadge component).
**Cut material display**: Uses `formatCutDescription()`, `formatConsumption()`, `formatEffectiveQtyTooltip()` from `frontend/src/lib/cutDisplay.ts` in the resolved component table.
