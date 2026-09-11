# @mcx/inn-code

The MHG Inn Code Standard (MHG-IC v1.0) as a library: derives five-character
property codes from the rule ladder and issues them atomically against a
registry of record.

```
EVVBC
└┬┘└┬┘
 │  └── flag   — chars 4-5, from the closed brand table (B1)
 └───── market — chars 1-3, from the M ladder
```

**The one thing to understand:** the formula proposes, the registry disposes.
`deriveCode` is a suggestion. `issueCode` is the only call that makes a code
real, because only it takes the atomic claim. Any code path that generates a
code without claiming it will eventually produce a duplicate (G8).

---

## Install

```bash
nvm use              # Node 22, pinned in .nvmrc
npm install
npm test             # 70 tests
npm run build        # emits dist/ and public/brands.json
```

`DEPLOY.md` covers standing up the Firebase project and deploying.

## Quick start

```ts
import { MHG_CONFIG, MemoryRegistry, issueCode } from '@mcx/inn-code';

const deps = { config: MHG_CONFIG, registry: new MemoryRegistry() };

const result = await issueCode(deps, {
  name: 'BYX Collection Evansville East',
  city: 'Evansville',
  state: 'IN',
  brandCode: 'BC',
  submarket: 'East',
});

if (result.ok) {
  result.record.code;        // 'EVVBC'
  result.record.propertyId;  // internal key — this is your foreign key, not the code
  result.trace;              // [{ rule: 'M2', detail: 'EVV — primary commercial airport…' }, …]
} else {
  result.failure.rule;       // 'M5'
  result.failure.message;    // 'Name the submarket. M5 splits on a real place…'
}
```

Every result carries a `trace` of the rules that fired, in order. Show it in
the UI — it is why someone can look at `SNTBC` and see that Santa Claus was
refused `SAN` because that is San Diego.

## Scope

**MHG-branded hotels only.** This registry issues codes for properties flying an
MHG flag — BYX Collection and BYX Luxury. A hotel MHG manages under someone
else's brand is out of scope and gets no code here.

That single sentence decides a lot of the design:

- The brand table is two rows, not the hundred-odd in the 2021 chain/brand
  sheet. That sheet is still the reference for *reading* a franchised
  property's flag; it just isn't what this registry issues against.
- The **PROP code is the inn code**, always. For an MHG-branded hotel the brand
  and the management company are the same entity, so the two codes mirror by
  construction. There is no branch in the code for the alternative, because
  there is no alternative in scope.
- `franchisorCode` survives as a cross-reference for a property that *converted*
  from a flag — a former Hampton now flying BYX keeps `EVVIN` on its record as
  history. It is never an identifier here (G5).

Adding an MHG brand is a row in `src/config/brands.ts`. Never repurpose a code
that has been issued against (B4).

## API

| Function | What it does |
|---|---|
| `deriveCode(deps, req)` | Proposes a code. Reads the registry, writes nothing. Safe on every keystroke. |
| `issueCode(deps, req, attempts?)` | Derives, then atomically claims. Retries on a lost race by re-deriving. |
| `rebrand(deps, oldCode, newFlag, overrides?)` | G2. Issues the new code, keeps the internal id, retires the old code. |
| `validateCode(config, code)` | G4 + G7 + B1 field-level check. No registry, no I/O. |
| `baseMarket(config, city, state)` | M1–M4 only. Pure. "What would this market's code be?" |
| `resolveMarket(config, registry, req)` | The full M ladder including M5/M6/M7. |

### Failure codes

`unknown_flag` (B1) · `market_unresolvable` (M4c) · `submarket_required` (M5) ·
`code_taken` (G3) · `blocked_string` (G7) · `malformed` (G4) ·
`market_conflict` (M7) · `race_lost` (G8)

`submarket_required` is the interesting one: it means the market collided and
the standard wants a real place to split on rather than a counter. Surface it
as a prompt ("Which part of town?"), not an error.

## The deployed tool

An **MHG corporate internal tool**, standalone: its own Firebase project, its
own database, its own sign-in. It is not part of OpsCore, does not import from
it, and never calls it. OpsCore is packaged for commercial sale; this is not.

```
public/            the web app — one page, no build step, served from Hosting
functions/         nine callables, gated on the mhgAdmin custom claim
src/               the engine. Storage-agnostic; talks only to a Registry
firestore.rules    closed to all clients; everything goes through the callables
```

`DEPLOY.md` is the runbook.

### Where the data lives

