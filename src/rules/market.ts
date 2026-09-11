import type {
  CodeConfig,
  Failure,
  MarketSource,
  Registry,
  TraceStep,
} from '../types.js';
import { isBlockedMarket } from './guards.js';
import { conflicts } from './claim.js';
import { lettersOnly, marketKey, normalizePlace } from './text.js';

export interface MarketRequest {
  city: string;
  state: string;
  submarket?: string;
  /** Present when resolving for issuance; absent when only a market is wanted. */
  flagCode?: string;
  marketOverride?: string;
}

export type MarketResult =
  | { ok: true; marketCode: string; source: MarketSource; trace: TraceStep[] }
  | { ok: false; failure: Failure; trace: TraceStep[] };

/**
 * M1–M4 — derive the base market code for a city, before any collision is
 * known. Pure: no registry, no flag.
 */
export function baseMarket(
  config: CodeConfig,
  city: string,
  state: string,
): { code: string | null; source: MarketSource; trace: TraceStep[] } {
  const trace: TraceStep[] = [];
  const key = marketKey(city, state);

  const metro = config.metroCodes[key];
  if (metro) {
    trace.push({ rule: 'M1', detail: `${metro} — IATA metropolitan area code for this market.` });
    return { code: metro, source: 'metro', trace };
  }

  const airport = config.airportCodes[key];
  if (airport) {
    trace.push({ rule: 'M2', detail: `${airport} — primary commercial airport serving this market.` });
    return { code: airport, source: 'airport', trace };
  }

  const name = lettersOnly(city);
  if (name.length < config.marketLength) {
    trace.push({ rule: 'M4c', detail: 'City name too short to derive from — standards-owner assignment required.' });
    return { code: null, source: 'letters', trace };
  }

  trace.push({ rule: 'M3', detail: 'No commercial airport on file — deriving from the city name.' });

  const first = name.slice(0, config.marketLength);
  if (!config.reservedIata[first] && !isBlockedMarket(config, first)) {
    trace.push({ rule: 'M3', detail: `${first} — first ${config.marketLength} letters, clear of every commercial IATA code.` });
    return { code: first, source: 'letters', trace };
  }
  trace.push({
    rule: 'M4',
    detail: config.reservedIata[first]
      ? `${first} rejected — that is the IATA code for ${config.reservedIata[first]}.`
      : `${first} rejected — reserved or blocked string.`,
  });

  // M4(a) — first letter plus the next consonants.
  const consonants = name.slice(1).replace(/[AEIOU]/g, '');
  const ladderA = (name[0] ?? '') + consonants.slice(0, config.marketLength - 1);
  if (
    ladderA.length === config.marketLength &&
    !config.reservedIata[ladderA] &&
    !isBlockedMarket(config, ladderA)
  ) {
    trace.push({ rule: 'M4a', detail: `${ladderA} — first letter plus the next two consonants.` });
    return { code: ladderA, source: 'letters', trace };
  }

  // M4(b) — first letters plus the last letter.
  const ladderB = name.slice(0, config.marketLength - 1) + name[name.length - 1];
  if (!config.reservedIata[ladderB] && !isBlockedMarket(config, ladderB)) {
    trace.push({ rule: 'M4b', detail: `${ladderB} — first two letters plus the last letter.` });
    return { code: ladderB, source: 'letters', trace };
  }

  trace.push({ rule: 'M4c', detail: 'Ladder exhausted — standards-owner assignment required.' });
  return { code: null, source: 'letters', trace };
}

/**
 * M5 — pick a submarket variant of `base`: the leading characters of the
 * market code plus a letter drawn from the submarket's name, then the
 * fallback ladder. Skips anything already claimed by another place (M7).
 */
export async function submarketVariant(
  config: CodeConfig,
  registry: Registry,
  base: string,
  submarket: string,
): Promise<string | null> {
  const prefix = base.slice(0, config.marketLength - 1);
  const candidates: string[] = [];

  const normalized = normalizePlace(submarket);
  const firstWord = normalized.split(' ')[0] ?? '';
  const named = config.submarketLetters[firstWord];
  if (named) candidates.push(named);
  const initial = lettersOnly(submarket)[0];
  if (initial) candidates.push(initial);
  for (const letter of config.variantLadder) candidates.push(letter);

  const seen = new Set<string>();
  for (const letter of candidates) {
    if (seen.has(letter)) continue;
    seen.add(letter);
    const candidate = prefix + letter;
    if (candidate === base) continue;
    if (config.reservedIata[candidate]) continue;
    if (isBlockedMarket(config, candidate)) continue;
    if (await registry.getMarketClaim(candidate)) continue; // M7 — belongs to somewhere else
    return candidate;
  }
  return null;
}

