const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
// Note: GET routes are open to all authenticated users (needed for kitting page).
// Write operations (POST, PUT, PATCH) are admin-only via per-route requireAdmin.

const ITEM_SELECT = { id: true, itemCode: true, description: true, unitOfMeasure: true };

function serializeBomLine(line) {
  return {
    ...line,
    quantityPer: line.quantityPer?.toNumber?.() ?? Number(line.quantityPer),
  };
}

// ---------------------------------------------------------------------------
// GET /api/boms — List BOMs
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('status').optional().isIn(['DRAFT', 'ACTIVE', 'RETIRED']),
    query('finishedGoodId').optional().isInt({ gt: 0 }),
    query('search').optional().trim(),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, search, finishedGoodId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const where = {};
    if (status) where.status = status;
    if (finishedGoodId) where.finishedGoodId = parseInt(finishedGoodId);
    if (search) {
      where.OR = [
        { bomCode: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [boms, total] = await Promise.all([
      prisma.bom.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          finishedGood: { select: ITEM_SELECT },
          creator: { select: { fullName: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.bom.count({ where }),
    ]);

    return res.json({
      boms: boms.map((b) => ({
        id: b.id,
        bomCode: b.bomCode,
        name: b.name,
        status: b.status,
        finishedGood: b.finishedGood,
        lineCount: b._count.lines,
        creator: b.creator,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/boms/:id — BOM detail with lines
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  [param('id').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: {
        finishedGood: { select: ITEM_SELECT },
        creator: { select: { fullName: true } },
        lines: {
          include: { item: { select: ITEM_SELECT } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!bom) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    return res.json({
      bom: {
        ...bom,
        lines: bom.lines.map(serializeBomLine),
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/boms — Create BOM with lines (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAdmin,
  [
    body('bomCode').trim().notEmpty().withMessage('bomCode is required').isLength({ max: 50 }),
    body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 200 }),
    body('finishedGoodId').isInt({ gt: 0 }).withMessage('finishedGoodId is required'),
    body('notes').optional({ nullable: true }).trim(),
    body('lines').isArray({ min: 1 }).withMessage('At least one component line is required'),
    body('lines.*.itemId').isInt({ gt: 0 }).withMessage('Each line must have a valid itemId'),
    body('lines.*.quantityPer').isFloat({ gt: 0 }).withMessage('quantityPer must be > 0'),
    body('lines.*.notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bomCode, name, finishedGoodId, notes, lines } = req.body;

    // Check unique bomCode
    const existing = await prisma.bom.findUnique({ where: { bomCode } });
    if (existing) {
      return res.status(409).json({ error: `BOM code "${bomCode}" already exists` });
    }

    // Validate finished good exists and is active
    const finishedGood = await prisma.item.findUnique({ where: { id: finishedGoodId } });
    if (!finishedGood || !finishedGood.isActive) {
      return res.status(400).json({ error: 'Finished good item not found or inactive' });
    }

    // Validate no self-referencing and all components exist
    const componentIds = lines.map((l) => l.itemId);
    if (componentIds.includes(finishedGoodId)) {
      return res.status(400).json({ error: 'Finished good cannot be its own component' });
    }

    // Check for duplicate component items
    const uniqueIds = new Set(componentIds);
    if (uniqueIds.size !== componentIds.length) {
      return res.status(400).json({ error: 'Duplicate component items are not allowed' });
    }

    const components = await prisma.item.findMany({
      where: { id: { in: componentIds }, isActive: true },
      select: { id: true },
    });
    if (components.length !== uniqueIds.size) {
      return res.status(400).json({ error: 'One or more component items not found or inactive' });
    }

    const bom = await prisma.bom.create({
      data: {
        bomCode,
        name,
        finishedGoodId,
        notes: notes || null,
        createdBy: req.user.id,
        lines: {
          create: lines.map((l, idx) => ({
            itemId: l.itemId,
            quantityPer: parseFloat(l.quantityPer),
            notes: l.notes || null,
            sortOrder: idx + 1,
          })),
        },
      },
      include: {
        finishedGood: { select: ITEM_SELECT },
        creator: { select: { fullName: true } },
        lines: {
          include: { item: { select: ITEM_SELECT } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return res.status(201).json({
      bom: { ...bom, lines: bom.lines.map(serializeBomLine) },
    });
  }
);

// ---------------------------------------------------------------------------
// PUT /api/boms/:id — Update BOM (DRAFT only, admin only)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireAdmin,
  [
    param('id').isInt({ gt: 0 }),
    body('bomCode').optional().trim().notEmpty().isLength({ max: 50 }),
    body('name').optional().trim().notEmpty().isLength({ max: 200 }),
    body('finishedGoodId').optional().isInt({ gt: 0 }),
    body('notes').optional({ nullable: true }).trim(),
    body('lines').optional().isArray({ min: 1 }),
    body('lines.*.itemId').optional().isInt({ gt: 0 }),
    body('lines.*.quantityPer').optional().isFloat({ gt: 0 }),
    body('lines.*.notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.bom.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT BOMs can be edited. Duplicate it to make changes.' });
    }

    const { bomCode, name, finishedGoodId, notes, lines } = req.body;
    const targetFinishedGoodId = finishedGoodId || existing.finishedGoodId;

    // Check bomCode uniqueness if changing
    if (bomCode && bomCode !== existing.bomCode) {
      const conflict = await prisma.bom.findUnique({ where: { bomCode } });
      if (conflict) {
        return res.status(409).json({ error: `BOM code "${bomCode}" already exists` });
      }
    }

    // Validate finished good if changing
    if (finishedGoodId && finishedGoodId !== existing.finishedGoodId) {
      const fg = await prisma.item.findUnique({ where: { id: finishedGoodId } });
      if (!fg || !fg.isActive) {
        return res.status(400).json({ error: 'Finished good item not found or inactive' });
      }
    }

    // Validate lines if provided
    if (lines) {
      const componentIds = lines.map((l) => l.itemId);
      if (componentIds.includes(targetFinishedGoodId)) {
        return res.status(400).json({ error: 'Finished good cannot be its own component' });
      }
      const uniqueIds = new Set(componentIds);
      if (uniqueIds.size !== componentIds.length) {
        return res.status(400).json({ error: 'Duplicate component items are not allowed' });
      }
      const components = await prisma.item.findMany({
        where: { id: { in: componentIds }, isActive: true },
        select: { id: true },
      });
      if (components.length !== uniqueIds.size) {
        return res.status(400).json({ error: 'One or more component items not found or inactive' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update header
      const data = {};
      if (bomCode !== undefined) data.bomCode = bomCode;
      if (name !== undefined) data.name = name;
      if (finishedGoodId !== undefined) data.finishedGoodId = finishedGoodId;
      if (notes !== undefined) data.notes = notes || null;

      if (Object.keys(data).length > 0) {
        await tx.bom.update({ where: { id }, data });
      }

      // Replace lines if provided
      if (lines) {
        await tx.bomLine.deleteMany({ where: { bomId: id } });
        await tx.bomLine.createMany({
          data: lines.map((l, idx) => ({
            bomId: id,
            itemId: l.itemId,
            quantityPer: parseFloat(l.quantityPer),
            notes: l.notes || null,
            sortOrder: idx + 1,
          })),
        });
      }

      return tx.bom.findUnique({
        where: { id },
        include: {
          finishedGood: { select: ITEM_SELECT },
          creator: { select: { fullName: true } },
          lines: {
            include: { item: { select: ITEM_SELECT } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    return res.json({
      bom: { ...result, lines: result.lines.map(serializeBomLine) },
    });
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/boms/:id/status — Change BOM status (admin only)
// ---------------------------------------------------------------------------
router.patch(
  '/:id/status',
  requireAdmin,
  [
    param('id').isInt({ gt: 0 }),
    body('status').isIn(['DRAFT', 'ACTIVE', 'RETIRED']).withMessage('status must be DRAFT, ACTIVE, or RETIRED'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: { _count: { select: { lines: true, productionOrders: true } } },
    });

    if (!bom) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    const newStatus = req.body.status;
    const current = bom.status;

    // Validate transitions
    const validTransitions = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['RETIRED'],
      RETIRED: ['ACTIVE'],
    };

    if (!validTransitions[current]?.includes(newStatus)) {
      return res.status(400).json({ error: `Cannot transition from ${current} to ${newStatus}` });
    }

    // Must have lines to activate
    if (newStatus === 'ACTIVE' && bom._count.lines === 0) {
      return res.status(400).json({ error: 'BOM must have at least one component line before activating' });
    }

    // Only one ACTIVE BOM per finished good — auto-retire the current active one
    if (newStatus === 'ACTIVE') {
      await prisma.bom.updateMany({
        where: {
          finishedGoodId: bom.finishedGoodId,
          status: 'ACTIVE',
          id: { not: id },
        },
        data: { status: 'RETIRED' },
      });
    }

    await prisma.bom.update({
      where: { id },
      data: { status: newStatus },
    });

    return res.json({ message: `BOM status changed to ${newStatus}`, status: newStatus });
  }
);

// ---------------------------------------------------------------------------
// POST /api/boms/:id/duplicate — Clone a BOM (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/:id/duplicate',
  requireAdmin,
  [param('id').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const source = await prisma.bom.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!source) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    // Generate unique code with -COPY suffix
    let newCode = `${source.bomCode}-COPY`;
    let attempt = 0;
    while (await prisma.bom.findUnique({ where: { bomCode: newCode } })) {
      attempt++;
      newCode = `${source.bomCode}-COPY${attempt}`;
    }

    const duplicate = await prisma.bom.create({
      data: {
        bomCode: newCode,
        name: `${source.name} (Copy)`,
        finishedGoodId: source.finishedGoodId,
        status: 'DRAFT',
        notes: source.notes,
        createdBy: req.user.id,
        lines: {
          create: source.lines.map((l) => ({
            itemId: l.itemId,
            quantityPer: l.quantityPer,
            notes: l.notes,
            sortOrder: l.sortOrder,
          })),
        },
      },
      include: {
        finishedGood: { select: ITEM_SELECT },
        creator: { select: { fullName: true } },
        lines: {
          include: { item: { select: ITEM_SELECT } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return res.status(201).json({
      bom: { ...duplicate, lines: duplicate.lines.map(serializeBomLine) },
    });
  }
);

module.exports = router;