```
properties/{propertyId}        the record. Internal key, never the code (G1).
innCodes/{CODE}                uniqueness ledger. Written once, never deleted (G3).
marketCodes/{MARKET}           market and submarket claims (M6, M7).
submarketIndex/{city|ST|sub}   reverse lookup for M6.
```

Firestore cannot enforce uniqueness on a *field*, so the code is a **document
ID**. Creating a document that already exists inside a transaction fails, and
that failure is the real guarantee. This is why issuance is server-side and the
database is closed to clients.

### PROP code and inn code

In the wider MHG standard these name different things: the **PROP code**
identifies the management company, the **inn code** identifies the property and
its flag. Inside this registry they are always the same value, because
everything here is MHG-branded and MHG-managed. See **Scope** above.

### The callables

`previewInnCode` (read-only, safe on every keystroke) · `issueInnCode` ·
`rebrandInnCode` · `retireInnCode` · `listInnCodes` · `checkInnCode` ·
`bootstrapInnCodeAdmin` · `grantInnCodeAdmin` · `revokeInnCodeAdmin`.
See `functions/src/index.ts`.

### The web app holds no rules

`public/app.js` collects input, calls `previewInnCode`, and renders whatever
trace comes back. It has no copy of the M ladder, so it cannot drift from the
standard. The flag dropdown reads `public/brands.json`, generated from the same
config the engine uses — `npm run build` regenerates it.

### Build

The functions bundle the library in rather than depending on a packed copy of
it, so no stale version can hide in `functions/node_modules`.
`npm run functions:prepare` builds the library, type-checks the functions
against its source, and bundles.

## Extending

**A new flag.** Add a row to `src/config/brands.ts`. Never reuse a code, never
delete a row — mark a dead brand `retired: true` so historical codes keep
resolving (B4). `guards.test.ts` fails the build on a duplicate.

**Wider airport coverage.** `AIRPORT_CODES` is curated, not exhaustive; M3/M4
handle anything missing, and a wrong airport code is worse than none. To widen
it, filter the OurAirports dataset to `type in (large_airport, medium_airport)`
with a non-empty `iata_code` and merge at build time.

**A second operator.** Everything the engine reads is data on a `CodeConfig`.
Nothing in `src/rules/` mentions MHG. A second management company is a second
config object — different brand table, different market length, different
blocked strings — passed to the same functions. Nothing about that is on the
roadmap; it is just what keeping the rules out of the code bought.

## Design notes

**Why the code is not the primary key (G1).** A rebrand changes the flag, which
changes the code. If the code were the key, every reference to a property would
have to be rewritten on a conversion. `propertyId` is immutable; the code is an
attribute of it, and `rebrand` proves it by keeping the id across the change.

**Why collisions move into the market segment.** A trailing counter (`EVVBC2`)
would have been easier and means nothing. The M5 split puts the tiebreaker
somewhere a person can read it: `EVWBC` is the BYX Collection on the west side.

**Why a base market code is not bound to one city.** Newburgh sits under `EVV`
by design (M2, M8). A market claim from M1/M2 is bound to the *market*; only a
code derived from a city name, split under M5, or assigned by hand is bound to
a specific place. `src/rules/claim.ts` is where that distinction lives, and
getting it wrong is what makes a code system start refusing legitimate
properties.

**Why the incumbent keeps its code when a market splits.** The first BYX
Collection in Evansville East holds `EVVBC`. When a second one arrives, East
gets its own code and the incumbent keeps `EVVBC` — codes are immutable (M7).
So a submarket can contain one property on the base code and later ones on the
split code.
That asymmetry is deliberate; the alternative is reissuing codes, which G3
forbids.

## Test coverage

70 tests.

```
test/market.test.ts     M1–M8: metro codes, airport lookup, name derivation,
                        the IATA screen, submarket splits, claim permanence
test/engine.test.ts     all nine worked examples against one registry,
                        derive/issue separation, races, concurrency, rebrand
test/guards.test.ts     G4, G7, B1, and config integrity (duplicate flags,
                        malformed market codes, I/O excluded from the ladder)
test/firestore.test.ts  the adapter against a fake Firestore that models merge
                        writes and transaction isolation: collection ownership,
                        PROP code mirroring, rebrand in place
```

Two of these matter more than the rest. The concurrency test: three
simultaneous issuances in the same market produce three distinct codes and
three records, never two writers holding one code. And the isolation test: it
asserts the adapter writes to nothing outside its own four collections, which
is the property that keeps this tool standalone.
