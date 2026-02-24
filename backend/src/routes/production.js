const express = require('express');
const crypto = require('crypto');
const { body, query, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { LOCATIONS } = require('../lib/locations');
const { getReservedQuantitiesMap } = require('../lib/reservations');

const router = express.Router();
router.use(authenticate);

const WHOLE_UNIT_UOMS = ['EA', 'SET', 'PAIR'];
const PO_UNIT_THRESHOLD = 25; // Orders above this require admin auth

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

// ---------------------------------------------------------------------------
// POST /api/production/kit — Execute a kitting/production order
// ---------------------------------------------------------------------------
router.post(
  '/kit',
  [
    body('finishedGoodId').isInt({ gt: 0 }).withMessage('finishedGoodId is required'),
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('quantityProduced').isFloat({ gt: 0 }).withMessage('quantityProduced must be > 0'),
    body('bomId').optional({ nullable: true }).isInt({ gt: 0 }),
    body('components').isArray({ min: 1 }).withMessage('At least one component is required'),
    body('components.*.itemId').isInt({ gt: 0 }).withMessage('Each component needs a valid itemId'),
    body('components.*.quantityPer').isFloat({ gt: 0 }).withMessage('quantityPer must be > 0'),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { finishedGoodId, location, quantityProduced, bomId, components, notes } = req.body;
    const qtyProduced = parseFloat(quantityProduced);

    // Validate finished good
    const finishedGood = await prisma.item.findUnique({ where: { id: finishedGoodId } });
    if (!finishedGood || !finishedGood.isActive) {
      return res.status(400).json({ error: 'Finished good item not found or inactive' });
    }

    // Block decimal quantities for whole-unit finished goods (EA, SET, PAIR)
    if (WHOLE_UNIT_UOMS.includes(finishedGood.unitOfMeasure?.toUpperCase()) && !Number.isInteger(qtyProduced)) {
      return res.status(400).json({
        error: `${finishedGood.itemCode} is measured in ${finishedGood.unitOfMeasure} — quantity produced must be a whole number.`,
      });
    }

    // Validate no self-referencing
    const componentIds = components.map((c) => c.itemId);
    if (componentIds.includes(finishedGoodId)) {
      return res.status(400).json({ error: 'Finished good cannot be its own component' });
    }

    // Validate all component items exist and are active
    const componentItems = await prisma.item.findMany({
      where: { id: { in: componentIds }, isActive: true },
      select: { id: true, itemCode: true, standardCost: true, unitOfMeasure: true },
    });
    const componentItemMap = new Map(componentItems.map((i) => [i.id, i]));

    for (const comp of components) {
      if (!componentItemMap.has(comp.itemId)) {
        return res.status(400).json({ error: `Component item ${comp.itemId} not found or inactive` });
      }
    }

    // Block decimal quantities for whole-unit component items
    for (const comp of components) {
      const compItem = componentItemMap.get(comp.itemId);
      if (compItem && WHOLE_UNIT_UOMS.includes(compItem.unitOfMeasure?.toUpperCase()) && !Number.isInteger(parseFloat(comp.quantityPer))) {
        return res.status(400).json({
          error: `${compItem.itemCode} is measured in ${compItem.unitOfMeasure} — quantityPer must be a whole number.`,
        });
      }
    }

    // Validate BOM and enforce component integrity if provided
    let hasDeviations = false;
    let deviationNotes = null;

    if (bomId) {
      const bom = await prisma.bom.findUnique({
        where: { id: bomId },
        include: { lines: { include: { item: { select: { itemCode: true } } } } },
      });
      if (!bom) {
        return res.status(400).json({ error: 'BOM not found' });
      }
      if (bom.status !== 'ACTIVE') {
        return res.status(400).json({ error: `BOM ${bom.bomCode} is ${bom.status}. Only ACTIVE BOMs can be used for kitting.` });
      }

      // Validate all BOM components are present with correct quantities
      const bomComponentMap = new Map(bom.lines.map((l) => [l.itemId, Number(l.quantityPer)]));

      const missing = [];
      const modified = [];
      for (const [itemId, expectedQty] of bomComponentMap) {
        const submitted = components.find((c) => c.itemId === itemId);
        if (!submitted) {
          const bomLine = bom.lines.find((l) => l.itemId === itemId);
          missing.push({ itemId, itemCode: bomLine?.item?.itemCode ?? `ID ${itemId}`, expected: expectedQty });
        } else if (Math.abs(parseFloat(submitted.quantityPer) - expectedQty) > 0.0001) {
          const bomLine = bom.lines.find((l) => l.itemId === itemId);
          modified.push({ itemId, itemCode: bomLine?.item?.itemCode ?? `ID ${itemId}`, expected: expectedQty, submitted: parseFloat(submitted.quantityPer) });
        }
      }

      if (missing.length > 0 || modified.length > 0) {
        return res.status(400).json({
          error: 'Cannot remove or modify BOM components. Extra components are allowed.',
          missing,
          modified,
        });
      }

      // Check for extra (non-BOM) components
      const extraComponents = components.filter((c) => !bomComponentMap.has(c.itemId));
      if (extraComponents.length > 0) {
        hasDeviations = true;
        // Build notes with item codes
        const extraDescriptions = [];
        for (const ec of extraComponents) {
          const item = componentItemMap.get(ec.itemId);
          extraDescriptions.push(`${item?.itemCode ?? `ID ${ec.itemId}`} (qty: ${ec.quantityPer})`);
        }
        deviationNotes = `Extra components added: ${extraDescriptions.join(', ')}`;
      }
    }

    // Calculate required quantities
    const requiredPerComponent = components.map((c) => ({
      itemId: c.itemId,
      quantityPer: parseFloat(c.quantityPer),
      requiredQty: parseFloat(c.quantityPer) * qtyProduced,
    }));

    // Check stock availability at the location (on hand minus reserved)
    const stockGrouped = await prisma.transaction.groupBy({
      by: ['itemId'],
      where: {
        itemId: { in: componentIds },
        location,
      },
      _sum: { quantity: true },
    });
    const stockMap = {};
    for (const row of stockGrouped) {
      stockMap[row.itemId] = Number(row._sum.quantity ?? 0);
    }
    const kitReservedMap = await getReservedQuantitiesMap();

    const insufficientItems = [];
    for (const comp of requiredPerComponent) {
      const onHand = stockMap[comp.itemId] ?? 0;
      const reserved = kitReservedMap.get(`${comp.itemId}_${location}`) || 0;
      const available = onHand - reserved;
      if (available < comp.requiredQty) {
        const item = componentItemMap.get(comp.itemId);
        insufficientItems.push({
          itemId: comp.itemId,
          itemCode: item?.itemCode ?? `ID:${comp.itemId}`,
          required: comp.requiredQty,
          available,
        });
      }
    }

    if (insufficientItems.length > 0) {
      return res.status(400).json({
        error: 'Insufficient stock for kitting',
        insufficientItems,
      });
    }

    // Get weighted average cost per component for cost rollup
    const costRows = await prisma.$queryRaw`
      SELECT "item_id" AS "itemId",
             SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
      FROM transactions
      WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
        AND unit_cost IS NOT NULL
        AND quantity > 0
        AND "item_id" = ANY(${componentIds}::int[])
      GROUP BY "item_id"
    `;
    const avgCostMap = {};
    for (const row of costRows) {
      avgCostMap[row.itemId] = Number(row.avgCost ?? 0);
    }

    // Calculate total cost with standardCost fallback
    let totalCost = 0;
    for (const comp of requiredPerComponent) {
      let unitCost = avgCostMap[comp.itemId] ?? null;
      if (unitCost === null) {
        const item = componentItemMap.get(comp.itemId);
        unitCost = item?.standardCost ? Number(item.standardCost) : 0;
      }
      totalCost += comp.requiredQty * unitCost;
    }
    totalCost = Math.round(totalCost * 100) / 100;
    const unitCostPerFinishedGood = Math.round((totalCost / qtyProduced) * 100) / 100;

    // Non-admin users require admin authorization to execute kitting
    if (req.user.role !== 'admin') {
      const adminAuthHeader = req.headers['x-admin-authorization'];
      if (!adminAuthHeader) {
        return res.status(403).json({
          error: 'Admin authorization required for kitting operations',
          requiresApproval: true,
          summary: {
            finishedGood: finishedGood.itemCode,
            location,
            quantityProduced: qtyProduced,
            components: requiredPerComponent.length,
            totalCost,
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

    // Create everything atomically
    const kitBatchId = crypto.randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create ProductionOrder with temp orderNumber
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: 'TEMP',
          bomId: bomId || null,
          finishedGoodId,
          location,
          quantityProduced: qtyProduced,
          totalCost,
          hasDeviations,
          deviationNotes,
          notes: notes || null,
          createdBy: req.user.id,
        },
      });

      // 2. Update orderNumber to KIT-{id}
      const updatedOrder = await tx.productionOrder.update({
        where: { id: order.id },
        data: { orderNumber: `KIT-${order.id}` },
      });

      // 3. Create CONSUMPTION transactions (one per component)
      for (const comp of requiredPerComponent) {
        let compUnitCost = avgCostMap[comp.itemId] ?? null;
        if (compUnitCost === null) {
          const item = componentItemMap.get(comp.itemId);
          compUnitCost = item?.standardCost ? Number(item.standardCost) : null;
        }

        await tx.transaction.create({
          data: {
            transactionType: 'CONSUMPTION',
            itemId: comp.itemId,
            location,
            quantity: -comp.requiredQty,
            unitCost: compUnitCost !== null ? Math.round(compUnitCost * 100) / 100 : null,
            transactionDate: new Date(),
            notes: `[Kit ${updatedOrder.orderNumber}] Consumed for ${finishedGood.itemCode}`,
            createdBy: req.user.id,
            productionOrderId: order.id,
            batchId: kitBatchId,
          },
        });
      }

      // 4. Create PRODUCTION transaction for finished good
      await tx.transaction.create({
        data: {
          transactionType: 'PRODUCTION',
          itemId: finishedGoodId,
          location,
          quantity: qtyProduced,
          unitCost: unitCostPerFinishedGood,
          transactionDate: new Date(),
          notes: `[Kit ${updatedOrder.orderNumber}] Produced`,
          createdBy: req.user.id,
          productionOrderId: order.id,
          batchId: kitBatchId,
        },
      });

      return updatedOrder;
    });

    // Fetch full order details for response
    const fullOrder = await prisma.productionOrder.findUnique({
      where: { id: result.id },
      include: {
        finishedGood: { select: { id: true, itemCode: true, description: true } },
        bom: { select: { id: true, bomCode: true, name: true } },
        creator: { select: { fullName: true } },
        transactions: {
          include: { item: { select: { itemCode: true, description: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });

    return res.status(201).json({
      order: {
        ...fullOrder,
        quantityProduced: Number(fullOrder.quantityProduced),
        totalCost: Number(fullOrder.totalCost),
        transactions: fullOrder.transactions.map((t) => ({
          ...t,
          quantity: Number(t.quantity),
          unitCost: t.unitCost !== null ? Number(t.unitCost) : null,
        })),
      },
    });
  }
);

// ---------------------------------------------------------------------------
// Helper: derive order status from its lines
// ---------------------------------------------------------------------------
function deriveOrderStatus(lines) {
  if (!lines || lines.length === 0) return 'COMPLETED';
  const staged = lines.filter((l) => l.status === 'STAGED').length;
  if (staged === lines.length) return 'OPEN';
  if (staged === 0) return 'COMPLETED';
  return 'PARTIAL';
}

// ---------------------------------------------------------------------------
// Helper: get weighted average cost map for given item IDs
// ---------------------------------------------------------------------------
async function getAvgCostMap(itemIds, tx) {
  const client = tx || prisma;
  const costRows = await client.$queryRaw`
    SELECT "item_id" AS "itemId",
           SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
    FROM transactions
    WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
      AND unit_cost IS NOT NULL
      AND quantity > 0
      AND "item_id" = ANY(${itemIds}::int[])
    GROUP BY "item_id"
  `;
  const map = {};
  for (const row of costRows) {
    map[row.itemId] = Number(row.avgCost ?? 0);
  }
  return map;
}

// ---------------------------------------------------------------------------
// POST /api/production/orders — Create a staged production order
// ---------------------------------------------------------------------------
router.post(
  '/orders',
  [
    body('finishedGoodId').isInt({ gt: 0 }).withMessage('finishedGoodId is required'),
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('totalQuantity').isInt({ gt: 0 }).withMessage('totalQuantity must be a positive integer'),
    body('bomId').optional({ nullable: true }).isInt({ gt: 0 }),
    body('components').isArray({ min: 1 }).withMessage('At least one component is required'),
    body('components.*.itemId').isInt({ gt: 0 }).withMessage('Each component needs a valid itemId'),
    body('components.*.quantityPer').isFloat({ gt: 0 }).withMessage('quantityPer must be > 0'),
    body('notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { finishedGoodId, location, totalQuantity, bomId, components, notes } = req.body;
    const qty = parseInt(totalQuantity);

    // Validate finished good
    const finishedGood = await prisma.item.findUnique({ where: { id: finishedGoodId } });
    if (!finishedGood || !finishedGood.isActive) {
      return res.status(400).json({ error: 'Finished good item not found or inactive' });
    }

    // Validate no self-referencing
    const componentIds = components.map((c) => c.itemId);
    if (componentIds.includes(finishedGoodId)) {
      return res.status(400).json({ error: 'Finished good cannot be its own component' });
    }

    // Validate all component items exist and are active
    const componentItems = await prisma.item.findMany({
      where: { id: { in: componentIds }, isActive: true },
      select: { id: true, itemCode: true, description: true, unitOfMeasure: true },
    });
    const componentItemMap = new Map(componentItems.map((i) => [i.id, i]));

    for (const comp of components) {
      if (!componentItemMap.has(comp.itemId)) {
        return res.status(400).json({ error: `Component item ${comp.itemId} not found or inactive` });
      }
    }

    // Block decimal quantityPer for whole-unit component items
    for (const comp of components) {
      const compItem = componentItemMap.get(comp.itemId);
      if (compItem && WHOLE_UNIT_UOMS.includes(compItem.unitOfMeasure?.toUpperCase()) && !Number.isInteger(parseFloat(comp.quantityPer))) {
        return res.status(400).json({
          error: `${compItem.itemCode} is measured in ${compItem.unitOfMeasure} — quantityPer must be a whole number.`,
        });
      }
    }

    // Validate BOM integrity if provided
    let hasDeviations = false;
    let deviationNotes = null;

    if (bomId) {
      const bom = await prisma.bom.findUnique({
        where: { id: bomId },
        include: { lines: { include: { item: { select: { itemCode: true } } } } },
      });
      if (!bom) return res.status(400).json({ error: 'BOM not found' });
      if (bom.status !== 'ACTIVE') {
        return res.status(400).json({ error: `BOM ${bom.bomCode} is ${bom.status}. Only ACTIVE BOMs can be used.` });
      }

      const bomComponentMap = new Map(bom.lines.map((l) => [l.itemId, Number(l.quantityPer)]));
      const missing = [];
      const modified = [];
      for (const [itemId, expectedQty] of bomComponentMap) {
        const submitted = components.find((c) => c.itemId === itemId);
        if (!submitted) {
          const bomLine = bom.lines.find((l) => l.itemId === itemId);
          missing.push({ itemId, itemCode: bomLine?.item?.itemCode ?? `ID ${itemId}`, expected: expectedQty });
        } else if (Math.abs(parseFloat(submitted.quantityPer) - expectedQty) > 0.0001) {
          const bomLine = bom.lines.find((l) => l.itemId === itemId);
          modified.push({ itemId, itemCode: bomLine?.item?.itemCode ?? `ID ${itemId}`, expected: expectedQty, submitted: parseFloat(submitted.quantityPer) });
        }
      }
      if (missing.length > 0 || modified.length > 0) {
        return res.status(400).json({ error: 'Cannot remove or modify BOM components.', missing, modified });
      }

      const extraComponents = components.filter((c) => !bomComponentMap.has(c.itemId));
      if (extraComponents.length > 0) {
        hasDeviations = true;
        const extraDescriptions = extraComponents.map((ec) => {
          const item = componentItemMap.get(ec.itemId);
          return `${item?.itemCode ?? `ID ${ec.itemId}`} (qty: ${ec.quantityPer})`;
        });
        deviationNotes = `Extra components added: ${extraDescriptions.join(', ')}`;
      }
    }

    // Admin auth required for large orders
    if (qty > PO_UNIT_THRESHOLD && req.user.role !== 'admin') {
      const adminAuthHeader = req.headers['x-admin-authorization'];
      if (!adminAuthHeader) {
        return res.status(403).json({
          error: `Production orders exceeding ${PO_UNIT_THRESHOLD} units require admin authorization`,
          requiresApproval: true,
        });
      }
      const isValidAdmin = await verifyAdminCredentials(adminAuthHeader);
      if (!isValidAdmin) {
        return res.status(403).json({ error: 'Invalid admin credentials', requiresApproval: true });
      }
    }

    // Check available stock and build warnings (don't block)
    const stockGrouped = await prisma.transaction.groupBy({
      by: ['itemId'],
      where: { itemId: { in: componentIds }, location },
      _sum: { quantity: true },
    });
    const stockMap = {};
    for (const row of stockGrouped) {
      stockMap[row.itemId] = Number(row._sum.quantity ?? 0);
    }
    const reservedMap = await getReservedQuantitiesMap();

    const warnings = [];
    for (const comp of components) {
      const qtyPer = parseFloat(comp.quantityPer);
      const totalNeeded = qtyPer * qty;
      const onHand = stockMap[comp.itemId] ?? 0;
      const reserved = reservedMap.get(`${comp.itemId}_${location}`) || 0;
      const available = onHand - reserved;
      if (available < totalNeeded) {
        const item = componentItemMap.get(comp.itemId);
        warnings.push({
          itemId: comp.itemId,
          itemCode: item?.itemCode ?? `ID:${comp.itemId}`,
          required: totalNeeded,
          available,
          short: totalNeeded - available,
        });
      }
    }

    // Build component snapshot (frozen at creation time)
    const componentSnapshot = components.map((c) => {
      const item = componentItemMap.get(c.itemId);
      return {
        itemId: c.itemId,
        itemCode: item?.itemCode ?? `ID:${c.itemId}`,
        description: item?.description ?? '',
        quantityPer: parseFloat(c.quantityPer),
      };
    });

    // Create order + lines atomically
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: 'TEMP',
          bomId: bomId || null,
          finishedGoodId,
          location,
          quantityProduced: 0,
          totalCost: 0,
          totalQuantity: qty,
          status: 'OPEN',
          orderType: 'STAGED',
          hasDeviations,
          deviationNotes,
          notes: notes || null,
          createdBy: req.user.id,
        },
      });

      await tx.productionOrder.update({
        where: { id: order.id },
        data: { orderNumber: `PRD-${order.id}` },
      });

      // Create one line per unit
      const lineData = [];
      for (let i = 1; i <= qty; i++) {
        lineData.push({
          productionOrderId: order.id,
          lineNumber: i,
          status: 'STAGED',
          componentSnapshot,
          lineCost: 0,
        });
      }
      await tx.productionOrderLine.createMany({ data: lineData });

      return order.id;
    });

    // Fetch full order for response
    const fullOrder = await prisma.productionOrder.findUnique({
      where: { id: result },
      include: {
        finishedGood: { select: { id: true, itemCode: true, description: true } },
        bom: { select: { id: true, bomCode: true, name: true } },
        creator: { select: { fullName: true } },
        lines: { orderBy: { lineNumber: 'asc' } },
      },
    });

    return res.status(201).json({
      order: {
        ...fullOrder,
        totalQuantity: Number(fullOrder.totalQuantity),
        quantityProduced: Number(fullOrder.quantityProduced),
        totalCost: Number(fullOrder.totalCost),
        lines: fullOrder.lines.map((l) => ({ ...l, lineCost: Number(l.lineCost) })),
      },
      warnings,
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/production/orders — List staged production orders
// ---------------------------------------------------------------------------
router.get(
  '/orders',
  [
    query('status').optional().isIn(['OPEN', 'PARTIAL', 'COMPLETED']),
    query('location').optional().isIn(LOCATIONS),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, location, from, to } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const where = { orderType: 'STAGED' };
    if (status) where.status = status;
    if (location) where.location = location;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        where.createdAt.lte = toDate;
      }
    }

    const [orders, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          finishedGood: { select: { id: true, itemCode: true, description: true } },
          bom: { select: { id: true, bomCode: true, name: true } },
          creator: { select: { fullName: true } },
          lines: { select: { status: true } },
        },
      }),
      prisma.productionOrder.count({ where }),
    ]);

    return res.json({
      orders: orders.map((o) => {
        const lineCounts = { staged: 0, posted: 0, voided: 0, reversed: 0 };
        for (const line of o.lines) {
          const key = line.status.toLowerCase();
          if (key in lineCounts) lineCounts[key]++;
        }
        return {
          ...o,
          totalQuantity: Number(o.totalQuantity),
          quantityProduced: Number(o.quantityProduced),
          totalCost: Number(o.totalCost),
          lines: undefined,
          lineCounts,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/production/orders/:id — Staged production order detail
// ---------------------------------------------------------------------------
router.get(
  '/orders/:id',
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        finishedGood: { select: { id: true, itemCode: true, description: true, unitOfMeasure: true } },
        bom: { select: { id: true, bomCode: true, name: true } },
        creator: { select: { fullName: true } },
        lines: {
          orderBy: { lineNumber: 'asc' },
          include: {
            poster: { select: { fullName: true } },
            voider: { select: { fullName: true } },
            reverser: { select: { fullName: true } },
          },
        },
      },
    });

    if (!order) return res.status(404).json({ error: 'Production order not found' });

    return res.json({
      order: {
        ...order,
        totalQuantity: Number(order.totalQuantity),
        quantityProduced: Number(order.quantityProduced),
        totalCost: Number(order.totalCost),
        lines: order.lines.map((l) => ({ ...l, lineCost: Number(l.lineCost) })),
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/production/orders/:id/lines/:lineId/post — Post a single line
// ---------------------------------------------------------------------------
router.post(
  '/orders/:id/lines/:lineId/post',
  async (req, res) => {
    const orderId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    if (isNaN(orderId) || isNaN(lineId)) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch order and line
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        finishedGood: { select: { id: true, itemCode: true, unitOfMeasure: true } },
        lines: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'Production order not found' });

    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });
    if (line.status !== 'STAGED') {
      return res.status(400).json({ error: `Line is ${line.status}, can only post STAGED lines` });
    }

    const components = line.componentSnapshot;
    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ error: 'Line has no component snapshot' });
    }

    const componentIds = components.map((c) => c.itemId);

    // Check stock: available = on hand - reserved from OTHER staged lines
    const stockGrouped = await prisma.transaction.groupBy({
      by: ['itemId'],
      where: { itemId: { in: componentIds }, location: order.location },
      _sum: { quantity: true },
    });
    const stockMap = {};
    for (const row of stockGrouped) {
      stockMap[row.itemId] = Number(row._sum.quantity ?? 0);
    }

    const reservedMap = await getReservedQuantitiesMap();

    const insufficientItems = [];
    for (const comp of components) {
      const onHand = stockMap[comp.itemId] ?? 0;
      const totalReserved = reservedMap.get(`${comp.itemId}_${order.location}`) || 0;
      // Subtract THIS line's reservation since it's about to be consumed
      const thisLineReserved = Number(comp.quantityPer);
      const otherReserved = totalReserved - thisLineReserved;
      const available = onHand - otherReserved;

      if (available < Number(comp.quantityPer)) {
        insufficientItems.push({
          itemId: comp.itemId,
          itemCode: comp.itemCode,
          required: Number(comp.quantityPer),
          available,
        });
      }
    }

    if (insufficientItems.length > 0) {
      return res.status(400).json({ error: 'Insufficient stock to post line', insufficientItems });
    }

    // Get weighted average costs for components
    const avgCostMap = await getAvgCostMap(componentIds);

    // Also look up standardCost as fallback
    const componentItemsForCost = await prisma.item.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, standardCost: true },
    });
    const standardCostMap = {};
    for (const item of componentItemsForCost) {
      standardCostMap[item.id] = item.standardCost ? Number(item.standardCost) : 0;
    }

    // Calculate line cost
    let lineCost = 0;
    for (const comp of components) {
      const unitCost = avgCostMap[comp.itemId] ?? standardCostMap[comp.itemId] ?? 0;
      lineCost += Number(comp.quantityPer) * unitCost;
    }
    lineCost = Math.round(lineCost * 100) / 100;

    const batchId = crypto.randomUUID();

    // Execute atomically
    await prisma.$transaction(async (tx) => {
      // Create CONSUMPTION transactions
      for (const comp of components) {
        let unitCost = avgCostMap[comp.itemId] ?? null;
        if (unitCost === null) unitCost = standardCostMap[comp.itemId] ?? null;

        await tx.transaction.create({
          data: {
            transactionType: 'CONSUMPTION',
            itemId: comp.itemId,
            location: order.location,
            quantity: -Number(comp.quantityPer),
            unitCost: unitCost !== null ? Math.round(unitCost * 100) / 100 : null,
            transactionDate: new Date(),
            notes: `[${order.orderNumber} Line ${line.lineNumber}] Consumed for ${order.finishedGood.itemCode}`,
            createdBy: req.user.id,
            productionOrderId: orderId,
            batchId,
          },
        });
      }

      // Create PRODUCTION transaction for finished good
      const unitCostPerFG = Math.round(lineCost * 100) / 100;
      await tx.transaction.create({
        data: {
          transactionType: 'PRODUCTION',
          itemId: order.finishedGoodId,
          location: order.location,
          quantity: 1, // Each line is 1 unit
          unitCost: unitCostPerFG,
          transactionDate: new Date(),
          notes: `[${order.orderNumber} Line ${line.lineNumber}] Produced`,
          createdBy: req.user.id,
          productionOrderId: orderId,
          batchId,
        },
      });

      // Update line status
      await tx.productionOrderLine.update({
        where: { id: lineId },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postedBy: req.user.id,
          lineCost,
          batchId,
        },
      });

      // Update order header
      const allLines = await tx.productionOrderLine.findMany({
        where: { productionOrderId: orderId },
        select: { status: true, lineCost: true },
      });
      const newStatus = deriveOrderStatus(allLines);
      const postedLines = allLines.filter((l) => l.status === 'POSTED');
      const totalPostedCost = postedLines.reduce((sum, l) => sum + Number(l.lineCost), 0);
      const totalProduced = postedLines.length;

      await tx.productionOrder.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          quantityProduced: totalProduced,
          totalCost: Math.round(totalPostedCost * 100) / 100,
        },
      });
    }, { isolationLevel: 'Serializable' });

    // Fetch updated line
    const updatedLine = await prisma.productionOrderLine.findUnique({
      where: { id: lineId },
      include: { poster: { select: { fullName: true } } },
    });

    return res.json({
      line: { ...updatedLine, lineCost: Number(updatedLine.lineCost) },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/production/orders/:id/post-all — Post all staged lines sequentially
// ---------------------------------------------------------------------------
router.post(
  '/orders/:id/post-all',
  async (req, res) => {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid ID' });

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        finishedGood: { select: { id: true, itemCode: true, unitOfMeasure: true } },
        lines: { where: { status: 'STAGED' }, orderBy: { lineNumber: 'asc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Production order not found' });

    if (order.lines.length === 0) {
      return res.status(400).json({ error: 'No staged lines to post' });
    }

    const posted = [];
    const failed = [];

    // Post each line independently
    for (const line of order.lines) {
      try {
        const components = line.componentSnapshot;
        if (!Array.isArray(components) || components.length === 0) {
          failed.push({ lineId: line.id, lineNumber: line.lineNumber, error: 'No component snapshot' });
          continue;
        }

        const componentIds = components.map((c) => c.itemId);

        // Check stock
        const stockGrouped = await prisma.transaction.groupBy({
          by: ['itemId'],
          where: { itemId: { in: componentIds }, location: order.location },
          _sum: { quantity: true },
        });
        const stockMap = {};
        for (const row of stockGrouped) {
          stockMap[row.itemId] = Number(row._sum.quantity ?? 0);
        }
        const reservedMap = await getReservedQuantitiesMap();

        const insufficientItems = [];
        for (const comp of components) {
          const onHand = stockMap[comp.itemId] ?? 0;
          const totalReserved = reservedMap.get(`${comp.itemId}_${order.location}`) || 0;
          const thisLineReserved = Number(comp.quantityPer);
          const otherReserved = totalReserved - thisLineReserved;
          const available = onHand - otherReserved;

          if (available < Number(comp.quantityPer)) {
            insufficientItems.push({ itemCode: comp.itemCode, required: Number(comp.quantityPer), available });
          }
        }

        if (insufficientItems.length > 0) {
          failed.push({ lineId: line.id, lineNumber: line.lineNumber, error: 'Insufficient stock', insufficientItems });
          continue;
        }

        const avgCostMap = await getAvgCostMap(componentIds);
        const componentItemsForCost = await prisma.item.findMany({
          where: { id: { in: componentIds } },
          select: { id: true, standardCost: true },
        });
        const standardCostMap = {};
        for (const item of componentItemsForCost) {
          standardCostMap[item.id] = item.standardCost ? Number(item.standardCost) : 0;
        }

        let lineCost = 0;
        for (const comp of components) {
          const unitCost = avgCostMap[comp.itemId] ?? standardCostMap[comp.itemId] ?? 0;
          lineCost += Number(comp.quantityPer) * unitCost;
        }
        lineCost = Math.round(lineCost * 100) / 100;

        const batchId = crypto.randomUUID();

        await prisma.$transaction(async (tx) => {
          for (const comp of components) {
            let unitCost = avgCostMap[comp.itemId] ?? null;
            if (unitCost === null) unitCost = standardCostMap[comp.itemId] ?? null;

            await tx.transaction.create({
              data: {
                transactionType: 'CONSUMPTION',
                itemId: comp.itemId,
                location: order.location,
                quantity: -Number(comp.quantityPer),
                unitCost: unitCost !== null ? Math.round(unitCost * 100) / 100 : null,
                transactionDate: new Date(),
                notes: `[${order.orderNumber} Line ${line.lineNumber}] Consumed for ${order.finishedGood.itemCode}`,
                createdBy: req.user.id,
                productionOrderId: orderId,
                batchId,
              },
            });
          }

          await tx.transaction.create({
            data: {
              transactionType: 'PRODUCTION',
              itemId: order.finishedGoodId,
              location: order.location,
              quantity: 1,
              unitCost: lineCost,
              transactionDate: new Date(),
              notes: `[${order.orderNumber} Line ${line.lineNumber}] Produced`,
              createdBy: req.user.id,
              productionOrderId: orderId,
              batchId,
            },
          });

          await tx.productionOrderLine.update({
            where: { id: line.id },
            data: { status: 'POSTED', postedAt: new Date(), postedBy: req.user.id, lineCost, batchId },
          });
        }, { isolationLevel: 'Serializable' });

        posted.push({ lineId: line.id, lineNumber: line.lineNumber });
      } catch (err) {
        failed.push({ lineId: line.id, lineNumber: line.lineNumber, error: err.message });
      }
    }

    // Update order header status
    const allLines = await prisma.productionOrderLine.findMany({
      where: { productionOrderId: orderId },
      select: { status: true, lineCost: true },
    });
    const newStatus = deriveOrderStatus(allLines);
    const postedLines = allLines.filter((l) => l.status === 'POSTED');
    await prisma.productionOrder.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        quantityProduced: postedLines.length,
        totalCost: Math.round(postedLines.reduce((s, l) => s + Number(l.lineCost), 0) * 100) / 100,
      },
    });

    return res.json({ posted, failed });
  }
);

