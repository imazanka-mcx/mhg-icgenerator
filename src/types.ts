/**
 * MHG Inn Code Standard — type surface.
 *
 * Everything the engine needs is data on a CodeConfig, so a second operator
 * is a second config object rather than a fork of this package (see the
 * "built to generalize" decision in the standard's changelog).
 */

/** A rule identifier from the standard: "M2", "M4a", "B1", "G7". */
export type RuleId = string;

/** One step of a derivation, in the order the rules fired. */
export interface TraceStep {
  rule: RuleId;
  detail: string;
}

export interface BrandEntry {
  /** Two-character flag code. Permanent — never reused (B4). */
  code: string;
  name: string;
  /** Parent company: MAR, HIL, MAZ. Not encoded in the inn code. */
  chainCode: string;
  /** What the 2021 sheet called this brand, when the code was reassigned. */
  wasCode?: string;
  /** Brand no longer sold by the franchisor. Code stays reserved (B4). */
  retired?: boolean;
}

export type PropertyStatus = 'pipeline' | 'active' | 'retired';

/** How a market code came to be — recorded so M7 can be audited later. */
export type MarketSource =
  | 'override'    // M4c, standards-owner assignment
  | 'metro'       // M1
  | 'airport'     // M2
  | 'letters'     // M3 / M4a / M4b
  | 'submarket'   // M5
  | 'registered'; // M6, this submarket already owns a code

/** A market or submarket code and the place it permanently belongs to (M6, M7). */
export interface MarketClaim {
  marketCode: string;
  city: string;
  state: string;
  /** Empty for a base market code; set for a submarket split. */
  submarket: string;
  source: MarketSource;
  claimedAt: string;
}

export interface PropertyRecord {
  /** Immutable internal key. Never the inn code (G1). */
  propertyId: string;
  /** The five characters. */
  code: string;
  name: string;
  brandCode: string;
  brandName: string;
  /** Parent company of the flag, copied from the brand table at issuance. */
  chainCode: string;
  marketCode: string;
  city: string;
  state: string;
  submarket: string;
  /**
   * A prior franchisor's code for this property, when it converted from a flag
   * — EVVIN and the like. Cross-reference only, never an identifier here (G5).
   */
  franchisorCode: string;
  status: PropertyStatus;
  /** Set when this code replaced another on a rebrand (G2). */
  predecessorCode: string;
  /** Date the code was issued, not the opening date. */
  effectiveDate: string;
  /**
   * The PROP code. Always equal to the inn code: this registry issues only for
   * MHG-branded hotels, where the brand and the management company are the same
   * entity, so the two codes mirror by construction rather than by rule.
   */
  propCode: string;
}

export interface IssueRequest {
  name: string;
  city: string;
  /** Two-letter USPS state code. */
  state: string;
  /** Two-letter flag code from the brand table. */
  brandCode: string;
  submarket?: string;
  /** A prior franchisor's code, if this property converted from a flag. */
  franchisorCode?: string;
  /** Standards-owner assignment under M4(c). Bypasses the M1–M4 ladder. */
  marketOverride?: string;
  status?: PropertyStatus;
  /** Supplied on a rebrand so the new record points back (G2). */
  predecessorCode?: string;
  /** Defaults to today. */
  effectiveDate?: string;
  /** Defaults to a generated id. */
  propertyId?: string;
}

export interface Candidate {
  code: string;
  marketCode: string;
  flagCode: string;
  submarket: string;
  source: MarketSource;
  trace: TraceStep[];
}

export type FailureCode =
  | 'unknown_flag'          // B1
  | 'market_unresolvable'   // M4c — ladder exhausted
  | 'submarket_required'    // M5 — collision with no place to split on
  | 'code_taken'            // G3
  | 'blocked_string'        // G7
  | 'malformed'             // G4
  | 'market_conflict'       // M7 — that market code belongs to somewhere else
  | 'race_lost';            // lost the transaction too many times

export interface Failure {
  code: FailureCode;
  message: string;
  /** The rule that refused it. */
  rule: RuleId;
}

export type DeriveResult =
  | { ok: true; candidate: Candidate }
  | { ok: false; failure: Failure; trace: TraceStep[] };

export type IssueResult =
  | { ok: true; record: PropertyRecord; trace: TraceStep[] }
  | { ok: false; failure: Failure; trace: TraceStep[] };

export interface ValidationResult {
  valid: boolean;
  /** Present when invalid — the rule that rejected it. */
  rule?: RuleId;
  message: string;
  marketCode?: string;
  flagCode?: string;
  brandName?: string;
  chainCode?: string;
}

export interface CodeConfig {
  /** Operator key. "mhg" today; a second operator is a second config. */
  id: string;
  version: string;
  marketLength: number;
  flagLength: number;
  /** Full-code shape check (G4). */
  pattern: RegExp;
  brands: BrandEntry[];
  /** M1 — "city|ST" to IATA metropolitan area code. */
  metroCodes: Record<string, string>;
  /** M2 — "city|ST" to primary commercial airport IATA code. */
  airportCodes: Record<string, string>;
  /**
   * M4 screen — IATA codes that belong to a city, so a derived candidate is
   * never mistaken for somewhere else. Value is the city, for the message.
   */
  reservedIata: Record<string, string>;
  /** Market codes never issued (G7). */
  reservedMarkets: string[];
  /** Substrings that fail a code outright (G7). */
  blockedSubstrings: string[];
  /** M5 — submarket word to its letter. */
  submarketLetters: Record<string, string>;
  /** M5 — fallback order when the submarket's own letter is unavailable. */
  variantLadder: string;
  /** Parent companies, for grouping and reporting. */
  chains: Record<string, string>;
}

/**
 * The registry port. The engine only ever talks to this, so the rules are
 * testable without Firebase and the store can change without touching them.
 */
export interface Registry {
  /** G3 — true if the code has ever existed, in any status. */
  hasCode(code: string): Promise<boolean>;
  /** M7 — who owns this market/submarket code, if anyone. */
  getMarketClaim(marketCode: string): Promise<MarketClaim | null>;
  /** M6 — the code this submarket already owns, if any. */
  findSubmarketCode(city: string, state: string, submarket: string): Promise<string | null>;
  /**
   * Atomically claim the code and the market. MUST reject with a
   * ConflictError if either is taken between derivation and here — that is
   * the only real uniqueness guarantee in the system (G8).
   */
  claim(record: PropertyRecord, market: MarketClaim): Promise<void>;
  /** Status change that keeps the code claimed forever (G2, G3). */
  setStatus(code: string, status: PropertyStatus): Promise<void>;
  get(code: string): Promise<PropertyRecord | null>;
  list(): Promise<PropertyRecord[]>;
}

/**
 * Thrown by Registry.claim when the code or market was taken concurrently.
 * The engine treats this as "re-derive and try again", never as a failure.
 */
export class ConflictError extends Error {
  constructor(
    message: string,
    readonly kind: 'code' | 'market',
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Thrown when the host application's property record is missing or already
 * carries a different code. Unlike ConflictError this is NOT retried — the
 * caller has to fix something, so it propagates to them.
 */
export class PropertyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PropertyNotFoundError';
  }
}
