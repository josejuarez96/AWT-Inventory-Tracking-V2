const express = require('express');
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// POST /api/production/kit — Execute a kitting/production order
// ---------------------------------------------------------------------------
router.post(
  '/kit',
  [
    body('finishedGoodId').isInt({ gt: 0 }).withMessage('finishedGoodId is required'),
    body('location').isIn(['ADEL', 'CALHOUN']).withMessage('location must be ADEL or CALHOUN'),
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

    // Validate no self-referencing
    const componentIds = components.map((c) => c.itemId);
    if (componentIds.includes(finishedGoodId)) {
      return res.status(400).json({ error: 'Finished good cannot be its own component' });
    }

    // Validate all component items exist and are active
    const componentItems = await prisma.item.findMany({
      where: { id: { in: componentIds }, isActive: true },
      select: { id: true, itemCode: true, standardCost: true },
    });
    const componentItemMap = new Map(componentItems.map((i) => [i.id, i]));

    for (const comp of components) {
      if (!componentItemMap.has(comp.itemId)) {
        return res.status(400).json({ error: `Component item ${comp.itemId} not found or inactive` });
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

    // Check stock availability at the location
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

    const insufficientItems = [];
    for (const comp of requiredPerComponent) {
      const available = stockMap[comp.itemId] ?? 0;
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

    // Create everything atomically
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
// GET /api/production — List production orders
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('location').optional().isIn(['ADEL', 'CALHOUN']),
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