// ---------------------------------------------------------------------------
// POST /api/production/orders/:id/lines/:lineId/void — Void a staged line
// ---------------------------------------------------------------------------
router.post(
  '/orders/:id/lines/:lineId/void',
  [body('reason').trim().notEmpty().withMessage('Reason is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const orderId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    if (isNaN(orderId) || isNaN(lineId)) return res.status(400).json({ error: 'Invalid ID' });

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) return res.status(404).json({ error: 'Production order not found' });

    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });
    if (line.status !== 'STAGED') {
      return res.status(400).json({ error: `Line is ${line.status}, can only void STAGED lines` });
    }

    await prisma.$transaction(async (tx) => {
      await tx.productionOrderLine.update({
        where: { id: lineId },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedBy: req.user.id,
          notes: req.body.reason,
        },
      });

      const allLines = await tx.productionOrderLine.findMany({
        where: { productionOrderId: orderId },
        select: { status: true },
      });
      await tx.productionOrder.update({
        where: { id: orderId },
        data: { status: deriveOrderStatus(allLines) },
      });
    });

    const updatedLine = await prisma.productionOrderLine.findUnique({
      where: { id: lineId },
      include: { voider: { select: { fullName: true } } },
    });

    return res.json({ line: { ...updatedLine, lineCost: Number(updatedLine.lineCost) } });
  }
);

