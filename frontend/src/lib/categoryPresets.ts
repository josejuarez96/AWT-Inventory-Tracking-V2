export const CATEGORY_PRESETS = [
  'Color',
  'Structure',
  'Doors/Windows',
  'Interior',
  'Exterior',
  'Electrical',
  'Vents/AC',
  'Tie Downs',
  'Tires/Wheels',
  'Miscellaneous',
] as const;

/** Sort categories by CATEGORY_PRESETS order; unknowns go to end alphabetically. */
export function sortCategories<T extends { name: string }>(categories: T[]): T[] {
  const order = new Map(CATEGORY_PRESETS.map((c, i) => [c, i]));
  return [...categories].sort((a, b) => {
    const ai = order.get(a.name as typeof CATEGORY_PRESETS[number]) ?? Infinity;
    const bi = order.get(b.name as typeof CATEGORY_PRESETS[number]) ?? Infinity;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}
