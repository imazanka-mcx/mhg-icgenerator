/**
 * Issue an inn code straight against Firestore with the Admin SDK — for
 * bulk-seeding the existing portfolio faster than the web app allows.
 *
 *   node functions/scripts/issue.mjs \
 *     --name "Hampton Inn Evansville East" \
 *     --city Evansville --state IN --flag HX \
 *     --submarket East --franchisor EVVIN
 *
 * Add --dry to derive without claiming.
 *
 * Uses Application Default Credentials, so no downloaded key is needed:
 *
 *   gcloud auth application-default login
 *   gcloud auth application-default set-quota-project mhg-icgenerator
 *
 * Also needs `npm run build` to have been run at least once. This bypasses the
 * callable's admin check, so it is a standards-owner tool: anything it writes
 * is real.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
// Built output, not source — run `npm run build` in the repo root first.
import { MHG_CONFIG, deriveCode, issueCode } from '../../dist/index.js';
import { FirestoreRegistry } from '../../dist/registry/firestore.js';

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(`--${flag}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? '');
}
const dry = process.argv.includes('--dry');

const req = {
  name: arg('name'),
  city: arg('city'),
  state: arg('state').toUpperCase(),
  brandCode: arg('flag').toUpperCase(),
  submarket: arg('submarket'),
  franchisorCode: arg('franchisor'),
  marketOverride: arg('market'),
  status: arg('status', 'active'),
  propertyId: arg('property') || undefined,
};

if (!req.city || !req.state || !req.brandCode) {
  console.error('Required: --city, --state, --flag. See the comment at the top of this file.');
  process.exit(1);
}
try {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'mhg-icgenerator',
  });
} catch (err) {
  console.error('Could not load Application Default Credentials.');
  console.error('Run: gcloud auth application-default login');
  console.error(err.message);
  process.exit(1);
}

const deps = { config: MHG_CONFIG, registry: new FirestoreRegistry(getFirestore()) };
const result = dry ? await deriveCode(deps, req) : await issueCode(deps, req);

if (!result.ok) {
  console.error(`Refused by ${result.failure.rule}: ${result.failure.message}`);
  for (const step of result.trace) console.error(`  ${step.rule.padEnd(5)} ${step.detail}`);
  process.exit(1);
}

const code = dry ? result.candidate.code : result.record.code;
console.log(dry ? `Would issue ${code}` : `Issued ${code}`);
for (const step of result.trace) console.log(`  ${step.rule.padEnd(5)} ${step.detail}`);
if (!dry) console.log(`  propertyId ${result.record.propertyId}`);
