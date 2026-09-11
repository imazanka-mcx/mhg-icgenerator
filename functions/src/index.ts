/**
 * Inn code issuance — MHG corporate.
 *
 * A standalone MHG corporate tool for MHG-BRANDED hotels. A property MHG
 * manages under someone else's flag is out of scope and gets no code here.
 *
 * It is not part of any other product and shares no data with one: this
 * project's Firestore is the whole world. Every callable requires the
 * `mhgAdmin` custom claim, and the registry collections are server-only in the
 * security rules to match.
 *
 * Issuance lives here rather than in a client because the uniqueness guarantee
 * is a transactional create on a document ID (G8), and the Admin SDK is the
 * only writer the rules permit.
 *
 * Access is granted from inside the app, not from a laptop. The first admin
 * self-enables through `bootstrapInnCodeAdmin`, which only ever works for the
 * emails in BOOTSTRAP_ADMINS below; after that, any admin can grant another
 * through `grantInnCodeAdmin`. No downloaded service account key is involved
 * anywhere, which matters because org policy can forbid creating one.
 */

import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

import {
  MHG_CONFIG,
  deriveCode,
  issueCode,
  rebrand,
  validateCode,
  type EngineDeps,
  type IssueRequest,
  type PropertyStatus,
} from '@mcx/inn-code';
import { FirestoreRegistry } from '@mcx/inn-code/firestore';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/**
 * Who may enable their own access, once, with no claim yet.
 *
 * This is the only bootstrap path, and it is narrow on purpose: a listed
 * address still has to sign in with a verified Google account on this project,
 * and listing an address grants nothing by itself. Everyone else is granted by
 * an existing admin through grantInnCodeAdmin.
 *
 * Editing this list requires a deploy, which is the point — it cannot be
 * widened by anyone who only has access to the app.
 */
const BOOTSTRAP_ADMINS = ['imazanka@mazcoenterprises.com'];

function deps(): EngineDeps {
  return { config: MHG_CONFIG, registry: new FirestoreRegistry(getFirestore()) };
}

/** MHG corporate only. There is no lesser tier — this tool is not tenant-facing. */
function requireCorporate(request: CallableRequest): void {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (request.auth.token?.['mhgAdmin'] !== true) {
    throw new HttpsError('permission-denied', 'Inn code administration is limited to MHG corporate.');
  }
}

function str(value: unknown, field: string, required = false): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpsError('invalid-argument', `${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${field} must be a string.`);
  return value.trim().slice(0, 200);
}

function readRequest(data: unknown): IssueRequest {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = str(d['status'], 'status');
  if (status && !['pipeline', 'active', 'retired'].includes(status)) {
    throw new HttpsError('invalid-argument', 'status must be pipeline, active, or retired.');
  }
  return {
    name: str(d['name'], 'name'),
    city: str(d['city'], 'city', true),
    state: str(d['state'], 'state', true).toUpperCase().slice(0, 2),
    brandCode: str(d['brandCode'], 'brandCode', true).toUpperCase(),
    submarket: str(d['submarket'], 'submarket'),
    franchisorCode: str(d['franchisorCode'], 'franchisorCode'),
    marketOverride: str(d['marketOverride'], 'marketOverride'),
    status: (status || 'active') as PropertyStatus,
    // Supplied only when re-issuing against an existing property record (G1).
    propertyId: str(d['propertyId'], 'propertyId') || undefined,
  };
}

/** Turn a rule refusal into a callable error that keeps the rule id and trace. */
function refuse(failure: { rule: string; code: string; message: string }, trace: unknown): never {
  throw new HttpsError('failed-precondition', failure.message, {
    rule: failure.rule,
    failureCode: failure.code,
    trace,
  });
}

/**
 * Read-only. Returns the candidate code and the rules that produced it, or the
 * rule that refused it. Writes nothing — calling this reserves no code.
 */
export const previewInnCode = onCall(async (request) => {
  requireCorporate(request);
  const result = await deriveCode(deps(), readRequest(request.data));
  if (!result.ok) return { ok: false, failure: result.failure, trace: result.trace };
  return { ok: true, candidate: result.candidate, trace: result.candidate.trace };
});

