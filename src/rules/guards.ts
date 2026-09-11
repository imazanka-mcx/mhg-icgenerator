import type { BrandEntry, CodeConfig, ValidationResult } from '../types.js';
import { flagCode, lettersOnly } from './text.js';

/** B1 — look a flag up in the closed brand table. */
export function findBrand(config: CodeConfig, flag: string): BrandEntry | null {
  const wanted = flagCode(flag);
  return config.brands.find((b) => b.code === wanted) ?? null;
}

/** The brand that used to hold this code in the 2021 sheet, if any (B4). */
export function findFormerBrand(config: CodeConfig, flag: string): BrandEntry | null {
  const wanted = flagCode(flag);
  return config.brands.find((b) => b.wasCode === wanted) ?? null;
}

/** G7 — market segments the standard never issues. */
export function isReservedMarket(config: CodeConfig, marketCode: string): boolean {
  return config.reservedMarkets.includes(marketCode);
}

/** G7 — the blocked-string screen, applied to a whole code. */
export function isBlockedCode(config: CodeConfig, code: string): boolean {
  if (isReservedMarket(config, code.slice(0, config.marketLength))) return true;
  return config.blockedSubstrings.some((bad) => code.includes(bad));
}

/** G7 applied to a market segment on its own, before a flag is attached. */
export function isBlockedMarket(config: CodeConfig, marketCode: string): boolean {
  if (isReservedMarket(config, marketCode)) return true;
  return config.blockedSubstrings.some((bad) => marketCode.includes(bad));
}

/**
 * G4 + G7 + B1 — the field-level check any system accepting an inn code
 * should run. Says nothing about whether the code was issued; that is the
 * registry's question (G8).
 */
export function validateCode(config: CodeConfig, input: string): ValidationResult {
  const code = flagCode(input);
  if (!code) {
    return { valid: false, rule: 'G4', message: 'Empty code.' };
  }
  if (!config.pattern.test(code)) {
    return {
      valid: false,
      rule: 'G4',
      message: `${code} fails G4. Expected exactly ${config.marketLength + config.flagLength} letters: ${config.marketLength} market, ${config.flagLength} flag.`,
    };
  }
  if (isBlockedCode(config, code)) {
    return { valid: false, rule: 'G7', message: `${code} fails G7 — blocked or reserved string.` };
  }
  const marketCode = code.slice(0, config.marketLength);
  const flag = code.slice(config.marketLength);
  const brand = findBrand(config, flag);
  if (!brand) {
    const former = findFormerBrand(config, flag);
    return {
      valid: false,
      rule: 'B1',
      message: former
        ? `${code} is well formed, but ${flag} is not in the brand table (B1). The 2021 sheet used ${flag} for ${former.name}, which is now ${former.code}.`
        : `${code} is well formed, but ${flag} is not in the brand table (B1).`,
      marketCode,
      flagCode: flag,
    };
  }
  return {
    valid: true,
    message: `${code} — ${marketCode} · ${brand.name} (${brand.chainCode}).`,
    marketCode,
    flagCode: flag,
    brandName: brand.name,
    chainCode: brand.chainCode,
  };
}
