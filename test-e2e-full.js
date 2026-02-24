#!/usr/bin/env node
/**
 * Comprehensive End-to-End Test Script
 * Tests every workflow the frontend performs, in order, with stock reconciliation.
 * Uses only built-in fetch API — no dependencies.
 *
 * Prerequisites: backend running on :3000, frontend on :5173
 * Run: node test-e2e-full.js
 */

const BASE = 'http://localhost:3000';
const DELAY = 200; // ms between requests

// ── State ──
let ADMIN_TOKEN = '';
let USER_TOKEN = '';
let baselineStock = {};   // { itemCode: { ADEL: n, CALHOUN: n } }
let stockChanges = {};    // tracks all changes made during test
const results = [];

// ── Helpers ──
const sleep = ms => new Promise(r => setTimeout(r, ms));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function futureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7); // 7 days ahead to avoid timezone edge cases
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function req(method, path, body, token, extraHeaders = {}) {
  await sleep(DELAY);
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BASE}${path}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
}

function record(num, description, expectedStatus, actualStatus, pass, failBody = null) {
  results.push({ num, description, expectedStatus, actualStatus, pass, failBody });
  const icon = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${icon}] #${String(num).padStart(2, '0')} ${description} (expected ${expectedStatus}, got ${actualStatus})`);
  if (!pass && failBody) {
    const detail = typeof failBody === 'object' ? JSON.stringify(failBody, null, 2).slice(0, 500) : String(failBody).slice(0, 500);
    console.log(`         Response: ${detail}`);
  }
}

function trackChange(itemCode, location, qty) {
  if (!stockChanges[itemCode]) stockChanges[itemCode] = { ADEL: 0, CALHOUN: 0 };
  stockChanges[itemCode][location] += qty;
}

async function getStockMap(token) {
  const map = {};
  let page = 1;
  while (true) {
    const r = await req('GET', `/api/transactions/stock-position?page=${page}&limit=100`, null, token);
    if (r.status !== 200 || !r.data.positions) break;
    for (const p of r.data.positions) {
      map[p.item.itemCode] = {
        ADEL: Number(p.qtyByLocation?.ADEL || 0),
        CALHOUN: Number(p.qtyByLocation?.CALHOUN || 0),
        id: p.item.id,
        uom: p.item.unitOfMeasure,
      };
    }
    if (page >= r.data.totalPages) break;
    page++;
  }
  return map;
}