/**
 * Derives and atomically claims. The only call that makes a code real.
 * Creates the property record in this tool's own registry. The PROP code is the
 * inn code — every property here flies an MHG flag.
 */
export const issueInnCode = onCall(async (request) => {
  requireCorporate(request);
  const result = await issueCode(deps(), readRequest(request.data));
  if (!result.ok) refuse(result.failure, result.trace);
  return { record: result.record, trace: result.trace };
});

/** G2 — flag change. New code, same property, old code retired permanently. */
export const rebrandInnCode = onCall(async (request) => {
  requireCorporate(request);
  const d = (request.data ?? {}) as Record<string, unknown>;
  const oldCode = str(d['oldCode'], 'oldCode', true).toUpperCase();
  const newBrandCode = str(d['newBrandCode'], 'newBrandCode', true).toUpperCase();
  const result = await rebrand(deps(), oldCode, newBrandCode, {
    submarket: str(d['submarket'], 'submarket') || undefined,
    marketOverride: str(d['marketOverride'], 'marketOverride') || undefined,
  });
  if (!result.ok) refuse(result.failure, result.trace);
  return { record: result.record, trace: result.trace };
});

/**
 * Retires a property. The code stays claimed forever (G3) — this marks the
 * property closed or divested, it does not free the code for reuse.
 */
export const retireInnCode = onCall(async (request) => {
  requireCorporate(request);
  const code = str((request.data as Record<string, unknown>)?.['code'], 'code', true).toUpperCase();
  const { registry } = deps();
  if (!(await registry.get(code))) throw new HttpsError('not-found', `${code} is not in the registry.`);
  await registry.setStatus(code, 'retired');
  return { code, status: 'retired' };
});

/** The whole registry, for the corporate admin screen. */
export const listInnCodes = onCall(async (request) => {
  requireCorporate(request);
  return { records: await deps().registry.list() };
});

/* ------------------------------------------------------------------ access */

function normalizeEmail(value: unknown, field: string): string {
  const email = str(value, field, true).toLowerCase();
  if (!email.includes('@')) throw new HttpsError('invalid-argument', `${field} must be an email.`);
  return email;
}

/**
 * First-admin bootstrap. Grants the caller the claim if — and only if — their
 * verified email is in BOOTSTRAP_ADMINS. Safe to call repeatedly and safe to
 * leave deployed: it can never grant anyone not on that list.
 */
export const bootstrapInnCodeAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');

  const email = (request.auth.token.email ?? '').toLowerCase();
  const verified = request.auth.token.email_verified === true;

  if (!email || !verified || !BOOTSTRAP_ADMINS.includes(email)) {
    // Deliberately the same message either way — this endpoint should not
    // report whether a given address is on the list.
    throw new HttpsError('permission-denied', 'This account cannot enable inn code access.');
  }

  const auth = getAuth();
  const user = await auth.getUser(request.auth.uid);
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), mhgAdmin: true });
  return { email, granted: true };
});

/** An existing admin grants another. This is how everyone after the first gets in. */
export const grantInnCodeAdmin = onCall(async (request) => {
  requireCorporate(request);
  const email = normalizeEmail((request.data as Record<string, unknown>)?.['email'], 'email');
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    throw new HttpsError(
      'not-found',
      `${email} has not signed in yet. Have them open the app and sign in once, then grant again.`,
    );
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), mhgAdmin: true });
  return { email, granted: true };
});

/** Withdraw access. An admin cannot revoke their own, so the tool keeps one. */
export const revokeInnCodeAdmin = onCall(async (request) => {
  requireCorporate(request);
  const email = normalizeEmail((request.data as Record<string, unknown>)?.['email'], 'email');
  if (email === (request.auth?.token.email ?? '').toLowerCase()) {
    throw new HttpsError('failed-precondition', 'You cannot revoke your own access.');
  }
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  delete claims['mhgAdmin'];
  await auth.setCustomUserClaims(user.uid, claims);
  return { email, granted: false };
});

/** Field-level check (G4, G7, B1). No registry read. */
export const checkInnCode = onCall(async (request) => {
  requireCorporate(request);
  const code = str((request.data as Record<string, unknown>)?.['code'], 'code', true);
  return validateCode(MHG_CONFIG, code);
});
