const prisma = require('./prisma');

/**
 * Calculate reserved quantities from all STAGED production order lines.
 * Returns a Map<"itemId_location", reservedQty>.
 *
 * Each STAGED line represents 1 unit of a finished good. The componentSnapshot
 * on each line stores [{itemId, itemCode, description, quantityPer}].
 * Reserved qty per component = quantityPer (since each line is 1 unit).
 *
 * @param {import('@prisma/client').PrismaClient} [tx] - Optional Prisma transaction client
 * @returns {Promise<Map<string, number>>}
 */
async function getReservedQuantitiesMap(tx) {
  const client = tx || prisma;

  const stagedLines = await client.productionOrderLine.findMany({
    where: { status: 'STAGED' },
    select: {
      componentSnapshot: true,
      productionOrder: {
        select: { location: true },
      },
    },
  });

  const map = new Map();

  for (const line of stagedLines) {
    const location = line.productionOrder.location;
    const components = line.componentSnapshot;

    if (!Array.isArray(components)) continue;

    for (const comp of components) {
      const key = `${comp.itemId}_${location}`;
      const existing = map.get(key) || 0;
      map.set(key, existing + Number(comp.quantityPer));
    }
  }

  return map;
}

/**
 * Get reserved quantity for a specific item at a specific location.
 *
 * @param {number} itemId
 * @param {string} location
 * @param {import('@prisma/client').PrismaClient} [tx] - Optional Prisma transaction client
 * @returns {Promise<number>}
 */
async function getReservedQty(itemId, location, tx) {
  const map = await getReservedQuantitiesMap(tx);
  return map.get(`${itemId}_${location}`) || 0;
}

module.exports = { getReservedQuantitiesMap, getReservedQty };
