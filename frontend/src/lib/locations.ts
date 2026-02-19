export const LOCATIONS = ['ADEL', 'CALHOUN'] as const;
export type Location = (typeof LOCATIONS)[number];
