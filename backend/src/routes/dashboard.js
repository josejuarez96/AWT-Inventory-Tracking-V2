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

  const [totalItems, transactionsMTD, activeVendors, teamMembers] = await Promise.all([
    prisma.item.count({ where: { isActive: true } }),
    prisma.transaction.count({ where: { transactionDate: { gte: startOfMonth } } }),
    prisma.vendor.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  return res.json({ totalItems, transactionsMTD, activeVendors, teamMembers });
});

// GET /api/dashboard/low-stock
router.get('/low-stock', async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stockMap = await getStockMap();
  const totalStock = getTotalStockPerItem(stockMap);

  const items = await prisma.item.findMany({
    where: { isActive: true, minQuantity: { not: null } },
    select: {
      id: true,
      itemCode: true,
      description: true,
      category: true,
      unitOfMeasure: true,
      minQuantity: true,
    },
  });

  const lowStockItems = [];
  for (const item of items) {
    const currentStock = totalStock[item.id] ?? 0;
    const minQty = Number(item.minQuantity);
    if (currentStock > minQty) continue;

    // Calculate burn rate from last 30 days of outgoing transactions
    const outgoing = await prisma.transaction.aggregate({
      where: {
        itemId: item.id,
        transactionDate: { gte: thirtyDaysAgo },
        quantity: { lt: 0 },
      },
      _sum: { quantity: true },
    });

    const totalOutgoing = Math.abs(Number(outgoing._sum.quantity ?? 0));
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

// GET /api/dashboard/valuation
router.get('/valuation', async (req, res) => {
  // Get most recent unit cost per item+location from RECEIPTs
  const receipts = await prisma.transaction.findMany({
    where: { transactionType: 'RECEIPT', unitCost: { not: null } },
    orderBy: { transactionDate: 'desc' },
    select: { itemId: true, location: true, unitCost: true },
  });

  // Build last cost map: first encountered per key = most recent
  const lastCostMap = {};
  for (const r of receipts) {
    const key = `${r.itemId}_${r.location}`;
    if (!(key in lastCostMap)) {
      lastCostMap[key] = Number(r.unitCost);
    }
  }

  const stockMap = await getStockMap();

  let adel = 0;
  let calhoun = 0;

  for (const [key, qty] of Object.entries(stockMap)) {
    if (qty <= 0) continue;
    const cost = lastCostMap[key] ?? 0;
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
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      item: { select: { description: true } },
      vendor: { select: { vendorName: true } },
      user: { select: { fullName: true } },
    },
  });

  const activity = transactions.map((t) => {
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
      case 'ADJUSTMENT':
        description = `${name} adjusted ${item} by ${Number(t.quantity) >= 0 ? '+' : ''}${Number(t.quantity)} at ${loc}`;
        break;
      case 'TRANSFER':
        description = `${name} transferred ${qty} × ${item} to ${loc}`;
        break;
      case 'OPENING_BALANCE':
        description = `${name} set opening balance of ${qty} × ${item} at ${loc}`;
        break;
      default:
        description = `${name} recorded ${qty} × ${item} at ${loc}`;
    }

    return {
      id: t.id,
      description,
      transactionType: t.transactionType,
      location: t.location,
      transactionDate: t.transactionDate,
      createdAt: t.createdAt,
    };
  });

  return res.json({ activity });
});

module.exports = router;
