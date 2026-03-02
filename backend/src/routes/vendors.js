const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, param, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// GET /api/vendors — list vendors (active only by default, ?all=true for admin)
router.get('/', async (req, res) => {
  const showAll = req.query.all === 'true' && req.user.role === 'admin';

  const vendors = await prisma.vendor.findMany({
    where: showAll ? {} : { isActive: true },
    orderBy: { vendorName: 'asc' },
    select: {
      id: true,
      vendorCode: true,
      vendorName: true,
      contactPerson: true,
      phone: true,
      email: true,
      paymentTerms: true,
      ...(showAll && { isActive: true, notes: true, createdAt: true }),
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

    try {
      // Batch in chunks of 500 to stay within DB parameter limits
      const BATCH_SIZE = 500;
      let totalInserted = 0;
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const result = await prisma.vendor.createMany({ data: batch, skipDuplicates: true });
        totalInserted += result.count;
      }
      return res.status(201).json({ inserted: totalInserted });
    } catch (err) {
      console.error('Vendor import failed:', err);
      const message = err.code === 'P2002'
        ? 'Some vendors have duplicate vendor codes that already exist.'
        : 'Database error during import. Please try again.';
      return res.status(500).json({ error: message });
    }
  }
);

// GET /api/vendors/next-code — suggest next vendor code based on prefix
router.get('/next-code', async (req, res) => {
  const prefix = (req.query.prefix || '').toString().toUpperCase().trim();
  if (!prefix) {
    return res.status(400).json({ error: 'prefix query parameter is required' });
  }

  const vendors = await prisma.vendor.findMany({
    where: { vendorCode: { startsWith: prefix } },
    select: { vendorCode: true },
    orderBy: { vendorCode: 'desc' },
  });

  let maxNum = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  for (const vendor of vendors) {
    const match = vendor.vendorCode.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const nextNum = String(maxNum + 1).padStart(3, '0');
  return res.json({ nextCode: `${prefix}${nextNum}` });
});

// GET /api/vendors/check-code — check if vendor code already exists (case-insensitive)
router.get('/check-code', async (req, res) => {
  const code = (req.query.code || '').toString().trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'code query parameter is required' });
  }

  const existing = await prisma.vendor.findFirst({
    where: { vendorCode: { equals: code, mode: 'insensitive' } },
    select: { id: true },
  });

  return res.json({ exists: !!existing, id: existing?.id ?? null });
});

// ---------------------------------------------------------------------------
// GET /api/vendors/:id — single vendor detail
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  [param('id').isInt({ gt: 0 }).withMessage('id must be a positive integer')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    return res.json({ vendor });
  }
);

// ---------------------------------------------------------------------------
// POST /api/vendors — create a single vendor (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAdmin,
  [
    body('vendorCode').trim().notEmpty().withMessage('vendorCode is required').isLength({ max: 50 }).withMessage('vendorCode max 50 characters'),
    body('vendorName').trim().notEmpty().withMessage('vendorName is required').isLength({ max: 200 }).withMessage('vendorName max 200 characters'),
    body('contactPerson').optional({ nullable: true }).trim(),
    body('phone').optional({ nullable: true }).trim(),
    body('email').optional({ nullable: true }).trim(),
    body('paymentTerms').optional({ nullable: true }).trim(),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { vendorName, contactPerson, phone, email, paymentTerms, notes } = req.body;
    const vendorCode = req.body.vendorCode.toUpperCase();

    const existing = await prisma.vendor.findFirst({ where: { vendorCode: { equals: vendorCode, mode: 'insensitive' } } });
    if (existing) {
      return res.status(409).json({ error: `Vendor code "${vendorCode}" already exists` });
    }

    const vendor = await prisma.vendor.create({
      data: {
        vendorCode,
        vendorName,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        paymentTerms: paymentTerms || null,
        notes: notes || null,
      },
    });

    return res.status(201).json({ vendor });
  }
);

// ---------------------------------------------------------------------------
// PUT /api/vendors/:id — update vendor (admin only)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireAdmin,
  [
    param('id').isInt({ gt: 0 }).withMessage('id must be a positive integer'),
    body('vendorCode').optional().trim().notEmpty().withMessage('vendorCode cannot be empty').isLength({ max: 50 }).withMessage('vendorCode max 50 characters'),
    body('vendorName').optional().trim().notEmpty().withMessage('vendorName cannot be empty').isLength({ max: 200 }).withMessage('vendorName max 200 characters'),
    body('contactPerson').optional({ nullable: true }).trim(),
    body('phone').optional({ nullable: true }).trim(),
    body('email').optional({ nullable: true }).trim(),
    body('paymentTerms').optional({ nullable: true }).trim(),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.vendor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const { vendorName, contactPerson, phone, email, paymentTerms, notes } = req.body;
    const vendorCode = req.body.vendorCode ? req.body.vendorCode.toUpperCase() : undefined;

    if (vendorCode && vendorCode !== existing.vendorCode) {
      const conflict = await prisma.vendor.findFirst({ where: { vendorCode: { equals: vendorCode, mode: 'insensitive' }, id: { not: id } } });
      if (conflict) {
        return res.status(409).json({ error: `Vendor code "${vendorCode}" already exists` });
      }
    }

    const data = {};
    if (vendorCode !== undefined) data.vendorCode = vendorCode;
    if (vendorName !== undefined) data.vendorName = vendorName;
    if (contactPerson !== undefined) data.contactPerson = contactPerson || null;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (paymentTerms !== undefined) data.paymentTerms = paymentTerms || null;
    if (notes !== undefined) data.notes = notes || null;

    const updated = await prisma.vendor.update({ where: { id }, data });
    return res.json({ vendor: updated });
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/vendors/:id/status — toggle isActive (admin only)
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
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const existing = await prisma.vendor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: { isActive: req.body.isActive },
    });

    return res.json({ vendor: updated });
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/vendors/:id — hard delete vendor with no references (admin only)
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
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Check for transaction references
    const txCount = await prisma.transaction.count({ where: { vendorId: id } });
    if (txCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${vendor.vendorCode}" — it is referenced in ${txCount} transaction(s). Deactivate it instead.`,
      });
    }

    // Check for items where this vendor is the default
    const defaultItemCount = await prisma.item.count({ where: { defaultVendorId: id } });
    if (defaultItemCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${vendor.vendorCode}" — it is the default vendor for ${defaultItemCount} item(s). Remove those references first.`,
      });
    }

    // Check for additional vendor references
    const itemVendorCount = await prisma.itemVendor.count({ where: { vendorId: id } });
    if (itemVendorCount > 0) {
      return res.status(400).json({
        error: `Cannot delete "${vendor.vendorCode}" — it is an additional vendor for ${itemVendorCount} item(s). Remove those references first.`,
      });
    }

    // Safe to delete
    await prisma.vendor.delete({ where: { id } });

    return res.json({ message: `Vendor "${vendor.vendorCode}" permanently deleted.` });
  }
);

module.exports = router;
