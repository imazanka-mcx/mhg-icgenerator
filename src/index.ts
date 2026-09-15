/**
 * @mcx/inn-code — MHG Inn Code Standard (MHG-IC v1.0)
 *
 *   import { MHG_CONFIG, MemoryRegistry, issueCode } from '@mcx/inn-code';
 *
 *   const deps = { config: MHG_CONFIG, registry: new MemoryRegistry() };
 *   const result = await issueCode(deps, {
 *     name: 'BYX Collection Evansville East',
 *     city: 'Evansville', state: 'IN', brandCode: 'BC',
 *     submarket: 'East', franchisorCode: 'EVVIN',
 *   });
 *   result.ok && result.record.code; // 'EVVBC'
 *
 * Swap MemoryRegistry for a real one — FirestoreRegistry from
 * '@mcx/inn-code/firestore', or the Corporate Console's PrismaRegistry — and
 * run issuance server-side.
 */

export * from './types.js';
export { MHG_CONFIG } from './config/mhg.js';
export { MHG_BRANDS } from './config/brands.js';
export {
  METRO_CODES,
  AIRPORT_CODES,
  SUBMARKET_LETTERS,
  buildReservedIata,
} from './config/markets.js';
export { MemoryRegistry } from './registry/memory.js';
export {
  deriveCode,
  issueCode,
  rebrand,
  validateCode,
  findBrand,
  baseMarket,
  resolveMarket,
  type EngineDeps,
} from './engine.js';
export { normalizePlace, lettersOnly, marketKey, submarketKey } from './rules/text.js';

// Part of the Registry contract, not internals: an adapter has to decide
// whether an incoming claim reassigns someone else's market code (M7) and
// whether a claim owns its submarket (M6). Every implementation needs these,
// so they belong to the port.
export { conflicts, ownsSubmarket, bindsSubmarket, claimIdentity } from './rules/claim.js';
