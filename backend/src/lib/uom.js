const DECIMAL_ALLOWED_UOMS = ['FT', 'LB', 'GAL', 'KG', 'M', 'SQ FT'];

function allowsDecimals(unitOfMeasure) {
  return DECIMAL_ALLOWED_UOMS.includes(unitOfMeasure?.toUpperCase());
}

module.exports = { DECIMAL_ALLOWED_UOMS, allowsDecimals };
