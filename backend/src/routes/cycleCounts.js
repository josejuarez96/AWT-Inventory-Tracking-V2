const express = require('express');
const { body, query, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { LOCATIONS } = require('../lib/locations');

const router = express.Router();
router.use(authenticate);

// Variance thresholds — a line is "large" if it exceeds either
const VARIANCE_THRESHOLD_PCT = 0.10; // 10%
const VARIANCE_THRESHOLD_VALUE = 500; // $500

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

function isLargeVariance(systemQty, variance, varianceValue) {
  const sysNum = Number(systemQty);
  const varNum = Math.abs(Number(variance));
  const valNum = Math.abs(Number(varianceValue));
  if (sysNum > 0 && varNum / sysNum > VARIANCE_THRESHOLD_PCT) return true;
  if (valNum > VARIANCE_THRESHOLD_VALUE) return true;
  return false;
}

// ---------------------------------------------------------------------------
// POST /api/cycle-counts — Create a new cycle count
// ---------------------------------------------------------------------------
router.post(
  '/',
  [
    body('location').isIn(LOCATIONS).withMessage('location must be ADEL or CALHOUN'),
    body('itemSelection').isIn(['allItems', 'all', 'category', 'manual']).withMessage('itemSelection must be allItems, all, category, or manual'),
    body('category').optional().trim(),
    body('itemIds').optional().isArray(),
    body('assignedTo').optional().isInt({ gt: 0 }),
    body('blindCount').optional().isBoolean(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { location, itemSelection, category, itemIds, assignedTo, blindCount, notes } = req.body;

    // Determine which items to include
    let itemWhere = { isActive: true };

    if (itemSelection === 'category') {
      if (!category) {
        return res.status(400).json({ error: 'category is required when itemSelection is "category"' });
      }
      itemWhere.category = { equals: category, mode: 'insensitive' };
    } else if (itemSelection === 'manual') {
      if (!itemIds || itemIds.length === 0) {
        return res.status(400).json({ error: 'itemIds is required when itemSelection is "manual"' });
      }
      itemWhere.id = { in: itemIds };
    }

    // For "allItems" — every active item regardless of activity
    if (itemSelection === 'allItems') {
      // No additional filter needed — itemWhere already selects all active items
      // (category filter is only added for 'category' selection)
    }

    // For "all" — items with any activity at this location
    if (itemSelection === 'all') {
      const activeItemIds = await prisma.transaction.groupBy({
        by: ['itemId'],
        where: { location },
      });
      const ids = activeItemIds.map((r) => r.itemId);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No items have activity at this location' });
      }
      itemWhere.id = { in: ids };
    }

    const selectedItems = await prisma.item.findMany({
      where: itemWhere,
      select: { id: true, itemCode: true, standardCost: true },
      orderBy: { itemCode: 'asc' },
    });

    if (selectedItems.length === 0) {
      return res.status(400).json({ error: 'No active items match the selection criteria' });
    }

    // Snapshot system quantities via groupBy
    const qtyGrouped = await prisma.transaction.groupBy({
      by: ['itemId'],
      where: {
        itemId: { in: selectedItems.map((i) => i.id) },
        location,
      },
      _sum: { quantity: true },
    });
    const qtyMap = {};
    for (const row of qtyGrouped) {
      qtyMap[row.itemId] = Number(row._sum.quantity ?? 0);
    }

    // Snapshot weighted average cost via raw SQL
    const itemIdList = selectedItems.map((i) => i.id);
    const costRows = await prisma.$queryRaw`
      SELECT "item_id" AS "itemId",
             SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
      FROM transactions
      WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
        AND unit_cost IS NOT NULL
        AND quantity > 0
        AND "item_id" = ANY(${itemIdList}::int[])
      GROUP BY "item_id"
    `;
    const costMap = {};
    for (const row of costRows) {
      costMap[row.itemId] = Number(row.avgCost ?? 0);
    }

    // Validate assignedTo if provided
    if (assignedTo) {
      const assignee = await prisma.user.findUnique({ where: { id: assignedTo } });
      if (!assignee || !assignee.isActive) {
        return res.status(400).json({ error: 'Assigned user not found or inactive' });
      }
    }

    // Create header + lines in a transaction
    const cycleCount = await prisma.$transaction(async (tx) => {
      const header = await tx.cycleCount.create({
        data: {
          countNumber: 'TEMP', // will update after we have the ID
          location,
          blindCount: blindCount || false,
          notes: notes || null,
          createdBy: req.user.id,
          assignedTo: assignedTo || null,
          lines: {
            create: selectedItems.map((item) => {
              // Priority: weighted avg from transactions > standardCost > null
              let unitCost = null;
              if (costMap[item.id]) {
                unitCost = Math.round(costMap[item.id] * 100) / 100;
              } else if (item.standardCost !== null) {
                unitCost = Number(item.standardCost);
              }
              return {
                itemId: item.id,
                systemQty: qtyMap[item.id] ?? 0,
                unitCost,
              };
            }),
          },
        },
        include: {
          lines: { include: { item: { select: { itemCode: true, description: true } } } },
          creator: { select: { fullName: true } },
          assignee: { select: { fullName: true } },
        },
      });

      // Set countNumber to CC-{id}
      const updated = await tx.cycleCount.update({
        where: { id: header.id },
        data: { countNumber: `CC-${header.id}` },
        include: {
          lines: { include: { item: { select: { itemCode: true, description: true } } } },
          creator: { select: { fullName: true } },
          assignee: { select: { fullName: true } },
        },
      });

      return updated;
    });

    return res.status(201).json({
      cycleCount: {
        ...cycleCount,
        lines: cycleCount.lines.map((l) => ({
          ...l,
          systemQty: Number(l.systemQty),
          countedQty: l.countedQty !== null ? Number(l.countedQty) : null,
          unitCost: l.unitCost !== null ? Number(l.unitCost) : null,
          variance: l.variance !== null ? Number(l.variance) : null,
          varianceValue: l.varianceValue !== null ? Number(l.varianceValue) : null,
        })),
      },
      lineCount: cycleCount.lines.length,
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/cycle-counts — List cycle counts
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('status').optional().isIn(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'POSTED', 'VOID']),
    query('location').optional().isIn(LOCATIONS),
    query('page').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ gt: 0, max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, location } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const where = {};
    if (status) where.status = status;
    if (location) where.location = location;

    // Non-admin sees counts they are assigned to OR counts they created
    if (req.user.role !== 'admin') {
      where.OR = [
        { assignedTo: req.user.id },
        { createdBy: req.user.id },
      ];
    }

    const [cycleCounts, total] = await Promise.all([
      prisma.cycleCount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { fullName: true } },
          assignee: { select: { fullName: true } },
          poster: { select: { fullName: true } },
          lines: {
            select: {
              id: true,
              countedQty: true,
              variance: true,
              varianceValue: true,
            },
          },
        },
      }),
      prisma.cycleCount.count({ where }),
    ]);

    const results = cycleCounts.map((cc) => {
      const totalLines = cc.lines.length;
      const countedLines = cc.lines.filter((l) => l.countedQty !== null).length;
      const totalVarianceValue = cc.lines.reduce(
        (sum, l) => sum + (l.varianceValue !== null ? Number(l.varianceValue) : 0),
        0
      );
      const { lines, ...header } = cc;
      return {
        ...header,
        totalLines,
        countedLines,
        totalVarianceValue: Math.round(totalVarianceValue * 100) / 100,
      };
    });

    return res.json({
      cycleCounts: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/cycle-counts/variance-history — Variance report (admin only)
// ---------------------------------------------------------------------------
router.get('/variance-history', requireAdmin, async (req, res) => {
  const { location, from, to, category } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const where = {
    variance: { not: 0 },
    cycleCount: { status: 'POSTED' },
  };

  if (location) where.cycleCount.location = location;
  if (category) where.item = { category: { equals: category, mode: 'insensitive' } };
  if (from || to) {
    where.cycleCount.postedAt = {};
    if (from) where.cycleCount.postedAt.gte = new Date(from);
    if (to) where.cycleCount.postedAt.lte = new Date(to);
  }

  const [lines, total] = await Promise.all([
    prisma.cycleCountLine.findMany({
      where,
      orderBy: { cycleCount: { postedAt: 'desc' } },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        item: { select: { itemCode: true, description: true, category: true } },
        cycleCount: { select: { countNumber: true, location: true, postedAt: true } },
      },
    }),
    prisma.cycleCountLine.count({ where }),
  ]);

  // Compute totals across ALL matching lines (not just the page)
  const totalsResult = await prisma.cycleCountLine.aggregate({
    where,
    _sum: { varianceValue: true },
  });

  // Separate positive/negative totals with raw approach
  const allVarianceLines = await prisma.cycleCountLine.findMany({
    where,
    select: { varianceValue: true },
  });

  let totalPositiveVariance = 0;
  let totalNegativeVariance = 0;
  for (const l of allVarianceLines) {
    const val = Number(l.varianceValue ?? 0);
    if (val > 0) totalPositiveVariance += val;
    else totalNegativeVariance += val;
  }

  return res.json({
    lines: lines.map((l) => ({
      id: l.id,
      countNumber: l.cycleCount.countNumber,
      postedAt: l.cycleCount.postedAt,
      location: l.cycleCount.location,
      itemCode: l.item.itemCode,
      description: l.item.description,
      category: l.item.category,
      systemQty: Number(l.systemQty),
      countedQty: l.countedQty !== null ? Number(l.countedQty) : null,
      variance: Number(l.variance),
      unitCost: l.unitCost !== null ? Number(l.unitCost) : null,
      varianceValue: Number(l.varianceValue),
    })),
    totals: {
      totalPositiveVariance: Math.round(totalPositiveVariance * 100) / 100,
      totalNegativeVariance: Math.round(totalNegativeVariance * 100) / 100,
      netVarianceValue: Math.round((totalPositiveVariance + totalNegativeVariance) * 100) / 100,
    },
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// ---------------------------------------------------------------------------
// GET /api/cycle-counts/variance-history/export — CSV download (admin only)
// ---------------------------------------------------------------------------
router.get('/variance-history/export', requireAdmin, async (req, res) => {
  const { location, from, to, category } = req.query;

  const where = {
    variance: { not: 0 },
    cycleCount: { status: 'POSTED' },
  };

  if (location) where.cycleCount.location = location;
  if (category) where.item = { category: { equals: category, mode: 'insensitive' } };
  if (from || to) {
    where.cycleCount.postedAt = {};
    if (from) where.cycleCount.postedAt.gte = new Date(from);
    if (to) where.cycleCount.postedAt.lte = new Date(to);
  }

  const lines = await prisma.cycleCountLine.findMany({
    where,
    orderBy: { cycleCount: { postedAt: 'desc' } },
    include: {
      item: { select: { itemCode: true, description: true, category: true } },
      cycleCount: { select: { countNumber: true, location: true, postedAt: true } },
    },
  });

  // Build CSV
  const headers = [
    'Count #', 'Date', 'Location', 'Item Code', 'Description', 'Category',
    'System Qty', 'Counted Qty', 'Variance', 'Unit Cost', 'Variance Value',
  ];

  const csvRows = [headers.join(',')];
  for (const l of lines) {
    const row = [
      l.cycleCount.countNumber,
      l.cycleCount.postedAt ? l.cycleCount.postedAt.toISOString().split('T')[0] : '',
      l.cycleCount.location,
      l.item.itemCode,
      `"${(l.item.description || '').replace(/"/g, '""')}"`,
      l.item.category || '',
      Number(l.systemQty),
      l.countedQty !== null ? Number(l.countedQty) : '',
      Number(l.variance),
      l.unitCost !== null ? Number(l.unitCost) : '',
      Number(l.varianceValue),
    ];
    csvRows.push(row.join(','));
  }

  const csv = csvRows.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="variance-history.csv"');
  return res.send(csv);
});

// ---------------------------------------------------------------------------
// GET /api/cycle-counts/:id — Cycle count detail
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  const cycleCount = await prisma.cycleCount.findUnique({
    where: { id },
    include: {
      creator: { select: { fullName: true } },
      assignee: { select: { fullName: true } },
      poster: { select: { fullName: true } },
      lines: {
        include: {
          item: { select: { itemCode: true, description: true, category: true, unitOfMeasure: true } },
        },
        orderBy: { item: { itemCode: 'asc' } },
      },
    },
  });

  if (!cycleCount) {
    return res.status(404).json({ error: 'Cycle count not found' });
  }

  // Non-admin can only see counts they are assigned to or created
  if (req.user.role !== 'admin' && cycleCount.assignedTo !== req.user.id && cycleCount.createdBy !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to view this cycle count' });
  }

  const totalLines = cycleCount.lines.length;
  const countedLines = cycleCount.lines.filter((l) => l.countedQty !== null).length;
  const linesWithVariance = cycleCount.lines.filter(
    (l) => l.variance !== null && Number(l.variance) !== 0
  ).length;
  const netVarianceValue = cycleCount.lines.reduce(
    (sum, l) => sum + (l.varianceValue !== null ? Number(l.varianceValue) : 0),
    0
  );
  const largeVarianceCount = cycleCount.lines.filter(
    (l) => l.variance !== null && l.varianceValue !== null &&
      isLargeVariance(l.systemQty, l.variance, l.varianceValue)
  ).length;

  return res.json({
    cycleCount: {
      ...cycleCount,
      lines: cycleCount.lines.map((l) => ({
        ...l,
        systemQty: Number(l.systemQty),
        countedQty: l.countedQty !== null ? Number(l.countedQty) : null,
        unitCost: l.unitCost !== null ? Number(l.unitCost) : null,
        variance: l.variance !== null ? Number(l.variance) : null,
        varianceValue: l.varianceValue !== null ? Number(l.varianceValue) : null,
        isLargeVariance: l.variance !== null && l.varianceValue !== null
          ? isLargeVariance(l.systemQty, l.variance, l.varianceValue)
          : false,
      })),
    },
    summary: {
      totalLines,
      countedLines,
      linesWithVariance,
      netVarianceValue: Math.round(netVarianceValue * 100) / 100,
      largeVarianceCount,
      requiresApproval: largeVarianceCount > 0,
    },
  });
});

// ---------------------------------------------------------------------------
// PUT /api/cycle-counts/:id/lines — Batch update counted quantities
// ---------------------------------------------------------------------------
router.put(
  '/:id/lines',
  [body('lines').isArray({ min: 1 }).withMessage('lines must be a non-empty array')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const cycleCount = await prisma.cycleCount.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!cycleCount) {
      return res.status(404).json({ error: 'Cycle count not found' });
    }

    // Non-admin can only update counts they are assigned to or created
    if (req.user.role !== 'admin' && cycleCount.assignedTo !== req.user.id && cycleCount.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this cycle count' });
    }

    if (!['DRAFT', 'IN_PROGRESS', 'COMPLETED'].includes(cycleCount.status)) {
      return res.status(400).json({ error: `Cannot update lines when status is ${cycleCount.status}` });
    }

    const { lines } = req.body;

    // Build a map of existing lines
    const lineMap = new Map(cycleCount.lines.map((l) => [l.id, l]));

    // Validate all line IDs exist in this count
    for (const update of lines) {
      if (!lineMap.has(update.lineId)) {
        return res.status(400).json({ error: `Line ID ${update.lineId} not found in this cycle count` });
      }
      if (update.countedQty !== undefined && update.countedQty !== null && isNaN(Number(update.countedQty))) {
        return res.status(400).json({ error: `Invalid countedQty for line ${update.lineId}` });
      }
    }

    // Update each line and compute variance
    const updates = lines.map((update) => {
      const existing = lineMap.get(update.lineId);
      const countedQty = update.countedQty !== undefined && update.countedQty !== null
        ? Number(update.countedQty)
        : null;
      const systemQty = Number(existing.systemQty);
      const unitCost = existing.unitCost !== null ? Number(existing.unitCost) : 0;
      const variance = countedQty !== null ? countedQty - systemQty : null;
      const varianceValue = variance !== null ? Math.round(variance * unitCost * 100) / 100 : null;

      return prisma.cycleCountLine.update({
        where: { id: update.lineId },
        data: {
          countedQty,
          variance,
          varianceValue,
        },
      });
    });

    await prisma.$transaction(updates);

    // Determine new status based on how many lines are counted
    const updatedCount = await prisma.cycleCount.findUnique({
      where: { id },
      include: { lines: true },
    });

    const totalLines = updatedCount.lines.length;
    const countedLines = updatedCount.lines.filter((l) => l.countedQty !== null).length;

    let newStatus = updatedCount.status;
    if (countedLines > 0 && countedLines < totalLines && updatedCount.status === 'DRAFT') {
      newStatus = 'IN_PROGRESS';
    } else if (countedLines === totalLines && updatedCount.status !== 'COMPLETED') {
      newStatus = 'COMPLETED';
    } else if (countedLines > 0 && countedLines < totalLines && updatedCount.status === 'COMPLETED') {
      // Edge case: if a count was cleared, revert to IN_PROGRESS
      newStatus = 'IN_PROGRESS';
    }

    if (newStatus !== updatedCount.status) {
      await prisma.cycleCount.update({
        where: { id },
        data: { status: newStatus },
      });
    }

    return res.json({
      message: 'Lines updated',
      linesUpdated: lines.length,
      status: newStatus,
      totalLines,
      countedLines,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/cycle-counts/:id/post — Post/Approve cycle count
// ---------------------------------------------------------------------------
router.post('/:id/post', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  const cycleCount = await prisma.cycleCount.findUnique({
    where: { id },
    include: {
      lines: {
        include: { item: { select: { itemCode: true } } },
      },
    },
  });

  if (!cycleCount) {
    return res.status(404).json({ error: 'Cycle count not found' });
  }

  if (cycleCount.status !== 'COMPLETED') {
    return res.status(400).json({ error: `Cannot post a cycle count with status ${cycleCount.status}. Must be COMPLETED.` });
  }

  // Check for large variances
  const largeVarianceLines = cycleCount.lines.filter(
    (l) => l.variance !== null && l.varianceValue !== null &&
      isLargeVariance(l.systemQty, l.variance, l.varianceValue)
  );

  // Non-admin must provide admin authorization for large variances
  if (req.user.role !== 'admin' && largeVarianceLines.length > 0) {
    const adminAuthHeader = req.headers['x-admin-authorization'];
    if (!adminAuthHeader) {
      return res.status(403).json({
        error: 'Admin authorization required for large variances',
        requiresApproval: true,
        flaggedLines: largeVarianceLines.map((l) => ({
          itemCode: l.item.itemCode,
          systemQty: Number(l.systemQty),
          countedQty: l.countedQty !== null ? Number(l.countedQty) : null,
          variance: Number(l.variance),
          varianceValue: Number(l.varianceValue),
        })),
        flaggedCount: largeVarianceLines.length,
      });
    }

    const isValidAdmin = await verifyAdminCredentials(adminAuthHeader);
    if (!isValidAdmin) {
      return res.status(403).json({
        error: 'Invalid admin credentials',
        requiresApproval: true,
        flaggedLines: largeVarianceLines.map((l) => ({
          itemCode: l.item.itemCode,
          systemQty: Number(l.systemQty),
          countedQty: l.countedQty !== null ? Number(l.countedQty) : null,
          variance: Number(l.variance),
          varianceValue: Number(l.varianceValue),
        })),
        flaggedCount: largeVarianceLines.length,
      });
    }
  }

  // Create adjustment transactions for non-zero variances
  const linesWithVariance = cycleCount.lines.filter(
    (l) => l.variance !== null && Number(l.variance) !== 0
  );

  const result = await prisma.$transaction(async (tx) => {
    const adjustments = [];

    for (const line of linesWithVariance) {
      const adjustment = await tx.transaction.create({
        data: {
          transactionType: 'ADJUSTMENT',
          itemId: line.itemId,
          location: cycleCount.location,
          quantity: Number(line.variance),
          unitCost: line.unitCost !== null ? Number(line.unitCost) : null,
          transactionDate: new Date(),
          notes: `[Cycle Count] ${cycleCount.countNumber}: ${line.item.itemCode} counted ${Number(line.countedQty)}, system was ${Number(line.systemQty)}`,
          createdBy: req.user.id,
        },
      });

      // Link adjustment back to the cycle count line
      await tx.cycleCountLine.update({
        where: { id: line.id },
        data: { adjustmentId: adjustment.id },
      });

      adjustments.push(adjustment);
    }

    // Update cycle count status
    await tx.cycleCount.update({
      where: { id },
      data: {
        status: 'POSTED',
        postedBy: req.user.id,
        postedAt: new Date(),
      },
    });

    return adjustments;
  });

  return res.json({
    message: `Cycle count ${cycleCount.countNumber} posted`,
    adjustmentsCreated: result.length,
    status: 'POSTED',
  });
});

// ---------------------------------------------------------------------------
// POST /api/cycle-counts/:id/void — Void/cancel a cycle count (admin only)
// ---------------------------------------------------------------------------
router.post('/:id/void', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  const cycleCount = await prisma.cycleCount.findUnique({ where: { id } });

  if (!cycleCount) {
    return res.status(404).json({ error: 'Cycle count not found' });
  }

  if (!['DRAFT', 'IN_PROGRESS', 'COMPLETED'].includes(cycleCount.status)) {
    return res.status(400).json({ error: `Cannot void a cycle count with status ${cycleCount.status}` });
  }

  // Non-admins can only void DRAFT/IN_PROGRESS counts they created or are assigned to
  if (req.user.role !== 'admin') {
    if (cycleCount.status === 'COMPLETED') {
      return res.status(403).json({ error: 'Only admins can void a completed cycle count' });
    }
    if (cycleCount.createdBy !== req.user.id && cycleCount.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to void this cycle count' });
    }
  }

  await prisma.cycleCount.update({
    where: { id },
    data: { status: 'VOID' },
  });

  return res.json({
    message: `Cycle count ${cycleCount.countNumber} voided`,
    status: 'VOID',
  });
});

module.exports = router;
