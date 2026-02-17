const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// GET /api/items — list all active items
router.get('/', async (req, res) => {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    orderBy: { itemCode: 'asc' },
    select: {
      id: true,
      itemCode: true,
      description: true,
      category: true,
      unitOfMeasure: true,
      minQuantity: true,
      maxQuantity: true,
    },
  });

  return res.json({
    items: items.map((item) => ({
      ...item,
      minQuantity: item.minQuantity?.toNumber() ?? null,
      maxQuantity: item.maxQuantity?.toNumber() ?? null,
    })),
  });
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
    if (row.lead_time_days && row.lead_time_days.trim() !== '') {
      const val = parseInt(row.lead_time_days);
      if (isNaN(val) || val <= 0) {
        errors.push({ rowNumber, field: 'lead_time_days', message: 'lead_time_days must be a positive integer' });
      }
    }
    if (row.safety_stock && row.safety_stock.trim() !== '') {
      const val = parseFloat(row.safety_stock);
      if (isNaN(val) || val < 0) {
        errors.push({ rowNumber, field: 'safety_stock', message: 'safety_stock must be a non-negative number' });
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
    const data = rows.map((row) => ({
      itemCode: row.item_code.trim(),
      description: row.description.trim(),
      category: row.category?.trim() || null,
      unitOfMeasure: row.unit_of_measure?.trim() || 'EA',
      minQuantity: row.min_quantity?.trim() ? parseFloat(row.min_quantity) : null,
      maxQuantity: row.max_quantity?.trim() ? parseFloat(row.max_quantity) : null,
      leadTimeDays: row.lead_time_days?.trim() ? parseInt(row.lead_time_days) : 14,
      safetyStock: row.safety_stock?.trim() ? parseFloat(row.safety_stock) : 0,
      notes: row.notes?.trim() || null,
    }));

    const result = await prisma.item.createMany({ data, skipDuplicates: true });
    return res.status(201).json({ inserted: result.count });
  }
);

module.exports = router;
