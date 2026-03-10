const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, param, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { ALL_UOMS } = require('../lib/uom');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// Helper to serialize Decimal fields
function serializeItem(item) {
  return {
    ...item,
    minQuantity: item.minQuantity?.toNumber?.() ?? item.minQuantity ?? null,
    maxQuantity: item.maxQuantity?.toNumber?.() ?? item.maxQuantity ?? null,
    safetyStock: item.safetyStock?.toNumber?.() ?? item.safetyStock ?? null,
    standardCost: item.standardCost?.toNumber?.() ?? item.standardCost ?? null,
    lastPurchaseCost: item.lastPurchaseCost?.toNumber?.() ?? item.lastPurchaseCost ?? null,
    stockLength: item.stockLength?.toNumber?.() ?? item.stockLength ?? null,
    purchaseUom: item.purchaseUom ?? null,
    conversionFactor: item.conversionFactor?.toNumber?.() ?? item.conversionFactor ?? null,
    defaultVendorId: item.defaultVendorId ?? null,
    defaultVendor: item.defaultVendor ?? null,
  };
}

const VENDOR_SELECT = { id: true, vendorCode: true, vendorName: true };

// GET /api/items — list items (active only by default, ?all=true for admin)
router.get('/', async (req, res) => {
  const showAll = req.query.all === 'true' && req.user.role === 'admin';

  const items = await prisma.item.findMany({
    where: showAll ? {} : { isActive: true },
    orderBy: { itemCode: 'asc' },
    select: {
      id: true,
      itemCode: true,
      description: true,
      category: true,
      unitOfMeasure: true,
      minQuantity: true,
      maxQuantity: true,
      standardCost: true,
      lastPurchaseCost: true,
      defaultVendorId: true,
      defaultVendor: { select: VENDOR_SELECT },
      itemType: true,
      allowDecimalQty: true,
      stockLength: true,
      purchaseUom: true,
      conversionFactor: true,
      ...(showAll && { isActive: true, notes: true, createdAt: true }),
    },
  });

  return res.json({ items: items.map(serializeItem) });
});

// GET /api/items/next-code — suggest next item code based on prefix
router.get('/next-code', async (req, res) => {
  const prefix = (req.query.prefix || '').toString().toUpperCase().trim();
  if (!prefix) {
    return res.status(400).json({ error: 'prefix query parameter is required' });
  }

  // Find all item codes that start with the prefix followed by digits
  const items = await prisma.item.findMany({
    where: { itemCode: { startsWith: prefix } },
    select: { itemCode: true },
    orderBy: { itemCode: 'desc' },
  });

  let maxNum = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  for (const item of items) {
    const match = item.itemCode.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const nextNum = String(maxNum + 1).padStart(3, '0');
  return res.json({ nextCode: `${prefix}${nextNum}` });
});

// GET /api/items/check-code — check if item code already exists (case-insensitive)
router.get('/check-code', async (req, res) => {
  const code = (req.query.code || '').toString().trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'code query parameter is required' });
  }

  const existing = await prisma.item.findFirst({
    where: { itemCode: { equals: code, mode: 'insensitive' } },
    select: { id: true },
  });

  return res.json({ exists: !!existing, id: existing?.id ?? null });
});

