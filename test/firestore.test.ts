import { beforeEach, describe, expect, it } from 'vitest';
import { MHG_CONFIG } from '../src/config/mhg.js';
import { issueCode, rebrand } from '../src/engine.js';
import { FirestoreRegistry, type FirestoreLike } from '../src/registry/firestore.js';
import type { EngineDeps, IssueRequest } from '../src/index.js';

/**
 * A fake Firestore, faithful on the two behaviours the adapter depends on:
 * merge writes leave untouched fields alone, and a transaction sees the store
 * as it was when it started.
 */
function fakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();

  function write(key: string, data: Record<string, unknown>, merge = false): void {
    if (!merge) {
      store.set(key, { ...data });
      return;
    }
    store.set(key, { ...(store.get(key) ?? {}), ...data });
  }

  function docRef(key: string) {
    return {
      id: key.split('/').pop()!,
      key,
      async get() {
        const data = store.get(key);
        return { exists: data !== undefined, id: key.split('/').pop()!, data: () => data };
      },
      async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
        write(key, data, options?.merge);
      },
      async update(data: Record<string, unknown>) {
        if (!store.has(key)) throw new Error(`update on missing ${key}`);
        write(key, data, true);
      },
    };
  }

  const db = {
    collection(name: string) {
      return {
        doc(id: string) {
          return docRef(`${name}/${id}`);
        },
        async get() {
          const docs = [...store.entries()]
            .filter(([k]) => k.startsWith(`${name}/`))
            .map(([k, v]) => ({ exists: true, id: k.split('/').pop()!, data: () => v }));
          return { docs };
        },
      };
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const buffered: Array<[string, Record<string, unknown>, boolean]> = [];
      const tx = {
        async get(ref: { key: string }) {
          const data = store.get(ref.key);
          return { exists: data !== undefined, id: ref.key.split('/').pop()!, data: () => data };
        },
        set(ref: { key: string }, data: Record<string, unknown>, options?: { merge?: boolean }) {
          buffered.push([ref.key, data, options?.merge ?? false]);
        },
      };
      const result = await fn(tx);
      for (const [key, data, merge] of buffered) write(key, data, merge);
      return result;
    },
  };

  return { db: db as unknown as FirestoreLike, store };
}

let fake: ReturnType<typeof fakeFirestore>;
let deps: EngineDeps;
let counter = 0;

beforeEach(() => {
  fake = fakeFirestore();
  counter = 0;
  deps = {
    config: MHG_CONFIG,
    registry: new FirestoreRegistry(fake.db),
    now: () => new Date('2026-09-05T12:00:00Z'),
    newId: () => `prop-${++counter}`,
  };
});

const req = (over: Partial<IssueRequest> = {}): IssueRequest => ({
  name: 'BYX Collection Evansville East',
  city: 'Evansville',
  state: 'IN',
  brandCode: 'BC',
  submarket: 'East',
  franchisorCode: 'EVVIN',
  ...over,
});

describe('a standalone registry', () => {
  it('owns all four collections and creates its own property record', async () => {
    const r = await issueCode(deps, req());
    expect(r.ok && r.record.code).toBe('EVVBC');

    expect(fake.store.get('properties/prop-1')).toMatchObject({
      code: 'EVVBC',
      name: 'BYX Collection Evansville East',
      city: 'Evansville',
      franchisorCode: 'EVVIN',
    });
    expect(fake.store.get('innCodes/EVVBC')).toMatchObject({ propertyId: 'prop-1' });
    expect(fake.store.get('marketCodes/EVV')).toMatchObject({ marketCode: 'EVV', submarket: '' });
  });

  it('writes nothing outside its own four collections', async () => {
    await issueCode(deps, req());
    const collections = new Set([...fake.store.keys()].map((k) => k.split('/')[0]));
    expect([...collections].sort()).toEqual(['innCodes', 'marketCodes', 'properties']);
  });

  it('indexes a submarket only when the market actually splits (M5, M6)', async () => {
    await issueCode(deps, req());
    expect(fake.store.has('submarketIndex/evansville|IN|east')).toBe(false);

    const second = await issueCode(deps, req({ submarket: 'West' }));
    expect(second.ok && second.record.code).toBe('EVWBC');
    expect(fake.store.get('submarketIndex/evansville|IN|west')).toMatchObject({ marketCode: 'EVW' });
  });
});

describe('PROP code', () => {
  it('always equals the inn code — every property here is MHG-branded', async () => {
    const a = await issueCode(deps, req({ brandCode: 'BC' }));
    expect(a.ok && a.record.propCode).toBe('EVVBC');

    const b = await issueCode(deps, req({ brandCode: 'LX' }));
    expect(b.ok && b.record.propCode).toBe('EVVLX');
  });

  it('follows the code across a rebrand', async () => {
    await issueCode(deps, req({ brandCode: 'BC' }));
    const converted = await rebrand(deps, 'EVVBC', 'LX');
    expect(converted.ok && converted.record.code).toBe('EVVLX');
    expect(converted.ok && converted.record.propCode).toBe('EVVLX');
  });
});

describe('rebrand against Firestore (G2)', () => {
  it('updates the property in place, retires the old code, keeps the id', async () => {
    await issueCode(deps, req());
    const converted = await rebrand(deps, 'EVVBC', 'LX');
    expect(converted.ok && converted.record.code).toBe('EVVLX');

    const prop = fake.store.get('properties/prop-1') as Record<string, unknown>;
    expect(prop['code']).toBe('EVVLX');
    expect(prop['predecessorCode']).toBe('EVVBC');
    expect(prop['propCode']).toBe('EVVLX');

    expect(fake.store.get('innCodes/EVVBC')).toMatchObject({ status: 'retired' });
    expect(fake.store.has('innCodes/EVVLX')).toBe(true);
  });

  it('does not create a second property record for the same hotel', async () => {
    await issueCode(deps, req());
    await rebrand(deps, 'EVVBC', 'LX');
    const properties = [...fake.store.keys()].filter((k) => k.startsWith('properties/'));
    expect(properties).toEqual(['properties/prop-1']);
  });

  it('retiring the old code does not rewrite the property the new code owns', async () => {
    await issueCode(deps, req());
    await rebrand(deps, 'EVVBC', 'LX');
    expect((fake.store.get('properties/prop-1') as Record<string, unknown>)['status']).toBe('active');
  });
});
