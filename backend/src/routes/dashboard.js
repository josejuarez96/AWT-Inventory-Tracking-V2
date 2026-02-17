const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// Helper: get current stock position as a map { itemId_location → qty }
async function getStockMap() {
  const grouped = await prisma.transaction.groupBy({
    by: ['itemId', 'location'],
    _sum: { quantity: true },
  });
  const map = {};
  for (const row of grouped) {
    map[`${row.itemId}_${row.location}`] = Number(row._sum.quantity ?? 0);
  }
  return map;
}

// Helper: get total stock per item { itemId → totalQty }
function getTotalStockPerItem(stockMap) {
  const totals = {};
  for (const [key, qty] of Object.entries(stockMap)) {
    const itemId = parseInt(key.split('_')[0]);
    totals[itemId] = (totals[itemId] ?? 0) + qty;
  }
  return totals;
}

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const stockMap = await getStockMap();
  const totalStock = getTotalStockPerItem(stockMap);

  const [totalItems, transactionsMTD, activeVendors, teamMembers, overstockItems] = await Promise.all([
    prisma.item.count({ where: { isActive: true } }),
    prisma.transaction.count({ where: { transactionDate: { gte: startOfMonth } } }),
    prisma.vendor.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.item.findMany({
      where: { isActive: true, maxQuantity: { not: null } },
      select: { id: true, maxQuantity: true },
    }),
  ]);

  // Count items where current stock exceeds maxQuantity
  let overstockCount = 0;
  for (const item of overstockItems) {
    const currentStock = totalStock[item.id] ?? 0;
    const maxQty = Number(item.maxQuantity);
    if (currentStock > maxQty) overstockCount++;
  }

  return res.json({ totalItems, transactionsMTD, activeVendors, teamMembers, overstockCount });
});

