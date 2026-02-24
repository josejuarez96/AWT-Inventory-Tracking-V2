export const CATEGORIES = [
  'Axles',
  'Brakes',
  'Couplers',
  'Electrical',
  'Fasteners',
  'Finished Goods',
  'Jacks & Accessories',
  'Lights',
  'Paint & Coatings',
  'Sheet Metal',
  'Steel',
  'Suspension',
  'Tires & Wheels',
  'Wood & Decking',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];