function getStock(stockMap, itemCode, location) {
  return stockMap[itemCode]?.[location] ?? 0;
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
async function login() {
  console.log('\n\x1b[1m══ LOGIN ══\x1b[0m');
  const r = await req('POST', '/api/auth/login', { username: 'jose', password: 'Password1' });
  if (r.status !== 200 || !r.data.token) {
    console.error('FATAL: Cannot log in as admin. Aborting.');
    process.exit(1);
  }
  ADMIN_TOKEN = r.data.token;
  console.log(`  Logged in as admin (${r.data.user.fullName})`);
}

// ═══════════════════════════════════════════════════════════════
//  SETUP — baseline stock
// ═══════════════════════════════════════════════════════════════
async function setupBaseline() {
  console.log('\n\x1b[1m══ SETUP: Record Baseline Stock ══\x1b[0m');
  baselineStock = await getStockMap(ADMIN_TOKEN);
  const count = Object.keys(baselineStock).length;
  console.log(`  Recorded baseline for ${count} items`);
}

// ═══════════════════════════════════════════════════════════════
//  RECEIPTS
// ═══════════════════════════════════════════════════════════════
async function testReceipts() {
  console.log('\n\x1b[1m══ RECEIPTS ══\x1b[0m');

  // 1. GET items
  const itemsRes = await req('GET', '/api/items', null, ADMIN_TOKEN);
  record(1, 'GET /api/items returns items array', 200, itemsRes.status,
    itemsRes.status === 200 && Array.isArray(itemsRes.data.items), itemsRes.data);
  const items = itemsRes.data.items || [];

  // 2. GET vendors
  const vendorsRes = await req('GET', '/api/vendors', null, ADMIN_TOKEN);
  record(2, 'GET /api/vendors returns vendors array', 200, vendorsRes.status,
    vendorsRes.status === 200 && Array.isArray(vendorsRes.data.vendors), vendorsRes.data);
  const vendors = vendorsRes.data.vendors || [];

  // Resolve IDs
  const ax7k = items.find(i => i.itemCode === 'AX-7K-STD');
  const br10 = items.find(i => i.itemCode === 'BR-10-DRUM');
  const vendor = vendors[0];

  if (!ax7k || !br10 || !vendor) {
    console.error('  SKIP: Required items/vendor not found. Skipping receipt tests.');
    for (let n = 3; n <= 10; n++) record(n, 'SKIPPED - missing test data', '-', '-', false);
    return;
  }

  // 3. POST batch receipt
  const receiptPayload = {
    vendorId: vendor.id,
    location: 'ADEL',
    transactionDate: today(),
    notes: 'E2E test receipt',
    lineItems: [
      { itemId: ax7k.id, quantity: 5, unitCost: 185 },
      { itemId: br10.id, quantity: 10, unitCost: 85 },
    ],
  };
  const receiptRes = await req('POST', '/api/transactions/receipts/batch', receiptPayload, ADMIN_TOKEN);
  const receiptOk = receiptRes.status === 201
    && Array.isArray(receiptRes.data.transactions)
    && receiptRes.data.transactions.length === 2;
  record(3, 'POST batch receipt — 201 with 2 transactions', 201, receiptRes.status, receiptOk, receiptRes.data);

  // Check batchId
  const hasBatch = receiptRes.data.transactions?.every(t => t.batchId);
  record(4, 'Batch receipt has batchId on all transactions', 'present', hasBatch ? 'present' : 'missing', !!hasBatch);

  if (receiptOk) {
    trackChange('AX-7K-STD', 'ADEL', 5);
    trackChange('BR-10-DRUM', 'ADEL', 10);
  }

  // 5. Verify stock increased
  const postReceiptStock = await getStockMap(ADMIN_TOKEN);
  const ax7kIncrease = getStock(postReceiptStock, 'AX-7K-STD', 'ADEL') - getStock(baselineStock, 'AX-7K-STD', 'ADEL');
  const br10Increase = getStock(postReceiptStock, 'BR-10-DRUM', 'ADEL') - getStock(baselineStock, 'BR-10-DRUM', 'ADEL');
  record(5, 'Stock: AX-7K-STD ADEL +5, BR-10-DRUM ADEL +10', '+5/+10',
    `+${ax7kIncrease}/+${br10Increase}`, ax7kIncrease === 5 && br10Increase === 10);

  // 6. Verify transactions in history (search by notes to find ours)
  const histRes = await req('GET', `/api/transactions?type=RECEIPT&search=E2E+test+receipt&limit=50`, null, ADMIN_TOKEN);
  const recentReceipts = histRes.data.transactions || [];
  const found = recentReceipts.some(t => t.item?.itemCode === 'AX-7K-STD')
    && recentReceipts.some(t => t.item?.itemCode === 'BR-10-DRUM');
  record(6, 'Both receipt transactions appear in history', 'found', found ? 'found' : 'missing', found);

  // 7. Duplicate receipt warning (single receipt endpoint has duplicate detection)
  const dupRes = await req('POST', '/api/transactions/receipts', {
    itemId: ax7k.id, vendorId: vendor.id, location: 'ADEL', transactionDate: today(),
    quantity: 5, unitCost: 185, notes: 'E2E dup test',
  }, ADMIN_TOKEN);
  const isDup = dupRes.status === 409 || (dupRes.data && dupRes.data.isDuplicate);
  record(7, 'Duplicate receipt triggers warning (409 or isDuplicate)', '409/dup',
    `${dupRes.status}${dupRes.data?.isDuplicate ? '/isDuplicate' : ''}`, isDup, dupRes.data);
  // If it actually created (no dup detection), track the change
  if (dupRes.status === 201) {
    trackChange('AX-7K-STD', 'ADEL', 5);
  }

  // 8. Future date (+7 days to avoid timezone edge cases)
  const futureRes = await req('POST', '/api/transactions/receipts/batch', {
    ...receiptPayload, transactionDate: futureDate(),
  }, ADMIN_TOKEN);
  record(8, 'Future date receipt rejected (400)', 400, futureRes.status, futureRes.status === 400, futureRes.data);
  // If the server allowed it (e.g., timezone mismatch), track the stock changes
  if (futureRes.status === 201 && Array.isArray(futureRes.data.transactions)) {
    for (const t of futureRes.data.transactions) {
      const ic = t.item?.itemCode;
      if (ic) trackChange(ic, t.location, Number(t.quantity));
    }
  }

  // 9. EA item with decimal qty
  const decimalRes = await req('POST', '/api/transactions/receipts/batch', {
    ...receiptPayload,
    lineItems: [{ itemId: ax7k.id, quantity: 2.5, unitCost: 185 }],
  }, ADMIN_TOKEN);
  record(9, 'EA item decimal qty rejected (400)', 400, decimalRes.status, decimalRes.status === 400, decimalRes.data);

  // 10. Zero unit cost
  const zeroCostRes = await req('POST', '/api/transactions/receipts/batch', {
    ...receiptPayload,
    lineItems: [{ itemId: ax7k.id, quantity: 1, unitCost: 0 }],
  }, ADMIN_TOKEN);
  record(10, 'Zero unitCost receipt rejected (400)', 400, zeroCostRes.status,
    zeroCostRes.status === 400, zeroCostRes.data);
}

// ═══════════════════════════════════════════════════════════════
//  ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════
async function testAdjustments() {
  console.log('\n\x1b[1m══ ADJUSTMENTS ══\x1b[0m');

  const itemsRes = await req('GET', '/api/items', null, ADMIN_TOKEN);
  record(11, 'GET /api/items for AdjustmentPage', 200, itemsRes.status,
    itemsRes.status === 200 && Array.isArray(itemsRes.data.items), itemsRes.data);
  const items = itemsRes.data.items || [];
  const cp2 = items.find(i => i.itemCode === 'CP-2-516');
  const br10 = items.find(i => i.itemCode === 'BR-10-DRUM');
  const eaItem = items.find(i => i.unitOfMeasure === 'EA');

  if (!cp2 || !br10) {
    console.error('  SKIP: Required items not found.');
    for (let n = 12; n <= 19; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  // 12. Positive adjustment
  const stockBefore = await getStockMap(ADMIN_TOKEN);
  const adjPosRes = await req('POST', '/api/transactions/adjustments', {
    itemId: cp2.id, location: 'ADEL', quantity: 3, reason: 'Correction', notes: 'E2E test',
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(12, 'Positive adjustment CP-2-516 +3 ADEL (201)', 201, adjPosRes.status,
    adjPosRes.status === 201, adjPosRes.data);
  if (adjPosRes.status === 201) trackChange('CP-2-516', 'ADEL', 3);

  // 13. Verify stock increased
  const stockAfterPos = await getStockMap(ADMIN_TOKEN);
  const cp2Increase = getStock(stockAfterPos, 'CP-2-516', 'ADEL') - getStock(stockBefore, 'CP-2-516', 'ADEL');
  record(13, 'Stock: CP-2-516 ADEL increased by 3', '+3', `+${cp2Increase}`, cp2Increase === 3);

  // 14. Negative adjustment
  const adjNegRes = await req('POST', '/api/transactions/adjustments', {
    itemId: br10.id, location: 'ADEL', quantity: -2, reason: 'Damage', notes: 'E2E test damage',
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(14, 'Negative adjustment BR-10-DRUM -2 ADEL (201)', 201, adjNegRes.status,
    adjNegRes.status === 201, adjNegRes.data);
  if (adjNegRes.status === 201) trackChange('BR-10-DRUM', 'ADEL', -2);

  // 15. Verify stock decreased
  const stockAfterNeg = await getStockMap(ADMIN_TOKEN);
  const br10Decrease = getStock(stockAfterNeg, 'BR-10-DRUM', 'ADEL') - getStock(stockAfterPos, 'BR-10-DRUM', 'ADEL');
  record(15, 'Stock: BR-10-DRUM ADEL decreased by 2', '-2', `${br10Decrease}`, br10Decrease === -2);

  // 16. Reason=Other, no notes
  const otherNoNotes = await req('POST', '/api/transactions/adjustments', {
    itemId: cp2.id, location: 'ADEL', quantity: 1, reason: 'Other', notes: '',
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(16, 'Adjustment reason=Other, empty notes rejected (400)', 400, otherNoNotes.status,
    otherNoNotes.status === 400, otherNoNotes.data);

  // 17. Reason=Other with notes
  const otherWithNotes = await req('POST', '/api/transactions/adjustments', {
    itemId: cp2.id, location: 'ADEL', quantity: 1, reason: 'Other', notes: 'valid reason',
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(17, 'Adjustment reason=Other with notes succeeds (201)', 201, otherWithNotes.status,
    otherWithNotes.status === 201, otherWithNotes.data);
  if (otherWithNotes.status === 201) trackChange('CP-2-516', 'ADEL', 1);

  // 18. Negative adjustment that would go negative
  const bigNegRes = await req('POST', '/api/transactions/adjustments', {
    itemId: cp2.id, location: 'ADEL', quantity: -999999, reason: 'Correction', notes: 'E2E',
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(18, 'Adjustment going negative rejected (400)', 400, bigNegRes.status,
    bigNegRes.status === 400, bigNegRes.data);

  // 19. EA item with decimal
  if (eaItem) {
    const decAdj = await req('POST', '/api/transactions/adjustments', {
      itemId: eaItem.id, location: 'ADEL', quantity: 1.5, reason: 'Correction', notes: 'E2E',
      transactionDate: today(),
    }, ADMIN_TOKEN);
    record(19, 'EA item decimal qty adjustment rejected (400)', 400, decAdj.status,
      decAdj.status === 400, decAdj.data);
  } else {
    record(19, 'EA item decimal qty — no EA item found', '-', 'skip', false);
  }
}

// ═══════════════════════════════════════════════════════════════
//  TRANSFERS
// ═══════════════════════════════════════════════════════════════
async function testTransfers() {
  console.log('\n\x1b[1m══ TRANSFERS ══\x1b[0m');

  const items = (await req('GET', '/api/items', null, ADMIN_TOKEN)).data.items || [];
  const ax7k = items.find(i => i.itemCode === 'AX-7K-STD');
  if (!ax7k) {
    for (let n = 20; n <= 23; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  const stockBefore = await getStockMap(ADMIN_TOKEN);

  // 20. Transfer ADEL→CALHOUN
  const xferRes = await req('POST', '/api/transactions/transfers', {
    itemId: ax7k.id, fromLocation: 'ADEL', toLocation: 'CALHOUN', quantity: 2,
    transactionDate: today(), notes: 'E2E transfer',
  }, ADMIN_TOKEN);
  record(20, 'Transfer AX-7K-STD ADEL→CALHOUN qty 2 (201)', 201, xferRes.status,
    xferRes.status === 201, xferRes.data);
  if (xferRes.status === 201) {
    trackChange('AX-7K-STD', 'ADEL', -2);
    trackChange('AX-7K-STD', 'CALHOUN', 2);
  }

  // 21. Verify stock movements
  const stockAfter = await getStockMap(ADMIN_TOKEN);
  const adelDelta = getStock(stockAfter, 'AX-7K-STD', 'ADEL') - getStock(stockBefore, 'AX-7K-STD', 'ADEL');
  const calDelta = getStock(stockAfter, 'AX-7K-STD', 'CALHOUN') - getStock(stockBefore, 'AX-7K-STD', 'CALHOUN');
  record(21, 'Stock: ADEL -2, CALHOUN +2', '-2/+2', `${adelDelta}/${calDelta > 0 ? '+' : ''}${calDelta}`,
    adelDelta === -2 && calDelta === 2);

  // 22. Same location transfer
  const sameLocRes = await req('POST', '/api/transactions/transfers', {
    itemId: ax7k.id, fromLocation: 'ADEL', toLocation: 'ADEL', quantity: 1,
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(22, 'Transfer same location rejected (400)', 400, sameLocRes.status,
    sameLocRes.status === 400, sameLocRes.data);

  // 23. Insufficient stock
  const bigXferRes = await req('POST', '/api/transactions/transfers', {
    itemId: ax7k.id, fromLocation: 'ADEL', toLocation: 'CALHOUN', quantity: 999999,
    transactionDate: today(),
  }, ADMIN_TOKEN);
  record(23, 'Transfer insufficient stock rejected (400)', 400, bigXferRes.status,
    bigXferRes.status === 400, bigXferRes.data);
}

// ═══════════════════════════════════════════════════════════════
//  CYCLE COUNTS
// ═══════════════════════════════════════════════════════════════
async function testCycleCounts() {
  console.log('\n\x1b[1m══ CYCLE COUNTS ══\x1b[0m');

  const items = (await req('GET', '/api/items', null, ADMIN_TOKEN)).data.items || [];
  const pick1 = items[0];
  const pick2 = items[1];
  if (!pick1 || !pick2) {
    for (let n = 24; n <= 31; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  // 24. Create cycle count
  const ccRes = await req('POST', '/api/cycle-counts', {
    location: 'ADEL', itemSelection: 'manual', itemIds: [pick1.id, pick2.id],
    notes: 'E2E cycle count',
  }, ADMIN_TOKEN);
  record(24, 'Create cycle count ADEL, 2 items (201)', 201, ccRes.status,
    ccRes.status === 201, ccRes.data);

  // 25. Verify shape
  const cc = ccRes.data?.cycleCount;
  const shapeOk = cc && cc.status === 'DRAFT' && Array.isArray(cc.lines) && cc.lines.length === 2
    && cc.lines.every(l => l.systemQty !== undefined);
  record(25, 'Cycle count: DRAFT status, lines with systemQty', 'DRAFT+lines',
    cc ? `${cc.status}, ${cc.lines?.length} lines` : 'no data', shapeOk);

  if (!cc) {
    for (let n = 26; n <= 31; n++) record(n, 'SKIPPED — no cycle count', '-', '-', false);
    return;
  }

  // 26. GET detail
  const detailRes = await req('GET', `/api/cycle-counts/${cc.id}`, null, ADMIN_TOKEN);
  record(26, 'GET cycle count detail loads with lines', 200, detailRes.status,
    detailRes.status === 200 && detailRes.data.cycleCount?.lines?.length === 2, detailRes.data);

  // 27. Update counted quantities — one matching, one with -1 variance
  const lines = cc.lines;
  const lineUpdates = [
    { lineId: lines[0].id, countedQty: Number(lines[0].systemQty) },       // no variance
    { lineId: lines[1].id, countedQty: Number(lines[1].systemQty) - 1 },   // -1 variance
  ];
  const updateRes = await req('PUT', `/api/cycle-counts/${cc.id}/lines`, { lines: lineUpdates }, ADMIN_TOKEN);
  record(27, 'Update counted quantities (one match, one -1 variance)', 200, updateRes.status,
    updateRes.status === 200, updateRes.data);

  // 28. Check status transition
  const afterUpdateStatus = updateRes.data?.status;
  const transitioned = afterUpdateStatus === 'COMPLETED' || afterUpdateStatus === 'IN_PROGRESS';
  record(28, 'Status transitions toward COMPLETED', 'COMPLETED/IN_PROGRESS',
    afterUpdateStatus || 'unknown', transitioned);

  // 29. Post the count
  const stockBeforePost = await getStockMap(ADMIN_TOKEN);
  // If status is COMPLETED we can post; otherwise try anyway (admin can post completed counts)
  const postRes = await req('POST', `/api/cycle-counts/${cc.id}/post`, null, ADMIN_TOKEN);
  record(29, 'Post cycle count', 200, postRes.status,
    postRes.status === 200, postRes.data);

  // 30. Verify stock adjusted for variance item
  if (postRes.status === 200) {
    const stockAfterPost = await getStockMap(ADMIN_TOKEN);
    const varianceItem = lines[1].item?.itemCode || pick2.itemCode;
    const delta = getStock(stockAfterPost, varianceItem, 'ADEL') - getStock(stockBeforePost, varianceItem, 'ADEL');
    record(30, `Stock adjusted for variance item (${varianceItem}) by -1`, '-1', `${delta}`,
      delta === -1);
    if (delta === -1) trackChange(varianceItem, 'ADEL', -1);
  } else {
    record(30, 'Stock adjustment — post failed', '-', 'skipped', false);
  }

  // 31. Void a separate cycle count
  const cc2Res = await req('POST', '/api/cycle-counts', {
    location: 'ADEL', itemSelection: 'manual', itemIds: [pick1.id],
    notes: 'E2E void test',
  }, ADMIN_TOKEN);
  const cc2 = cc2Res.data?.cycleCount;
  if (cc2) {
    const stockBeforeVoid = await getStockMap(ADMIN_TOKEN);
    const voidRes = await req('POST', `/api/cycle-counts/${cc2.id}/void`, null, ADMIN_TOKEN);
    const stockAfterVoid = await getStockMap(ADMIN_TOKEN);
    const noStockChange = getStock(stockAfterVoid, pick1.itemCode, 'ADEL') === getStock(stockBeforeVoid, pick1.itemCode, 'ADEL');
    record(31, 'Void cycle count — VOID status, no stock change', 'VOID', voidRes.data?.status || 'error',
      voidRes.status === 200 && voidRes.data?.status === 'VOID' && noStockChange, voidRes.data);
  } else {
    record(31, 'Void cycle count — creation failed', '-', '-', false);
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOMs
// ═══════════════════════════════════════════════════════════════
let activeBomId = null;
let activeBomFinishedGoodId = null;
let activeBomComponents = [];

async function testBOMs() {
  console.log('\n\x1b[1m══ BOMs ══\x1b[0m');

  // 32. GET boms
  const bomsRes = await req('GET', '/api/boms', null, ADMIN_TOKEN);
  record(32, 'GET /api/boms returns response', 200, bomsRes.status,
    bomsRes.status === 200, bomsRes.data);

  // Get items for BOM creation
  const items = (await req('GET', '/api/items?all=true', null, ADMIN_TOKEN)).data.items || [];
  const finishedGoods = items.filter(i => i.itemType === 'FINISHED');
  const rawItems = items.filter(i => i.itemType === 'RAW' && i.itemCode !== finishedGoods[0]?.itemCode);

  if (finishedGoods.length === 0 || rawItems.length < 2) {
    console.error('  SKIP: Need 1 finished good + 2 raw items for BOM tests.');
    for (let n = 33; n <= 37; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  const fg = finishedGoods[0];
  const comp1 = rawItems[0];
  const comp2 = rawItems[1];

  // 33. Create BOM
  const bomPayload = {
    bomCode: `E2E-BOM-${Date.now()}`,
    name: 'E2E Test BOM',
    finishedGoodId: fg.id,
    lines: [
      { itemId: comp1.id, quantityPer: 2 },
      { itemId: comp2.id, quantityPer: 1 },
    ],
  };
  const createBomRes = await req('POST', '/api/boms', bomPayload, ADMIN_TOKEN);
  record(33, 'Create BOM with 2 components — DRAFT status', 201, createBomRes.status,
    createBomRes.status === 201 && createBomRes.data.bom?.status === 'DRAFT', createBomRes.data);

  const newBom = createBomRes.data?.bom;
  if (!newBom) {
    for (let n = 34; n <= 37; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  // 34. Activate BOM
  const activateRes = await req('PATCH', `/api/boms/${newBom.id}/status`, { status: 'ACTIVE' }, ADMIN_TOKEN);
  record(34, 'Activate BOM — ACTIVE status', 200, activateRes.status,
    activateRes.status === 200 && activateRes.data.status === 'ACTIVE', activateRes.data);

  activeBomId = newBom.id;
  activeBomFinishedGoodId = fg.id;
  activeBomComponents = [
    { itemId: comp1.id, itemCode: comp1.itemCode, quantityPer: 2 },
    { itemId: comp2.id, itemCode: comp2.itemCode, quantityPer: 1 },
  ];

  // 35. Try to edit ACTIVE BOM
  const editActiveRes = await req('PUT', `/api/boms/${newBom.id}`, { name: 'Modified' }, ADMIN_TOKEN);
  record(35, 'Edit ACTIVE BOM rejected (400)', 400, editActiveRes.status,
    editActiveRes.status === 400, editActiveRes.data);

  // 36. Duplicate BOM
  const dupBomRes = await req('POST', `/api/boms/${newBom.id}/duplicate`, null, ADMIN_TOKEN);
  record(36, 'Duplicate BOM — DRAFT with -COPY suffix', 201, dupBomRes.status,
    dupBomRes.status === 201 && dupBomRes.data.bom?.status === 'DRAFT'
    && dupBomRes.data.bom?.bomCode?.includes('COPY'), dupBomRes.data);

  // 37. Retire the original BOM (ACTIVE → RETIRED), then re-activate for kitting tests
  const retireRes = await req('PATCH', `/api/boms/${newBom.id}/status`, { status: 'RETIRED' }, ADMIN_TOKEN);
  record(37, 'Retire BOM — RETIRED status', 200, retireRes.status,
    retireRes.status === 200 && retireRes.data.status === 'RETIRED', retireRes.data);

  // Re-activate the BOM so kitting/production tests can use it
  const reactivateRes = await req('PATCH', `/api/boms/${newBom.id}/status`, { status: 'ACTIVE' }, ADMIN_TOKEN);
  if (reactivateRes.status === 200) {
    console.log('  (Re-activated BOM for kitting/production tests)');
  }
}

// ═══════════════════════════════════════════════════════════════
//  KITTING (instant)
// ═══════════════════════════════════════════════════════════════
async function testKitting() {
  console.log('\n\x1b[1m══ KITTING (INSTANT) ══\x1b[0m');

  if (!activeBomId || !activeBomFinishedGoodId || activeBomComponents.length === 0) {
    console.error('  SKIP: No active BOM from previous section.');
    for (let n = 38; n <= 43; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  // Ensure sufficient stock for components — always top up via receipt
  const stockBefore = await getStockMap(ADMIN_TOKEN);
  for (const comp of activeBomComponents) {
    const available = getStock(stockBefore, comp.itemCode, 'ADEL');
    const target = comp.quantityPer * 5;
    if (available < target) {
      const needed = target - available;
      const adjRes = await req('POST', '/api/transactions/adjustments', {
        itemId: comp.itemId, location: 'ADEL', quantity: Math.ceil(needed),
        reason: 'Correction', notes: 'E2E ensure stock for kitting',
        transactionDate: today(),
      }, ADMIN_TOKEN);
      if (adjRes.status === 201) {
        trackChange(comp.itemCode, 'ADEL', Math.ceil(needed));
      } else {
        console.error(`  WARN: Stock top-up for ${comp.itemCode} failed (${adjRes.status}):`, adjRes.data);
      }
    }
  }

  const stockBeforeKit = await getStockMap(ADMIN_TOKEN);

  // 38. Kit 1 unit
  const kitPayload = {
    finishedGoodId: activeBomFinishedGoodId,
    location: 'ADEL',
    quantityProduced: 1,
    bomId: activeBomId,
    components: activeBomComponents.map(c => ({ itemId: c.itemId, quantityPer: c.quantityPer })),
    notes: 'E2E kitting test',
  };
  const kitRes = await req('POST', '/api/production/kit', kitPayload, ADMIN_TOKEN);
  record(38, 'Kit 1 unit using active BOM at ADEL (201)', 201, kitRes.status,
    kitRes.status === 201, kitRes.data);

  // 39. Verify component stock decreased
  if (kitRes.status === 201) {
    const stockAfterKit = await getStockMap(ADMIN_TOKEN);
    let allComponentsDecreased = true;
    for (const comp of activeBomComponents) {
      const delta = getStock(stockAfterKit, comp.itemCode, 'ADEL') - getStock(stockBeforeKit, comp.itemCode, 'ADEL');
      if (delta !== -comp.quantityPer) {
        allComponentsDecreased = false;
      }
      trackChange(comp.itemCode, 'ADEL', -comp.quantityPer);
    }
    record(39, 'Component stock decreased by BOM quantities', 'decreased', allComponentsDecreased ? 'correct' : 'mismatch',
      allComponentsDecreased);

    // 40. Verify FG increased
    const items = (await req('GET', '/api/items', null, ADMIN_TOKEN)).data.items || [];
    const fgItem = items.find(i => i.id === activeBomFinishedGoodId);
    if (fgItem) {
      const fgDelta = getStock(stockAfterKit, fgItem.itemCode, 'ADEL') - getStock(stockBeforeKit, fgItem.itemCode, 'ADEL');
      record(40, 'Finished good stock increased by 1', '+1', `+${fgDelta}`, fgDelta === 1);
      if (fgDelta === 1) trackChange(fgItem.itemCode, 'ADEL', 1);
    } else {
      record(40, 'FG stock check — item not found', '-', '-', false);
    }
  } else {
    record(39, 'Component stock check — kit failed', '-', '-', false);
    record(40, 'FG stock check — kit failed', '-', '-', false);
  }

  // 41. GET production list
  const prodListRes = await req('GET', '/api/production', null, ADMIN_TOKEN);
  record(41, 'GET /api/production — order appears', 200, prodListRes.status,
    prodListRes.status === 200 && (prodListRes.data.orders?.length > 0), prodListRes.data);

  // 42. GET production detail
  const kitOrder = kitRes.data?.order;
  if (kitOrder) {
    const detailRes = await req('GET', `/api/production/${kitOrder.id}`, null, ADMIN_TOKEN);
    const hasTransactions = detailRes.data?.order?.transactions?.length > 0;
    record(42, 'GET /api/production/:id — detail with transactions', 200, detailRes.status,
      detailRes.status === 200 && hasTransactions, detailRes.data);
  } else {
    record(42, 'Production detail — no order', '-', '-', false);
  }

  // 43. Kit with insufficient stock
  const insuffPayload = {
    finishedGoodId: activeBomFinishedGoodId,
    location: 'ADEL',
    quantityProduced: 999999,
    bomId: activeBomId,
    components: activeBomComponents.map(c => ({ itemId: c.itemId, quantityPer: c.quantityPer })),
  };
  const insuffRes = await req('POST', '/api/production/kit', insuffPayload, ADMIN_TOKEN);
  record(43, 'Kit with insufficient stock rejected (400)', 400, insuffRes.status,
    insuffRes.status === 400, insuffRes.data);
}

// ═══════════════════════════════════════════════════════════════
//  STAGED PRODUCTION ORDERS
// ═══════════════════════════════════════════════════════════════
async function testStagedProduction() {
  console.log('\n\x1b[1m══ STAGED PRODUCTION ORDERS ══\x1b[0m');

  if (!activeBomId || !activeBomFinishedGoodId) {
    for (let n = 44; n <= 55; n++) record(n, 'SKIPPED — no active BOM', '-', '-', false);
    return;
  }

  // 44. GET boms
  const bomsRes = await req('GET', '/api/boms', null, ADMIN_TOKEN);
  record(44, 'GET /api/boms (CreateProductionOrderPage)', 200, bomsRes.status,
    bomsRes.status === 200, bomsRes.data);

  // 45. GET bom detail — verify lines
  const bomDetailRes = await req('GET', `/api/boms/${activeBomId}`, null, ADMIN_TOKEN);
  const bomHasLines = bomDetailRes.data?.bom?.lines?.length > 0;
  record(45, 'GET /api/boms/:id — includes lines array', 200, bomDetailRes.status,
    bomDetailRes.status === 200 && bomHasLines, bomDetailRes.data);

  // Ensure stock for components
  const stockBeforeOrder = await getStockMap(ADMIN_TOKEN);
  for (const comp of activeBomComponents) {
    const available = getStock(stockBeforeOrder, comp.itemCode, 'ADEL');
    if (available < comp.quantityPer * 3) {
      const needed = comp.quantityPer * 5;
      await req('POST', '/api/transactions/adjustments', {
        itemId: comp.itemId, location: 'ADEL', quantity: needed,
        reason: 'Correction', notes: 'E2E ensure stock for staged production',
        transactionDate: today(),
      }, ADMIN_TOKEN);
      trackChange(comp.itemCode, 'ADEL', needed);
    }
  }

  // 46. Create staged production order
  const orderPayload = {
    finishedGoodId: activeBomFinishedGoodId,
    location: 'ADEL',
    totalQuantity: 1,
    bomId: activeBomId,
    components: activeBomComponents.map(c => ({ itemId: c.itemId, quantityPer: c.quantityPer })),
    notes: 'E2E staged order',
  };
  const createOrderRes = await req('POST', '/api/production/orders', orderPayload, ADMIN_TOKEN);
  const order = createOrderRes.data?.order;
  record(46, 'Create staged production order (201)', 201, createOrderRes.status,
    createOrderRes.status === 201 && order, createOrderRes.data);

  if (!order) {
    for (let n = 47; n <= 55; n++) record(n, 'SKIPPED — order creation failed', '-', '-', false);
    return;
  }

  // 47. Verify shape
  const hasLines = Array.isArray(order.lines) && order.lines.length > 0;
  const hasSnapshot = order.lines?.[0]?.componentSnapshot?.length > 0;
  record(47, 'Order has lines with componentSnapshot', 'present',
    hasLines && hasSnapshot ? 'present' : 'missing', hasLines && hasSnapshot);

  // 48. GET orders list
  const ordersListRes = await req('GET', '/api/production/orders', null, ADMIN_TOKEN);
  const foundInList = ordersListRes.data?.orders?.some(o => o.id === order.id);
  record(48, 'Order appears in GET /api/production/orders', 'found',
    foundInList ? 'found' : 'missing', !!foundInList);

  // 49. GET order detail
  const orderDetailRes = await req('GET', `/api/production/orders/${order.id}`, null, ADMIN_TOKEN);
  const detailOrder = orderDetailRes.data?.order;
  const hasAllFields = detailOrder && Array.isArray(detailOrder.lines) && detailOrder.lines.length > 0
    && detailOrder.lines[0].status && detailOrder.lines[0].componentSnapshot;
  record(49, 'GET order detail — full shape with lines, status, snapshot', 200, orderDetailRes.status,
    orderDetailRes.status === 200 && hasAllFields, orderDetailRes.data);

  const line = detailOrder?.lines?.[0];
  if (!line) {
    for (let n = 50; n <= 55; n++) record(n, 'SKIPPED — no lines', '-', '-', false);
    return;
  }

  // 50. Post first line
  const stockBeforePost = await getStockMap(ADMIN_TOKEN);
  const postLineRes = await req('POST', `/api/production/orders/${order.id}/lines/${line.id}/post`, null, ADMIN_TOKEN);
  record(50, 'Post production line (200)', 200, postLineRes.status,
    postLineRes.status === 200 && postLineRes.data?.line?.status === 'POSTED', postLineRes.data);

  // 51. Verify stock changes
  if (postLineRes.status === 200) {
    const stockAfterPost = await getStockMap(ADMIN_TOKEN);
    let compOk = true;
    for (const comp of activeBomComponents) {
      const delta = getStock(stockAfterPost, comp.itemCode, 'ADEL') - getStock(stockBeforePost, comp.itemCode, 'ADEL');
      if (delta !== -comp.quantityPer) compOk = false;
      trackChange(comp.itemCode, 'ADEL', -comp.quantityPer);
    }
    // FG should increase
    const items = (await req('GET', '/api/items', null, ADMIN_TOKEN)).data.items || [];
    const fgItem = items.find(i => i.id === activeBomFinishedGoodId);
    let fgOk = false;
    if (fgItem) {
      const fgDelta = getStock(stockAfterPost, fgItem.itemCode, 'ADEL') - getStock(stockBeforePost, fgItem.itemCode, 'ADEL');
      fgOk = fgDelta === 1;
      if (fgOk) trackChange(fgItem.itemCode, 'ADEL', 1);
    }
    record(51, 'Components decreased, FG increased after post', 'correct',
      compOk && fgOk ? 'correct' : 'mismatch', compOk && fgOk);

    // 52. Reverse the posted line
    const stockBeforeReverse = await getStockMap(ADMIN_TOKEN);
    const reverseRes = await req('POST', `/api/production/orders/${order.id}/lines/${line.id}/reverse`,
      { reason: 'E2E test reversal' }, ADMIN_TOKEN);
    record(52, 'Reverse posted line (200)', 200, reverseRes.status,
      reverseRes.status === 200 && reverseRes.data?.line?.status === 'REVERSED', reverseRes.data);

    // 53. Verify stock changes undone
    if (reverseRes.status === 200) {
      const stockAfterReverse = await getStockMap(ADMIN_TOKEN);
      let allUndone = true;
      for (const comp of activeBomComponents) {
        const delta = getStock(stockAfterReverse, comp.itemCode, 'ADEL') - getStock(stockBeforeReverse, comp.itemCode, 'ADEL');
        if (delta !== comp.quantityPer) allUndone = false;
        trackChange(comp.itemCode, 'ADEL', comp.quantityPer); // reversed
      }
      if (fgItem) {
        const fgDelta = getStock(stockAfterReverse, fgItem.itemCode, 'ADEL') - getStock(stockBeforeReverse, fgItem.itemCode, 'ADEL');
        if (fgDelta !== -1) allUndone = false;
        trackChange(fgItem.itemCode, 'ADEL', -1); // reversed
      }
      record(53, 'Stock changes fully undone after reversal', 'undone', allUndone ? 'undone' : 'mismatch', allUndone);
    } else {
      record(53, 'Stock reversal check — reverse failed', '-', '-', false);
    }
  } else {
    record(51, 'Stock post check — post failed', '-', '-', false);
    record(52, 'Reverse line — post failed', '-', '-', false);
    record(53, 'Stock reversal check — post failed', '-', '-', false);
  }

  // 54. Void a staged line — need a new order with at least 2 lines so we have a staged line
  // Create a 2-qty order to get 2 lines
  const order2Res = await req('POST', '/api/production/orders', {
    ...orderPayload, totalQuantity: 2, notes: 'E2E void test',
  }, ADMIN_TOKEN);
  const order2 = order2Res.data?.order;
  if (order2 && order2.lines?.length >= 1) {
    const voidLine = order2.lines[0];
    const stockBeforeVoid = await getStockMap(ADMIN_TOKEN);
    const voidRes = await req('POST', `/api/production/orders/${order2.id}/lines/${voidLine.id}/void`,
      { reason: 'E2E void test' }, ADMIN_TOKEN);
    record(54, 'Void staged production line (200)', 200, voidRes.status,
      voidRes.status === 200 && voidRes.data?.line?.status === 'VOIDED', voidRes.data);

    // 55. Verify no stock impact
    const stockAfterVoid = await getStockMap(ADMIN_TOKEN);
    let noImpact = true;
    for (const comp of activeBomComponents) {
      const delta = getStock(stockAfterVoid, comp.itemCode, 'ADEL') - getStock(stockBeforeVoid, comp.itemCode, 'ADEL');
      if (delta !== 0) noImpact = false;
    }
    record(55, 'Void line — no stock impact', 'no change', noImpact ? 'no change' : 'changed', noImpact);
  } else {
    record(54, 'Void line — order creation failed', '-', '-', false);
    record(55, 'Void stock check — skipped', '-', '-', false);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════════════════════════════
async function testItems() {
  console.log('\n\x1b[1m══ ITEMS ══\x1b[0m');

  // 56. Create item
  const itemCode = `TEST-E2E-${Date.now()}`;
  const createRes = await req('POST', '/api/items', {
    itemCode, description: 'E2E Test Item', unitOfMeasure: 'EA', itemType: 'RAW',
  }, ADMIN_TOKEN);
  record(56, 'Create TEST-E2E item (201)', 201, createRes.status,
    createRes.status === 201, createRes.data);

  const newItem = createRes.data?.item;
  if (!newItem) {
    for (let n = 57; n <= 60; n++) record(n, 'SKIPPED', '-', '-', false);
    return;
  }

  // 57. Update item
  const updateRes = await req('PUT', `/api/items/${newItem.id}`, {
    description: 'E2E Test Item Updated',
  }, ADMIN_TOKEN);
  record(57, 'Update item description (200)', 200, updateRes.status,
    updateRes.status === 200, updateRes.data);

  // 58. Create a BOM using this item, activate it
  // Use a different finished good than the kitting BOM to avoid auto-retiring it
  const items = (await req('GET', '/api/items?all=true', null, ADMIN_TOKEN)).data.items || [];
  const finishedGoods = items.filter(i => i.itemType === 'FINISHED');
  // Pick a FG that is NOT the one used by kitting BOM
  const fg = finishedGoods.find(i => i.id !== activeBomFinishedGoodId) || finishedGoods[0];
  let blockingBomId = null;

  if (fg) {
    const bomCode = `E2E-BLOCK-${Date.now()}`;
    const bomRes = await req('POST', '/api/boms', {
      bomCode, name: 'E2E Block Test', finishedGoodId: fg.id,
      lines: [{ itemId: newItem.id, quantityPer: 1 }],
    }, ADMIN_TOKEN);
    if (bomRes.status === 201) {
      blockingBomId = bomRes.data.bom.id;
      await req('PATCH', `/api/boms/${blockingBomId}/status`, { status: 'ACTIVE' }, ADMIN_TOKEN);
    }
    record(58, 'Create BOM using item as component, activate', 201, bomRes.status,
      bomRes.status === 201, bomRes.data);
  } else {
    record(58, 'BOM creation — no finished good available', '-', '-', false);
  }

  // 59. Try to deactivate — blocked
  const deactivateRes = await req('PATCH', `/api/items/${newItem.id}/status`, { isActive: false }, ADMIN_TOKEN);
  record(59, 'Deactivate item blocked by active BOM (400)', 400, deactivateRes.status,
    deactivateRes.status === 400, deactivateRes.data);

  // 60. Retire the BOM, then deactivate
  if (blockingBomId) {
    await req('PATCH', `/api/boms/${blockingBomId}/status`, { status: 'RETIRED' }, ADMIN_TOKEN);
    const deactivate2Res = await req('PATCH', `/api/items/${newItem.id}/status`, { isActive: false }, ADMIN_TOKEN);
    record(60, 'Deactivate item after retiring BOM (200)', 200, deactivate2Res.status,
      deactivate2Res.status === 200, deactivate2Res.data);
  } else {
    record(60, 'Deactivate after retire — no BOM to retire', '-', '-', false);
  }
}

// ═══════════════════════════════════════════════════════════════
//  VENDORS
// ═══════════════════════════════════════════════════════════════
async function testVendors() {
  console.log('\n\x1b[1m══ VENDORS ══\x1b[0m');

  // 61. Create vendor
  const vendorCode = `TEST-E2E-V-${Date.now()}`;
  const createRes = await req('POST', '/api/vendors', {
    vendorCode, vendorName: 'E2E Test Vendor',
  }, ADMIN_TOKEN);
  record(61, 'Create TEST-E2E vendor (201)', 201, createRes.status,
    createRes.status === 201, createRes.data);

  const newVendor = createRes.data?.vendor;
  if (!newVendor) {
    record(62, 'SKIPPED', '-', '-', false);
    return;
  }

  // 62. Update vendor
  const updateRes = await req('PUT', `/api/vendors/${newVendor.id}`, {
    vendorName: 'E2E Test Vendor Updated',
  }, ADMIN_TOKEN);
  record(62, 'Update vendor name (200)', 200, updateRes.status,
    updateRes.status === 200, updateRes.data);
}

// ═══════════════════════════════════════════════════════════════
//  RBAC
// ═══════════════════════════════════════════════════════════════
async function testRBAC() {
  console.log('\n\x1b[1m══ RBAC ══\x1b[0m');

  // Login as standard user
  const loginRes = await req('POST', '/api/auth/login', { username: 'alix', password: 'Password1' });
  record(63, 'Login as standard user (alix)', 200, loginRes.status,
    loginRes.status === 200 && loginRes.data.token, loginRes.data);
  USER_TOKEN = loginRes.data?.token || '';

  if (!USER_TOKEN) {
    for (let n = 64; n <= 72; n++) record(n, 'SKIPPED — login failed', '-', '-', false);
    return;
  }

  // 64. Items — 403
  const itemRes = await req('POST', '/api/items', {
    itemCode: 'RBAC-TEST', description: 'RBAC', unitOfMeasure: 'EA',
  }, USER_TOKEN);
  record(64, 'Standard user POST /api/items → 403', 403, itemRes.status,
    itemRes.status === 403, itemRes.data);

  // 65. Vendors — 403
  const vendorRes = await req('POST', '/api/vendors', {
    vendorCode: 'RBAC-V', vendorName: 'RBAC',
  }, USER_TOKEN);
  record(65, 'Standard user POST /api/vendors → 403', 403, vendorRes.status,
    vendorRes.status === 403, vendorRes.data);

  // 66. Users — 403
  const userRes = await req('POST', '/api/users', {
    username: 'rbactest', password: 'Password1!Aa', fullName: 'RBAC Test', role: 'user',
  }, USER_TOKEN);
  record(66, 'Standard user POST /api/users → 403', 403, userRes.status,
    userRes.status === 403, userRes.data);

  // 67. BOMs — 403
  const bomRes = await req('POST', '/api/boms', {
    bomCode: 'RBAC-BOM', name: 'RBAC', finishedGoodId: 1, lines: [],
  }, USER_TOKEN);
  record(67, 'Standard user POST /api/boms → 403', 403, bomRes.status,
    bomRes.status === 403, bomRes.data);

  // 68. Opening balances — 403
  const obRes = await req('POST', '/api/transactions/opening-balances', {
    itemId: 1, location: 'ADEL', quantity: 1, unitCost: 1,
  }, USER_TOKEN);
  record(68, 'Standard user POST opening-balances → 403', 403, obRes.status,
    obRes.status === 403, obRes.data);

  // 69. Receipts — allowed
  const items = (await req('GET', '/api/items', null, USER_TOKEN)).data.items || [];
  const vendors = (await req('GET', '/api/vendors', null, USER_TOKEN)).data.vendors || [];
  if (items.length > 0 && vendors.length > 0) {
    const receiptRes = await req('POST', '/api/transactions/receipts/batch', {
      vendorId: vendors[0].id, location: 'ADEL', transactionDate: today(),
      lineItems: [{ itemId: items[0].id, quantity: 1, unitCost: 10 }],
    }, USER_TOKEN);
    record(69, 'Standard user POST receipt → 201', 201, receiptRes.status,
      receiptRes.status === 201, receiptRes.data);
    if (receiptRes.status === 201) trackChange(items[0].itemCode, 'ADEL', 1);
  } else {
    record(69, 'Receipt — no items/vendors available', '-', '-', false);
  }

  // 70. Adjustments — allowed (may need admin auth if large variance)
  if (items.length > 0) {
    // Pick an item with high stock so 1-unit adjustment is <10% threshold
    const userStock = await getStockMap(USER_TOKEN);
    const highStockItem = items.find(i => getStock(userStock, i.itemCode, 'ADEL') >= 20) || items[0];
    const adminAuth = 'Basic ' + Buffer.from('jose:Password1').toString('base64');
    const adjRes = await req('POST', '/api/transactions/adjustments', {
      itemId: highStockItem.id, location: 'ADEL', quantity: 1, reason: 'Correction', notes: 'E2E RBAC',
      transactionDate: today(),
    }, USER_TOKEN, { 'X-Admin-Authorization': adminAuth });
    record(70, 'Standard user POST adjustment → 201', 201, adjRes.status,
      adjRes.status === 201, adjRes.data);
    if (adjRes.status === 201) trackChange(highStockItem.itemCode, 'ADEL', 1);
  } else {
    record(70, 'Adjustment — no items', '-', '-', false);
  }

  // 71. Transfers — allowed
  if (items.length > 0) {
    // First ensure there's stock to transfer
    const stock = await getStockMap(USER_TOKEN);
    const testItem = items.find(i => getStock(stock, i.itemCode, 'ADEL') > 0);
    if (testItem) {
      const xferRes = await req('POST', '/api/transactions/transfers', {
        itemId: testItem.id, fromLocation: 'ADEL', toLocation: 'CALHOUN', quantity: 1,
        transactionDate: today(),
      }, USER_TOKEN);
      record(71, 'Standard user POST transfer → 201', 201, xferRes.status,
        xferRes.status === 201, xferRes.data);
      if (xferRes.status === 201) {
        trackChange(testItem.itemCode, 'ADEL', -1);
        trackChange(testItem.itemCode, 'CALHOUN', 1);
      }
    } else {
      record(71, 'Transfer — no stock to transfer', '-', '-', false);
    }
  } else {
    record(71, 'Transfer — no items', '-', '-', false);
  }

  // 72. Kitting — allowed (with admin auth header for non-admin)
  // Ensure the BOM is still active (may have been retired by item deactivation tests)
  if (activeBomId) {
    const bomCheck = await req('GET', `/api/boms/${activeBomId}`, null, ADMIN_TOKEN);
    if (bomCheck.data?.bom?.status !== 'ACTIVE') {
      await req('PATCH', `/api/boms/${activeBomId}/status`, { status: 'ACTIVE' }, ADMIN_TOKEN);
    }
  }
  if (activeBomId && activeBomFinishedGoodId && activeBomComponents.length > 0) {
    // Ensure stock for kitting components
    for (const comp of activeBomComponents) {
      const currentStock = await getStockMap(ADMIN_TOKEN);
      const available = getStock(currentStock, comp.itemCode, 'ADEL');
      if (available < comp.quantityPer) {
        const needed = comp.quantityPer * 3;
        await req('POST', '/api/transactions/adjustments', {
          itemId: comp.itemId, location: 'ADEL', quantity: needed,
          reason: 'Correction', notes: 'E2E ensure stock for RBAC kit',
          transactionDate: today(),
        }, ADMIN_TOKEN);
        trackChange(comp.itemCode, 'ADEL', needed);
      }
    }
    // Provide admin credentials via header
    const adminAuth = 'Basic ' + Buffer.from('jose:Password1').toString('base64');
    const kitRes = await req('POST', '/api/production/kit', {
      finishedGoodId: activeBomFinishedGoodId,
      location: 'ADEL',
      quantityProduced: 1,
      bomId: activeBomId,
      components: activeBomComponents.map(c => ({ itemId: c.itemId, quantityPer: c.quantityPer })),
    }, USER_TOKEN, { 'X-Admin-Authorization': adminAuth });
    // Could be 201 (allowed with admin auth) or 403 (if auth required and not provided correctly)
    record(72, 'Standard user POST kit (with admin auth) → 201', 201, kitRes.status,
      kitRes.status === 201, kitRes.data);
    if (kitRes.status === 201) {
      for (const comp of activeBomComponents) {
        trackChange(comp.itemCode, 'ADEL', -comp.quantityPer);
      }
      const items2 = (await req('GET', '/api/items', null, ADMIN_TOKEN)).data.items || [];
      const fgItem = items2.find(i => i.id === activeBomFinishedGoodId);
      if (fgItem) trackChange(fgItem.itemCode, 'ADEL', 1);
    }
  } else {
    record(72, 'Kitting — no active BOM', '-', '-', false);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD & HISTORY
// ═══════════════════════════════════════════════════════════════
async function testDashboard() {
  console.log('\n\x1b[1m══ DASHBOARD & HISTORY ══\x1b[0m');

  // 73. Stats
  const statsRes = await req('GET', '/api/dashboard/stats', null, ADMIN_TOKEN);
  const stats = statsRes.data;
  const statsOk = statsRes.status === 200 && typeof stats.totalItems === 'number'
    && typeof stats.transactionsMTD === 'number' && typeof stats.activeVendors === 'number'
    && typeof stats.teamMembers === 'number';
  record(73, 'GET /api/dashboard/stats — numeric fields present', 200, statsRes.status, statsOk, stats);

  // 74. Low stock
  const lowStockRes = await req('GET', '/api/dashboard/low-stock', null, ADMIN_TOKEN);
  record(74, 'GET /api/dashboard/low-stock — array response', 200, lowStockRes.status,
    lowStockRes.status === 200 && Array.isArray(lowStockRes.data.items), lowStockRes.data);

  // 75. Valuation
  const valRes = await req('GET', '/api/dashboard/valuation', null, ADMIN_TOKEN);
  const val = valRes.data;
  const valOk = valRes.status === 200 && typeof val.adel === 'number'
    && typeof val.calhoun === 'number' && typeof val.total === 'number';
  // Check adel + calhoun ≈ total (within rounding)
  const sumOk = valOk && Math.abs((val.adel + val.calhoun) - val.total) < 0.02;
  record(75, 'Valuation: adel + calhoun = total', 'match',
    valOk ? `${val.adel} + ${val.calhoun} = ${val.total}` : 'error', sumOk, val);

  // 76. Filter by type
  const typeFilterRes = await req('GET', '/api/transactions?type=RECEIPT', null, ADMIN_TOKEN);
  const allReceipts = (typeFilterRes.data.transactions || []).every(t => t.transactionType === 'RECEIPT');
  record(76, 'GET /api/transactions?type=RECEIPT — filter works', 200, typeFilterRes.status,
    typeFilterRes.status === 200 && allReceipts);

  // 77. Filter by location
  const locFilterRes = await req('GET', '/api/transactions?location=ADEL', null, ADMIN_TOKEN);
  const allAdel = (locFilterRes.data.transactions || []).every(t => t.location === 'ADEL');
  record(77, 'GET /api/transactions?location=ADEL — filter works', 200, locFilterRes.status,
    locFilterRes.status === 200 && allAdel);
}

// ═══════════════════════════════════════════════════════════════
//  FINAL STOCK RECONCILIATION
// ═══════════════════════════════════════════════════════════════
async function testReconciliation() {
  console.log('\n\x1b[1m══ FINAL STOCK RECONCILIATION ══\x1b[0m');

  const finalStock = await getStockMap(ADMIN_TOKEN);
  let allMatch = true;
  const mismatches = [];

  // Check every item that was in baseline or had changes
  const allItemCodes = new Set([...Object.keys(baselineStock), ...Object.keys(stockChanges)]);

  for (const itemCode of allItemCodes) {
    for (const loc of ['ADEL', 'CALHOUN']) {
      const baseline = baselineStock[itemCode]?.[loc] ?? 0;
      const change = stockChanges[itemCode]?.[loc] ?? 0;
      const expected = baseline + change;
      const actual = finalStock[itemCode]?.[loc] ?? 0;

      if (Math.abs(expected - actual) > 0.001) {
        allMatch = false;
        mismatches.push({ itemCode, loc, baseline, change, expected, actual, diff: actual - expected });
      }
    }
  }

  if (mismatches.length > 0) {
    console.log('\n  \x1b[31mDATA INTEGRITY FAILURES:\x1b[0m');
    console.log('  ' + '-'.repeat(90));
    console.log(`  ${'Item'.padEnd(20)} ${'Loc'.padEnd(10)} ${'Baseline'.padEnd(10)} ${'Change'.padEnd(10)} ${'Expected'.padEnd(10)} ${'Actual'.padEnd(10)} ${'Diff'.padEnd(10)}`);
    console.log('  ' + '-'.repeat(90));
    for (const m of mismatches) {
      console.log(`  ${m.itemCode.padEnd(20)} ${m.loc.padEnd(10)} ${String(m.baseline).padEnd(10)} ${String(m.change).padEnd(10)} ${String(m.expected).padEnd(10)} ${String(m.actual).padEnd(10)} ${String(m.diff).padEnd(10)}`);
    }
  }

  record(78, `Final stock reconciliation (${allItemCodes.size} items checked)`,
    'match', allMatch ? 'match' : `${mismatches.length} mismatches`, allMatch,
    mismatches.length > 0 ? mismatches : null);
}

// ═══════════════════════════════════════════════════════════════
//  PRINT RESULTS
// ═══════════════════════════════════════════════════════════════
function printResults() {
  console.log('\n\n\x1b[1m═══════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m  TEST RESULTS SUMMARY\x1b[0m');
  console.log('\x1b[1m═══════════════════════════════════════════════════════════════\x1b[0m\n');

  // Table header
  console.log(`  ${'#'.padStart(3)}  ${'Result'.padEnd(6)}  ${'Expected'.padEnd(12)}  ${'Actual'.padEnd(12)}  Description`);
  console.log('  ' + '-'.repeat(90));

  for (const r of results) {
    const icon = r.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${String(r.num).padStart(3)}  ${icon}    ${String(r.expectedStatus).padEnd(12)}  ${String(r.actualStatus).padEnd(12)}  ${r.description}`);
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log('\n  ' + '-'.repeat(90));
  console.log(`\n  \x1b[1mTotal: ${total}  |  \x1b[32mPassed: ${passed}\x1b[0m  |  \x1b[31mFailed: ${failed}\x1b[0m\n`);

  // Show failure details
  const failures = results.filter(r => !r.pass && r.failBody);
  if (failures.length > 0) {
    console.log('\n\x1b[1m  FAILURE DETAILS:\x1b[0m');
    for (const f of failures) {
      console.log(`\n  #${f.num} — ${f.description}`);
      const body = typeof f.failBody === 'object' ? JSON.stringify(f.failBody, null, 2) : String(f.failBody);
      const lines = body.split('\n').slice(0, 20);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
      if (body.split('\n').length > 20) console.log('    ... (truncated)');
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\x1b[1m╔═══════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║  AWT Inventory Tracker — Full E2E Test Suite             ║\x1b[0m');
  console.log('\x1b[1m║  78 tests across all workflows                           ║\x1b[0m');
  console.log('\x1b[1m╚═══════════════════════════════════════════════════════════╝\x1b[0m');

  await login();
  await setupBaseline();
  await testReceipts();
  await testAdjustments();
  await testTransfers();
  await testCycleCounts();
  await testBOMs();
  await testKitting();
  await testStagedProduction();
  await testItems();
  await testVendors();
  await testRBAC();
  await testDashboard();
  await testReconciliation();
  printResults();
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(2);
});