// GET /api/items/categories — distinct categories for active items
router.get('/categories', async (_req, res) => {
  const rows = await prisma.item.findMany({
    where: { isActive: true, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  return res.json({ categories: rows.map((r) => r.category) });
});

// POST /api/items/import/preview — parse CSV, return rows + validation errors (no DB writes)
router.post('/import/preview', requireAdmin, upload.single('file'), (req, res) => {
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
    const rowNumber = index + 2;
    if (!row.item_code || row.item_code.trim() === '') {
      errors.push({ rowNumber, field: 'item_code', message: 'item_code is required' });
    } else if (row.item_code.length > 50) {
      errors.push({ rowNumber, field: 'item_code', message: 'item_code max 50 characters' });
    }
    if (!row.description || row.description.trim() === '') {
      errors.push({ rowNumber, field: 'description', message: 'description is required' });
    }
    if (row.min_quantity && row.min_quantity.trim() !== '') {
      const val = parseFloat(row.min_quantity);
      if (isNaN(val) || val < 0) {
        errors.push({ rowNumber, field: 'min_quantity', message: 'min_quantity must be a non-negative number' });
      }
    }
    if (row.max_quantity && row.max_quantity.trim() !== '') {
      const val = parseFloat(row.max_quantity);
      if (isNaN(val) || val < 0) {
        errors.push({ rowNumber, field: 'max_quantity', message: 'max_quantity must be a non-negative number' });
      }
    }
    if (
      row.min_quantity && row.min_quantity.trim() !== '' &&
      row.max_quantity && row.max_quantity.trim() !== ''
    ) {
      const min = parseFloat(row.min_quantity);
      const max = parseFloat(row.max_quantity);
      if (!isNaN(min) && !isNaN(max) && max < min) {
        errors.push({ rowNumber, field: 'max_quantity', message: 'max_quantity must be >= min_quantity' });
      }
    }
    if (row.safety_stock && row.safety_stock.trim() !== '') {
      const val = parseFloat(row.safety_stock);
      if (isNaN(val) || val < 0) {
        errors.push({ rowNumber, field: 'safety_stock', message: 'safety_stock must be a non-negative number' });
      }
    }
    if (row.standard_cost && row.standard_cost.trim() !== '') {
      const val = parseFloat(row.standard_cost);
      if (isNaN(val) || val < 0) {
        errors.push({ rowNumber, field: 'standard_cost', message: 'standard_cost must be a non-negative number' });
      }
    }
    if (row.conversion_factor && row.conversion_factor.trim() !== '') {
      const val = parseFloat(row.conversion_factor);
      if (isNaN(val) || val <= 0) {
        errors.push({ rowNumber, field: 'conversion_factor', message: 'conversion_factor must be a positive number' });
      }
    }
  });

  return res.json({ rows, errors });
});

// POST /api/items/import — commit validated rows (JSON body)
router.post(
  '/import',
  requireAdmin,
  [body('rows').isArray({ min: 1 }).withMessage('rows must be a non-empty array')],
  async (req, res) => {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({ errors: validationErrors.array() });
    }

    const { rows } = req.body;

    // Resolve default_vendor_code to vendor IDs
    const vendorCodes = [...new Set(
      rows
        .map((row) => row.default_vendor_code?.trim())
        .filter((code) => code && code !== '')
    )];

    let vendorMap = {};
    if (vendorCodes.length > 0) {
      const vendors = await prisma.vendor.findMany({
        where: { vendorCode: { in: vendorCodes }, isActive: true },
        select: { id: true, vendorCode: true },
      });
      for (const v of vendors) {
        vendorMap[v.vendorCode] = v.id;
      }
      const unknownVendors = vendorCodes.filter((code) => !vendorMap[code]);
      if (unknownVendors.length > 0) {
        return res.status(400).json({
          error: `Unknown or inactive vendor code(s): ${unknownVendors.join(', ')}`,
        });
      }
    }

    const data = rows.map((row) => ({
      itemCode: row.item_code.trim(),
      description: row.description.trim(),
      category: row.category?.trim() || null,
      unitOfMeasure: row.unit_of_measure?.trim() || 'EA',
      minQuantity: row.min_quantity?.trim() ? parseFloat(row.min_quantity) : null,
      maxQuantity: row.max_quantity?.trim() ? parseFloat(row.max_quantity) : null,
      safetyStock: row.safety_stock?.trim() ? parseFloat(row.safety_stock) : 0,
      standardCost: row.standard_cost?.trim() ? parseFloat(row.standard_cost) : null,
      defaultVendorId: row.default_vendor_code?.trim() ? vendorMap[row.default_vendor_code.trim()] : null,
      notes: row.notes?.trim() || null,
      purchaseUom: row.purchase_uom?.trim() || null,
      conversionFactor: row.conversion_factor?.trim() ? parseFloat(row.conversion_factor) : null,
    }));

    try {
      // Batch in chunks of 500 to stay within DB parameter limits
      const BATCH_SIZE = 500;
      let totalInserted = 0;
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const result = await prisma.item.createMany({ data: batch, skipDuplicates: true });
        totalInserted += result.count;
      }
      return res.status(201).json({ inserted: totalInserted });
    } catch (err) {
      console.error('Item import failed:', err);
      const message = err.code === 'P2002'
        ? 'Some items have duplicate item codes that already exist.'
        : 'Database error during import. Please try again.';
      return res.status(500).json({ error: message });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/items/:id — single item detail
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  [param('id').isInt({ gt: 0 }).withMessage('id must be a positive integer')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const item = await prisma.item.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        defaultVendor: { select: VENDOR_SELECT },
        additionalVendors: {
          include: { vendor: { select: VENDOR_SELECT } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    return res.json({ item: serializeItem(item) });
  }
);

// ---------------------------------------------------------------------------
// POST /api/items — create a single item (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAdmin,
  [
    body('itemCode').trim().notEmpty().withMessage('itemCode is required').isLength({ max: 50 }).withMessage('itemCode max 50 characters'),
    body('description').trim().notEmpty().withMessage('description is required'),
    body('category').optional({ nullable: true }).trim(),
    body('unitOfMeasure').optional().trim(),
    body('minQuantity').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('minQuantity must be >= 0'),
    body('maxQuantity').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('maxQuantity must be >= 0'),
    body('standardCost').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('standardCost must be >= 0'),
    body('defaultVendorId').optional({ nullable: true }).isInt({ gt: 0 }).withMessage('defaultVendorId must be a positive integer'),
    body('notes').optional({ nullable: true }).trim(),
    body('itemType').optional().isIn(['RAW', 'FINISHED', 'OTHER']).withMessage('itemType must be RAW, FINISHED, or OTHER'),
    body('allowDecimalQty').optional().isBoolean().withMessage('allowDecimalQty must be a boolean'),
    body('stockLength').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('stockLength must be > 0'),
    body('purchaseUom').optional({ nullable: true }).trim(),
    body('conversionFactor').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('conversionFactor must be > 0'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { description, category, unitOfMeasure, minQuantity, maxQuantity, notes, standardCost, defaultVendorId, allowDecimalQty, stockLength, purchaseUom, conversionFactor } = req.body;
    const itemCode = req.body.itemCode.toUpperCase();

    // Check unique itemCode (case-insensitive)
    const existing = await prisma.item.findFirst({ where: { itemCode: { equals: itemCode, mode: 'insensitive' } } });
    if (existing) {
      return res.status(409).json({ error: `Item code "${itemCode}" already exists` });
    }

    // stockLength requires allowDecimalQty
    if (stockLength != null && !allowDecimalQty) {
      return res.status(400).json({ error: 'stockLength can only be set on items with allowDecimalQty enabled' });
    }

    // purchaseUom must be a valid UOM
    if (purchaseUom && !ALL_UOMS.includes(purchaseUom.toUpperCase())) {
      return res.status(400).json({ error: `purchaseUom must be one of: ${ALL_UOMS.join(', ')}` });
    }
    // purchaseUom and conversionFactor must be set together
    if (purchaseUom && !conversionFactor) {
      return res.status(400).json({ error: 'conversionFactor is required when purchaseUom is set' });
    }
    if (conversionFactor && !purchaseUom) {
      return res.status(400).json({ error: 'purchaseUom is required when conversionFactor is set' });
    }
    if (purchaseUom && purchaseUom === (unitOfMeasure || 'EA')) {
      return res.status(400).json({ error: 'Purchase UOM must differ from consumption UOM' });
    }

    // Validate defaultVendorId if provided
    if (defaultVendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: defaultVendorId } });
      if (!vendor || !vendor.isActive) {
        return res.status(400).json({ error: 'Default vendor not found or inactive' });
      }
    }

    const additionalVendorIds = req.body.additionalVendorIds ?? [];

    const item = await prisma.item.create({
      data: {
        itemCode,
        description,
        category: category || null,
        unitOfMeasure: unitOfMeasure || 'EA',
        minQuantity: minQuantity != null ? parseFloat(minQuantity) : null,
        maxQuantity: maxQuantity != null ? parseFloat(maxQuantity) : null,
        standardCost: standardCost != null ? parseFloat(standardCost) : null,
        defaultVendorId: defaultVendorId ?? null,
        notes: notes || null,
        itemType: req.body.itemType || 'RAW',
        allowDecimalQty: allowDecimalQty === true,
        stockLength: stockLength != null ? parseFloat(stockLength) : null,
        purchaseUom: purchaseUom || null,
        conversionFactor: conversionFactor != null ? parseFloat(conversionFactor) : null,
        ...(additionalVendorIds.length > 0 && {
          additionalVendors: {
            create: additionalVendorIds.map((vid) => ({ vendorId: vid })),
          },
        }),
      },
      include: {
        defaultVendor: { select: VENDOR_SELECT },
        additionalVendors: {
          include: { vendor: { select: VENDOR_SELECT } },
          orderBy: { id: 'asc' },
        },
      },
    });

    return res.status(201).json({ item: serializeItem(item) });
  }
);

