const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { allowsDecimals } = require('../lib/uom');

const router = express.Router();
router.use(authenticate);
// Note: GET routes are open to all authenticated users (needed for kitting page).
// Write operations (POST, PUT, PATCH) are admin-only via per-route requireAdmin.

const ITEM_SELECT = { id: true, itemCode: true, description: true, unitOfMeasure: true, allowDecimalQty: true, stockLength: true };

function serializeBomLine(line) {
  return {
    ...line,
    quantityPer: line.quantityPer?.toNumber?.() ?? Number(line.quantityPer),
    scrapPercent: line.scrapPercent?.toNumber?.() ?? (line.scrapPercent != null ? Number(line.scrapPercent) : null),
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
      select: { id: true, itemCode: true, unitOfMeasure: true, allowDecimalQty: true },
    });
    if (components.length !== uniqueIds.size) {
      return res.status(400).json({ error: 'One or more component items not found or inactive' });
    }

    // UOM integer validation — whole-unit UOMs cannot have decimal quantityPer
    const componentMap = new Map(components.map((c) => [c.id, c]));
    for (const l of lines) {
      const comp = componentMap.get(l.itemId);
      const qty = parseFloat(l.quantityPer);
      if (comp && !allowsDecimals(comp.unitOfMeasure) && !comp.allowDecimalQty && !Number.isInteger(qty)) {
        return res.status(400).json({
          error: `${comp.itemCode} is measured in ${comp.unitOfMeasure} — quantity must be a whole number.`,
        });
      }
      // scrapPercent range validation
      if (l.scrapPercent != null) {
        const sp = parseFloat(l.scrapPercent);
        if (sp < 0 || sp > 100) {
          return res.status(400).json({
            error: `scrapPercent must be between 0 and 100 (got ${sp} for ${comp?.itemCode ?? 'unknown'}).`,
          });
        }
      }
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
            scrapPercent: l.scrapPercent != null ? parseFloat(l.scrapPercent) : null,
            cutDetails: l.cutDetails ?? null,
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
        select: { id: true, itemCode: true, unitOfMeasure: true, allowDecimalQty: true },
      });
      if (components.length !== uniqueIds.size) {
        return res.status(400).json({ error: 'One or more component items not found or inactive' });
      }

      // UOM integer validation — whole-unit UOMs cannot have decimal quantityPer
      const componentMap = new Map(components.map((c) => [c.id, c]));
      for (const l of lines) {
        const comp = componentMap.get(l.itemId);
        const qty = parseFloat(l.quantityPer);
        if (comp && !allowsDecimals(comp.unitOfMeasure) && !comp.allowDecimalQty && !Number.isInteger(qty)) {
          return res.status(400).json({
            error: `${comp.itemCode} is measured in ${comp.unitOfMeasure} — quantity must be a whole number.`,
          });
        }
        // scrapPercent range validation
        if (l.scrapPercent != null) {
          const sp = parseFloat(l.scrapPercent);
          if (sp < 0 || sp > 100) {
            return res.status(400).json({
              error: `scrapPercent must be between 0 and 100 (got ${sp} for ${comp?.itemCode ?? 'unknown'}).`,
            });
          }
        }
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
            scrapPercent: l.scrapPercent != null ? parseFloat(l.scrapPercent) : null,
            cutDetails: l.cutDetails ?? null,
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

    // Validate option packages when activating
    const warnings = [];
    if (newStatus === 'ACTIVE') {
      const optionGroups = await prisma.optionGroup.findMany({
        where: { bomId: id },
        include: {
          packages: {
            select: { id: true, name: true, status: true },
          },
        },
      });

      for (const group of optionGroups) {
        const activePackages = group.packages.filter((p) => p.status === 'ACTIVE');

        // Required groups must have >= 1 ACTIVE package
        if (group.required && activePackages.length === 0) {
          return res.status(400).json({
            error: `Required option group "${group.name}" has no ACTIVE packages. Activate at least one package before activating this BOM.`,
          });
        }

        // Warn (don't block) if optional group has 0 active packages
        if (!group.required && group.packages.length > 0 && activePackages.length === 0) {
          warnings.push(`Optional group "${group.name}" has no ACTIVE packages`);
        }
      }

      // Validate REMOVE lines in all ACTIVE packages against base BOM
      const baseBomLines = await prisma.bomLine.findMany({
        where: { bomId: id },
        select: { itemId: true, quantityPer: true },
      });
      const baseMap = new Map(baseBomLines.map((l) => [l.itemId, Number(l.quantityPer)]));

      const activePackageIds = optionGroups
        .flatMap((g) => g.packages)
        .filter((p) => p.status === 'ACTIVE')
        .map((p) => p.id);

      if (activePackageIds.length > 0) {
        const removeLines = await prisma.optionLine.findMany({
          where: { optionPackageId: { in: activePackageIds }, action: 'REMOVE' },
          include: { item: { select: { itemCode: true } }, optionPackage: { select: { name: true } } },
        });

        for (const rl of removeLines) {
          const baseQty = baseMap.get(rl.itemId);
          if (baseQty === undefined) {
            return res.status(400).json({
              error: `Package "${rl.optionPackage.name}" has a REMOVE line for "${rl.item.itemCode}" which is not in the base BOM`,
            });
          }
          if (Number(rl.quantityPer) > baseQty) {
            return res.status(400).json({
              error: `Package "${rl.optionPackage.name}" removes ${Number(rl.quantityPer)} of "${rl.item.itemCode}" but base BOM only has ${baseQty}`,
            });
          }
        }
      }
    }

    // Only one ACTIVE BOM per finished good — auto-retire the current active one
    let retiredBom = null;
    if (newStatus === 'ACTIVE') {
      const previousActive = await prisma.bom.findFirst({
        where: {
          finishedGoodId: bom.finishedGoodId,
          status: 'ACTIVE',
          id: { not: id },
        },
        select: { id: true, bomCode: true, version: true },
      });

      if (previousActive) {
        await prisma.bom.update({
          where: { id: previousActive.id },
          data: { status: 'RETIRED' },
        });
        retiredBom = previousActive;
      }
    }

    await prisma.bom.update({
      where: { id },
      data: { status: newStatus },
    });

    const response = { message: `BOM status changed to ${newStatus}`, status: newStatus };
    if (warnings.length > 0) response.warnings = warnings;
    if (retiredBom) response.retiredBom = retiredBom;
    return res.json(response);
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
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        optionGroups: {
          orderBy: { sortOrder: 'asc' },
          include: {
            packages: {
              orderBy: { sortOrder: 'asc' },
              include: { lines: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
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

    const duplicate = await prisma.$transaction(async (tx) => {
      // Create BOM + lines
      const newBom = await tx.bom.create({
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
              scrapPercent: l.scrapPercent,
              cutDetails: l.cutDetails ?? undefined,
              notes: l.notes,
              sortOrder: l.sortOrder,
            })),
          },
        },
      });

      // Copy option groups → packages (reset to DRAFT) → lines
      for (const sg of source.optionGroups) {
        const newGroup = await tx.optionGroup.create({
          data: {
            bomId: newBom.id,
            name: sg.name,
            category: sg.category,
            selectionType: sg.selectionType,
            required: sg.required,
            sortOrder: sg.sortOrder,
            createdBy: req.user.id,
          },
        });

        for (const sp of sg.packages) {
          const newPkg = await tx.optionPackage.create({
            data: {
              optionGroupId: newGroup.id,
              name: sp.name,
              isDefault: sp.isDefault,
              status: 'DRAFT',
              allowQuantity: sp.allowQuantity,
              minQuantity: sp.minQuantity,
              maxQuantity: sp.maxQuantity,
              sortOrder: sp.sortOrder,
              notes: sp.notes,
              createdBy: req.user.id,
            },
          });

          if (sp.lines.length > 0) {
            await tx.optionLine.createMany({
              data: sp.lines.map((sl) => ({
                optionPackageId: newPkg.id,
                itemId: sl.itemId,
                action: sl.action,
                quantityPer: sl.quantityPer,
                scrapPercent: sl.scrapPercent,
                cutDetails: sl.cutDetails ?? undefined,
                sortOrder: sl.sortOrder,
                notes: sl.notes,
              })),
            });
          }
        }
      }

      // Re-fetch with includes
      return tx.bom.findUnique({
        where: { id: newBom.id },
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

    return res.status(201).json({
      bom: { ...duplicate, lines: duplicate.lines.map(serializeBomLine) },
    });
  }
);

// DELETE /api/boms/:id — soft-guard: only DRAFT, no production orders
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: { _count: { select: { productionOrders: true } } },
    });

    if (!bom) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    if (bom.status !== 'DRAFT') {
      return res
        .status(400)
        .json({ error: 'Only DRAFT BOMs can be deleted. Retire the BOM instead.' });
    }

    if (bom._count.productionOrders > 0) {
      return res
        .status(400)
        .json({ error: 'Cannot delete BOM with existing production orders.' });
    }

    // Cascade handles BomLine and OptionGroup → OptionPackage → OptionLine
    await prisma.bom.delete({ where: { id } });

    return res.json({ message: 'BOM deleted' });
  }
);

module.exports = router;
