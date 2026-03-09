const express = require('express');
const { body, param, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { allowsDecimals } = require('../lib/uom');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

// Shared select for item details on option lines
const ITEM_SELECT = {
  id: true, itemCode: true, description: true,
  unitOfMeasure: true, allowDecimalQty: true, stockLength: true,
};

function serializeOptionLine(line) {
  return {
    ...line,
    quantityPer: line.quantityPer?.toNumber?.() ?? Number(line.quantityPer),
    scrapPercent: line.scrapPercent?.toNumber?.() ?? (line.scrapPercent != null ? Number(line.scrapPercent) : null),
  };
}

function serializePackage(pkg) {
  return {
    ...pkg,
    lines: pkg.lines ? pkg.lines.map(serializeOptionLine) : [],
  };
}

function serializeGroup(group) {
  return {
    ...group,
    packages: group.packages ? group.packages.map(serializePackage) : [],
  };
}

// Helper: load BOM and verify it exists, optionally check status
async function loadBom(req, res, { allowedStatuses } = {}) {
  const bomId = parseInt(req.params.bomId);
  if (isNaN(bomId)) {
    res.status(400).json({ error: 'Invalid BOM ID' });
    return null;
  }
  const bom = await prisma.bom.findUnique({ where: { id: bomId } });
  if (!bom) {
    res.status(404).json({ error: 'BOM not found' });
    return null;
  }
  if (allowedStatuses && !allowedStatuses.includes(bom.status)) {
    res.status(400).json({ error: `This operation is not allowed on ${bom.status} BOMs` });
    return null;
  }
  return bom;
}

// ---------------------------------------------------------------------------
// GET /:bomId/options — List all groups + packages + lines
// ---------------------------------------------------------------------------
router.get(
  '/:bomId/options',
  [param('bomId').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    const groups = await prisma.optionGroup.findMany({
      where: { bomId: bom.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        creator: { select: { fullName: true } },
        packages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lines: {
              orderBy: { sortOrder: 'asc' },
              include: { item: { select: ITEM_SELECT } },
            },
            creator: { select: { fullName: true } },
          },
        },
      },
    });

    return res.json({ groups: groups.map(serializeGroup) });
  }
);

// ---------------------------------------------------------------------------
// POST /:bomId/options/groups — Create option group (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/:bomId/options/groups',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 100 }),
    body('category').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('selectionType').isIn(['PICK_ONE', 'PICK_MANY']).withMessage('selectionType must be PICK_ONE or PICK_MANY'),
    body('required').optional().isBoolean(),
    body('sortOrder').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res, { allowedStatuses: ['DRAFT', 'ACTIVE'] });
    if (!bom) return;

    const { name, category, selectionType, required, sortOrder } = req.body;

    // Check unique name within BOM
    const existing = await prisma.optionGroup.findUnique({
      where: { bomId_name: { bomId: bom.id, name } },
    });
    if (existing) {
      return res.status(409).json({ error: `Option group "${name}" already exists on this BOM` });
    }

    const group = await prisma.optionGroup.create({
      data: {
        bomId: bom.id,
        name,
        category: category || null,
        selectionType,
        required: required ?? false,
        sortOrder: sortOrder ?? 0,
        createdBy: req.user.id,
      },
      include: {
        creator: { select: { fullName: true } },
        packages: true,
      },
    });

    return res.status(201).json({ group: serializeGroup(group) });
  }
);

// ---------------------------------------------------------------------------
// PUT /:bomId/options/groups/:groupId — Update option group (DRAFT BOM only)
// ---------------------------------------------------------------------------
router.put(
  '/:bomId/options/groups/:groupId',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    param('groupId').isInt({ gt: 0 }),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('category').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('selectionType').optional().isIn(['PICK_ONE', 'PICK_MANY']),
    body('required').optional().isBoolean(),
    body('sortOrder').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res, { allowedStatuses: ['DRAFT'] });
    if (!bom) return;

    const groupId = parseInt(req.params.groupId);
    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId, bomId: bom.id },
    });
    if (!group) {
      return res.status(404).json({ error: 'Option group not found' });
    }

    const { name, category, selectionType, required, sortOrder } = req.body;

    // Check unique name if changing
    if (name && name !== group.name) {
      const conflict = await prisma.optionGroup.findUnique({
        where: { bomId_name: { bomId: bom.id, name } },
      });
      if (conflict) {
        return res.status(409).json({ error: `Option group "${name}" already exists on this BOM` });
      }
    }

    // If changing to PICK_MANY, clear any isDefault flags (isDefault is only for PICK_ONE)
    if (selectionType === 'PICK_MANY' && group.selectionType === 'PICK_ONE') {
      await prisma.optionPackage.updateMany({
        where: { optionGroupId: groupId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.optionGroup.update({
      where: { id: groupId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category: category || null }),
        ...(selectionType !== undefined && { selectionType }),
        ...(required !== undefined && { required }),
        ...(sortOrder !== undefined && { sortOrder }),
        updatedBy: req.user.id,
      },
      include: {
        creator: { select: { fullName: true } },
        packages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lines: {
              orderBy: { sortOrder: 'asc' },
              include: { item: { select: ITEM_SELECT } },
            },
          },
        },
      },
    });

    return res.json({ group: serializeGroup(updated) });
  }
);

