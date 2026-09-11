import type { MarketClaim, PropertyRecord, PropertyStatus, Registry } from '../types.js';
import { ConflictError } from '../types.js';
import { submarketKey } from '../rules/text.js';
import { conflicts, ownsSubmarket } from '../rules/claim.js';

/**
 * In-memory registry — tests, dry runs, and the "what would this be?"
 * preview in the admin UI. Same contract as Firestore, including the
 * conflict on a double claim.
 *
 * Seeded records are treated as base market claims. Pass `claims` explicitly
 * to seed a market that was split under M5.
 */
export class MemoryRegistry implements Registry {
  private codes = new Map<string, PropertyRecord>();
  private markets = new Map<string, MarketClaim>();

  /** Test seam: runs inside claim(), between the checks and the write. */
  onBeforeWrite?: () => void | Promise<void>;

  constructor(seed: PropertyRecord[] = [], claims: MarketClaim[] = []) {
    for (const record of seed) {
      this.codes.set(record.code, record);
      if (!this.markets.has(record.marketCode)) {
        this.markets.set(record.marketCode, {
          marketCode: record.marketCode,
          city: record.city,
          state: record.state,
          submarket: '',
          source: 'airport',
          claimedAt: record.effectiveDate,
        });
      }
    }
    for (const claim of claims) this.markets.set(claim.marketCode, claim);
  }

  async hasCode(code: string): Promise<boolean> {
    return this.codes.has(code);
  }

  async getMarketClaim(marketCode: string): Promise<MarketClaim | null> {
    return this.markets.get(marketCode) ?? null;
  }

  async findSubmarketCode(city: string, state: string, submarket: string): Promise<string | null> {
    if (!submarket.trim()) return null;
    const wanted = submarketKey(city, state, submarket);
    for (const claim of this.markets.values()) {
      if (!ownsSubmarket(claim)) continue;
      if (submarketKey(claim.city, claim.state, claim.submarket) === wanted) return claim.marketCode;
    }
    return null;
  }

  async claim(record: PropertyRecord, market: MarketClaim): Promise<void> {
    this.check(record, market);
    // Models the Firestore transaction: anything that lands while we are
    // mid-flight invalidates the checks, so they run again before the write.
    await this.onBeforeWrite?.();
    this.check(record, market);

    this.codes.set(record.code, record);
    if (!this.markets.has(market.marketCode)) this.markets.set(market.marketCode, market);
  }

  private check(record: PropertyRecord, market: MarketClaim): void {
    if (this.codes.has(record.code)) {
      throw new ConflictError(`${record.code} was claimed by another writer.`, 'code');
    }
    const existing = this.markets.get(market.marketCode);
    if (existing && conflicts(existing, market)) {
      throw new ConflictError(
        `${market.marketCode} belongs to ${existing.city}, ${existing.state}.`,
        'market',
      );
    }
  }

  async setStatus(code: string, status: PropertyStatus): Promise<void> {
    const record = this.codes.get(code);
    if (record) this.codes.set(code, { ...record, status });
  }

  async get(code: string): Promise<PropertyRecord | null> {
    return this.codes.get(code) ?? null;
  }

  async list(): Promise<PropertyRecord[]> {
    return [...this.codes.values()].sort((a, b) => a.code.localeCompare(b.code));
  }
}
