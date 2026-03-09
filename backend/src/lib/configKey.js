/**
 * Generate a deterministic configuration key from BOM code and selections.
 *
 * Format: BOM-7K-UTIL::BLACKOUT+DRINGS:6+SPOILER
 * - bomCode as prefix
 * - "::" separator
 * - Sorted package names joined by "+"
 * - Quantity suffix ":N" only when allowQuantity=true AND quantity > 1
 * - packageId=null (explicit "None") selections excluded
 * - No active packages → "BOM-CODE::BASE"
 *
 * @param {string} bomCode
 * @param {Array<{packageId: number|null, packageName: string, quantity: number, allowQuantity?: boolean}>} selections
 * @returns {string}
 */
function generateConfigKey(bomCode, selections) {
  const activeSelections = selections
    .filter(s => s.packageId != null)
    .map(s => {
      const name = s.packageName.toUpperCase().replace(/\s+/g, '-');
      const needsQty = s.allowQuantity && s.quantity > 1;
      return { name, qty: needsQty ? s.quantity : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (activeSelections.length === 0) {
    return `${bomCode}::BASE`;
  }

  const parts = activeSelections.map(s =>
    s.qty != null ? `${s.name}:${s.qty}` : s.name
  );

  return `${bomCode}::${parts.join('+')}`;
}

module.exports = { generateConfigKey };