// ---------------------------------------------------------------------------
// DELETE /:bomId/options/groups/:groupId — Delete group + cascade (DRAFT only)
// ---------------------------------------------------------------------------
router.delete(
  '/:bomId/options/groups/:groupId',
  requireAdmin,
  [param('bomId').isInt({ gt: 0 }), param('groupId').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res, { allowedStatuses: ['DRAFT'] });
    if (!bom) return;

    const groupId = parseInt(req.params.groupId);
    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId, bomId: bom.id },
    });
    if (!group) {
      return res.status(404).json({ error: 'Option group not found' });
    }

    await prisma.optionGroup.delete({ where: { id: groupId } });
    return res.json({ message: 'Option group deleted' });
  }
);

// ---------------------------------------------------------------------------
// POST /:bomId/options/packages — Create package (DRAFT or ACTIVE BOM)
// ---------------------------------------------------------------------------
router.post(
  '/:bomId/options/packages',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    body('optionGroupId').isInt({ gt: 0 }).withMessage('optionGroupId is required'),
    body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 100 }),
    body('isDefault').optional().isBoolean(),
    body('allowQuantity').optional().isBoolean(),
    body('minQuantity').optional().isInt({ min: 1 }),
    body('maxQuantity').optional({ nullable: true }).isInt({ min: 1 }),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res, { allowedStatuses: ['DRAFT', 'ACTIVE'] });
    if (!bom) return;

    const { optionGroupId, name, isDefault, allowQuantity, minQuantity, maxQuantity, sortOrder, notes } = req.body;

    // Verify group belongs to this BOM
    const group = await prisma.optionGroup.findFirst({
      where: { id: optionGroupId, bomId: bom.id },
    });
    if (!group) {
      return res.status(404).json({ error: 'Option group not found on this BOM' });
    }

    // Check unique name within group
    const existing = await prisma.optionPackage.findUnique({
      where: { optionGroupId_name: { optionGroupId, name } },
    });
    if (existing) {
      return res.status(409).json({ error: `Package "${name}" already exists in this group` });
    }

    // Validate minQuantity <= maxQuantity
    const effectiveMin = minQuantity ?? 1;
    const effectiveMax = maxQuantity ?? null;
    if (effectiveMax != null && effectiveMin > effectiveMax) {
      return res.status(400).json({
        error: `minQuantity (${effectiveMin}) cannot be greater than maxQuantity (${effectiveMax}).`,
      });
    }

    // isDefault is only meaningful for PICK_ONE groups
    if (isDefault && group.selectionType === 'PICK_MANY') {
      return res.status(400).json({
        error: 'isDefault is not supported for PICK_MANY groups. Use PICK_ONE if a default selection is needed.',
      });
    }

    // PICK_ONE: only one default per group
    if (isDefault && group.selectionType === 'PICK_ONE') {
      const existingDefault = await prisma.optionPackage.findFirst({
        where: { optionGroupId, isDefault: true },
      });
      if (existingDefault) {
        return res.status(400).json({
          error: `Group "${group.name}" already has a default package ("${existingDefault.name}"). Remove the existing default first.`,
        });
      }
    }

    const pkg = await prisma.optionPackage.create({
      data: {
        optionGroupId,
        name,
        isDefault: isDefault ?? false,
        status: 'DRAFT',
        allowQuantity: allowQuantity ?? false,
        minQuantity: minQuantity ?? 1,
        maxQuantity: maxQuantity ?? null,
        sortOrder: sortOrder ?? 0,
        notes: notes || null,
        createdBy: req.user.id,
      },
      include: {
        lines: { orderBy: { sortOrder: 'asc' }, include: { item: { select: ITEM_SELECT } } },
        creator: { select: { fullName: true } },
      },
    });

    return res.status(201).json({ package: serializePackage(pkg) });
  }
);