// ---------------------------------------------------------------------------
// POST /api/production/orders/:id/lines/:lineId/reverse — Reverse a posted line
// ---------------------------------------------------------------------------
router.post(
  '/orders/:id/lines/:lineId/reverse',
  [body('reason').trim().notEmpty().withMessage('Reason is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const orderId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    if (isNaN(orderId) || isNaN(lineId)) return res.status(400).json({ error: 'Invalid ID' });

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) return res.status(404).json({ error: 'Production order not found' });

    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });
    if (line.status !== 'POSTED') {
      return res.status(400).json({ error: `Line is ${line.status}, can only reverse POSTED lines` });
    }

    // Find original transactions for this line by batchId
    const originalTxns = await prisma.transaction.findMany({
      where: { batchId: line.batchId, productionOrderId: orderId },
    });

    if (originalTxns.length === 0) {
      return res.status(400).json({ error: 'No original transactions found for this line' });
    }

    const reversalBatchId = crypto.randomUUID();

    await prisma.$transaction(async (tx) => {
      // Create offsetting transactions using exact same costs
      for (const origTx of originalTxns) {
        await tx.transaction.create({
          data: {
            transactionType: origTx.transactionType,
            itemId: origTx.itemId,
            location: origTx.location,
            quantity: -Number(origTx.quantity), // Flip the sign
            unitCost: origTx.unitCost !== null ? Number(origTx.unitCost) : null,
            transactionDate: new Date(),
            notes: `[REVERSAL ${order.orderNumber} Line ${line.lineNumber}] ${req.body.reason}`,
            createdBy: req.user.id,
            productionOrderId: orderId,
            batchId: reversalBatchId,
          },
        });
      }

      // Update line
      await tx.productionOrderLine.update({
        where: { id: lineId },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedBy: req.user.id,
          notes: (line.notes ? line.notes + ' | ' : '') + `Reversed: ${req.body.reason}`,
        },
      });

      // Update header
      const allLines = await tx.productionOrderLine.findMany({
        where: { productionOrderId: orderId },
        select: { status: true, lineCost: true },
      });
      const newStatus = deriveOrderStatus(allLines);
      const postedLines = allLines.filter((l) => l.status === 'POSTED');
      await tx.productionOrder.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          quantityProduced: postedLines.length,
          totalCost: Math.round(postedLines.reduce((s, l) => s + Number(l.lineCost), 0) * 100) / 100,
        },
      });
    });

    const updatedLine = await prisma.productionOrderLine.findUnique({
      where: { id: lineId },
      include: { reverser: { select: { fullName: true } } },
    });

    return res.json({ line: { ...updatedLine, lineCost: Number(updatedLine.lineCost) } });
  }
);

