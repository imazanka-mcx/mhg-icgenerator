import { describe, expect, it } from 'vitest';
import { MHG_CONFIG } from '../src/config/mhg.js';
import { findBrand, validateCode } from '../src/rules/guards.js';
import { MHG_BRANDS } from '../src/config/brands.js';

const cfg = MHG_CONFIG;

describe('G4 — format', () => {
  it.each(['EVVBC', 'evvbc', 'evv bc', 'EVV-BC'])('accepts %s', (input) => {
    expect(validateCode(cfg, input).valid).toBe(true);
  });

  it.each(['EVVB', 'EVVBCC', '', 'EVV1C'])('rejects %s', (input) => {
    const r = validateCode(cfg, input);
    expect(r.valid).toBe(false);
    expect(r.rule).toBe('G4');
  });

  it('reports the market, flag and chain on a valid code', () => {
    const r = validateCode(cfg, 'OWBLX');
    expect(r.marketCode).toBe('OWB');
    expect(r.flagCode).toBe('LX');
    expect(r.brandName).toBe('BYX Luxury');
    expect(r.chainCode).toBe('MAZ');
  });

  it('tolerates a digit in the flag, so a future brand could be named with one', () => {
    // Shape is fine (G4); the brand simply isn't in the table yet (B1).
    const r = validateCode(cfg, 'EVVH2');
    expect(r.rule).toBe('B1');
  });

  it('still rejects 0 and 1 anywhere — they read as O and I', () => {
    expect(validateCode(cfg, 'EVVB1').rule).toBe('G4');
    expect(validateCode(cfg, 'EVVB0').rule).toBe('G4');
  });
});

describe('G7 — blocked strings', () => {
  it.each(['TBDBC', 'NEWBC', 'ZZZBC', 'MHGBC'])('refuses the reserved market in %s', (input) => {
    const r = validateCode(cfg, input);
    expect(r.valid).toBe(false);
    expect(r.rule).toBe('G7');
  });
});

describe('B1 — the closed brand table', () => {
  it('refuses a well-formed code with an unlisted flag', () => {
    const r = validateCode(cfg, 'EVVQQ');
    expect(r.valid).toBe(false);
    expect(r.rule).toBe('B1');
  });

  it('refuses a franchised flag — this registry is MHG-branded only', () => {
    // HA is Hampton Inn and HX is Holiday Inn Express in the 2021 chain sheet.
    // Neither is an MHG brand, so neither can be issued here.
    for (const flag of ['HA', 'HX', 'CY', 'HG']) {
      expect(validateCode(cfg, `EVV${flag}`).rule).toBe('B1');
    }
  });

  it('is case-insensitive on lookup', () => {
    expect(findBrand(cfg, 'bc')?.name).toBe('BYX Collection');
    expect(findBrand(cfg, 'lx')?.name).toBe('BYX Luxury');
  });

  it('has no duplicate codes — B4 depends on it', () => {
    const codes = MHG_BRANDS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has only two-character codes, letters or 2-9', () => {
    for (const brand of MHG_BRANDS) expect(brand.code).toMatch(/^[A-Z2-9]{2}$/);
  });

  it('gives every brand a chain that exists in the chain table', () => {
    for (const brand of MHG_BRANDS) expect(cfg.chains[brand.chainCode]).toBeDefined();
  });

  it('holds only MHG brands, all under the MAZ chain', () => {
    expect(MHG_BRANDS.map((b) => b.code).sort()).toEqual(['BC', 'LX']);
    for (const brand of MHG_BRANDS) expect(brand.chainCode).toBe('MAZ');
  });
});

describe('config integrity', () => {
  it('never maps two markets to the same metro key', () => {
    const keys = Object.keys(cfg.metroCodes);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has three-letter uppercase market codes throughout', () => {
    for (const code of [...Object.values(cfg.metroCodes), ...Object.values(cfg.airportCodes)]) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('screens every code it can issue against the IATA table', () => {
    for (const code of Object.values(cfg.airportCodes)) {
      expect(cfg.reservedIata[code]).toBeDefined();
    }
  });

  it('excludes I and O from the M5 ladder', () => {
    expect(cfg.variantLadder).not.toContain('I');
    expect(cfg.variantLadder).not.toContain('O');
  });
});