// ---------------------------------------------------------------------------
// PUT /:bomId/options/packages/:packageId — Update package (DRAFT pkgs only)
// ---------------------------------------------------------------------------
router.put(
  '/:bomId/options/packages/:packageId',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    param('packageId').isInt({ gt: 0 }),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('isDefault').optional().isBoolean(),
    body('allowQuantity').optional().isBoolean(),
    body('minQuantity').optional().isInt({ min: 1 }),
    body('maxQuantity').optional({ nullable: true }).isInt({ min: 1 }),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    const packageId = parseInt(req.params.packageId);
    const pkg = await prisma.optionPackage.findFirst({
      where: { id: packageId, optionGroup: { bomId: bom.id } },
      include: { optionGroup: true },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Option package not found' });
    }
    if (pkg.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT packages can be edited' });
    }

    const { name, isDefault, allowQuantity, minQuantity, maxQuantity, sortOrder, notes } = req.body;

    // Check unique name if changing
    if (name && name !== pkg.name) {
      const conflict = await prisma.optionPackage.findUnique({
        where: { optionGroupId_name: { optionGroupId: pkg.optionGroupId, name } },
      });
      if (conflict) {
        return res.status(409).json({ error: `Package "${name}" already exists in this group` });
      }
    }

    // Validate minQuantity <= maxQuantity
    const effectiveMin = minQuantity ?? pkg.minQuantity;
    const effectiveMax = maxQuantity !== undefined ? (maxQuantity ?? null) : pkg.maxQuantity;
    if (effectiveMax != null && effectiveMin > effectiveMax) {
      return res.status(400).json({
        error: `minQuantity (${effectiveMin}) cannot be greater than maxQuantity (${effectiveMax}).`,
      });
    }

    // isDefault is only meaningful for PICK_ONE groups
    if (isDefault && pkg.optionGroup.selectionType === 'PICK_MANY') {
      return res.status(400).json({
        error: 'isDefault is not supported for PICK_MANY groups. Use PICK_ONE if a default selection is needed.',
      });
    }

    // PICK_ONE default check
    if (isDefault && pkg.optionGroup.selectionType === 'PICK_ONE') {
      const existingDefault = await prisma.optionPackage.findFirst({
        where: { optionGroupId: pkg.optionGroupId, isDefault: true, id: { not: packageId } },
      });
      if (existingDefault) {
        return res.status(400).json({
          error: `Group already has a default package ("${existingDefault.name}"). Remove the existing default first.`,
        });
      }
    }

    const updated = await prisma.optionPackage.update({
      where: { id: packageId },
      data: {
        ...(name !== undefined && { name }),
        ...(isDefault !== undefined && { isDefault }),
        ...(allowQuantity !== undefined && { allowQuantity }),
        ...(minQuantity !== undefined && { minQuantity }),
        ...(maxQuantity !== undefined && { maxQuantity: maxQuantity ?? null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(notes !== undefined && { notes: notes || null }),
        updatedBy: req.user.id,
      },
      include: {
        lines: { orderBy: { sortOrder: 'asc' }, include: { item: { select: ITEM_SELECT } } },
        creator: { select: { fullName: true } },
      },
    });

    return res.json({ package: serializePackage(updated) });
  }
);

// ---------------------------------------------------------------------------
// DELETE /:bomId/options/packages/:packageId — Delete package (DRAFT only)
// ---------------------------------------------------------------------------
router.delete(
  '/:bomId/options/packages/:packageId',
  requireAdmin,
  [param('bomId').isInt({ gt: 0 }), param('packageId').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    const packageId = parseInt(req.params.packageId);
    const pkg = await prisma.optionPackage.findFirst({
      where: { id: packageId, optionGroup: { bomId: bom.id } },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Option package not found' });
    }
    if (pkg.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT packages can be deleted' });
    }

    await prisma.optionPackage.delete({ where: { id: packageId } });
    return res.json({ message: 'Option package deleted' });
  }
);

// ---------------------------------------------------------------------------
// PATCH /:bomId/options/packages/:packageId/status — Status transitions
// ---------------------------------------------------------------------------
router.patch(
  '/:bomId/options/packages/:packageId/status',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    param('packageId').isInt({ gt: 0 }),
    body('status').isIn(['DRAFT', 'ACTIVE', 'RETIRED']).withMessage('status must be DRAFT, ACTIVE, or RETIRED'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    if (bom.status === 'RETIRED') {
      return res.status(400).json({ error: 'Cannot modify packages on a RETIRED BOM' });
    }

    const packageId = parseInt(req.params.packageId);
    const pkg = await prisma.optionPackage.findFirst({
      where: { id: packageId, optionGroup: { bomId: bom.id } },
      include: {
        optionGroup: true,
        _count: { select: { lines: true } },
      },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Option package not found' });
    }

    const newStatus = req.body.status;
    const current = pkg.status;

    const validTransitions = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['RETIRED'],
      RETIRED: ['ACTIVE'],
    };

    if (!validTransitions[current]?.includes(newStatus)) {
      return res.status(400).json({ error: `Cannot transition from ${current} to ${newStatus}` });
    }

    // Activation validation
    if (newStatus === 'ACTIVE') {
      // Must have at least 1 line (unless it's a default package — defaults represent "no change" / base config)
      if (pkg._count.lines === 0 && !pkg.isDefault) {
        return res.status(400).json({ error: 'Package must have at least one line before activating (default packages may be empty)' });
      }

      // Validate all line items are active
      const allLines = await prisma.optionLine.findMany({
        where: { optionPackageId: packageId },
        include: { item: { select: { itemCode: true, isActive: true } } },
      });

      const inactiveItems = allLines.filter(l => !l.item.isActive);
      if (inactiveItems.length > 0) {
        const names = inactiveItems.map(l => `"${l.item.itemCode}"`).join(', ');
        return res.status(400).json({
          error: `Cannot activate: ${inactiveItems.length === 1 ? 'item' : 'items'} ${names} ${inactiveItems.length === 1 ? 'is' : 'are'} inactive`,
        });
      }

      // Validate REMOVE lines against base BOM
      const removeLines = allLines.filter(l => l.action === 'REMOVE');

      if (removeLines.length > 0) {
        const baseBomLines = await prisma.bomLine.findMany({
          where: { bomId: bom.id },
          select: { itemId: true, quantityPer: true },
        });
        const baseMap = new Map(baseBomLines.map((l) => [l.itemId, Number(l.quantityPer)]));

        for (const rl of removeLines) {
          const baseQty = baseMap.get(rl.itemId);
          if (baseQty === undefined) {
            return res.status(400).json({
              error: `REMOVE line for "${rl.item.itemCode}" — item not found in base BOM`,
            });
          }
          if (Number(rl.quantityPer) > baseQty) {
            return res.status(400).json({
              error: `REMOVE line for "${rl.item.itemCode}" exceeds base BOM quantity (${Number(rl.quantityPer)} > ${baseQty})`,
            });
          }
        }
      }
    }

    // Retirement warning: check if this is the last ACTIVE package in a required group
    let warning = null;
    if (newStatus === 'RETIRED' && pkg.optionGroup.required) {
      const activeCount = await prisma.optionPackage.count({
        where: { optionGroupId: pkg.optionGroupId, status: 'ACTIVE', id: { not: packageId } },
      });
      if (activeCount === 0) {
        warning = `Warning: "${pkg.name}" is the only active package in the required group "${pkg.optionGroup.name}." Retiring it will prevent kitting until another package is activated.`;
      }
    }

    const updated = await prisma.optionPackage.update({
      where: { id: packageId },
      data: { status: newStatus, updatedBy: req.user.id },
      select: { id: true, name: true, status: true, isDefault: true, optionGroup: { select: { id: true, name: true } } },
    });

    const response = { message: `Package status changed to ${newStatus}`, status: newStatus, package: updated };
    if (warning) response.warning = warning;
    return res.json(response);
  }
);

// ---------------------------------------------------------------------------
// POST /:bomId/options/packages/:packageId/lines — Add line to package
// ---------------------------------------------------------------------------
router.post(
  '/:bomId/options/packages/:packageId/lines',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    param('packageId').isInt({ gt: 0 }),
    body('itemId').isInt({ gt: 0 }).withMessage('itemId is required'),
    body('action').isIn(['ADD', 'REMOVE']).withMessage('action must be ADD or REMOVE'),
    body('quantityPer').isFloat({ gt: 0 }).withMessage('quantityPer must be > 0'),
    body('scrapPercent').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('cutDetails').optional({ nullable: true }),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    const packageId = parseInt(req.params.packageId);
    const pkg = await prisma.optionPackage.findFirst({
      where: { id: packageId, optionGroup: { bomId: bom.id } },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Option package not found' });
    }
    if (pkg.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only add lines to DRAFT packages' });
    }

    const { itemId, action, quantityPer, scrapPercent, cutDetails, sortOrder, notes } = req.body;

    // Validate item exists and is active
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, itemCode: true, unitOfMeasure: true, allowDecimalQty: true, isActive: true },
    });
    if (!item || !item.isActive) {
      return res.status(400).json({ error: 'Item not found or inactive' });
    }

    // UOM integer validation
    const qty = parseFloat(quantityPer);
    if (!allowsDecimals(item.unitOfMeasure) && !item.allowDecimalQty && !Number.isInteger(qty)) {
      return res.status(400).json({
        error: `${item.itemCode} is measured in ${item.unitOfMeasure} — quantity must be a whole number.`,
      });
    }

    // REMOVE validation: item must exist in base BOM with sufficient qty
    if (action === 'REMOVE') {
      const baseLine = await prisma.bomLine.findFirst({
        where: { bomId: bom.id, itemId },
      });
      if (!baseLine) {
        return res.status(400).json({ error: `Cannot REMOVE "${item.itemCode}" — not found in base BOM` });
      }
      if (qty > Number(baseLine.quantityPer)) {
        return res.status(400).json({
          error: `Cannot REMOVE ${qty} of "${item.itemCode}" — base BOM only has ${Number(baseLine.quantityPer)}`,
        });
      }
    }

    // Check duplicate (itemId + action) per package
    const dupCheck = await prisma.optionLine.findUnique({
      where: { optionPackageId_itemId_action: { optionPackageId: packageId, itemId, action } },
    });
    if (dupCheck) {
      return res.status(409).json({ error: `A ${action} line for this item already exists in this package` });
    }

    // Orphaned cut data cleanup: if item doesn't support decimals, nullify scrap/cut
    const effectiveScrap = item.allowDecimalQty ? (scrapPercent ?? null) : null;
    const effectiveCut = item.allowDecimalQty ? (cutDetails ?? null) : null;

    const line = await prisma.optionLine.create({
      data: {
        optionPackageId: packageId,
        itemId,
        action,
        quantityPer: qty,
        scrapPercent: effectiveScrap != null ? parseFloat(effectiveScrap) : null,
        cutDetails: effectiveCut,
        sortOrder: sortOrder ?? 0,
        notes: notes || null,
      },
      include: { item: { select: ITEM_SELECT } },
    });

    return res.status(201).json({ line: serializeOptionLine(line) });
  }
);

