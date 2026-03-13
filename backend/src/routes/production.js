const express = require('express');
const crypto = require('crypto');
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { LOCATIONS } = require('../lib/locations');
const { getReservedQuantitiesMap } = require('../lib/reservations');
const { allowsDecimals } = require('../lib/uom');
const { verifyAdminCredentials } = require('../lib/adminAuth');

const router = express.Router();
router.use(authenticate);
const PO_UNIT_THRESHOLD = 25; // Orders above this require admin auth

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
    // components required only when no selections (legacy path)
    body('components').if(body('selections').not().exists()).isArray({ min: 1 }).withMessage('At least one component is required'),
    body('components.*.itemId').optional().isInt({ gt: 0 }).withMessage('Each component needs a valid itemId'),
    body('components.*.quantityPer').optional().isFloat({ gt: 0 }).withMessage('quantityPer must be > 0'),
    body('notes').optional({ nullable: true }).trim(),
    // Resolution path fields
    body('selections').optional().isArray(),
    body('selections.*.packageId').optional().custom((val) => {
      if (val === null) return true;
      if (Number.isInteger(val) && val > 0) return true;
      throw new Error('packageId must be a positive integer or null');
    }),
    body('selections.*.groupId').optional().isInt({ gt: 0 }),
    body('selections.*.quantity').optional().isInt({ gt: 0 }),
    body('vinReference').optional({ nullable: true }).trim().isLength({ max: 500 }),
    // Deviations: additional items added/changed at kit time
    body('deviations').optional().isArray(),
    body('deviations.*.itemId').isInt({ gt: 0 }).withMessage('Each deviation needs a valid itemId'),
    body('deviations.*.quantityPer').isFloat({ gt: 0 }).withMessage('Deviation quantityPer must be > 0'),
    body('deviations.*.notes').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { finishedGoodId, location, quantityProduced, bomId, components, notes, selections, vinReference, deviations } = req.body;
    const qtyProduced = parseFloat(quantityProduced);
    const hasSelections = Array.isArray(selections) && selections.length > 0;

    // Validate finished good
    const finishedGood = await prisma.item.findUnique({ where: { id: finishedGoodId } });
    if (!finishedGood || !finishedGood.isActive) {
      return res.status(400).json({ error: 'Finished good item not found or inactive' });
    }

    // Block decimal quantities for whole-unit finished goods (EA, SET, PAIR)
    if (!allowsDecimals(finishedGood.unitOfMeasure) && !finishedGood.allowDecimalQty && !Number.isInteger(qtyProduced)) {
      return res.status(400).json({
        error: `${finishedGood.itemCode} is measured in ${finishedGood.unitOfMeasure} — quantity produced must be a whole number.`,
      });
    }

    // ── Resolution path vs Legacy path ──────────────────────────────────
    let hasDeviations = false;
    let deviationNotes = null;
    let previewResolved = null; // resolution preview (for staleness check)
    let configSnapshot = null;
    let configKey = null;
    let requiredPerComponent;
    let componentIds;
    let componentItemMap;
    let avgCostMap = {};
    let totalCost = 0;

    if (hasSelections && bomId) {
      // ── RESOLUTION PATH: backend owns the component list ────────────
      const { resolveBom } = require('../lib/resolveBom');
      const { generateConfigKey } = require('../lib/configKey');

      // Verify BOM is ACTIVE
      const bom = await prisma.bom.findUnique({ where: { id: bomId } });
      if (!bom) return res.status(400).json({ error: 'BOM not found' });
      if (bom.status !== 'ACTIVE') {
        return res.status(400).json({ error: `BOM ${bom.bomCode} is ${bom.status}. Only ACTIVE BOMs can be used for kitting.` });
      }

      // Preview resolve (outside transaction) for early validation
      const preview = await resolveBom(bomId, selections);
      if (preview.errors.length > 0) {
        return res.status(400).json({ error: 'Resolution failed', details: preview.errors });
      }
      if (preview.resolved.length === 0) {
        return res.status(400).json({ error: 'Resolution produced zero components' });
      }
      previewResolved = preview;

      // Validate no self-referencing
      const resolvedItemIds = preview.resolved.map(r => r.itemId);
      if (resolvedItemIds.includes(finishedGoodId)) {
        return res.status(400).json({ error: 'Finished good cannot be its own component' });
      }

      // Build component data from resolved output
      componentIds = resolvedItemIds;
      const resolvedItems = await prisma.item.findMany({
        where: { id: { in: componentIds }, isActive: true },
        select: { id: true, itemCode: true, standardCost: true, unitOfMeasure: true, allowDecimalQty: true },
      });
      componentItemMap = new Map(resolvedItems.map(i => [i.id, i]));

      for (const r of preview.resolved) {
        if (!componentItemMap.has(r.itemId)) {
          return res.status(400).json({ error: `Resolved component ${r.itemCode} (ID ${r.itemId}) not found or inactive` });
        }
      }

      // Use effectiveQty (includes scrap) for consumption
      requiredPerComponent = preview.resolved.map(r => ({
        itemId: r.itemId,
        quantityPer: r.effectiveQty,
        requiredQty: r.effectiveQty * qtyProduced,
      }));

      // Pre-build cost map from resolution output (already has unitCost)
      for (const r of preview.resolved) {
        avgCostMap[r.itemId] = r.unitCost;
      }

      // Calculate total cost from resolution
      for (const comp of requiredPerComponent) {
        const uc = avgCostMap[comp.itemId] ?? 0;
        totalCost += comp.requiredQty * uc;
      }
      totalCost = Math.round(totalCost * 100) / 100;

      // ── Detect quantity deviations: compare submitted components vs resolved ──
      const quantityDeviations = [];
      if (Array.isArray(components) && components.length > 0) {
        const resolvedByItemId = new Map(preview.resolved.map(r => [r.itemId, r]));

        for (const comp of components) {
          const resolved = resolvedByItemId.get(comp.itemId);
          const submittedQty = parseFloat(comp.quantityPer);
          if (resolved) {
            // Compare submitted qty against resolved effectiveQty
            if (Math.abs(submittedQty - resolved.effectiveQty) > 0.0001) {
              quantityDeviations.push({
                itemId: comp.itemId,
                itemCode: resolved.itemCode,
                resolvedQty: resolved.effectiveQty,
                submittedQty,
                notes: comp.notes || null,
              });
            }
          }
          // Extra items (not in resolved) will be caught by the deviations array below
        }

        if (quantityDeviations.length > 0) {
          hasDeviations = true;
          const qtyDevDescriptions = quantityDeviations.map(d =>
            `${d.itemCode} (resolved: ${d.resolvedQty}, submitted: ${d.submittedQty})`
          );
          deviationNotes = `Quantity deviations: ${qtyDevDescriptions.join(', ')}`;
        }
      }

      // ── Process deviations (extra items added at kit time) ────────────
      const processedDeviations = [];
      const hasDeviationsArr = Array.isArray(deviations) && deviations.length > 0;
      if (hasDeviationsArr) {
        const devItemIds = deviations.map(d => d.itemId);
        const devItems = await prisma.item.findMany({
          where: { id: { in: devItemIds }, isActive: true },
          select: { id: true, itemCode: true, description: true, standardCost: true, unitOfMeasure: true, allowDecimalQty: true },
        });
        const devItemMap = new Map(devItems.map(i => [i.id, i]));

        for (const dev of deviations) {
          const devItem = devItemMap.get(dev.itemId);
          if (!devItem) {
            return res.status(400).json({ error: `Deviation item ${dev.itemId} not found or inactive` });
          }
          if (dev.itemId === finishedGoodId) {
            return res.status(400).json({ error: 'Finished good cannot be a deviation item' });
          }
          const devQty = parseFloat(dev.quantityPer);
          if (!devQty || devQty <= 0) {
            return res.status(400).json({ error: `Deviation quantityPer for ${devItem.itemCode} must be > 0` });
          }
          // Block decimal quantities for whole-unit items
          if (!allowsDecimals(devItem.unitOfMeasure) && !devItem.allowDecimalQty && !Number.isInteger(devQty)) {
            return res.status(400).json({
              error: `${devItem.itemCode} is measured in ${devItem.unitOfMeasure} — deviation quantityPer must be a whole number.`,
            });
          }

          const devUnitCost = devItem.standardCost ? Number(devItem.standardCost) : 0;
          processedDeviations.push({
            itemId: dev.itemId,
            itemCode: devItem.itemCode,
            quantityPer: devQty,
            notes: dev.notes || null,
          });

          // Add deviation to consumption list
          componentIds.push(dev.itemId);
          componentItemMap.set(dev.itemId, devItem);
          avgCostMap[dev.itemId] = devUnitCost;
          requiredPerComponent.push({
            itemId: dev.itemId,
            quantityPer: devQty,
            requiredQty: devQty * qtyProduced,
          });
          totalCost += devQty * qtyProduced * devUnitCost;
        }
        totalCost = Math.round(totalCost * 100) / 100;
        hasDeviations = true;
        const extraItemNotes = processedDeviations.map(d => `${d.itemCode} (qty: ${d.quantityPer}${d.notes ? ', ' + d.notes : ''})`).join('; ');
        deviationNotes = deviationNotes
          ? `${deviationNotes}; Extra items: ${extraItemNotes}`
          : `Extra items: ${extraItemNotes}`;
      }

      // Generate config key and snapshot (will be finalized inside transaction)
      // Deviations are excluded from config key by design
      configKey = generateConfigKey(bom.bomCode, preview.selections);
      configSnapshot = {
        bomId: bom.id,
        bomCode: bom.bomCode,
        selections: preview.selections,
        deviations: processedDeviations,
        quantityDeviations: quantityDeviations.length > 0 ? quantityDeviations : undefined,
        componentSnapshot: preview.resolved.map(r => ({
          itemId: r.itemId,
          itemCode: r.itemCode,
          quantityPer: r.quantityPer,
          scrapPercent: r.scrapPercent,
          cutDetails: r.cutDetails,
          effectiveQty: r.effectiveQty,
          unitCost: r.unitCost,
          source: r.source,
        })),
      };

    } else {
      // ── LEGACY PATH: frontend sends components[], validated against BOM ──

      if (!components || !Array.isArray(components) || components.length === 0) {
        return res.status(400).json({ error: 'At least one component is required' });
      }

      // Validate no self-referencing
      componentIds = components.map((c) => c.itemId);
      if (componentIds.includes(finishedGoodId)) {
        return res.status(400).json({ error: 'Finished good cannot be its own component' });
      }

      // Validate all component items exist and are active
      const componentItems = await prisma.item.findMany({
        where: { id: { in: componentIds }, isActive: true },
        select: { id: true, itemCode: true, standardCost: true, unitOfMeasure: true, allowDecimalQty: true },
      });
      componentItemMap = new Map(componentItems.map((i) => [i.id, i]));

      for (const comp of components) {
        if (!componentItemMap.has(comp.itemId)) {
          return res.status(400).json({ error: `Component item ${comp.itemId} not found or inactive` });
        }
      }

      // Block decimal quantities for whole-unit component items
      for (const comp of components) {
        const compItem = componentItemMap.get(comp.itemId);
        if (compItem && !allowsDecimals(compItem.unitOfMeasure) && !compItem.allowDecimalQty && !Number.isInteger(parseFloat(comp.quantityPer))) {
          return res.status(400).json({
            error: `${compItem.itemCode} is measured in ${compItem.unitOfMeasure} — quantityPer must be a whole number.`,
          });
        }
      }

      // Validate BOM and enforce component integrity if provided
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

        const extraComponents = components.filter((c) => !bomComponentMap.has(c.itemId));
        if (extraComponents.length > 0) {
          hasDeviations = true;
          const extraDescriptions = [];
          for (const ec of extraComponents) {
            const item = componentItemMap.get(ec.itemId);
            extraDescriptions.push(`${item?.itemCode ?? `ID ${ec.itemId}`} (qty: ${ec.quantityPer})`);
          }
          deviationNotes = `Extra components added: ${extraDescriptions.join(', ')}`;
        }
      }

      // Calculate required quantities
      requiredPerComponent = components.map((c) => ({
        itemId: c.itemId,
        quantityPer: parseFloat(c.quantityPer),
        requiredQty: parseFloat(c.quantityPer) * qtyProduced,
      }));

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
      for (const row of costRows) {
        avgCostMap[row.itemId] = Number(row.avgCost ?? 0);
      }

      // Calculate total cost with standardCost fallback
      for (const comp of requiredPerComponent) {
        let unitCost = avgCostMap[comp.itemId] ?? null;
        if (unitCost === null) {
          const item = componentItemMap.get(comp.itemId);
          unitCost = item?.standardCost ? Number(item.standardCost) : 0;
        }
        totalCost += comp.requiredQty * unitCost;
      }
      totalCost = Math.round(totalCost * 100) / 100;
    }

    // ── Stock availability check (both paths) ────────────────────────
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
      // Re-resolve inside transaction for atomicity (resolution path only)
      let finalRequiredPerComponent = requiredPerComponent;
      let finalAvgCostMap = avgCostMap;
      let finalTotalCost = totalCost;
      let finalConfigSnapshot = configSnapshot;

      if (previewResolved) {
        const { resolveBom } = require('../lib/resolveBom');
        const txResult = await resolveBom(bomId, selections, tx);
        if (txResult.errors.length > 0) {
          throw new Error(`Resolution failed: ${txResult.errors.join(', ')}`);
        }

        // Staleness check: compare re-resolved against preview
        const previewItems = previewResolved.resolved
          .map(r => `${r.itemId}:${r.effectiveQty}`)
          .sort()
          .join(',');
        const txItems = txResult.resolved
          .map(r => `${r.itemId}:${r.effectiveQty}`)
          .sort()
          .join(',');
        if (previewItems !== txItems) {
          throw new Error('BOM or options were modified after preview. Please refresh and try again.');
        }

        // Use the transaction-resolved data for final consumption
        finalRequiredPerComponent = txResult.resolved.map(r => ({
          itemId: r.itemId,
          quantityPer: r.effectiveQty,
          requiredQty: r.effectiveQty * qtyProduced,
        }));
        finalAvgCostMap = {};
        finalTotalCost = 0;
        for (const r of txResult.resolved) {
          finalAvgCostMap[r.itemId] = r.unitCost;
          finalTotalCost += r.effectiveQty * qtyProduced * r.unitCost;
        }
        finalTotalCost = Math.round(finalTotalCost * 100) / 100;

        // Add deviation costs back to finalTotalCost
        if (Array.isArray(deviations) && deviations.length > 0) {
          for (const dev of deviations) {
            const devUc = finalAvgCostMap[dev.itemId] ?? (componentItemMap.get(dev.itemId)?.standardCost ? Number(componentItemMap.get(dev.itemId).standardCost) : 0);
            finalTotalCost += parseFloat(dev.quantityPer) * qtyProduced * devUc;
          }
          finalTotalCost = Math.round(finalTotalCost * 100) / 100;
        }

        // Update snapshot with transaction-resolved data
        finalConfigSnapshot = {
          ...configSnapshot,
          componentSnapshot: txResult.resolved.map(r => ({
            itemId: r.itemId,
            itemCode: r.itemCode,
            quantityPer: r.quantityPer,
            scrapPercent: r.scrapPercent,
            cutDetails: r.cutDetails,
            effectiveQty: r.effectiveQty,
            unitCost: r.unitCost,
            source: r.source,
          })),
        };
      }

      const finalUnitCostPerFG = Math.round((finalTotalCost / qtyProduced) * 100) / 100;

      // 1. Create ProductionOrder with temp orderNumber
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: 'TEMP',
          bomId: bomId || null,
          finishedGoodId,
          location,
          quantityProduced: qtyProduced,
          totalCost: finalTotalCost,
          hasDeviations,
          deviationNotes,
          vinReference: vinReference || null,
          configurationSnapshot: finalConfigSnapshot,
          configurationKey: configKey,
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
      for (const comp of finalRequiredPerComponent) {
        let compUnitCost = finalAvgCostMap[comp.itemId] ?? null;
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

      // 3b. Create CONSUMPTION transactions for deviations
      if (Array.isArray(deviations) && deviations.length > 0) {
        for (const dev of deviations) {
          const devQty = parseFloat(dev.quantityPer) * qtyProduced;
          const devItem = componentItemMap.get(dev.itemId);
          let devUnitCost = finalAvgCostMap[dev.itemId] ?? null;
          if (devUnitCost === null) {
            devUnitCost = devItem?.standardCost ? Number(devItem.standardCost) : null;
          }

          await tx.transaction.create({
            data: {
              transactionType: 'CONSUMPTION',
              itemId: dev.itemId,
              location,
              quantity: -devQty,
              unitCost: devUnitCost !== null ? Math.round(devUnitCost * 100) / 100 : null,
              transactionDate: new Date(),
              notes: `[Kit ${updatedOrder.orderNumber}] Deviation: ${dev.notes || 'extra component'}`,
              createdBy: req.user.id,
              productionOrderId: order.id,
              batchId: kitBatchId,
            },
          });
        }
      }

      // 4. Create PRODUCTION transaction for finished good
      await tx.transaction.create({
        data: {
          transactionType: 'PRODUCTION',
          itemId: finishedGoodId,
          location,
          quantity: qtyProduced,
          unitCost: finalUnitCostPerFG,
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
    body('components').if(body('selections').not().exists()).isArray({ min: 1 }).withMessage('At least one component is required'),
    body('components.*.itemId').optional().isInt({ gt: 0 }).withMessage('Each component needs a valid itemId'),
    body('components.*.quantityPer').optional().isFloat({ gt: 0 }).withMessage('quantityPer must be > 0'),
    body('notes').optional({ nullable: true }).trim(),
    // Resolution path fields
    body('selections').optional().isArray(),
    body('selections.*.packageId').optional().custom((val) => {
      if (val === null) return true;
      if (Number.isInteger(val) && val > 0) return true;
      throw new Error('packageId must be a positive integer or null');
    }),
    body('selections.*.groupId').optional().isInt({ gt: 0 }),
    body('selections.*.quantity').optional().isInt({ gt: 0 }),
    body('vinReference').optional({ nullable: true }).trim().isLength({ max: 500 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { finishedGoodId, location, totalQuantity, bomId, components, notes, selections, vinReference } = req.body;
    const qty = parseInt(totalQuantity);
    const hasSelections = Array.isArray(selections) && selections.length > 0;

    // Validate finished good
    const finishedGood = await prisma.item.findUnique({ where: { id: finishedGoodId } });
    if (!finishedGood || !finishedGood.isActive) {
      return res.status(400).json({ error: 'Finished good item not found or inactive' });
    }

    // ── Resolution path vs Legacy path ──────────────────────────────────
    let hasDeviations = false;
    let deviationNotes = null;
    let configSnapshot = null;
    let configKey = null;
    let componentSnapshot;
    let componentIds;

    if (hasSelections && bomId) {
      // ── RESOLUTION PATH: backend resolves, freezes snapshot ──────────
      const { resolveBom } = require('../lib/resolveBom');
      const { generateConfigKey } = require('../lib/configKey');

      const bom = await prisma.bom.findUnique({ where: { id: bomId } });
      if (!bom) return res.status(400).json({ error: 'BOM not found' });
      if (bom.status !== 'ACTIVE') {
        return res.status(400).json({ error: `BOM ${bom.bomCode} is ${bom.status}. Only ACTIVE BOMs can be used.` });
      }

      const resolved = await resolveBom(bomId, selections);
      if (resolved.errors.length > 0) {
        return res.status(400).json({ error: 'Resolution failed', details: resolved.errors });
      }
      if (resolved.resolved.length === 0) {
        return res.status(400).json({ error: 'Resolution produced zero components' });
      }

      // Validate no self-referencing
      componentIds = resolved.resolved.map(r => r.itemId);
      if (componentIds.includes(finishedGoodId)) {
        return res.status(400).json({ error: 'Finished good cannot be its own component' });
      }

      // Build frozen snapshot from resolved data
      componentSnapshot = resolved.resolved.map(r => ({
        itemId: r.itemId,
        itemCode: r.itemCode,
        description: r.description,
        quantityPer: r.quantityPer,
        scrapPercent: r.scrapPercent,
        cutDetails: r.cutDetails,
        effectiveQty: r.effectiveQty,
        unitCost: r.unitCost,
        source: r.source,
      }));

      configKey = generateConfigKey(bom.bomCode, resolved.selections);
      configSnapshot = {
        bomId: bom.id,
        bomCode: bom.bomCode,
        selections: resolved.selections,
        deviations: [],
        componentSnapshot,
      };

    } else {
      // ── LEGACY PATH: frontend sends components[] ────────────────────

      if (!components || !Array.isArray(components) || components.length === 0) {
        return res.status(400).json({ error: 'At least one component is required' });
      }

      componentIds = components.map((c) => c.itemId);
      if (componentIds.includes(finishedGoodId)) {
        return res.status(400).json({ error: 'Finished good cannot be its own component' });
      }

      // Validate all component items exist and are active
      const componentItems = await prisma.item.findMany({
        where: { id: { in: componentIds }, isActive: true },
        select: { id: true, itemCode: true, description: true, unitOfMeasure: true, allowDecimalQty: true },
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
        if (compItem && !allowsDecimals(compItem.unitOfMeasure) && !compItem.allowDecimalQty && !Number.isInteger(parseFloat(comp.quantityPer))) {
          return res.status(400).json({
            error: `${compItem.itemCode} is measured in ${compItem.unitOfMeasure} — quantityPer must be a whole number.`,
          });
        }
      }

      // Validate BOM integrity if provided
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

      // Build legacy component snapshot
      componentSnapshot = components.map((c) => {
        const item = componentItemMap.get(c.itemId);
        return {
          itemId: c.itemId,
          itemCode: item?.itemCode ?? `ID:${c.itemId}`,
          description: item?.description ?? '',
          quantityPer: parseFloat(c.quantityPer),
        };
      });
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
    for (const comp of componentSnapshot) {
      const qtyPer = comp.effectiveQty ?? comp.quantityPer;
      const totalNeeded = qtyPer * qty;
      const onHand = stockMap[comp.itemId] ?? 0;
      const reserved = reservedMap.get(`${comp.itemId}_${location}`) || 0;
      const available = onHand - reserved;
      if (available < totalNeeded) {
        warnings.push({
          itemId: comp.itemId,
          itemCode: comp.itemCode,
          required: totalNeeded,
          available,
          short: totalNeeded - available,
        });
      }
    }

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
          vinReference: vinReference?.trim() || null,
          configurationSnapshot: configSnapshot,
          configurationKey: configKey,
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
    query('search').optional().trim(),
    query('vin').optional().trim(),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, location, from, to, search, vin } = req.query;
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
    if (vin) {
      where.vinReference = { contains: vin, mode: 'insensitive' };
    }
    if (search) {
      where.OR = [
        { vinReference: { contains: search, mode: 'insensitive' } },
        { finishedGood: { itemCode: { contains: search, mode: 'insensitive' } } },
        { finishedGood: { description: { contains: search, mode: 'insensitive' } } },
      ];
      // Also try matching by order ID if search is numeric
      const searchNum = /^\d+$/.test(search) ? parseInt(search) : NaN;
      if (!isNaN(searchNum)) {
        where.OR.push({ id: searchNum });
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
// GET /api/production/configurations — List unique configuration keys with usage counts
// ---------------------------------------------------------------------------
router.get(
  '/configurations',
  [
    query('bomCode').optional().trim(),
    query('finishedGoodId').optional().isInt({ gt: 0 }),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const where = {
      configurationKey: { not: null },
    };
    if (req.query.finishedGoodId) where.finishedGoodId = parseInt(req.query.finishedGoodId);

    // Group by configurationKey to get unique configs with counts
    const groupResult = await prisma.productionOrder.groupBy({
      by: ['configurationKey', 'finishedGoodId'],
      where,
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get total unique configs
    const totalResult = await prisma.productionOrder.groupBy({
      by: ['configurationKey'],
      where,
    });
    const total = totalResult.length;

    // Enrich with finished good info and a sample snapshot
    const configs = await Promise.all(
      groupResult.map(async (g) => {
        const sample = await prisma.productionOrder.findFirst({
          where: { configurationKey: g.configurationKey, finishedGoodId: g.finishedGoodId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            configurationSnapshot: true,
            finishedGood: { select: { id: true, itemCode: true, description: true } },
            bom: { select: { id: true, bomCode: true, name: true } },
          },
        });
        return {
          configurationKey: g.configurationKey,
          finishedGoodId: g.finishedGoodId,
          usageCount: g._count.id,
          lastUsed: g._max.createdAt,
          finishedGood: sample?.finishedGood || null,
          bom: sample?.bom || null,
          configurationSnapshot: sample?.configurationSnapshot || null,
        };
      })
    );

    return res.json({
      configurations: configs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/production/orders/:id/configuration — Return configuration snapshot for an order
// ---------------------------------------------------------------------------
router.get(
  '/orders/:id/configuration',
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const order = await prisma.productionOrder.findUnique({
      where: { id },
      select: {
        id: true,
        configurationKey: true,
        configurationSnapshot: true,
        vinReference: true,
        finishedGood: { select: { id: true, itemCode: true, description: true } },
        bom: { select: { id: true, bomCode: true, name: true } },
      },
    });

    if (!order) return res.status(404).json({ error: 'Production order not found' });

    return res.json({
      orderId: order.id,
      configurationKey: order.configurationKey,
      configurationSnapshot: order.configurationSnapshot,
      vinReference: order.vinReference,
      finishedGood: order.finishedGood,
      bom: order.bom,
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
