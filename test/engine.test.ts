import { beforeEach, describe, expect, it } from 'vitest';
import { MHG_CONFIG } from '../src/config/mhg.js';
import { MemoryRegistry } from '../src/registry/memory.js';
import { deriveCode, issueCode, rebrand } from '../src/engine.js';
import type { EngineDeps, IssueRequest } from '../src/index.js';

let registry: MemoryRegistry;
let deps: EngineDeps;
let counter = 0;

beforeEach(() => {
  registry = new MemoryRegistry();
  counter = 0;
  deps = {
    config: MHG_CONFIG,
    registry,
    now: () => new Date('2026-09-05T12:00:00Z'),
    newId: () => `prop-${++counter}`,
  };
});

const req = (over: Partial<IssueRequest>): IssueRequest => ({
  name: '', city: 'Evansville', state: 'IN', brandCode: 'BC', ...over,
});

async function code(over: Partial<IssueRequest>): Promise<string> {
  const r = await issueCode(deps, req(over));
  if (!r.ok) throw new Error(`${r.failure.rule}: ${r.failure.message}`);
  return r.record.code;
}

describe('the worked examples from the standard', () => {
  it('reproduces every one, in order, against one registry', async () => {
    expect(await code({ name: 'BYX Collection Evansville East', brandCode: 'BC', submarket: 'East', franchisorCode: 'EVVIN' })).toBe('EVVBC');
    expect(await code({ name: 'BYX Luxury Evansville', brandCode: 'LX', submarket: 'East' })).toBe('EVVLX');
    expect(await code({ name: 'BYX Collection Evansville West', brandCode: 'BC', submarket: 'West' })).toBe('EVWBC');
    expect(await code({ name: 'BYX Luxury Evansville West', brandCode: 'LX', submarket: 'West' })).toBe('EVWLX');
    expect(await code({ name: 'BYX Collection Newburgh', city: 'Newburgh', brandCode: 'BC', submarket: 'Newburgh' })).toBe('EVNBC');
    expect(await code({ name: 'BYX Collection Indianapolis', city: 'Indianapolis', brandCode: 'BC', submarket: 'Downtown' })).toBe('INDBC');
    expect(await code({ name: 'BYX Collection Owensboro', city: 'Owensboro', state: 'KY', brandCode: 'BC' })).toBe('OWBBC');
    expect(await code({ name: 'The Kringle', city: 'Santa Claus', brandCode: 'BC' })).toBe('SNTBC');
    expect(await code({ name: 'BYX Collection Schaumburg', city: 'Schaumburg', state: 'IL', brandCode: 'BC' })).toBe('CHIBC');
  });

  it('gives an MHG-branded property the same PROP code as its inn code', async () => {
    const r = await issueCode(deps, req({ name: 'BYX Collection Evansville', brandCode: 'BC' }));
    expect(r.ok && r.record.propCode).toBe('EVVBC');
    expect(r.ok && r.record.chainCode).toBe('MAZ');
  });
});

