type CutPiece = {
  lengthInches: number;
  quantity: number;
};

type CutDetails = {
  pieces: CutPiece[];
  stockLengthInches?: number;
};

/**
 * Format cut details into a human-readable string.
 * Example: "2 x 78.75in" or "1 x 90in + 2 x 48in"
 */
export function formatCutDescription(cutDetails: unknown): string | null {
  if (!cutDetails || typeof cutDetails !== 'object') return null;
  const cd = cutDetails as CutDetails;
  if (!cd.pieces || !Array.isArray(cd.pieces) || cd.pieces.length === 0) return null;

  return cd.pieces
    .map(p => `${p.quantity} x ${p.lengthInches}in`)
    .join(' + ');
}

/**
 * Format effective quantity as a natural-language consumption hint.
 * For items with a known stock length, show approximate fraction of stock unit.
 * Examples: "~2/3 bar", "~1.5 bars", "2 bars"
 */
export function formatConsumption(
  effectiveQty: number,
  stockLength: number | null | undefined
): string | null {
  if (!stockLength || stockLength <= 0) return null;

  const bars = effectiveQty / stockLength;

  if (Math.abs(bars - Math.round(bars)) < 0.01) {
    const rounded = Math.round(bars);
    return `${rounded} bar${rounded !== 1 ? 's' : ''}`;
  }

  // Check common fractions
  const fractions: [number, string][] = [
    [0.25, '1/4'], [0.333, '1/3'], [0.5, '1/2'],
    [0.667, '2/3'], [0.75, '3/4'],
  ];

  const wholePart = Math.floor(bars);
  const fractPart = bars - wholePart;

  for (const [val, label] of fractions) {
    if (Math.abs(fractPart - val) < 0.05) {
      if (wholePart === 0) return `~${label} bar`;
      return `~${wholePart} ${label} bars`;
    }
  }

  // Fallback: round to 1 decimal
  return `~${bars.toFixed(1)} bars`;
}

/**
 * Parse cut details into individual piece descriptions for separate chip display.
 * Returns null if no cut details, or an array of strings like ["2 x 78.75in", "1 x 48in"]
 */
export function formatCutPieceChips(cutDetails: unknown): string[] | null {
  if (!cutDetails || typeof cutDetails !== 'object') return null;
  const cd = cutDetails as CutDetails;
  if (!cd.pieces || !Array.isArray(cd.pieces) || cd.pieces.length === 0) return null;

  return cd.pieces.map(p => `${p.quantity} x ${p.lengthInches}in`);
}

/**
 * Get precise decimal tooltip text.
 * Example: "Effective qty: 13.125 FT (includes 5% scrap)"
 */
export function formatEffectiveQtyTooltip(
  effectiveQty: number,
  uom: string,
  scrapPercent: number | null
): string {
  const base = `Effective qty: ${effectiveQty} ${uom}`;
  if (scrapPercent != null && scrapPercent > 0) {
    return `${base} (includes ${scrapPercent}% scrap)`;
  }
  return base;
}