// ---------------------------------------------------------------------------
// PUT /api/items/:id — update item (admin only)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireAdmin,
  [
    param('id').isInt({ gt: 0 }).withMessage('id must be a positive integer'),
    body('itemCode').optional().trim().notEmpty().withMessage('itemCode cannot be empty').isLength({ max: 50 }).withMessage('itemCode max 50 characters'),
    body('description').optional().trim().notEmpty().withMessage('description cannot be empty'),
    body('category').optional({ nullable: true }).trim(),
    body('unitOfMeasure').optional().trim(),
    body('minQuantity').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('minQuantity must be >= 0'),
    body('maxQuantity').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('maxQuantity must be >= 0'),
    body('standardCost').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('standardCost must be >= 0'),
    body('defaultVendorId').optional({ nullable: true }).isInt({ gt: 0 }).withMessage('defaultVendorId must be a positive integer'),
    body('notes').optional({ nullable: true }).trim(),
    body('itemType').optional().isIn(['RAW', 'FINISHED', 'OTHER']).withMessage('itemType must be RAW, FINISHED, or OTHER'),
    body('allowDecimalQty').optional().isBoolean().withMessage('allowDecimalQty must be a boolean'),
    body('stockLength').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('stockLength must be > 0'),
    body('purchaseUom').optional({ nullable: true }).trim(),
    body('conversionFactor').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('conversionFactor must be > 0'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { description, category, unitOfMeasure, minQuantity, maxQuantity, notes, standardCost, defaultVendorId, allowDecimalQty, stockLength, purchaseUom, conversionFactor } = req.body;
    const itemCode = req.body.itemCode ? req.body.itemCode.toUpperCase() : undefined;

    // If itemCode is changing, check uniqueness (case-insensitive)
    if (itemCode && itemCode !== existing.itemCode) {
      const conflict = await prisma.item.findFirst({ where: { itemCode: { equals: itemCode, mode: 'insensitive' }, id: { not: id } } });
      if (conflict) {
        return res.status(409).json({ error: `Item code "${itemCode}" already exists` });
      }
    }

    // stockLength requires allowDecimalQty
    const effectiveAllowDecimal = allowDecimalQty !== undefined ? allowDecimalQty === true : existing.allowDecimalQty;
    const effectiveStockLength = stockLength !== undefined ? stockLength : existing.stockLength;
    if (effectiveStockLength != null && !effectiveAllowDecimal) {
      return res.status(400).json({ error: 'stockLength can only be set on items with allowDecimalQty enabled' });
    }

    // purchaseUom must be a valid UOM
    if (purchaseUom && !ALL_UOMS.includes(purchaseUom.toUpperCase())) {
      return res.status(400).json({ error: `purchaseUom must be one of: ${ALL_UOMS.join(', ')}` });
    }
    // Treat empty/null purchaseUom as "clear both"
    const clearingPurchaseUom = purchaseUom !== undefined && !purchaseUom;
    // purchaseUom + conversionFactor cross-validation
    const effectiveUom = unitOfMeasure !== undefined ? (unitOfMeasure || 'EA') : existing.unitOfMeasure;
    const effectivePurchaseUom = clearingPurchaseUom ? null : (purchaseUom !== undefined ? (purchaseUom || null) : existing.purchaseUom);
    const effectiveConversionFactor = clearingPurchaseUom ? null : (conversionFactor !== undefined ? conversionFactor : existing.conversionFactor);
    // If purchaseUom is changing to a new value, require conversionFactor to also be sent
    if (purchaseUom && purchaseUom !== existing.purchaseUom && conversionFactor === undefined) {
      return res.status(400).json({ error: 'conversionFactor is required when changing purchaseUom' });
    }
    if (effectivePurchaseUom && !effectiveConversionFactor) {
      return res.status(400).json({ error: 'conversionFactor is required when purchaseUom is set' });
    }
    if (effectiveConversionFactor && !effectivePurchaseUom) {
      return res.status(400).json({ error: 'purchaseUom is required when conversionFactor is set' });
    }
    if (effectivePurchaseUom && effectivePurchaseUom === effectiveUom) {
      return res.status(400).json({ error: 'Purchase UOM must differ from consumption UOM' });
    }

    // Validate defaultVendorId if provided
    if (defaultVendorId !== undefined && defaultVendorId !== null) {
      const vendor = await prisma.vendor.findUnique({ where: { id: defaultVendorId } });
      if (!vendor || !vendor.isActive) {
        return res.status(400).json({ error: 'Default vendor not found or inactive' });
      }
    }

    const data = {};
    if (itemCode !== undefined) data.itemCode = itemCode;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category || null;
    if (unitOfMeasure !== undefined) data.unitOfMeasure = unitOfMeasure || 'EA';
    if (minQuantity !== undefined) data.minQuantity = minQuantity != null ? parseFloat(minQuantity) : null;
    if (maxQuantity !== undefined) data.maxQuantity = maxQuantity != null ? parseFloat(maxQuantity) : null;
    if (standardCost !== undefined) data.standardCost = standardCost != null ? parseFloat(standardCost) : null;
    if (defaultVendorId !== undefined) data.defaultVendorId = defaultVendorId;
    if (notes !== undefined) data.notes = notes || null;
    if (req.body.itemType !== undefined) data.itemType = req.body.itemType;
    if (allowDecimalQty !== undefined) data.allowDecimalQty = allowDecimalQty === true;
    // Nullify stockLength if allowDecimalQty is being disabled
    if (allowDecimalQty === false && existing.stockLength != null) data.stockLength = null;
    else if (stockLength !== undefined) data.stockLength = stockLength != null ? parseFloat(stockLength) : null;
    // Purchase UOM fields
    if (purchaseUom !== undefined) data.purchaseUom = purchaseUom || null;
    if (conversionFactor !== undefined) data.conversionFactor = conversionFactor != null ? parseFloat(conversionFactor) : null;
    // Clear both if purchaseUom is being removed
    if (purchaseUom !== undefined && !purchaseUom) {
      data.purchaseUom = null;
      data.conversionFactor = null;
    }

    // Sync additional vendors if provided
    const additionalVendorIds = req.body.additionalVendorIds;
    if (additionalVendorIds !== undefined) {
      // Delete-and-recreate pattern for simplicity
      data.additionalVendors = {
        deleteMany: {},
        create: (additionalVendorIds || []).map((vid) => ({ vendorId: vid })),
      };
    }

    const updated = await prisma.item.update({
      where: { id },
      data,
      include: {
        defaultVendor: { select: VENDOR_SELECT },
        additionalVendors: {
          include: { vendor: { select: VENDOR_SELECT } },
          orderBy: { id: 'asc' },
        },
      },
    });
    return res.json({ item: serializeItem(updated) });
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/items/:id/status — toggle isActive (admin only)
// ---------------------------------------------------------------------------
router.patch(
  '/:id/status',
  requireAdmin,
  [body('isActive').isBoolean().withMessage('isActive must be a boolean')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Block deactivation — check BOM references first (structural blocker), then stock
    if (req.body.isActive === false && existing.isActive === true) {
      // 1. Check if item is a component in any ACTIVE BOM
      const activeBomRefs = await prisma.bomLine.findMany({
        where: {
          itemId: id,
          bom: { status: 'ACTIVE' },
        },
        include: { bom: { select: { bomCode: true, name: true } } },
      });
      if (activeBomRefs.length > 0) {
        const bomList = activeBomRefs.map((r) => r.bom.bomCode).join(', ');
        return res.status(400).json({
          error: `Cannot deactivate item — it is a component in ${activeBomRefs.length} active BOM(s): ${bomList}. Retire those BOMs first.`,
        });
      }

      // 2. Check if item is used in any ACTIVE option package
      const activeOptionRefs = await prisma.optionLine.findMany({
        where: {
          itemId: id,
          optionPackage: {
            status: 'ACTIVE',
            optionGroup: { bom: { status: 'ACTIVE' } },
          },
        },
        include: { optionPackage: { select: { name: true, optionGroup: { select: { bom: { select: { bomCode: true } } } } } } },
      });
      if (activeOptionRefs.length > 0) {
        const pkgList = [...new Set(activeOptionRefs.map((r) => `${r.optionPackage.optionGroup.bom.bomCode}/${r.optionPackage.name}`))].join(', ');
        return res.status(400).json({
          error: `Cannot deactivate item — it is used in ${activeOptionRefs.length} active option package(s): ${pkgList}.`,
        });
      }

      // 3. Check if item is a finished good in any ACTIVE BOM
      const activeFgBoms = await prisma.bom.findMany({
        where: {
          finishedGoodId: id,
          status: 'ACTIVE',
        },
        select: { bomCode: true },
      });
      if (activeFgBoms.length > 0) {
        const bomList = activeFgBoms.map((b) => b.bomCode).join(', ');
        return res.status(400).json({
          error: `Cannot deactivate item — it is the finished good in ${activeFgBoms.length} active BOM(s): ${bomList}. Retire those BOMs first.`,
        });
      }

      // 3. Check if item has positive stock at any location
      const stockResult = await prisma.transaction.aggregate({
        where: { itemId: id },
        _sum: { quantity: true },
      });
      const totalStock = Number(stockResult._sum.quantity ?? 0);
      if (totalStock > 0) {
        return res.status(400).json({
          error: `Cannot deactivate item with ${totalStock} units on hand. Adjust or transfer stock to zero first.`,
        });
      }
    }

    const updated = await prisma.item.update({
      where: { id },
      data: { isActive: req.body.isActive },
    });

    return res.json({ item: serializeItem(updated) });
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/items/:id — permanently delete item (admin only, only if never used)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ gt: 0 }).withMessage('id must be a positive integer')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check for any transaction history
    const txCount = await prisma.transaction.count({ where: { itemId: id } });
    if (txCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${item.itemCode}" — it has ${txCount} transaction(s). Deactivate it instead.`,
      });
    }

    // Check for BOM line references
    const bomLineCount = await prisma.bomLine.count({ where: { itemId: id } });
    if (bomLineCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${item.itemCode}" — it is referenced in ${bomLineCount} BOM line(s). Remove those references first.`,
      });
    }

    // Check if it's a finished good in any BOM
    const bomFgCount = await prisma.bom.count({ where: { finishedGoodId: id } });
    if (bomFgCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${item.itemCode}" — it is the finished good in ${bomFgCount} BOM(s). Delete those BOMs first.`,
      });
    }

    // Check for cycle count line references
    const ccLineCount = await prisma.cycleCountLine.count({ where: { itemId: id } });
    if (ccLineCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${item.itemCode}" — it is referenced in ${ccLineCount} cycle count line(s). Deactivate it instead.`,
      });
    }

    // Safe to delete — remove additional vendor links first, then the item
    await prisma.itemVendor.deleteMany({ where: { itemId: id } });
    await prisma.item.delete({ where: { id } });

    return res.json({ message: `Item "${item.itemCode}" permanently deleted.` });
  }
);

module.exports = router;
