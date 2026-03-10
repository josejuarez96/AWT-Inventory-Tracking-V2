const DECIMAL_ALLOWED_UOMS = ['FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT'];

const ALL_UOMS = [
  'EA', 'BOX', 'BUNDLE', 'ROLL', 'PACK', 'BAG', 'SHEET', 'SPOOL', 'SET', 'PAIR',
  'FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT',
];

function allowsDecimals(unitOfMeasure) {
  return DECIMAL_ALLOWED_UOMS.includes(unitOfMeasure?.toUpperCase());
}

module.exports = { DECIMAL_ALLOWED_UOMS, ALL_UOMS, allowsDecimals };