/**
 * The full M ladder, including the registry-aware rungs (M5, M6, M7).
 *
 * With no `flagCode` this stops after M1–M4 and returns the base market,
 * which is what a "what would this market's code be?" lookup wants.
 */
export async function resolveMarket(
  config: CodeConfig,
  registry: Registry,
  req: MarketRequest,
): Promise<MarketResult> {
  const trace: TraceStep[] = [];
  const submarket = (req.submarket ?? '').trim();

  // M4(c) — a standards-owner assignment short-circuits the ladder.
  if (req.marketOverride) {
    const override = lettersOnly(req.marketOverride).slice(0, config.marketLength);
    if (override.length !== config.marketLength) {
      return {
        ok: false,
        trace,
        failure: {
          code: 'market_unresolvable',
          rule: 'M4c',
          message: `Market override must be exactly ${config.marketLength} letters.`,
        },
      };
    }
    if (isBlockedMarket(config, override)) {
      return {
        ok: false,
        trace,
        failure: { code: 'blocked_string', rule: 'G7', message: `${override} is a reserved market code.` },
      };
    }
    const claim = await registry.getMarketClaim(override);
    const proposed = {
      marketCode: override, city: req.city, state: req.state,
      submarket, source: 'override' as const, claimedAt: '',
    };
    if (claim && conflicts(claim, proposed)) {
      return {
        ok: false,
        trace,
        failure: {
          code: 'market_conflict',
          rule: 'M7',
          message: `${override} already belongs to ${claim.city}, ${claim.state}${claim.submarket ? ` · ${claim.submarket}` : ''}. Market codes are never reassigned.`,
        },
      };
    }
    trace.push({ rule: 'M4c', detail: `${override} — standards-owner assignment.` });
    return { ok: true, marketCode: override, source: 'override', trace };
  }

  // M6 — this submarket may already own a code.
  let base: string | null = null;
  let source: MarketSource = 'letters';
  let fromRegisteredSubmarket = false;

  if (submarket) {
    const registered = await registry.findSubmarketCode(req.city, req.state, submarket);
    if (registered) {
      base = registered;
      source = 'registered';
      fromRegisteredSubmarket = true;
      trace.push({
        rule: 'M6',
        detail: `${registered} — already the registered code for ${submarket}. Every MHG house in this submarket uses it, whatever the flag.`,
      });
    }
  }

  if (!base) {
    const derived = baseMarket(config, req.city, req.state);
    trace.push(...derived.trace);
    if (!derived.code) {
      return {
        ok: false,
        trace,
        failure: {
          code: 'market_unresolvable',
          rule: 'M4c',
          message: `No market code could be derived for ${req.city}, ${req.state}. Assign one and pass it as a market override.`,
        },
      };
    }
    base = derived.code;
    source = derived.source;
  }

  // Without a flag there is no collision to test for.
  if (!req.flagCode) return { ok: true, marketCode: base, source, trace };

  const pair = base + req.flagCode;
  const taken = await registry.hasCode(pair);
  if (!taken && !isBlockedMarket(config, base)) {
    return { ok: true, marketCode: base, source, trace };
  }

  // M5 — the market has to split.
  trace.push({
    rule: 'M5',
    detail: `${pair} is already ${taken ? 'issued' : 'blocked'} — the market splits by submarket.`,
  });

  if (!submarket) {
    return {
      ok: false,
      trace,
      failure: {
        code: 'submarket_required',
        rule: 'M5',
        message: 'Name the submarket. M5 splits on a real place — East, West, Airport — not a counter.',
      },
    };
  }

  if (fromRegisteredSubmarket) {
    return {
      ok: false,
      trace,
      failure: {
        code: 'market_conflict',
        rule: 'M4c',
        message: `${submarket} already holds a property with this flag under ${base}. A second one in the same submarket needs a standards-owner assignment.`,
      },
    };
  }

  const variant = await submarketVariant(config, registry, base, submarket);
  if (!variant) {
    return {
      ok: false,
      trace,
      failure: {
        code: 'market_unresolvable',
        rule: 'M4c',
        message: `No submarket letter is left for ${base}. Standards-owner assignment required.`,
      },
    };
  }

  trace.push({
    rule: 'M5',
    detail: `${variant} — ${base.slice(0, config.marketLength - 1)} plus the letter for ${submarket}. Registered to that submarket permanently (M7).`,
  });
  return { ok: true, marketCode: variant, source: 'submarket', trace };
}
