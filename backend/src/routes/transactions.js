const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

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
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
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
    body('location').isIn(['ADEL', 'CALHOUN']).withMessage('location must be ADEL or CALHOUN'),
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

    const created = await prisma.transaction.create({
      data: {
        transactionType: 'RECEIPT',
        itemId,
        vendorId,
        location,
        quantity,
        unitCost,
        invoiceNumber: invoiceNumber || null,
        transactionDate: new Date(transactionDate),
        notes: notes || null,
        createdBy: req.user.id,
      },
      include: {
        item: { select: { itemCode: true, description: true } },
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
    body('location').isIn(['ADEL', 'CALHOUN']).withMessage('location must be ADEL or CALHOUN'),
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
      select: { id: true, itemCode: true, description: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const missingItems = itemIds.filter((id) => !itemMap.has(id));
    if (missingItems.length > 0) {
      return res.status(404).json({ error: 'Some items not found', missingItemIds: missingItems });
    }

    // Create all receipt transactions atomically
    const created = await prisma.$transaction(
      lineItems.map((li) =>
        prisma.transaction.create({
          data: {
            transactionType: 'RECEIPT',
            itemId: li.itemId,
            vendorId,
            location,
            quantity: li.quantity,
            unitCost: li.unitCost,
            invoiceNumber: invoiceNumber || null,
            transactionDate: new Date(transactionDate),
            notes: notes || null,
            createdBy: req.user.id,
          },
          include: {
            item: { select: { id: true, itemCode: true, description: true } },
            vendor: { select: { vendorName: true } },
            user: { select: { fullName: true } },
          },
        })
      )
    );

    // Fetch last paid prices for variance warnings (excluding just-created transactions)
    const createdIds = created.map((t) => t.id);
    const lastPaidPrices = {};

    for (const id of itemIds) {
      const lastPaid = await prisma.transaction.findFirst({
        where: {
          itemId: id,
          transactionType: 'RECEIPT',
          unitCost: { not: null },
          id: { notIn: createdIds },
        },
        orderBy: { transactionDate: 'desc' },
        select: { unitCost: true },
      });
      lastPaidPrices[id] = lastPaid?.unitCost ? Number(lastPaid.unitCost) : null;
    }

    // Store referencePrice on each created transaction for variance tracking
    const refPriceUpdates = created
      .filter((t) => lastPaidPrices[t.itemId] !== null)
      .map((t) =>
        prisma.transaction.update({
          where: { id: t.id },
          data: { referencePrice: lastPaidPrices[t.itemId] },
        })
      );
    if (refPriceUpdates.length > 0) {
      await prisma.$transaction(refPriceUpdates);
    }

    // Auto-update lastPurchaseCost for each item in the batch
    const lastCostPerItem = {};
    for (const li of lineItems) {
      lastCostPerItem[li.itemId] = li.unitCost;
    }
    const itemCostUpdates = Object.entries(lastCostPerItem).map(([id, cost]) =>
      prisma.item.update({
        where: { id: parseInt(id) },
        data: { lastPurchaseCost: parseFloat(cost) },
      })
    );
    if (itemCostUpdates.length > 0) {
      await prisma.$transaction(itemCostUpdates);
    }

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
    body('location').isIn(['ADEL', 'CALHOUN']).withMessage('location must be ADEL or CALHOUN'),
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

    const created = await prisma.transaction.create({
      data: {
        transactionType: 'OPENING_BALANCE',
        itemId,
        location,
        quantity,
        unitCost: unitCost ?? null,
        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
        notes: notes || null,
        createdBy: req.user.id,
      },
      include: {
        item: { select: { itemCode: true, description: true } },
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

      if (!row.location || !['ADEL', 'CALHOUN'].includes(row.location.trim().toUpperCase())) {
        errors.push({ rowNumber, field: 'location', message: 'location must be ADEL or CALHOUN' });
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

    // Create all opening balance transactions atomically
    const data = rows.map((row) => ({
      transactionType: 'OPENING_BALANCE',
      itemId: itemMap[row.item_code.trim()],
      location: row.location.trim().toUpperCase(),
      quantity: Number(row.quantity),
      unitCost: row.unit_cost && row.unit_cost !== '' ? Number(row.unit_cost) : null,
      transactionDate: new Date(),
      createdBy: req.user.id,
    }));

    const result = await prisma.$transaction(
      data.map((d) => prisma.transaction.create({ data: d }))
    );

    return res.status(201).json({ inserted: result.length });
  }
);

// ---------------------------------------------------------------------------
// POST /api/transactions/adjustments — create an ADJUSTMENT
// ---------------------------------------------------------------------------
router.post(
  '/adjustments',
  [
    body('itemId').isInt({ gt: 0 }).withMessage('itemId must be a positive integer'),
    body('location').isIn(['ADEL', 'CALHOUN']).withMessage('location must be ADEL or CALHOUN'),
    body('quantity')
      .isFloat()
      .withMessage('quantity must be a number')
      .custom((value) => value !== 0)
      .withMessage('quantity cannot be zero'),
    body('reason')
      .isIn(['Damage', 'Shrinkage', 'Correction', 'Other'])
      .withMessage('reason must be one of: Damage, Shrinkage, Correction, Other'),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, location, quantity, reason, notes } = req.body;

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Block negative adjustments that would make stock go below zero
    if (quantity < 0) {
      const stockResult = await prisma.transaction.aggregate({
        where: { itemId, location },
        _sum: { quantity: true },
      });
      const currentStock = Number(stockResult._sum.quantity ?? 0);
      if (currentStock + quantity < 0) {
        return res.status(400).json({
          error: `Adjustment would result in negative stock. Current stock at ${location}: ${currentStock}, Adjustment: ${quantity}`,
        });
      }
    }

    const formattedNotes = notes ? `[${reason}] ${notes}` : `[${reason}]`;

    const created = await prisma.transaction.create({
      data: {
        transactionType: 'ADJUSTMENT',
        itemId,
        location,
        quantity,
        transactionDate: new Date(),
        notes: formattedNotes,
        createdBy: req.user.id,
      },
      include: {
        item: { select: { itemCode: true, description: true } },
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
    body('fromLocation').isIn(['ADEL', 'CALHOUN']).withMessage('fromLocation must be ADEL or CALHOUN'),
    body('toLocation').isIn(['ADEL', 'CALHOUN']).withMessage('toLocation must be ADEL or CALHOUN'),
    body('quantity').isFloat({ gt: 0 }).withMessage('quantity must be greater than 0'),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, fromLocation, toLocation, quantity, notes } = req.body;

    if (fromLocation === toLocation) {
      return res.status(400).json({ error: 'From and To locations must be different' });
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Stock check + transfer creation in a serializable transaction to prevent race conditions
    let outbound, inbound;
    try {
      [outbound, inbound] = await prisma.$transaction(async (tx) => {
        // Lock: aggregate inside the transaction ensures consistent read
        const stockResult = await tx.transaction.aggregate({
          where: { itemId, location: fromLocation },
          _sum: { quantity: true },
        });
        const currentStock = Number(stockResult._sum.quantity ?? 0);

        if (currentStock < quantity) {
          throw new Error(`Insufficient stock at ${fromLocation}. Available: ${currentStock}, Requested: ${quantity}`);
        }

        const out = await tx.transaction.create({
          data: {
            transactionType: 'TRANSFER',
            itemId,
            location: fromLocation,
            quantity: -quantity,
            transactionDate: new Date(),
            notes: notes || null,
            createdBy: req.user.id,
          },
          include: {
            item: { select: { itemCode: true, description: true } },
            user: { select: { fullName: true } },
          },
        });
        const inc = await tx.transaction.create({
          data: {
            transactionType: 'TRANSFER',
            itemId,
            location: toLocation,
            quantity: quantity,
            transactionDate: new Date(),
            notes: notes || null,
            createdBy: req.user.id,
          },
          include: {
            item: { select: { itemCode: true, description: true } },
            user: { select: { fullName: true } },
          },
        });

        return [out, inc];
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      if (err.message.startsWith('Insufficient stock')) {
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
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  // Build item filter with optional server-side search
  const itemWhere = { isActive: true };
  if (search) {
    itemWhere.OR = [
      { itemCode: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [grouped, items, itemCount, costRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['itemId', 'location'],
      _sum: { quantity: true },
    }),
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
    // Weighted average cost via raw SQL (no memory bloat)
    prisma.$queryRaw`
      SELECT "item_id" AS "itemId",
             SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
      FROM transactions
      WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
        AND unit_cost IS NOT NULL
        AND quantity > 0
      GROUP BY "item_id"
    `,
  ]);

  // Build lookup map: "itemId_location" → sumQty
  const qtyMap = {};
  for (const row of grouped) {
    const key = `${row.itemId}_${row.location}`;
    qtyMap[key] = Number(row._sum.quantity ?? 0);
  }

  // Build avg cost map from raw query results
  const avgCostMap = {};
  for (const row of costRows) {
    avgCostMap[row.itemId] = Number(row.avgCost ?? 0);
  }

  const positions = items.map((item) => {
    const adelQty = qtyMap[`${item.id}_ADEL`] ?? 0;
    const calhounQty = qtyMap[`${item.id}_CALHOUN`] ?? 0;
    const totalQty = adelQty + calhounQty;
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
      adelQty,
      calhounQty,
      totalQty,
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
    query('location').optional().isIn(['ADEL', 'CALHOUN']),
    query('type').optional().isIn(['RECEIPT', 'ADJUSTMENT', 'TRANSFER', 'OPENING_BALANCE', 'CONSUMPTION', 'PRODUCTION']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, location, type, from, to } = req.query;
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

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          item: { select: { itemCode: true, description: true } },
          vendor: { select: { vendorName: true } },
          user: { select: { fullName: true } },
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
