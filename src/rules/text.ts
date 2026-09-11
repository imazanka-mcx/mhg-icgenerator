/** Text normalization shared by the M rules. Kept separate so the ladder reads as rules. */

/** Strip diacritics. */
export function fold(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * M3 — the canonical form of a place name: lowercase, letters and single
 * spaces only, with "St."/"Ft." spelled the way the standard requires.
 */
export function normalizePlace(s: string): string {
  return fold(s)
    .toLowerCase()
    .replace(/\bst\.?\b/g, 'st')
    .replace(/\bft\.?\b/g, 'fort')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Uppercase letters only — the alphabet every code segment is drawn from. */
export function lettersOnly(s: string): string {
  return fold(s).toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * A flag code as the brand table writes it: letters and digits, because some
 * brands are genuinely named with one (4P, H2, M6, S8).
 */
export function flagCode(s: string): string {
  return fold(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Uppercase letters and digits — franchisor codes may carry digits (G5). */
export function alnum(s: string): string {
  return fold(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The registry key for a market: "city|ST". */
export function marketKey(city: string, state: string): string {
  return `${normalizePlace(city)}|${state.toUpperCase()}`;
}

/** The registry key for a submarket: "city|ST|submarket" (M6). */
export function submarketKey(city: string, state: string, submarket: string): string {
  return `${normalizePlace(city)}|${state.toUpperCase()}|${normalizePlace(submarket)}`;
}
