/**
 * BOM Resolution Engine
 *
 * Takes a BOM ID and a set of option package selections, then resolves the
 * final component list by applying ADDs, REMOVEs, scrap percentages, and
 * quantity multipliers on top of the base BOM.
 *
 * Used by:
 * - POST /api/boms/:bomId/resolve  (preview)
 * - POST /api/production/kit        (re-resolved inside transaction)
 */

const prisma = require('./prisma');

/**
 * Round to 4 decimal places — the canonical rounding for effectiveQty.
 * All stock checks and transaction postings use this same precision.
 */
function round4(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * Resolve a BOM with option selections into a final component list.
 *
 * @param {number} bomId - The BOM to resolve
 * @param {Array<{packageId: number, quantity?: number}>} selections - Option package selections
 * @param {object} [tx=prisma] - Prisma client or transaction handle
 * @returns {{ resolved, changes, selections: Array, warnings: string[], errors: string[] }}
 */
async function resolveBom(bomId, selections = [], tx = prisma) {
  const errors = [];
  const warnings = [];
  const changes = [];

  // ── 1. Load the BOM with base lines ─────────────────────────────────
  const bom = await tx.bom.findUnique({
    where: { id: bomId },
    include: {
      lines: {
        include: {
          item: {
            select: {
              id: true, itemCode: true, description: true,
              unitOfMeasure: true, allowDecimalQty: true,
              stockLength: true, standardCost: true,
            },
          },
        },
      },
      optionGroups: {
        include: {
          packages: {
            where: { status: 'ACTIVE' },
            include: {
              lines: {
                include: {
                  item: {
                    select: {
                      id: true, itemCode: true, description: true,
                      unitOfMeasure: true, allowDecimalQty: true,
                      stockLength: true, standardCost: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!bom) {
    return { resolved: [], changes: [], selections: [], warnings: [], errors: ['BOM not found'] };
  }

  if (bom.status !== 'ACTIVE') {
    return { resolved: [], changes: [], selections: [], warnings: [], errors: ['BOM must be ACTIVE to resolve'] };
  }

  // ── 2. Build base component map ─────────────────────────────────────
  // Key: `${itemId}` for non-cut items, `${itemId}:${scrapPercent}` for cut items
  // This allows same item with different scrap rates to stay separate.
  const baseMap = new Map(); // key → resolved entry

  for (const line of bom.lines) {
    const qtyPer = Number(line.quantityPer);
    const scrap = line.scrapPercent != null ? Number(line.scrapPercent) : null;
    const key = scrap != null ? `${line.itemId}:${scrap}` : `${line.itemId}`;
    const effectiveQty = scrap != null ? round4(qtyPer * (1 + scrap / 100)) : round4(qtyPer);

    baseMap.set(key, {
      itemId: line.item.id,
      itemCode: line.item.itemCode,
      description: line.item.description,
      unitOfMeasure: line.item.unitOfMeasure,
      quantityPer: qtyPer,
      scrapPercent: scrap,
      cutDetails: line.cutDetails ?? null,
      effectiveQty,
      unitCost: 0, // filled later
      source: 'BASE',
    });
  }

  // ── 3. Index option groups and packages ─────────────────────────────
  const groupMap = new Map(); // groupId → group (with packages)
  const packageMap = new Map(); // packageId → { pkg, group }

  for (const group of bom.optionGroups) {
    groupMap.set(group.id, group);
    for (const pkg of group.packages) {
      packageMap.set(pkg.id, { pkg, group });
    }
  }

  // ── 4. Validate selections ──────────────────────────────────────────
  const selectionsByGroup = new Map(); // groupId → [{ pkg, quantity }]
  const selectedPackageIds = new Set();
  const explicitNoneGroups = new Set(); // groups where user explicitly chose "None"
  const normalizedSelections = []; // for response

  for (const sel of selections) {
    // Explicit "None" override: packageId is null, groupId identifies the group
    if (sel.packageId === null) {
      const groupId = sel.groupId;
      if (!groupId || !groupMap.has(groupId)) {
        errors.push(`Explicit "None" selection requires a valid groupId`);
        continue;
      }
      const group = groupMap.get(groupId);
      explicitNoneGroups.add(groupId);
      // Mark group as having an explicit selection (empty array = "None")
      if (!selectionsByGroup.has(groupId)) {
        selectionsByGroup.set(groupId, []);
      }
      normalizedSelections.push({
        groupId: group.id,
        groupName: group.name,
        selectionType: group.selectionType,
        packageId: null,
        packageName: 'None (base)',
        quantity: 0,
        allowQuantity: false,
      });
      continue;
    }

    const entry = packageMap.get(sel.packageId);
    if (!entry) {
      errors.push(`Package ${sel.packageId} not found or not ACTIVE on this BOM`);
      continue;
    }
    const { pkg, group } = entry;

    // Validate packageId belongs to the specified group (if groupId provided)
    if (sel.groupId && sel.groupId !== group.id) {
      errors.push(`Package '${pkg.name}' (id ${pkg.id}) belongs to group '${group.name}', not group ${sel.groupId}`);
      continue;
    }

    if (selectedPackageIds.has(pkg.id)) {
      continue; // ignore duplicate selections
    }
    selectedPackageIds.add(pkg.id);

    // Validate quantity for allowQuantity packages
    const quantity = pkg.allowQuantity ? (sel.quantity ?? pkg.minQuantity) : 1;
    if (pkg.allowQuantity) {
      if (quantity < pkg.minQuantity) {
        errors.push(`Package '${pkg.name}': quantity ${quantity} below minimum ${pkg.minQuantity}`);
        continue;
      }
      if (pkg.maxQuantity != null && quantity > pkg.maxQuantity) {
        errors.push(`Package '${pkg.name}': quantity ${quantity} above maximum ${pkg.maxQuantity}`);
        continue;
      }
    }

    if (!selectionsByGroup.has(group.id)) {
      selectionsByGroup.set(group.id, []);
    }
    selectionsByGroup.get(group.id).push({ pkg, quantity });

    normalizedSelections.push({
      groupId: group.id,
      groupName: group.name,
      selectionType: group.selectionType,
      packageId: pkg.id,
      packageName: pkg.name,
      quantity,
      allowQuantity: pkg.allowQuantity,
    });
  }

  // ── 5. Validate group constraints ───────────────────────────────────
  for (const [groupId, group] of groupMap) {
    const groupSels = selectionsByGroup.get(groupId) || [];

    if (group.selectionType === 'PICK_ONE') {
      if (groupSels.length > 1) {
        errors.push(`Group '${group.name}' (PICK_ONE): only one selection allowed, got ${groupSels.length}`);
      }
    }

    if (group.required && groupSels.length === 0) {
      if (explicitNoneGroups.has(groupId)) {
        errors.push(`Group '${group.name}' is required — cannot select "None"`);
      } else {
        // Check for default package
        const defaultPkg = group.packages.find(p => p.isDefault);
        if (!defaultPkg) {
          errors.push(`Group '${group.name}' is required but has no selection and no default`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { resolved: [], changes: [], selections: normalizedSelections, warnings, errors };
  }

  // ── 6. Apply defaults for groups with no explicit selection ──────────
  for (const [groupId, group] of groupMap) {
    if (selectionsByGroup.has(groupId)) continue; // explicit selection exists

    const defaultPkg = group.packages.find(p => p.isDefault);
    if (defaultPkg) {
      const quantity = defaultPkg.allowQuantity ? defaultPkg.minQuantity : 1;
      selectionsByGroup.set(groupId, [{ pkg: defaultPkg, quantity }]);
      normalizedSelections.push({
        groupId: group.id,
        groupName: group.name,
        selectionType: group.selectionType,
        packageId: defaultPkg.id,
        packageName: defaultPkg.name,
        quantity,
        allowQuantity: defaultPkg.allowQuantity,
      });
      changes.push(`Default applied: '${defaultPkg.name}' for group '${group.name}'`);
    } else {
      // No selection, no default — record "None (base)" in selections
      normalizedSelections.push({
        groupId: group.id,
        groupName: group.name,
        selectionType: group.selectionType,
        packageId: null,
        packageName: 'None (base)',
        quantity: 0,
        allowQuantity: false,
      });
    }
  }

  // ── 7. Process REMOVEs first ────────────────────────────────────────
  const resolvedMap = new Map(baseMap); // clone base
  const removeTracker = new Map(); // itemId → [{ pkgName, qty }] — for conflict detection

  for (const [, groupSels] of selectionsByGroup) {
    for (const { pkg } of groupSels) {
      const removeLines = pkg.lines.filter(l => l.action === 'REMOVE');
      for (const line of removeLines) {
        const qtyToRemove = Number(line.quantityPer);

        // Check if item exists in base BOM
        const baseKey = findBaseKey(resolvedMap, line.itemId);
        if (!baseKey) {
          errors.push(`Package '${pkg.name}': cannot REMOVE ${line.item.itemCode} — not in base BOM`);
          continue;
        }

        // Track removes for conflict detection
        if (!removeTracker.has(line.itemId)) {
          removeTracker.set(line.itemId, []);
        }
        removeTracker.get(line.itemId).push({ pkgName: pkg.name, qty: qtyToRemove });

        const existing = resolvedMap.get(baseKey);
        const newQty = existing.quantityPer - qtyToRemove;

        if (newQty < 0) {
          errors.push(`Package '${pkg.name}': REMOVE ${line.item.itemCode} qty ${qtyToRemove} exceeds base qty ${existing.quantityPer}`);
        } else if (newQty === 0) {
          resolvedMap.delete(baseKey);
          changes.push(`Removed: ${line.item.itemCode} (by ${pkg.name})`);
        } else {
          const scrap = existing.scrapPercent;
          const effectiveQty = scrap != null ? round4(newQty * (1 + scrap / 100)) : round4(newQty);
          resolvedMap.set(baseKey, { ...existing, quantityPer: newQty, effectiveQty });
          changes.push(`Reduced: ${line.item.itemCode} by ${qtyToRemove} (by ${pkg.name})`);
        }
      }
    }
  }

  // Check for REMOVE conflicts (two packages removing same item)
  for (const [itemId, removes] of removeTracker) {
    if (removes.length > 1) {
      const pkgNames = removes.map(r => `'${r.pkgName}'`).join(' and ');
      errors.push(`Conflict: both ${pkgNames} remove item ${itemId}`);
    }
  }

  if (errors.length > 0) {
    return { resolved: [], changes: [], selections: normalizedSelections, warnings, errors };
  }

  // ── 8. Process ADDs ─────────────────────────────────────────────────
  for (const [, groupSels] of selectionsByGroup) {
    for (const { pkg, quantity: pkgQuantity } of groupSels) {
      const addLines = pkg.lines.filter(l => l.action === 'ADD');
      for (const line of addLines) {
        const baseQtyPer = Number(line.quantityPer);
        const qtyPer = baseQtyPer * pkgQuantity; // allowQuantity multiplier
        const scrap = line.scrapPercent != null ? Number(line.scrapPercent) : null;
        const cutDetails = line.cutDetails ?? null;
        const key = scrap != null ? `${line.itemId}:${scrap}` : `${line.itemId}`;
        const effectiveQty = scrap != null ? round4(qtyPer * (1 + scrap / 100)) : round4(qtyPer);

        if (resolvedMap.has(key)) {
          // Same item + same scrap: sum quantities
          const existing = resolvedMap.get(key);
          const newQty = existing.quantityPer + qtyPer;
          const newEffective = scrap != null ? round4(newQty * (1 + scrap / 100)) : round4(newQty);
          resolvedMap.set(key, {
            ...existing,
            quantityPer: newQty,
            effectiveQty: newEffective,
            source: existing.source === 'BASE' ? `BASE + ${pkg.name}` : `${existing.source} + ${pkg.name}`,
          });
        } else {
          resolvedMap.set(key, {
            itemId: line.item.id,
            itemCode: line.item.itemCode,
            description: line.item.description,
            unitOfMeasure: line.item.unitOfMeasure,
            quantityPer: qtyPer,
            scrapPercent: scrap,
            cutDetails,
            effectiveQty,
            unitCost: 0, // filled later
            source: pkg.name,
          });
        }
        changes.push(`Added: ${line.item.itemCode} x${qtyPer} (by ${pkg.name})`);
      }
    }
  }

  // ── 9. Validate final resolved list ─────────────────────────────────
  for (const [key, entry] of resolvedMap) {
    if (entry.effectiveQty <= 0) {
      errors.push(`Resolved quantity for ${entry.itemCode} is ${entry.effectiveQty} — must be > 0`);
    }
  }

  if (errors.length > 0) {
    return { resolved: [], changes: [], selections: normalizedSelections, warnings, errors };
  }

  // ── 10. Fetch weighted average costs ────────────────────────────────
  const itemIds = [...new Set([...resolvedMap.values()].map(e => e.itemId))];

  if (itemIds.length > 0) {
    const costRows = await tx.$queryRaw`
      SELECT "item_id" AS "itemId",
             SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS "avgCost"
      FROM transactions
      WHERE transaction_type IN ('RECEIPT', 'OPENING_BALANCE', 'PRODUCTION')
        AND unit_cost IS NOT NULL
        AND quantity > 0
        AND "item_id" = ANY(${itemIds}::int[])
      GROUP BY "item_id"
    `;
    const avgCostMap = {};
    for (const row of costRows) {
      avgCostMap[row.itemId] = Number(row.avgCost ?? 0);
    }

    // Also load standardCost for fallback (items already loaded, but for ADD-only items
    // that weren't in the base BOM, we need to fetch)
    const itemsForCost = await tx.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, standardCost: true },
    });
    const standardCostMap = {};
    for (const item of itemsForCost) {
      standardCostMap[item.id] = item.standardCost ? Number(item.standardCost) : 0;
    }

    for (const [, entry] of resolvedMap) {
      entry.unitCost = avgCostMap[entry.itemId] ?? standardCostMap[entry.itemId] ?? 0;
    }
  }

  // ── 11. Build final resolved array ──────────────────────────────────
  const resolved = [...resolvedMap.values()];

  return { resolved, changes, selections: normalizedSelections, warnings, errors };
}

/**
 * Find the base map key for an item by itemId.
 * Checks plain key first, then scrap-suffixed keys.
 */
function findBaseKey(map, itemId) {
  const plainKey = `${itemId}`;
  if (map.has(plainKey)) return plainKey;
  // Check for scrap-suffixed keys
  for (const key of map.keys()) {
    if (key.startsWith(`${itemId}:`)) return key;
  }
  return null;
}

module.exports = { resolveBom, round4 };