// ---------------------------------------------------------------------------
// PUT /:bomId/options/packages/:packageId/lines/:lineId — Update line
// ---------------------------------------------------------------------------
router.put(
  '/:bomId/options/packages/:packageId/lines/:lineId',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    param('packageId').isInt({ gt: 0 }),
    param('lineId').isInt({ gt: 0 }),
    body('itemId').optional().isInt({ gt: 0 }),
    body('action').optional().isIn(['ADD', 'REMOVE']),
    body('quantityPer').optional().isFloat({ gt: 0 }),
    body('scrapPercent').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('cutDetails').optional({ nullable: true }),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    const packageId = parseInt(req.params.packageId);
    const lineId = parseInt(req.params.lineId);

    const pkg = await prisma.optionPackage.findFirst({
      where: { id: packageId, optionGroup: { bomId: bom.id } },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Option package not found' });
    }
    if (pkg.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only edit lines on DRAFT packages' });
    }

    const existingLine = await prisma.optionLine.findFirst({
      where: { id: lineId, optionPackageId: packageId },
    });
    if (!existingLine) {
      return res.status(404).json({ error: 'Option line not found' });
    }

    const { itemId, action, quantityPer, scrapPercent, cutDetails, sortOrder, notes } = req.body;
    const targetItemId = itemId ?? existingLine.itemId;
    const targetAction = action ?? existingLine.action;
    const targetQty = quantityPer != null ? parseFloat(quantityPer) : Number(existingLine.quantityPer);

    // Load item for validation
    const item = await prisma.item.findUnique({
      where: { id: targetItemId },
      select: { id: true, itemCode: true, unitOfMeasure: true, allowDecimalQty: true, isActive: true },
    });
    if (!item || !item.isActive) {
      return res.status(400).json({ error: 'Item not found or inactive' });
    }

    // UOM integer validation
    if (!allowsDecimals(item.unitOfMeasure) && !item.allowDecimalQty && !Number.isInteger(targetQty)) {
      return res.status(400).json({
        error: `${item.itemCode} is measured in ${item.unitOfMeasure} — quantity must be a whole number.`,
      });
    }

    // REMOVE validation
    if (targetAction === 'REMOVE') {
      const baseLine = await prisma.bomLine.findFirst({
        where: { bomId: bom.id, itemId: targetItemId },
      });
      if (!baseLine) {
        return res.status(400).json({ error: `Cannot REMOVE "${item.itemCode}" — not found in base BOM` });
      }
      if (targetQty > Number(baseLine.quantityPer)) {
        return res.status(400).json({
          error: `Cannot REMOVE ${targetQty} of "${item.itemCode}" — base BOM only has ${Number(baseLine.quantityPer)}`,
        });
      }
    }

    // Duplicate check if item or action changed
    if (targetItemId !== existingLine.itemId || targetAction !== existingLine.action) {
      const dupCheck = await prisma.optionLine.findUnique({
        where: { optionPackageId_itemId_action: { optionPackageId: packageId, itemId: targetItemId, action: targetAction } },
      });
      if (dupCheck && dupCheck.id !== lineId) {
        return res.status(409).json({ error: `A ${targetAction} line for this item already exists in this package` });
      }
    }

    // Orphaned cut data cleanup
    const effectiveScrap = item.allowDecimalQty ? (scrapPercent !== undefined ? scrapPercent : undefined) : null;
    const effectiveCut = item.allowDecimalQty ? (cutDetails !== undefined ? cutDetails : undefined) : null;

    const updated = await prisma.optionLine.update({
      where: { id: lineId },
      data: {
        ...(itemId !== undefined && { itemId }),
        ...(action !== undefined && { action }),
        ...(quantityPer !== undefined && { quantityPer: targetQty }),
        ...(effectiveScrap !== undefined && { scrapPercent: effectiveScrap != null ? parseFloat(effectiveScrap) : null }),
        ...(effectiveCut !== undefined && { cutDetails: effectiveCut }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      include: { item: { select: ITEM_SELECT } },
    });

    return res.json({ line: serializeOptionLine(updated) });
  }
);

// ---------------------------------------------------------------------------
// DELETE /:bomId/options/packages/:packageId/lines/:lineId — Delete line
// ---------------------------------------------------------------------------
router.delete(
  '/:bomId/options/packages/:packageId/lines/:lineId',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    param('packageId').isInt({ gt: 0 }),
    param('lineId').isInt({ gt: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res);
    if (!bom) return;

    const packageId = parseInt(req.params.packageId);
    const pkg = await prisma.optionPackage.findFirst({
      where: { id: packageId, optionGroup: { bomId: bom.id } },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Option package not found' });
    }
    if (pkg.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only delete lines from DRAFT packages' });
    }

    const lineId = parseInt(req.params.lineId);
    const line = await prisma.optionLine.findFirst({
      where: { id: lineId, optionPackageId: packageId },
    });
    if (!line) {
      return res.status(404).json({ error: 'Option line not found' });
    }

    await prisma.optionLine.delete({ where: { id: lineId } });
    return res.json({ message: 'Option line deleted' });
  }
);

// ---------------------------------------------------------------------------
// POST /:bomId/options/import — Copy options from source BOM
// ---------------------------------------------------------------------------
router.post(
  '/:bomId/options/import',
  requireAdmin,
  [
    param('bomId').isInt({ gt: 0 }),
    body('sourceBomId').isInt({ gt: 0 }).withMessage('sourceBomId is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res, { allowedStatuses: ['DRAFT'] });
    if (!bom) return;

    // Target must have zero option groups
    const existingGroups = await prisma.optionGroup.count({ where: { bomId: bom.id } });
    if (existingGroups > 0) {
      return res.status(400).json({ error: 'Target BOM already has option groups. Import is only allowed on BOMs with no existing groups.' });
    }

    const sourceBomId = parseInt(req.body.sourceBomId);
    if (sourceBomId === bom.id) {
      return res.status(400).json({ error: 'Cannot import from the same BOM' });
    }

    // Verify source BOM exists
    const sourceBom = await prisma.bom.findUnique({ where: { id: sourceBomId } });
    if (!sourceBom) {
      return res.status(404).json({ error: 'Source BOM not found' });
    }

    // Load source groups + packages + lines
    const sourceGroups = await prisma.optionGroup.findMany({
      where: { bomId: sourceBomId },
      orderBy: { sortOrder: 'asc' },
      include: {
        packages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (sourceGroups.length === 0) {
      return res.status(400).json({ error: 'Source BOM has no option groups to import' });
    }

    // Load target base BOM items for flagging REMOVE lines
    const targetBaseItems = await prisma.bomLine.findMany({
      where: { bomId: bom.id },
      select: { itemId: true },
    });
    const targetBaseItemIds = new Set(targetBaseItems.map((l) => l.itemId));

    let groupsCopied = 0;
    let packagesCopied = 0;
    let linesCopied = 0;
    let flaggedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const sg of sourceGroups) {
        const newGroup = await tx.optionGroup.create({
          data: {
            bomId: bom.id,
            name: sg.name,
            category: sg.category,
            selectionType: sg.selectionType,
            required: sg.required,
            sortOrder: sg.sortOrder,
            createdBy: req.user.id,
          },
        });
        groupsCopied++;

        for (const sp of sg.packages) {
          let needsFlag = false;

          const newPkg = await tx.optionPackage.create({
            data: {
              optionGroupId: newGroup.id,
              name: sp.name,
              isDefault: sp.isDefault,
              status: 'DRAFT', // Always reset to DRAFT
              allowQuantity: sp.allowQuantity,
              minQuantity: sp.minQuantity,
              maxQuantity: sp.maxQuantity,
              sortOrder: sp.sortOrder,
              notes: sp.notes,
              createdBy: req.user.id,
            },
          });
          packagesCopied++;

          for (const sl of sp.lines) {
            await tx.optionLine.create({
              data: {
                optionPackageId: newPkg.id,
                itemId: sl.itemId,
                action: sl.action,
                quantityPer: sl.quantityPer,
                scrapPercent: sl.scrapPercent,
                cutDetails: sl.cutDetails ?? undefined,
                sortOrder: sl.sortOrder,
                notes: sl.notes,
              },
            });
            linesCopied++;

            // Flag REMOVE lines or cut material lines
            if (sl.action === 'REMOVE' && !targetBaseItemIds.has(sl.itemId)) {
              needsFlag = true;
            }
            if (sl.scrapPercent != null || sl.cutDetails != null) {
              needsFlag = true;
            }
          }

          if (needsFlag) flaggedCount++;
        }
      }
    });

    // Validate PICK_ONE defaults: at most one per group (should be preserved from source)
    // No action needed — we copy isDefault as-is and source should already be valid

    return res.status(201).json({
      message: `Imported ${groupsCopied} groups with ${packagesCopied} packages and ${linesCopied} lines`,
      groupsCopied,
      packagesCopied,
      linesCopied,
      flaggedCount,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /:bomId/resolve — Resolve BOM with option selections
// ---------------------------------------------------------------------------
router.post(
  '/:bomId/resolve',
  [
    param('bomId').isInt({ gt: 0 }),
    body('selections').isArray().withMessage('selections must be an array'),
    body('selections.*.packageId').custom((val) => {
      if (val === null) return true; // explicit "None" override
      if (Number.isInteger(val) && val > 0) return true;
      throw new Error('packageId must be a positive integer or null');
    }),
    body('selections.*.groupId').optional().isInt({ gt: 0 }).withMessage('groupId must be a positive integer'),
    body('selections.*.quantity').optional().isInt({ gt: 0 }).withMessage('quantity must be a positive integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bom = await loadBom(req, res, { allowedStatuses: ['ACTIVE'] });
    if (!bom) return;

    const { resolveBom } = require('../lib/resolveBom');
    const { generateConfigKey } = require('../lib/configKey');
    const result = await resolveBom(bom.id, req.body.selections);

    if (result.errors.length > 0) {
      return res.status(400).json(result);
    }

    // Generate configurationKey so frontend can preview/cache it
    const configurationKey = generateConfigKey(bom.bomCode, result.selections);

    return res.json({ ...result, configurationKey });
  }
);

module.exports = router;