// ---------------------------------------------------------------------------
// GET /api/production — List production orders (instant kitting — legacy)
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('location').optional().isIn(LOCATIONS),
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

    const { location, from, to } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const where = {};
    if (location) where.location = location;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [orders, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          finishedGood: { select: { id: true, itemCode: true, description: true } },
          bom: { select: { id: true, bomCode: true, name: true } },
          creator: { select: { fullName: true } },
        },
      }),
      prisma.productionOrder.count({ where }),
    ]);

    return res.json({
      orders: orders.map((o) => ({
        ...o,
        quantityProduced: Number(o.quantityProduced),
        totalCost: Number(o.totalCost),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/production/:id — Production order detail
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        finishedGood: { select: { id: true, itemCode: true, description: true } },
        bom: { select: { id: true, bomCode: true, name: true } },
        creator: { select: { fullName: true } },
        transactions: {
          include: { item: { select: { itemCode: true, description: true, unitOfMeasure: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Production order not found' });
    }

    return res.json({
      order: {
        ...order,
        quantityProduced: Number(order.quantityProduced),
        totalCost: Number(order.totalCost),
        transactions: order.transactions.map((t) => ({
          ...t,
          quantity: Number(t.quantity),
          unitCost: t.unitCost !== null ? Number(t.unitCost) : null,
        })),
      },
    });
  }
);

module.exports = router;
