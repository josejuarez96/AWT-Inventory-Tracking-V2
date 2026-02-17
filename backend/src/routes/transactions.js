const express = require('express');
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// POST /api/transactions/receipts — create a RECEIPT transaction
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

    return res.status(201).json({
      transaction: {
        ...created,
        quantity: Number(created.quantity),
        unitCost: created.unitCost ? Number(created.unitCost) : null,
      },
      lastPaidPrice: lastPaid?.unitCost ? Number(lastPaid.unitCost) : null,
    });
  }
);

// GET /api/transactions/stock-position — current qty on hand per item per location
router.get('/stock-position', async (req, res) => {
  const [grouped, items] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['itemId', 'location'],
      _sum: { quantity: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { itemCode: 'asc' },
      select: {
        id: true,
        itemCode: true,
        description: true,
        category: true,
        unitOfMeasure: true,
        minQuantity: true,
      },
    }),
  ]);

  // Build lookup map: "itemId_location" → sumQty
  const qtyMap = {};
  for (const row of grouped) {
    const key = `${row.itemId}_${row.location}`;
    qtyMap[key] = Number(row._sum.quantity ?? 0);
  }

  const positions = items.map((item) => {
    const adelQty = qtyMap[`${item.id}_ADEL`] ?? 0;
    const calhounQty = qtyMap[`${item.id}_CALHOUN`] ?? 0;
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
      totalQty: adelQty + calhounQty,
    };
  });

  return res.json({ positions });
});

// GET /api/transactions — transaction history with optional filters
router.get(
  '/',
  [
    query('itemId').optional().isInt({ gt: 0 }),
    query('location').optional().isIn(['ADEL', 'CALHOUN']),
    query('type').optional().isIn(['RECEIPT', 'ADJUSTMENT', 'TRANSFER', 'OPENING_BALANCE']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, location, type, from, to } = req.query;

    const where = {};
    if (itemId) where.itemId = parseInt(itemId);
    if (location) where.location = location;
    if (type) where.transactionType = type;
    if (from || to) {
      where.transactionDate = {};
      if (from) where.transactionDate.gte = new Date(from);
      if (to) where.transactionDate.lte = new Date(to);
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      include: {
        item: { select: { itemCode: true, description: true } },
        vendor: { select: { vendorName: true } },
        user: { select: { fullName: true } },
      },
    });

    return res.json({
      transactions: transactions.map((t) => ({
        ...t,
        quantity: Number(t.quantity),
        unitCost: t.unitCost ? Number(t.unitCost) : null,
        referencePrice: t.referencePrice ? Number(t.referencePrice) : null,
      })),
    });
  }
);

module.exports = router;