describe('deriveCode', () => {
  it('writes nothing — the same candidate comes back twice', async () => {
    const a = await deriveCode(deps, req({ brandCode: 'BC' }));
    const b = await deriveCode(deps, req({ brandCode: 'BC' }));
    expect(a.ok && a.candidate.code).toBe('EVVBC');
    expect(b.ok && b.candidate.code).toBe('EVVBC');
    expect(await registry.list()).toHaveLength(0);
  });

  it('refuses a flag that is not in the table (B1)', async () => {
    const r = await deriveCode(deps, req({ brandCode: 'ZQ' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.code).toBe('unknown_flag');
      expect(r.failure.rule).toBe('B1');
    }
  });

  it('traces the rules that fired, in order', async () => {
    const r = await deriveCode(deps, req({ brandCode: 'LX' }));
    expect(r.ok && r.candidate.trace.map((s) => s.rule)).toEqual(['M2', 'B1', 'G3']);
  });
});

describe('issueCode', () => {
  it('fills defaults: internal id, name, effective date, active status', async () => {
    const r = await issueCode(deps, req({ brandCode: 'LX' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.propertyId).toBe('prop-1');
    expect(r.record.name).toBe('BYX Luxury Evansville');
    expect(r.record.effectiveDate).toBe('2026-09-05');
    expect(r.record.status).toBe('active');
    expect(r.record.marketCode).toBe('EVV');
  });

  it('keeps the franchisor code in its own field, digits intact (G5)', async () => {
    const r = await issueCode(deps, req({ brandCode: 'BC', franchisorCode: 'evvin1502h58' }));
    expect(r.ok && r.record.franchisorCode).toBe('EVVIN1502H58');
    expect(r.ok && r.record.code).toBe('EVVBC');
  });

  it('issues pipeline codes at contract, not opening (G6)', async () => {
    const r = await issueCode(deps, req({ brandCode: 'LX', status: 'pipeline' }));
    expect(r.ok && r.record.status).toBe('pipeline');
    expect(await registry.hasCode('EVVLX')).toBe(true);
  });

  it('blocks a pipeline code from being reissued to someone else (G3)', async () => {
    await issueCode(deps, req({ brandCode: 'LX', status: 'pipeline' }));
    const second = await issueCode(deps, req({ brandCode: 'LX', submarket: 'West' }));
    expect(second.ok && second.record.code).toBe('EVWLX');
  });

  it('re-derives and wins after losing one race', async () => {
    // Another writer takes EVVBC in the instant between derive and claim.
    let fired = false;
    registry.onBeforeWrite = async () => {
      if (fired) return;
      fired = true;
      registry.onBeforeWrite = undefined;
      await registry.claim(
        {
          propertyId: 'other', code: 'EVVBC', name: 'Someone else',
          brandCode: 'BC', brandName: 'BYX Collection', chainCode: 'MAZ', marketCode: 'EVV',
          city: 'Evansville', state: 'IN', submarket: 'East',
          franchisorCode: '', status: 'active', predecessorCode: '',
          effectiveDate: '2026-09-05',
        propCode: 'EVVBC',
        },
        { marketCode: 'EVV', city: 'Evansville', state: 'IN', submarket: 'East', source: 'airport', claimedAt: '2026-09-05' },
      );
    };
    const r = await issueCode(deps, req({ brandCode: 'BC', submarket: 'West' }));
    expect(r.ok && r.record.code).toBe('EVWBC');
    expect(await registry.hasCode('EVVBC')).toBe(true);
  });

  it('never produces two records for the same code under concurrency', async () => {
    const results = await Promise.all([
      issueCode(deps, req({ brandCode: 'BC', submarket: 'East' })),
      issueCode(deps, req({ brandCode: 'BC', submarket: 'West' })),
      issueCode(deps, req({ brandCode: 'BC', submarket: 'North' })),
    ]);
    const codes = results.filter((r) => r.ok).map((r) => (r.ok ? r.record.code : ''));
    expect(new Set(codes).size).toBe(codes.length);
    expect((await registry.list()).length).toBe(codes.length);
  });
});

describe('rebrand (G2)', () => {
  it('issues a new code, retires the old one, and keeps the internal id', async () => {
    const first = await issueCode(deps, req({ name: 'BYX Collection Evansville East', brandCode: 'BC', submarket: 'East' }));
    expect(first.ok && first.record.code).toBe('EVVBC');

    const converted = await rebrand(deps, 'EVVBC', 'LX');
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    expect(converted.record.code).toBe('EVVLX');
    expect(converted.record.predecessorCode).toBe('EVVBC');
    expect(converted.record.propertyId).toBe('prop-1');

    const old = await registry.get('EVVBC');
    expect(old?.status).toBe('retired');
  });

  it('keeps the retired code claimed forever — a later property cannot have it (G3)', async () => {
    await issueCode(deps, req({ name: 'BYX Collection', brandCode: 'BC', submarket: 'East' }));
    await rebrand(deps, 'EVVBC', 'LX');

    const reuse = await issueCode(deps, req({ name: 'Second BYX Collection', brandCode: 'BC', submarket: 'East' }));
    expect(reuse.ok).toBe(true);
    if (!reuse.ok) return;
    expect(reuse.record.code).not.toBe('EVVBC');
    expect(reuse.record.code).toBe('EVEBC');
    expect((await registry.get('EVVBC'))?.status).toBe('retired');
  });

  it('refuses to rebrand a code that is not in the registry', async () => {
    const r = await rebrand(deps, 'ZZZZZ', 'LX');
    expect(r.ok).toBe(false);
  });
});
