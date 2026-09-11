import type {
  Candidate,
  CodeConfig,
  DeriveResult,
  IssueRequest,
  IssueResult,
  MarketClaim,
  PropertyRecord,
  Registry,
  TraceStep,
} from './types.js';
import { ConflictError } from './types.js';
import { findBrand, isBlockedCode } from './rules/guards.js';
import { bindsSubmarket } from './rules/claim.js';
import { resolveMarket } from './rules/market.js';
import { alnum, flagCode, lettersOnly } from './rules/text.js';

export interface EngineDeps {
  config: CodeConfig;
  registry: Registry;
  /** Injectable for tests. */
  now?: () => Date;
  newId?: () => string;
}

function today(deps: EngineDeps): string {
  return (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
}

function newId(deps: EngineDeps): string {
  if (deps.newId) return deps.newId();
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Derive a candidate code without touching it.
 *
 * Safe to call on every keystroke: it reads the registry but writes nothing,
 * and the code it returns is only a proposal. Nothing is unique until
 * `issueCode` claims it (G8).
 */
export async function deriveCode(deps: EngineDeps, req: IssueRequest): Promise<DeriveResult> {
  const { config, registry } = deps;
  const trace: TraceStep[] = [];

  const flag = flagCode(req.brandCode);
  const brand = findBrand(config, flag);
  if (!brand) {
    return {
      ok: false,
      trace,
      failure: {
        code: 'unknown_flag',
        rule: 'B1',
        message: `${flag || '(none)'} is not in the brand table. Add the flag to the table before using it.`,
      },
    };
  }

  const market = await resolveMarket(config, registry, {
    city: req.city,
    state: req.state,
    submarket: req.submarket,
    flagCode: flag,
    marketOverride: req.marketOverride,
  });
  trace.push(...market.trace);
  if (!market.ok) return { ok: false, failure: market.failure, trace };

  const code = market.marketCode + flag;
  trace.push({
    rule: 'B1',
    detail: `${flag} — ${brand.name} (${brand.chainCode}), from the closed brand table.`,
  });

  if (!config.pattern.test(code)) {
    return {
      ok: false,
      trace,
      failure: { code: 'malformed', rule: 'G4', message: `${code} fails the G4 format check.` },
    };
  }
  if (isBlockedCode(config, code)) {
    return {
      ok: false,
      trace,
      failure: { code: 'blocked_string', rule: 'G7', message: `${code} fails the G7 blocked-string screen.` },
    };
  }
  if (await registry.hasCode(code)) {
    return {
      ok: false,
      trace,
      failure: {
        code: 'code_taken',
        rule: 'G3',
        message: `${code} has already been issued. Codes are never reused, in any status.`,
      },
    };
  }

  trace.push({ rule: 'G3', detail: 'Checked against the registry — active, pipeline, and retired.' });

  const candidate: Candidate = {
    code,
    marketCode: market.marketCode,
    flagCode: flag,
    submarket: (req.submarket ?? '').trim(),
    source: market.source,
    trace,
  };
  return { ok: true, candidate };
}

/**
 * Derive and claim in one call.
 *
 * The claim is atomic in the registry adapter, so two callers racing for the
 * same code produce one winner and one retry — never two records. On a lost
 * race this re-derives (the registry has moved on) up to `attempts` times,
 * which is how a second property in the same market naturally falls through
 * to M5 rather than failing.
 */
export async function issueCode(
  deps: EngineDeps,
  req: IssueRequest,
  attempts = 3,
): Promise<IssueResult> {
  let lastTrace: TraceStep[] = [];

  for (let attempt = 0; attempt < attempts; attempt++) {
    const derived = await deriveCode(deps, req);
    if (!derived.ok) return { ok: false, failure: derived.failure, trace: derived.trace };

    const { candidate } = derived;
    lastTrace = candidate.trace;
    const brand = findBrand(deps.config, candidate.flagCode)!;

    const record: PropertyRecord = {
      propertyId: req.propertyId ?? newId(deps),
      code: candidate.code,
      name: req.name.trim() || `${brand.name} ${req.city.trim()}`,
      brandCode: candidate.flagCode,
      brandName: brand.name,
      chainCode: brand.chainCode,
      marketCode: candidate.marketCode,
      city: req.city.trim(),
      state: req.state.toUpperCase(),
      submarket: candidate.submarket,
      franchisorCode: alnum(req.franchisorCode ?? '').slice(0, 12),
      status: req.status ?? 'active',
      predecessorCode: lettersOnly(req.predecessorCode ?? ''),
      effectiveDate: req.effectiveDate ?? today(deps),
      // MHG-branded only, so the PROP code is the inn code. See PropertyRecord.
      propCode: candidate.code,
    };

    // A base market code belongs to the market, so it carries no submarket;
    // only a split or an assigned code is bound to a specific place (M6, M7).
    const claim: MarketClaim = {
      marketCode: candidate.marketCode,
      city: record.city,
      state: record.state,
      submarket: bindsSubmarket(candidate.source) ? record.submarket : '',
      source: candidate.source,
      claimedAt: record.effectiveDate,
    };

    try {
      await deps.registry.claim(record, claim);
      return { ok: true, record, trace: candidate.trace };
    } catch (err) {
      if (err instanceof ConflictError) continue; // someone beat us here; re-derive
      throw err;
    }
  }

  return {
    ok: false,
    trace: lastTrace,
    failure: {
      code: 'race_lost',
      rule: 'G8',
      message: `Lost the registry race ${attempts} times. Retry, or issue with an explicit market override.`,
    },
  };
}

/**
 * G2 — a rebrand. Retires the old code permanently and issues a new one that
 * points back at it. The property keeps its internal id (G1), so nothing
 * downstream has to be repointed.
 */
export async function rebrand(
  deps: EngineDeps,
  oldCode: string,
  newBrandCode: string,
  overrides: Partial<IssueRequest> = {},
): Promise<IssueResult> {
  const code = lettersOnly(oldCode);
  const existing = await deps.registry.get(code);
  if (!existing) {
    return {
      ok: false,
      trace: [],
      failure: { code: 'code_taken', rule: 'G3', message: `${code} is not in the registry.` },
    };
  }

  const result = await issueCode(deps, {
    name: overrides.name ?? existing.name,
    city: overrides.city ?? existing.city,
    state: overrides.state ?? existing.state,
    brandCode: newBrandCode,
    submarket: overrides.submarket ?? existing.submarket,
    franchisorCode: overrides.franchisorCode ?? existing.franchisorCode,
    marketOverride: overrides.marketOverride,
    status: overrides.status ?? existing.status,
    predecessorCode: code,
    propertyId: existing.propertyId,
    effectiveDate: overrides.effectiveDate,
  });

  // Retire the old code only once the new one exists, so a failure here
  // never leaves the property without a code.
  if (result.ok) await deps.registry.setStatus(code, 'retired');
  return result;
}

export { validateCode, findBrand } from './rules/guards.js';
export { baseMarket, resolveMarket } from './rules/market.js';
