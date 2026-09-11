import type { MarketClaim, PropertyRecord, PropertyStatus, Registry } from '../types.js';
import { ConflictError } from '../types.js';
import { submarketKey } from '../rules/text.js';
import { conflicts, ownsSubmarket } from '../rules/claim.js';

/**
 * Firestore adapter for the MHG corporate inn code project.
 *
 * This tool is standalone by design. It owns all four of its collections and
 * knows nothing about any other system — no reads, no writes, no shared
 * documents. Where a code needs to appear somewhere else, a person looks it up
 * and types it, which is a feature: nothing downstream can break by changing
 * here, and this tool cannot break anything downstream.
 *
 * Firestore cannot enforce uniqueness on a *field*, so the code and the market
 * code are document IDs in their own ledgers. Creating a document that already
 * exists inside a transaction fails, and that failure is the system's actual
 * uniqueness guarantee (G8) — not the derivation.
 *
 * Layout:
 *   properties/{propertyId}        the record. Internal key, never the code (G1).
 *   innCodes/{CODE}                uniqueness ledger. Written once, never deleted (G3).
 *   marketCodes/{MARKET}           market and submarket claims (M6, M7).
 *   submarketIndex/{city|ST|sub}   reverse lookup for M6.
 *
 * Typed structurally so the package builds without firebase-admin installed.
 * Targets the ADMIN SDK, where `snapshot.exists` is a property, not a method.
 */

interface SnapLike {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}
interface DocLike {
  id: string;
  get(): Promise<SnapLike>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
}
interface QuerySnapLike {
  docs: SnapLike[];
}
interface CollectionLike {
  doc(id: string): DocLike;
  get(): Promise<QuerySnapLike>;
}
interface TransactionLike {
  get(ref: DocLike): Promise<SnapLike>;
  set(ref: DocLike, data: Record<string, unknown>, options?: { merge?: boolean }): unknown;
}
export interface FirestoreLike {
  collection(path: string): CollectionLike;
  runTransaction<T>(fn: (tx: TransactionLike) => Promise<T>): Promise<T>;
}

export interface FirestoreRegistryOptions {
  /** Prefix every collection, e.g. "mhg_", if this project ever hosts another registry. */
  prefix?: string;
}

export class FirestoreRegistry implements Registry {
  private readonly p: string;

  constructor(private readonly db: FirestoreLike, options: FirestoreRegistryOptions = {}) {
    this.p = options.prefix ?? '';
  }

  private col(name: string): CollectionLike {
    return this.db.collection(this.p + name);
  }

  async hasCode(code: string): Promise<boolean> {
    const snap = await this.col('innCodes').doc(code).get();
    return snap.exists;
  }

  async getMarketClaim(marketCode: string): Promise<MarketClaim | null> {
    const snap = await this.col('marketCodes').doc(marketCode).get();
    return snap.exists ? (snap.data() as unknown as MarketClaim) : null;
  }

  async findSubmarketCode(city: string, state: string, submarket: string): Promise<string | null> {
    if (!submarket.trim()) return null;
    const snap = await this.col('submarketIndex').doc(submarketKey(city, state, submarket)).get();
    if (!snap.exists) return null;
    const value = snap.data()?.['marketCode'];
    return typeof value === 'string' ? value : null;
  }

  async claim(record: PropertyRecord, market: MarketClaim): Promise<void> {
    const codeRef = this.col('innCodes').doc(record.code);
    const marketRef = this.col('marketCodes').doc(market.marketCode);
    const propertyRef = this.col('properties').doc(record.propertyId);
    const subKey = ownsSubmarket(market)
      ? submarketKey(market.city, market.state, market.submarket)
      : null;
    const subRef = subKey ? this.col('submarketIndex').doc(subKey) : null;

    await this.db.runTransaction(async (tx) => {
      // All reads first — Firestore requires it.
      const codeSnap = await tx.get(codeRef);
      const marketSnap = await tx.get(marketRef);

      if (codeSnap.exists) {
        throw new ConflictError(`${record.code} was claimed by another writer.`, 'code');
      }

      const existing = marketSnap.exists ? (marketSnap.data() as unknown as MarketClaim) : null;
      if (existing && conflicts(existing, market)) {
        throw new ConflictError(
          `${market.marketCode} belongs to ${existing.city}, ${existing.state}.`,
          'market',
        );
      }

      // The property record is merged so a rebrand updates the property in
      // place, keeping its internal id (G1) rather than orphaning it.
      tx.set(propertyRef, { ...record }, { merge: true });
      tx.set(codeRef, { ...record });
      if (!existing) tx.set(marketRef, { ...market });
      if (subRef) {
        tx.set(subRef, {
          marketCode: market.marketCode,
          city: market.city,
          state: market.state,
          submarket: market.submarket,
        });
      }
    });
  }

  async setStatus(code: string, status: PropertyStatus): Promise<void> {
    const codeSnap = await this.col('innCodes').doc(code).get();
    if (!codeSnap.exists) return;
    await this.col('innCodes').doc(code).update({ status });

    const propertyId = codeSnap.data()?.['propertyId'];
    if (typeof propertyId !== 'string') return;
    // Only touch the property if this code is still the one it holds — a
    // rebranded property has moved on and its retired code must not rewrite it.
    const propSnap = await this.col('properties').doc(propertyId).get();
    if (propSnap.data()?.['code'] === code) {
      await this.col('properties').doc(propertyId).update({ status });
    }
  }

  async get(code: string): Promise<PropertyRecord | null> {
    const snap = await this.col('innCodes').doc(code).get();
    return snap.exists ? (snap.data() as unknown as PropertyRecord) : null;
  }

  async list(): Promise<PropertyRecord[]> {
    const snap = await this.col('innCodes').get();
    return snap.docs
      .map((d) => d.data() as unknown as PropertyRecord)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
}
