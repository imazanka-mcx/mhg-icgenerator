/**
 * Emits public/brands.json from the config so the web app's flag dropdown can
 * never drift from the closed brand table (B1). Runs as part of `npm run build`.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MHG_CONFIG } from '../dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const payload = {
  version: MHG_CONFIG.version,
  generatedAt: new Date().toISOString().slice(0, 10),
  chains: MHG_CONFIG.chains,
  brands: MHG_CONFIG.brands.map((b) => ({
    code: b.code,
    name: b.name,
    chainCode: b.chainCode,
    wasCode: b.wasCode ?? '',
    retired: b.retired ?? false,
  })),
};

await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(
  resolve(root, 'public/brands.json'),
  JSON.stringify(payload, null, 2) + '\n',
  'utf8',
);
console.log(`public/brands.json — ${payload.brands.length} flags`);
