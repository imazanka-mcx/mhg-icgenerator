/**
 * @mcx/inn-code — MHG Inn Code Standard (MHG-IC v1.0)
 *
 *   import { MHG_CONFIG, MemoryRegistry, issueCode } from '@mcx/inn-code';
 *
 *   const deps = { config: MHG_CONFIG, registry: new MemoryRegistry() };
 *   const result = await issueCode(deps, {
 *     name: 'Hampton Inn Evansville East',
 *     city: 'Evansville', state: 'IN', brandCode: 'HX',
 *     submarket: 'East', franchisorCode: 'EVVIN',
 *   });
 *   result.ok && result.record.code; // 'EVVHX'
 *
 * In OpsCore, swap MemoryRegistry for FirestoreRegistry from
 * '@mcx/inn-code/firestore' and run issuance server-side.
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
