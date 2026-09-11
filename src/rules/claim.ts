import type { MarketClaim } from '../types.js';
import { normalizePlace } from './text.js';

/**
 * What a market code is bound to, for the M7 "never reassigned" check.
 *
 * The distinction matters: a code that came from M1/M2 belongs to the
 * *market*, and every town inside it legitimately shares it — Newburgh sits
 * under EVV by design (M2, M8). A code derived from a city name, assigned by
 * the standards owner, or split off under M5 belongs to that specific place,
 * and nothing else may take it.
 */
export function claimIdentity(claim: MarketClaim): string {
  const state = claim.state.toUpperCase();
  switch (claim.source) {
    case 'metro':
    case 'airport':
      return `market:${claim.marketCode}`;
    case 'submarket':
    case 'override':
    case 'registered':
      // 'registered' is M6 reusing a split code — same binding as the split
      // that created it, so re-issuing into that submarket is not a reassignment.
      return `place:${normalizePlace(claim.city)}|${state}|${normalizePlace(claim.submarket)}`;
    default:
      return `place:${normalizePlace(claim.city)}|${state}`;
  }
}

/** True when a new claim would reassign a code that belongs to somewhere else (M7). */
export function conflicts(existing: MarketClaim, incoming: MarketClaim): boolean {
  return claimIdentity(existing) !== claimIdentity(incoming);
}

/** M6 — only a split or an assigned code indexes its submarket. A base market code does not. */
export function ownsSubmarket(claim: MarketClaim): boolean {
  return bindsSubmarket(claim.source) && !!claim.submarket.trim();
}

/** Sources whose codes are bound to a specific submarket rather than to the market. */
export function bindsSubmarket(source: MarketClaim['source']): boolean {
  return source === 'submarket' || source === 'override' || source === 'registered';
}
