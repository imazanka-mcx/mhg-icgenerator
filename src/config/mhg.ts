import type { CodeConfig } from '../types.js';
import { MHG_BRANDS, MHG_CHAINS } from './brands.js';
import {
  AIRPORT_CODES,
  METRO_CODES,
  SUBMARKET_LETTERS,
  buildReservedIata,
} from './markets.js';

/**
 * MHG-IC v1.0 — the operator config for Maz Hospitality Group.
 *
 * A second operator on OpsCore is a second object of this shape, not a fork
 * of the engine. Nothing below is referenced by name anywhere in `rules/`.
 */
export const MHG_CONFIG: CodeConfig = {
  id: 'mhg',
  version: '1.0',
  marketLength: 3,
  flagLength: 2,
  /**
   * G4 — three market letters, then the two-character flag. The flag may carry
   * a digit because some brands are named with one (4P, H2, M6, S8); 0 and 1
   * are excluded throughout because they read as O and I.
   */
  pattern: /^[A-Z]{3}[A-Z2-9]{2}$/,
  brands: MHG_BRANDS,
  chains: MHG_CHAINS,
  metroCodes: METRO_CODES,
  airportCodes: AIRPORT_CODES,
  reservedIata: buildReservedIata(),
  /** G7 — never issued as a market segment. */
  reservedMarkets: ['XXX', 'ZZZ', 'TBD', 'NEW', 'MHG'],
  /** G7 — a code containing any of these is refused. */
  blockedSubstrings: ['ASS', 'FUK', 'FUC', 'SHT', 'SEX', 'NAZ', 'KKK'],
  submarketLetters: SUBMARKET_LETTERS,
  /**
   * M5 fallback order. Leads with the directional letters so an unnamed
   * split still lands somewhere meaningful; I and O are absent because they
   * read as 1 and 0 on folios and key packets.
   */
  variantLadder: 'DEWNSARUMPBCFGHJKLQTVXYZ',
};