// GET /api/dashboard/low-stock
router.get('/low-stock', async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch all data in parallel — 3 queries total (was 2 + N)
  const [stockMap, items, burnRateRows] = await Promise.all([
    getStockMap(),
    prisma.item.findMany({
      where: { isActive: true, minQuantity: { not: null } },
      select: {
        id: true,
        itemCode: true,
        description: true,
        category: true,
        unitOfMeasure: true,
        minQuantity: true,
        safetyStock: true,
      },
    }),
    // Single grouped query replaces per-item N+1 loop
    prisma.transaction.groupBy({
      by: ['itemId'],
      where: {
        transactionDate: { gte: thirtyDaysAgo },
        quantity: { lt: 0 },
      },
      _sum: { quantity: true },
    }),
  ]);

  const totalStock = getTotalStockPerItem(stockMap);

  // Build burn rate lookup: itemId → totalOutgoing (absolute value)
  const burnRateMap = {};
  for (const row of burnRateRows) {
    burnRateMap[row.itemId] = Math.abs(Number(row._sum.quantity ?? 0));
  }

  const lowStockItems = [];
  for (const item of items) {
    const currentStock = totalStock[item.id] ?? 0;
    const minQty = Number(item.minQuantity);
    const safety = Number(item.safetyStock ?? 0);
    const threshold = minQty + safety;
    if (currentStock > threshold) continue;

    const totalOutgoing = burnRateMap[item.id] ?? 0;
    const burnRate = totalOutgoing > 0 ? totalOutgoing / 30 : null;
    const daysRemaining = burnRate !== null && currentStock > 0
      ? Math.floor(currentStock / burnRate)
      : null;

    lowStockItems.push({
      id: item.id,
      itemCode: item.itemCode,
      description: item.description,
      category: item.category,
      unitOfMeasure: item.unitOfMeasure,
      currentStock,
      minQuantity: minQty,
      safetyStock: safety,
      burnRate: burnRate !== null ? Math.round(burnRate * 100) / 100 : null,
      daysRemaining,
    });
  }

  // Sort by daysRemaining asc, nulls last
  lowStockItems.sort((a, b) => {
    if (a.daysRemaining === null && b.daysRemaining === null) return 0;
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  return res.json({ items: lowStockItems });
});

// GET /api/dashboard/dead-stock
router.get('/dead-stock', async (req, res) => {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Find item IDs that had ANY transaction in the last 90 days
  const recentRows = await prisma.transaction.findMany({
    where: { transactionDate: { gte: ninetyDaysAgo } },
    select: { itemId: true },
    distinct: ['itemId'],
  });
  const recentItemIds = new Set(recentRows.map((r) => r.itemId));

  const stockMap = await getStockMap();
  const totalStock = getTotalStockPerItem(stockMap);

  const items = await prisma.item.findMany({
    where: { isActive: true },
    select: {
      id: true,
      itemCode: true,
      description: true,
      category: true,
    },
    orderBy: { itemCode: 'asc' },
  });

  // Dead stock: has stock, no recent activity
  const deadStockItems = items
    .filter((item) => {
      const stock = totalStock[item.id] ?? 0;
      return stock > 0 && !recentItemIds.has(item.id);
    })
    .map((item) => ({
      ...item,
      currentStock: totalStock[item.id] ?? 0,
    }));

  return res.json({ items: deadStockItems });
});

// Helper: compute weighted average cost per item using raw SQL (no memory bloat)
async function getWeightedAvgCostMap() {
  const rows = await prisma.$queryRaw`
    SELECT "item_id" AS "itemId",
           SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
    FROM transactions
    WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
      AND unit_cost IS NOT NULL
      AND quantity > 0
    GROUP BY "item_id"
  `;

  const avgCostMap = {};
  for (const row of rows) {
    avgCostMap[row.itemId] = Number(row.avgCost ?? 0);
  }
  return avgCostMap;
}

// GET /api/dashboard/valuation
router.get('/valuation', async (req, res) => {
  const [avgCostMap, stockMap] = await Promise.all([
    getWeightedAvgCostMap(),
    getStockMap(),
  ]);

  let adel = 0;
  let calhoun = 0;

  for (const [key, qty] of Object.entries(stockMap)) {
    if (qty <= 0) continue;
    const itemId = key.split('_')[0];
    const cost = avgCostMap[itemId] ?? 0;
    const value = qty * cost;
    if (key.endsWith('_ADEL')) {
      adel += value;
    } else if (key.endsWith('_CALHOUN')) {
      calhoun += value;
    }
  }

  return res.json({
    adel: Math.round(adel * 100) / 100,
    calhoun: Math.round(calhoun * 100) / 100,
    total: Math.round((adel + calhoun) * 100) / 100,
  });
});

// GET /api/dashboard/activity — last 20 transactions, human-readable
router.get('/activity', async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    take: 40, // fetch extra to account for filtered-out outbound transfer legs
    orderBy: { createdAt: 'desc' },
    include: {
      item: { select: { description: true } },
      vendor: { select: { vendorName: true } },
      user: { select: { fullName: true } },
    },
  });

  const activity = [];
  for (const t of transactions) {
    if (activity.length >= 20) break;

    // Skip outbound transfer legs (negative qty) to avoid duplicate entries
    if (t.transactionType === 'TRANSFER' && Number(t.quantity) < 0) continue;
    // Skip consumption legs — production entry covers the kitting event
    if (t.transactionType === 'CONSUMPTION') continue;

    const qty = Math.abs(Number(t.quantity));
    const name = t.user.fullName;
    const item = t.item.description;
    const loc = t.location;
    const vendor = t.vendor?.vendorName;

    let description;
    switch (t.transactionType) {
      case 'RECEIPT':
        description = `${name} received ${qty} × ${item} from ${vendor ?? 'unknown vendor'} at ${loc}`;
        break;
      case 'ADJUSTMENT': {
        const reason = t.notes?.match(/^\[(.+?)\]/)?.[1] ?? '';
        const reasonText = reason ? ` (${reason})` : '';
        description = `${name} adjusted ${item} by ${Number(t.quantity) >= 0 ? '+' : ''}${Number(t.quantity)} at ${loc}${reasonText}`;
        break;
      }
      case 'TRANSFER':
        description = `${name} transferred ${qty} × ${item} to ${loc}`;
        break;
      case 'OPENING_BALANCE':
        description = `${name} set opening balance of ${qty} × ${item} at ${loc}`;
        break;
      case 'PRODUCTION':
        description = `${name} produced ${qty} × ${item} at ${loc}`;
        break;
      default:
        description = `${name} recorded ${qty} × ${item} at ${loc}`;
    }

    activity.push({
      id: t.id,
      description,
      transactionType: t.transactionType,
      location: t.location,
      transactionDate: t.transactionDate,
      createdAt: t.createdAt,
    });
  }

  return res.json({ activity });
});

module.exports = router;
