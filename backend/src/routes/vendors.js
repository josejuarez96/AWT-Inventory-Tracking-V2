const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// GET /api/vendors — list all active vendors
router.get('/', async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    orderBy: { vendorName: 'asc' },
    select: {
      id: true,
      vendorCode: true,
      vendorName: true,
      contactPerson: true,
      phone: true,
      email: true,
      paymentTerms: true,
    },
  });
  return res.json({ vendors });
});

// POST /api/vendors/import/preview — parse CSV, return rows + validation errors (no DB writes)
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

  // Normalize headers: "Vendor Code" → "vendor_code"
  const rows = rawRows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[key.toLowerCase().replace(/\s+/g, '_')] = row[key];
    }
    return normalized;
  });

  const errors = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because row 1 is the header
    if (!row.vendor_code || row.vendor_code.trim() === '') {
      errors.push({ rowNumber, field: 'vendor_code', message: 'vendor_code is required' });
    } else if (row.vendor_code.length > 50) {
      errors.push({ rowNumber, field: 'vendor_code', message: 'vendor_code max 50 characters' });
    }
    if (!row.vendor_name || row.vendor_name.trim() === '') {
      errors.push({ rowNumber, field: 'vendor_name', message: 'vendor_name is required' });
    } else if (row.vendor_name.length > 200) {
      errors.push({ rowNumber, field: 'vendor_name', message: 'vendor_name max 200 characters' });
    }
    if (row.email && row.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.email.trim())) {
        errors.push({ rowNumber, field: 'email', message: 'Invalid email format' });
      }
    }
  });

  return res.json({ rows, errors });
});

// POST /api/vendors/import — commit validated rows (JSON body)
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
      vendorCode: row.vendor_code.trim(),
      vendorName: row.vendor_name.trim(),
      contactPerson: row.contact_person?.trim() || null,
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      paymentTerms: row.payment_terms?.trim() || null,
      notes: row.notes?.trim() || null,
    }));

    const result = await prisma.vendor.createMany({ data, skipDuplicates: true });
    return res.status(201).json({ inserted: result.count });
  }
);

module.exports = router;
