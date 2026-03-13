export const DECIMAL_ALLOWED_UOMS = ['FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT'];

export const ALL_UOMS = [
  'EA', 'BOX', 'BUNDLE', 'ROLL', 'PACK', 'BAG', 'SHEET', 'SPOOL', 'SET', 'PAIR', 'PALLET',
  'FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT',
];

export function allowsDecimals(unitOfMeasure: string): boolean {
  return DECIMAL_ALLOWED_UOMS.includes(unitOfMeasure?.toUpperCase());
}
