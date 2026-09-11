import { describe, expect, it } from 'vitest';
import { MHG_CONFIG } from '../src/config/mhg.js';
import { baseMarket, resolveMarket } from '../src/rules/market.js';
import { MemoryRegistry } from '../src/registry/memory.js';

const cfg = MHG_CONFIG;
const rules = (steps: { rule: string }[]) => steps.map((s) => s.rule);

describe('M1 — metropolitan area codes', () => {
  it('uses the metro code for a suburb rather than fragmenting the market', () => {
    const r = baseMarket(cfg, 'Schaumburg', 'IL');
    expect(r.code).toBe('CHI');
    expect(rules(r.trace)).toContain('M1');
  });

  it('puts Newark on the New York metro code', () => {
    expect(baseMarket(cfg, 'Newark', 'NJ').code).toBe('NYC');
  });
});

describe('M2 — primary commercial airport', () => {
  it.each([
    ['Evansville', 'IN', 'EVV'],
    ['Owensboro', 'KY', 'OWB'],
    ['Indianapolis', 'IN', 'IND'],
    ['Louisville', 'KY', 'SDF'],
  ])('%s, %s → %s', (city, state, code) => {
    const r = baseMarket(cfg, city, state);
    expect(r.code).toBe(code);
    expect(rules(r.trace)).toContain('M2');
  });

  it('puts a metro-area town on the metro airport (C5: market, not address)', () => {
    expect(baseMarket(cfg, 'Newburgh', 'IN').code).toBe('EVV');
  });

  it('normalizes punctuation and abbreviations before lookup', () => {
    expect(baseMarket(cfg, 'St. Louis', 'MO').code).toBe('STL');
  });
});

describe('M3 / M4 — deriving from the city name', () => {
  it('takes the first three letters when nothing collides', () => {
    const r = baseMarket(cfg, 'Jasper', 'IN');
    expect(r.code).toBe('JAS');
    expect(rules(r.trace)).toContain('M3');
  });

  it('rejects a candidate that is another city’s IATA code and falls to M4a', () => {
    const r = baseMarket(cfg, 'Santa Claus', 'IN');
    expect(r.code).toBe('SNT');
    expect(rules(r.trace)).toContain('M4');
    expect(rules(r.trace)).toContain('M4a');
    expect(r.trace.find((s) => s.rule === 'M4')?.detail).toContain('San Diego');
  });

  it('refuses a city name too short to derive from', () => {
    expect(baseMarket(cfg, 'Ky', 'IN').code).toBeNull();
  });
});

describe('M5 / M6 / M7 — the submarket split', () => {
  const seed = () =>
    new MemoryRegistry([
      {
        propertyId: 'p1', code: 'EVVBC', name: 'BYX Collection Evansville East',
        brandCode: 'BC', brandName: 'BYX Collection', chainCode: 'MAZ', marketCode: 'EVV',
        city: 'Evansville', state: 'IN', submarket: 'East',
        franchisorCode: 'EVVIN', status: 'active', predecessorCode: '',
        effectiveDate: '2026-09-05',
        propCode: 'EVVBC',
      },
    ]);

  it('leaves the base market alone when there is no collision', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Evansville', state: 'IN', submarket: 'East', flagCode: 'LX',
    });
    expect(r.ok && r.marketCode).toBe('EVV');
  });

  it('demands a submarket when the pair collides', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Evansville', state: 'IN', flagCode: 'BC',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.code).toBe('submarket_required');
      expect(r.failure.rule).toBe('M5');
    }
  });

  it('splits the market on the submarket letter', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Evansville', state: 'IN', submarket: 'West', flagCode: 'BC',
    });
    expect(r.ok && r.marketCode).toBe('EVW');
    expect(r.ok && r.source).toBe('submarket');
  });

  it('uses the submarket initial when the word is not in the letter table', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Evansville', state: 'IN', submarket: 'Burkhardt', flagCode: 'BC',
    });
    expect(r.ok && r.marketCode).toBe('EVB');
  });

  it('splits even when the incumbent sits in the submarket that is splitting', async () => {
    // The first Hampton is in East but holds the base code EVV. Codes are
    // immutable (M7), so it keeps EVV and East gets its own code going forward.
    const r = await resolveMarket(cfg, seed(), {
      city: 'Evansville', state: 'IN', submarket: 'East', flagCode: 'BC',
    });
    expect(r.ok && r.marketCode).toBe('EVE');
  });

  it('refuses a second property with the same flag in a submarket that already owns a code (M4c)', async () => {
    const registry = new MemoryRegistry(
      [{
        propertyId: 'p2', code: 'EVWBC', name: 'BYX Collection Evansville West',
        brandCode: 'BC', brandName: 'BYX Collection', chainCode: 'MAZ', marketCode: 'EVW',
        city: 'Evansville', state: 'IN', submarket: 'West',
        franchisorCode: '', status: 'active', predecessorCode: '',
        effectiveDate: '2026-09-05',
        propCode: 'EVWBC',
      }],
      [{
        marketCode: 'EVW', city: 'Evansville', state: 'IN', submarket: 'West',
        source: 'submarket', claimedAt: '2026-09-05',
      }],
    );
    const r = await resolveMarket(cfg, registry, {
      city: 'Evansville', state: 'IN', submarket: 'West', flagCode: 'BC',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.rule).toBe('M4c');
  });

  it('reuses a submarket’s registered code for a different flag (M6)', async () => {
    const registry = new MemoryRegistry(
      [],
      [{
        marketCode: 'EVW', city: 'Evansville', state: 'IN', submarket: 'West',
        source: 'submarket', claimedAt: '2026-09-05',
      }],
    );
    const r = await resolveMarket(cfg, registry, {
      city: 'Evansville', state: 'IN', submarket: 'West', flagCode: 'LX',
    });
    expect(r.ok && r.marketCode).toBe('EVW');
    expect(r.ok && r.source).toBe('registered');
  });

  it('lets a metro-area town share the market code without a conflict (M8)', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Newburgh', state: 'IN', flagCode: 'LX',
    });
    expect(r.ok && r.marketCode).toBe('EVV');
  });

  it('rejects an override that belongs to another place (M7)', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Owensboro', state: 'KY', flagCode: 'LX', marketOverride: 'EVV',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.rule).toBe('M7');
  });

  it('accepts a standards-owner override for an unclaimed market', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Santa Claus', state: 'IN', flagCode: 'BC', marketOverride: 'sct',
    });
    expect(r.ok && r.marketCode).toBe('SCT');
    expect(r.ok && r.source).toBe('override');
  });

  it('refuses a reserved market override (G7)', async () => {
    const r = await resolveMarket(cfg, seed(), {
      city: 'Anywhere', state: 'IN', flagCode: 'BC', marketOverride: 'TBD',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.rule).toBe('G7');
  });
});
