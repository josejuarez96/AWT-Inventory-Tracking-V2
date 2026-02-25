const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { LOCATIONS } = require('../lib/locations');
const { getReservedQuantitiesMap, getReservedQty } = require('../lib/reservations');
const { allowsDecimals } = require('../lib/uom');

async function verifyAdminCredentials(authHeader) {
  try {
    if (!authHeader || !authHeader.startsWith('Basic ')) return false;
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) return false;
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    if (!username || !password) return false;

    const adminUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    if (!adminUser || !adminUser.isActive || adminUser.role !== 'admin') return false;

    return bcrypt.compare(password, adminUser.passwordHash);
  } catch {
    return false;
  }
}

// Adjustment threshold — requires admin approval if exceeded
const ADJ_THRESHOLD_PCT = 0.10; // 10% of current stock
const ADJ_THRESHOLD_VALUE = 500; // $500 value impact

/** Parse a YYYY-MM-DD string as local noon to avoid UTC timezone shift */
function parseDateLocal(dateStr) {
  if (!dateStr) return new Date();
  return new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// ---------------------------------------------------------------------------
// Date validation helper — role-based backdate rules
//   Anyone:       0–7 days back = OK
//   Standard user: 8+ days back  = BLOCKED
//   Admin:        8–30 days back = OK (frontend shows warning)
//   Everyone:     31+ days back  = BLOCKED
//   Everyone:     future         = BLOCKED
// ---------------------------------------------------------------------------
const WARN_BACKDATE_DAYS = 7;
const MAX_BACKDATE_DAYS = 30;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function validateTransactionDate(dateStr, userRole) {
  // Compare as plain date strings to avoid timezone ambiguity
  const txDateStr = dateStr.slice(0, 10); // input is "YYYY-MM-DD"
  const now = new Date();
  const todayStr = toDateStr(now);

  if (txDateStr > todayStr) {
    return 'Transaction date cannot be in the future';
  }

  const hardCutoff = new Date();
  hardCutoff.setDate(hardCutoff.getDate() - MAX_BACKDATE_DAYS);
  const hardCutoffStr = toDateStr(hardCutoff);
  if (txDateStr < hardCutoffStr) {
    return `Transaction date cannot be more than ${MAX_BACKDATE_DAYS} days in the past`;
  }

  if (userRole !== 'admin') {
    const userCutoff = new Date();
    userCutoff.setDate(userCutoff.getDate() - WARN_BACKDATE_DAYS);
    const userCutoffStr = toDateStr(userCutoff);
    if (txDateStr < userCutoffStr) {
      return `Dates older than ${WARN_BACKDATE_DAYS} days must be posted by an admin.`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// POST /api/transactions/receipts — create a RECEIPT transaction
// ---------------------------------------------------------------------------
router.post(
  '/receipts',
  [
    body('itemId').isInt({ gt: 0 }).withMessage('itemId must be a positive integer'),
    body('vendorId').isInt({ gt: 0 }).withMessage('vendorId must be a positive integer'),
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('quantity').isFloat({ gt: 0 }).withMessage('quantity must be greater than 0'),
    body('unitCost').isFloat({ gt: 0 }).withMessage('unitCost must be greater than 0'),
    body('transactionDate').isISO8601().withMessage('transactionDate must be a valid date'),
    body('invoiceNumber').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, vendorId, location, quantity, unitCost, transactionDate, invoiceNumber, notes } = req.body;

    // Enforce date window
    const dateError = validateTransactionDate(transactionDate, req.user.role);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Duplicate receipt detection (unless explicitly overridden)
    if (!req.body.skipDuplicateCheck) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const duplicate = await prisma.transaction.findFirst({
        where: {
          transactionType: 'RECEIPT',
          itemId,
          vendorId,
          quantity: { equals: quantity },
          createdAt: { gte: oneDayAgo },
        },
        include: { item: { select: { itemCode: true } } },
      });
      if (duplicate) {
        return res.status(409).json({
          error: `Possible duplicate: a receipt for ${duplicate.item.itemCode} (qty ${Number(duplicate.quantity)}) from the same vendor was created recently. Submit again with skipDuplicateCheck to proceed.`,
          isDuplicate: true,
        });
      }
    }

    const created = await prisma.transaction.create({
      data: {
        transactionType: 'RECEIPT',
        itemId,
        vendorId,
        location,
        quantity,
        unitCost,
        invoiceNumber: invoiceNumber || null,
        transactionDate: parseDateLocal(transactionDate),
        notes: notes || null,
        createdBy: req.user.id,
      },
      include: {
        item: { select: { id: true, itemCode: true, description: true } },
        vendor: { select: { vendorName: true } },
        user: { select: { fullName: true } },
      },
    });

    // Look up the last paid price for this item (excluding the transaction just created)
    const lastPaid = await prisma.transaction.findFirst({
      where: {
        itemId,
        transactionType: 'RECEIPT',
        unitCost: { not: null },
        id: { not: created.id },
      },
      orderBy: { transactionDate: 'desc' },
      select: { unitCost: true, transactionDate: true },
    });

    // Store referencePrice for variance tracking
    const lastPaidPrice = lastPaid?.unitCost ? Number(lastPaid.unitCost) : null;
    if (lastPaidPrice !== null) {
      await prisma.transaction.update({
        where: { id: created.id },
        data: { referencePrice: lastPaidPrice },
      });
    }

    // Auto-update lastPurchaseCost on the item
    await prisma.item.update({
      where: { id: itemId },
      data: { lastPurchaseCost: parseFloat(unitCost) },
    });

    return res.status(201).json({
      transaction: {
        ...created,
        quantity: Number(created.quantity),
        unitCost: created.unitCost ? Number(created.unitCost) : null,
        referencePrice: lastPaidPrice,
      },
      lastPaidPrice,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/receipts/batch — create multiple RECEIPT transactions
// ---------------------------------------------------------------------------
router.post(
  '/receipts/batch',
  [
    body('vendorId').isInt({ gt: 0 }).withMessage('vendorId must be a positive integer'),
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('transactionDate').isISO8601().withMessage('transactionDate must be a valid date'),
    body('invoiceNumber').optional().trim(),
    body('notes').optional().trim(),
    body('lineItems').isArray({ min: 1 }).withMessage('lineItems must be a non-empty array'),
    body('lineItems.*.itemId').isInt({ gt: 0 }).withMessage('Each line item must have a positive itemId'),
    body('lineItems.*.quantity').isFloat({ gt: 0 }).withMessage('Each line item quantity must be > 0'),
    body('lineItems.*.unitCost').isFloat({ gt: 0 }).withMessage('Each line item unitCost must be > 0'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { vendorId, location, transactionDate, invoiceNumber, notes, lineItems } = req.body;

    // Enforce date window
    const dateError = validateTransactionDate(transactionDate, req.user.role);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    // Validate vendor
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Validate all items exist and are active
    const itemIds = [...new Set(lineItems.map((li) => li.itemId))];
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds }, isActive: true },
      select: { id: true, itemCode: true, description: true, unitOfMeasure: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const missingItems = itemIds.filter((id) => !itemMap.has(id));
    if (missingItems.length > 0) {
      return res.status(404).json({ error: 'Some items not found', missingItemIds: missingItems });
    }

    // Block decimal quantities for whole-unit items (EA, SET, PAIR)
    for (const li of lineItems) {
      const liItem = itemMap.get(li.itemId);
      if (liItem && !allowsDecimals(liItem.unitOfMeasure) && !Number.isInteger(li.quantity)) {
        return res.status(400).json({
          error: `${liItem.itemCode} is measured in ${liItem.unitOfMeasure} — quantity must be a whole number.`,
        });
      }
    }

    // Create receipts, update reference prices, and update lastPurchaseCost atomically
    const batchId = crypto.randomUUID();
    const { created, lastPaidPrices } = await prisma.$transaction(async (tx) => {
      // 1. Create all receipt transactions
      const receipts = [];
      for (const li of lineItems) {
        const receipt = await tx.transaction.create({
          data: {
            transactionType: 'RECEIPT',
            itemId: li.itemId,
            vendorId,
            location,
            quantity: li.quantity,
            unitCost: li.unitCost,
            invoiceNumber: invoiceNumber || null,
            transactionDate: parseDateLocal(transactionDate),
            notes: notes || null,
            createdBy: req.user.id,
            batchId,
          },
          include: {
            item: { select: { id: true, itemCode: true, description: true } },
            vendor: { select: { vendorName: true } },
            user: { select: { fullName: true } },
          },
        });
        receipts.push(receipt);
      }

      // 2. Fetch last paid prices for variance warnings (excluding just-created)
      const createdIds = receipts.map((t) => t.id);
      const prices = {};
      for (const id of itemIds) {
        const lastPaid = await tx.transaction.findFirst({
          where: {
            itemId: id,
            transactionType: 'RECEIPT',
            unitCost: { not: null },
            id: { notIn: createdIds },
          },
          orderBy: { transactionDate: 'desc' },
          select: { unitCost: true },
        });
        prices[id] = lastPaid?.unitCost ? Number(lastPaid.unitCost) : null;
      }

      // 3. Store referencePrice on each created transaction
      for (const t of receipts) {
        if (prices[t.itemId] !== null) {
          await tx.transaction.update({
            where: { id: t.id },
            data: { referencePrice: prices[t.itemId] },
          });
        }
      }

      // 4. Update lastPurchaseCost for each item
      const lastCostPerItem = {};
      for (const li of lineItems) {
        lastCostPerItem[li.itemId] = li.unitCost;
      }
      for (const [id, cost] of Object.entries(lastCostPerItem)) {
        await tx.item.update({
          where: { id: parseInt(id) },
          data: { lastPurchaseCost: parseFloat(cost) },
        });
      }

      return { created: receipts, lastPaidPrices: prices };
    });

    return res.status(201).json({
      transactions: created.map((t) => ({
        ...t,
        quantity: Number(t.quantity),
        unitCost: t.unitCost ? Number(t.unitCost) : null,
        referencePrice: lastPaidPrices[t.itemId] ?? null,
      })),
      lastPaidPrices,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/opening-balances — create an OPENING_BALANCE (admin)
// ---------------------------------------------------------------------------
router.post(
  '/opening-balances',
  requireAdmin,
  [
    body('itemId').isInt({ gt: 0 }).withMessage('itemId must be a positive integer'),
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('quantity').isFloat({ gt: 0 }).withMessage('quantity must be greater than 0'),
    body('unitCost').optional().isFloat({ gt: 0 }).withMessage('unitCost must be greater than 0'),
    body('transactionDate').optional().isISO8601().withMessage('transactionDate must be a valid date'),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, location, quantity, unitCost, transactionDate, notes } = req.body;

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Block decimal quantities for whole-unit items (EA, SET, PAIR)
    if (!allowsDecimals(item.unitOfMeasure) && !Number.isInteger(quantity)) {
      return res.status(400).json({
        error: `${item.itemCode} is measured in ${item.unitOfMeasure} — quantity must be a whole number.`,
      });
    }

    // Check for existing opening balance for this item+location
    const existingOB = await prisma.transaction.findFirst({
      where: { transactionType: 'OPENING_BALANCE', itemId, location },
    });
    if (existingOB) {
      return res.status(409).json({
        error: `Opening balance already exists for ${item.itemCode} at ${location}. Use an adjustment to correct quantities.`,
      });
    }

    const created = await prisma.transaction.create({
      data: {
        transactionType: 'OPENING_BALANCE',
        itemId,
        location,
        quantity,
        unitCost: unitCost ?? null,
        transactionDate: transactionDate ? parseDateLocal(transactionDate) : new Date(),
        notes: notes || null,
        createdBy: req.user.id,
      },
      include: {
        item: { select: { id: true, itemCode: true, description: true } },
        user: { select: { fullName: true } },
      },
    });

    return res.status(201).json({
      transaction: {
        ...created,
        quantity: Number(created.quantity),
        unitCost: created.unitCost ? Number(created.unitCost) : null,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/opening-balances/import/preview — CSV preview (admin)
// ---------------------------------------------------------------------------
router.post(
  '/opening-balances/import/preview',
  requireAdmin,
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let rawRows;
    try {
      rawRows = parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      return res.status(400).json({ error: 'Failed to parse CSV. Ensure the file is valid UTF-8.' });
    }

    // Normalize headers: "Item Code" → "item_code"
    const rows = rawRows.map((row) => {
      const normalized = {};
      for (const key of Object.keys(row)) {
        normalized[key.toLowerCase().replace(/\s+/g, '_')] = row[key];
      }
      return normalized;
    });

    const errors = [];
    rows.forEach((row, index) => {
      const rowNumber = index + 2; // 1-based + header row

      if (!row.item_code || !row.item_code.trim()) {
        errors.push({ rowNumber, field: 'item_code', message: 'item_code is required' });
      }

      if (!row.location || !LOCATIONS.includes(row.location.trim().toUpperCase())) {
        errors.push({ rowNumber, field: 'location', message: `location must be one of: ${LOCATIONS.join(', ')}` });
      } else {
        row.location = row.location.trim().toUpperCase();
      }

      if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) <= 0) {
        errors.push({ rowNumber, field: 'quantity', message: 'quantity must be a positive number' });
      }

      if (row.unit_cost !== undefined && row.unit_cost !== '') {
        if (isNaN(Number(row.unit_cost)) || Number(row.unit_cost) <= 0) {
          errors.push({ rowNumber, field: 'unit_cost', message: 'unit_cost must be a positive number if provided' });
        }
      }
    });

    return res.json({ rows, errors });
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/opening-balances/import — CSV commit (admin)
// ---------------------------------------------------------------------------
router.post(
  '/opening-balances/import',
  requireAdmin,
  [body('rows').isArray({ min: 1 }).withMessage('rows must be a non-empty array')],
  async (req, res) => {
    const valErrors = validationResult(req);
    if (!valErrors.isEmpty()) {
      return res.status(400).json({ errors: valErrors.array() });
    }

    const { rows } = req.body;

    // Look up all item codes in one query
    const codes = [...new Set(rows.map((r) => r.item_code.trim()))];
    const items = await prisma.item.findMany({
      where: { itemCode: { in: codes }, isActive: true },
      select: { id: true, itemCode: true },
    });
    const itemMap = {};
    for (const item of items) {
      itemMap[item.itemCode] = item.id;
    }

    // Check for unknown codes
    const unknownErrors = [];
    rows.forEach((row, index) => {
      const code = row.item_code.trim();
      if (!itemMap[code]) {
        unknownErrors.push({ rowNumber: index + 2, field: 'item_code', message: `Item "${code}" not found` });
      }
    });

    if (unknownErrors.length > 0) {
      return res.status(400).json({ error: 'Some items not found', details: unknownErrors });
    }

    // Check for existing opening balances (duplicate import protection)
    const importPairs = rows.map((row) => ({
      itemId: itemMap[row.item_code.trim()],
      location: row.location.trim().toUpperCase(),
    }));
    const existingOBs = await prisma.transaction.findMany({
      where: {
        transactionType: 'OPENING_BALANCE',
        OR: importPairs.map((p) => ({ itemId: p.itemId, location: p.location })),
      },
      include: { item: { select: { itemCode: true } } },
    });
    if (existingOBs.length > 0) {
      const dupes = existingOBs.map((t) => `${t.item.itemCode} at ${t.location}`);
      return res.status(409).json({
        error: `Opening balances already exist for ${existingOBs.length} item(s). Use adjustments to correct quantities.`,
        duplicates: dupes,
      });
    }

    // Create opening balance transactions in batches to stay within DB parameter limits
    const data = rows.map((row) => ({
      transactionType: 'OPENING_BALANCE',
      itemId: itemMap[row.item_code.trim()],
      location: row.location.trim().toUpperCase(),
      quantity: Number(row.quantity),
      unitCost: row.unit_cost && row.unit_cost !== '' ? Number(row.unit_cost) : null,
      transactionDate: new Date(),
      createdBy: req.user.id,
    }));

    try {
      const BATCH_SIZE = 500;
      let totalInserted = 0;
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const result = await prisma.transaction.createMany({ data: batch });
        totalInserted += result.count;
      }
      return res.status(201).json({ inserted: totalInserted });
    } catch (err) {
      console.error('Opening balance import failed:', err);
      return res.status(500).json({ error: 'Database error during import. Please try again.' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/adjustments — create an ADJUSTMENT
// ---------------------------------------------------------------------------
router.post(
  '/adjustments',
  [
    body('itemId').isInt({ gt: 0 }).withMessage('itemId must be a positive integer'),
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('quantity')
      .isFloat()
      .withMessage('quantity must be a number')
      .custom((value) => value !== 0)
      .withMessage('quantity cannot be zero'),
    body('transactionDate').optional().isISO8601().withMessage('transactionDate must be a valid date'),
    body('reason')
      .isIn(['Damage', 'Shrinkage', 'Correction', 'Other'])
      .withMessage('reason must be one of: Damage, Shrinkage, Correction, Other'),
    body('notes')
      .optional()
      .trim()
      .custom((value, { req: r }) => {
        if (r.body.reason === 'Other' && (!value || value.trim() === '')) {
          throw new Error('Notes are required when reason is "Other"');
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, location, quantity, reason, notes, transactionDate } = req.body;

    // Date validation (if provided)
    if (transactionDate) {
      const dateError = validateTransactionDate(transactionDate, req.user.role);
      if (dateError) {
        return res.status(400).json({ error: dateError });
      }
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Block decimal quantities for whole-unit items (EA, SET, PAIR)
    if (!allowsDecimals(item.unitOfMeasure) && !Number.isInteger(quantity)) {
      return res.status(400).json({
        error: `${item.itemCode} is measured in ${item.unitOfMeasure} — quantity must be a whole number.`,
      });
    }

    // Block negative adjustments that would make available stock go below zero
    if (quantity < 0) {
      const stockResult = await prisma.transaction.aggregate({
        where: { itemId, location },
        _sum: { quantity: true },
      });
      const currentStock = Number(stockResult._sum.quantity ?? 0);
      const reserved = await getReservedQty(itemId, location);
      const available = currentStock - reserved;
      if (available + quantity < 0) {
        return res.status(400).json({
          error: `Adjustment would result in negative available stock. On hand: ${currentStock}, Reserved: ${reserved}, Available: ${available}, Adjustment: ${quantity}`,
        });
      }
    }

    const formattedNotes = notes ? `[${reason}] ${notes}` : `[${reason}]`;

    // Non-admin threshold check: large adjustments require admin authorization
    if (req.user.role !== 'admin') {
      const absQty = Math.abs(quantity);
      // Get available stock for percentage check (on hand - reserved)
      const stockAgg = await prisma.transaction.aggregate({
        where: { itemId, location },
        _sum: { quantity: true },
      });
      const onHand = Number(stockAgg._sum.quantity ?? 0);
      const reservedForThreshold = await getReservedQty(itemId, location);
      const currentStock = onHand - reservedForThreshold;

      // Get avg cost for value impact check
      const costRow = await prisma.$queryRaw`
        SELECT SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
        FROM transactions
        WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
          AND unit_cost IS NOT NULL AND quantity > 0
          AND item_id = ${itemId}
      `;
      const avgCost = costRow.length > 0 && costRow[0].avgCost ? Number(costRow[0].avgCost) : 0;
      const valueImpact = absQty * avgCost;

      const exceedsPct = currentStock > 0 && absQty / currentStock > ADJ_THRESHOLD_PCT;
      const exceedsValue = valueImpact > ADJ_THRESHOLD_VALUE;

      if (exceedsPct || exceedsValue) {
        const adminAuthHeader = req.headers['x-admin-authorization'];
        if (!adminAuthHeader) {
          return res.status(403).json({
            error: 'Admin authorization required for large adjustments',
            requiresApproval: true,
            threshold: {
              adjustmentQty: quantity,
              currentStock,
              pctOfStock: currentStock > 0 ? Math.round((absQty / currentStock) * 100) : null,
              valueImpact: Math.round(valueImpact * 100) / 100,
              exceedsPct,
              exceedsValue,
            },
          });
        }

        const isValidAdmin = await verifyAdminCredentials(adminAuthHeader);
        if (!isValidAdmin) {
          return res.status(403).json({
            error: 'Invalid admin credentials',
            requiresApproval: true,
          });
        }
      }
    }

    const created = await prisma.transaction.create({
      data: {
        transactionType: 'ADJUSTMENT',
        itemId,
        location,
        quantity,
        transactionDate: transactionDate ? parseDateLocal(transactionDate) : new Date(),
        notes: formattedNotes,
        createdBy: req.user.id,
      },
      include: {
        item: { select: { id: true, itemCode: true, description: true } },
        user: { select: { fullName: true } },
      },
    });

    return res.status(201).json({
      transaction: {
        ...created,
        quantity: Number(created.quantity),
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/transfers — create a TRANSFER (atomic pair)
// ---------------------------------------------------------------------------
router.post(
  '/transfers',
  [
    body('itemId').isInt({ gt: 0 }).withMessage('itemId must be a positive integer'),
    body('fromLocation').isIn(LOCATIONS).withMessage('fromLocation must be ADEL or CALHOUN'),
    body('toLocation').isIn(LOCATIONS).withMessage('toLocation must be ADEL or CALHOUN'),
    body('quantity').isFloat({ gt: 0 }).withMessage('quantity must be greater than 0'),
    body('transactionDate').optional().isISO8601().withMessage('transactionDate must be a valid date'),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, fromLocation, toLocation, quantity, notes, transactionDate } = req.body;

    // Date validation (if provided)
    if (transactionDate) {
      const dateError = validateTransactionDate(transactionDate, req.user.role);
      if (dateError) {
        return res.status(400).json({ error: dateError });
      }
    }

    if (fromLocation === toLocation) {
      return res.status(400).json({ error: 'From and To locations must be different' });
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Block decimal quantities for whole-unit items (EA, SET, PAIR)
    if (!allowsDecimals(item.unitOfMeasure) && !Number.isInteger(quantity)) {
      return res.status(400).json({
        error: `${item.itemCode} is measured in ${item.unitOfMeasure} — quantity must be a whole number.`,
      });
    }

    // Stock check + transfer creation in a serializable transaction to prevent race conditions
    const transferBatchId = crypto.randomUUID();
    let outbound, inbound;
    try {
      [outbound, inbound] = await prisma.$transaction(async (tx) => {
        // Lock: aggregate inside the transaction ensures consistent read
        const stockResult = await tx.transaction.aggregate({
          where: { itemId, location: fromLocation },
          _sum: { quantity: true },
        });
        const currentStock = Number(stockResult._sum.quantity ?? 0);
        const reserved = await getReservedQty(itemId, fromLocation, tx);
        const available = currentStock - reserved;

        if (available < quantity) {
          throw new Error(`Insufficient available stock at ${fromLocation}. On hand: ${currentStock}, Reserved: ${reserved}, Available: ${available}, Requested: ${quantity}`);
        }

        const out = await tx.transaction.create({
          data: {
            transactionType: 'TRANSFER',
            itemId,
            location: fromLocation,
            quantity: -quantity,
            transactionDate: transactionDate ? parseDateLocal(transactionDate) : new Date(),
            notes: notes || null,
            createdBy: req.user.id,
            batchId: transferBatchId,
          },
          include: {
            item: { select: { id: true, itemCode: true, description: true } },
            user: { select: { fullName: true } },
          },
        });
        const inc = await tx.transaction.create({
          data: {
            transactionType: 'TRANSFER',
            itemId,
            location: toLocation,
            quantity: quantity,
            transactionDate: transactionDate ? parseDateLocal(transactionDate) : new Date(),
            notes: notes || null,
            createdBy: req.user.id,
            batchId: transferBatchId,
          },
          include: {
            item: { select: { id: true, itemCode: true, description: true } },
            user: { select: { fullName: true } },
          },
        });

        return [out, inc];
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      if (err.message.startsWith('Insufficient')) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    return res.status(201).json({
      transfer: {
        outbound: { ...outbound, quantity: Number(outbound.quantity) },
        inbound: { ...inbound, quantity: Number(inbound.quantity) },
      },
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/transactions/stock-position — current qty on hand per item per location
// ---------------------------------------------------------------------------
router.get('/stock-position', async (req, res) => {
  const search = (req.query.search || '').trim().toLowerCase();
  const category = (req.query.category || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  // Build item filter with optional server-side search and category
  const itemWhere = { isActive: true };
  if (search) {
    itemWhere.OR = [
      { itemCode: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (category) {
    itemWhere.category = category;
  }

  // First get page of items + count
  const [items, itemCount] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      orderBy: { itemCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        itemCode: true,
        description: true,
        category: true,
        unitOfMeasure: true,
        minQuantity: true,
      },
    }),
    prisma.item.count({ where: itemWhere }),
  ]);

  const itemIds = items.map((i) => i.id);

  // Only query transactions for items on the current page
  const [grouped, costRows] = itemIds.length > 0 ? await Promise.all([
    prisma.$queryRaw`
      SELECT "item_id" AS "itemId", location,
             SUM(quantity) AS "sumQty"
      FROM transactions
      WHERE "item_id" = ANY(${itemIds}::int[])
      GROUP BY "item_id", location
    `,
    prisma.$queryRaw`
      SELECT "item_id" AS "itemId",
             SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
      FROM transactions
      WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
        AND unit_cost IS NOT NULL
        AND quantity > 0
        AND "item_id" = ANY(${itemIds}::int[])
      GROUP BY "item_id"
    `,
  ]) : [[], []];

  // Build lookup map: "itemId_location" → sumQty
  const qtyMap = {};
  for (const row of grouped) {
    const key = `${row.itemId}_${row.location}`;
    qtyMap[key] = Number(row.sumQty ?? 0);
  }

  // Build avg cost map from raw query results
  const avgCostMap = {};
  for (const row of costRows) {
    avgCostMap[row.itemId] = Number(row.avgCost ?? 0);
  }

  // Get reserved quantities from staged production order lines
  const reservedMap = await getReservedQuantitiesMap();

  const positions = items.map((item) => {
    const qtyByLocation = {};
    const reservedByLocation = {};
    const availableByLocation = {};
    let totalQty = 0;
    let totalReserved = 0;
    for (const loc of LOCATIONS) {
      const qty = qtyMap[`${item.id}_${loc}`] ?? 0;
      const reserved = reservedMap.get(`${item.id}_${loc}`) || 0;
      qtyByLocation[loc] = qty;
      reservedByLocation[loc] = reserved;
      availableByLocation[loc] = qty - reserved;
      totalQty += qty;
      totalReserved += reserved;
    }
    const totalAvailable = totalQty - totalReserved;
    const avgCost = avgCostMap[item.id]
      ? Math.round(avgCostMap[item.id] * 100) / 100
      : null;
    const totalValue = avgCost !== null
      ? Math.round(totalQty * avgCost * 100) / 100
      : null;
    return {
      item: {
        id: item.id,
        itemCode: item.itemCode,
        description: item.description,
        category: item.category,
        unitOfMeasure: item.unitOfMeasure,
        minQuantity: item.minQuantity ? Number(item.minQuantity) : null,
      },
      qtyByLocation,
      reservedByLocation,
      availableByLocation,
      totalQty,
      totalReserved,
      totalAvailable,
      avgCost,
      totalValue,
    };
  });

  return res.json({
    positions,
    total: itemCount,
    page,
    limit,
    totalPages: Math.ceil(itemCount / limit),
  });
});

// ---------------------------------------------------------------------------
// GET /api/transactions — transaction history with optional filters
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('itemId').optional().isInt({ gt: 0 }),
    query('location').optional().isIn(LOCATIONS),
    query('type').optional().isIn(['RECEIPT', 'ADJUSTMENT', 'TRANSFER', 'OPENING_BALANCE', 'CONSUMPTION', 'PRODUCTION']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('search').optional().trim(),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, location, type, from, to, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const where = {};
    if (itemId) where.itemId = parseInt(itemId);
    if (location) where.location = location;
    if (type) where.transactionType = type;
    if (from || to) {
      where.transactionDate = {};
      if (from) where.transactionDate.gte = new Date(from);
      if (to) where.transactionDate.lte = new Date(to);
    }
    if (search) {
      // Pre-query matching items and vendors by ID to avoid nested relation
      // filters inside OR (which can produce incorrect results in Prisma)
      const [matchingItems, matchingVendors] = await Promise.all([
        prisma.item.findMany({
          where: {
            OR: [
              { itemCode: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        prisma.vendor.findMany({
          where: { vendorName: { contains: search, mode: 'insensitive' } },
          select: { id: true },
        }),
      ]);

      const orConditions = [];
      if (matchingItems.length > 0) {
        orConditions.push({ itemId: { in: matchingItems.map((i) => i.id) } });
      }
      if (matchingVendors.length > 0) {
        orConditions.push({ vendorId: { in: matchingVendors.map((v) => v.id) } });
      }
      orConditions.push({ invoiceNumber: { contains: search, mode: 'insensitive' } });
      // Notes search (e.g. cycle count references, adjustment reasons)
      orConditions.push({ notes: { contains: search, mode: 'insensitive' } });
      // Allow searching by transaction ID
      const searchId = parseInt(search);
      if (!isNaN(searchId) && searchId > 0) {
        orConditions.push({ id: searchId });
      }
      where.OR = orConditions;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          item: { select: { id: true, itemCode: true, description: true } },
          vendor: { select: { vendorName: true } },
          user: { select: { fullName: true } },
          productionOrder: { select: { id: true, orderNumber: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return res.json({
      transactions: transactions.map((t) => ({
        ...t,
        quantity: Number(t.quantity),
        unitCost: t.unitCost ? Number(t.unitCost) : null,
        referencePrice: t.referencePrice ? Number(t.referencePrice) : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

module.exports = router;
