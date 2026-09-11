import type { BrandEntry } from '../types.js';

/**
 * The closed brand table referenced by B1.
 *
 * MHG-branded hotels only. This tool issues codes for properties flying an MHG
 * flag; a hotel MHG manages under someone else's brand is out of scope and gets
 * no inn code here.
 *
 * That is why this table is two rows rather than the hundred-odd in the 2021
 * chain/brand sheet. The sheet is still the reference for reading a franchised
 * property's flag — it just isn't what this registry issues against.
 *
 * Codes are permanent and never reused (B4). To add an MHG brand, add a row;
 * never repurpose a code that has been issued against.
 */
export const MHG_BRANDS: BrandEntry[] = [
  // MAZ — Maz Hotel Group
  { code: 'BC', name: 'BYX Collection', chainCode: 'MAZ' },
  { code: 'LX', name: 'BYX Luxury', chainCode: 'MAZ' },
];

/** Parent company. One entry, because this registry only issues MHG flags. */
export const MHG_CHAINS: Record<string, string> = {
  MAZ: 'Maz Hotel Group',
};
