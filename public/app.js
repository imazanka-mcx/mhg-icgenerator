/**
 * MHG Inn Codes — corporate issuance screen.
 *
 * Thin by design. Every rule lives in the Cloud Functions; this page collects
 * input, shows the derivation the server returned, and issues. It holds no copy
 * of the rule ladder, so it cannot drift from the standard. The flag list comes
 * from brands.json, generated from the same config the engine uses.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFunctions, httpsCallable,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { firebaseConfig as fallbackConfig, functionsRegion } from './firebase-config.js';

/**
 * Firebase Hosting serves this site's own project config at a reserved URL, so
 * the page asks Hosting who it is rather than carrying hand-copied keys. That
 * removes the failure where the config file still says REPLACE_ME.
 *
 * Falls back to firebase-config.js when the endpoint isn't there — running the
 * page from anywhere other than Firebase Hosting, for instance.
 */
async function loadConfig() {
  try {
    const res = await fetch('/__/firebase/init.json');
    if (res.ok) {
      const served = await res.json();
      if (served?.apiKey) return served;
    }
  } catch {
    // Not on Firebase Hosting, or offline. Fall through to the file.
  }
  return fallbackConfig;
}

const firebaseConfig = await loadConfig();

if (!firebaseConfig?.apiKey || firebaseConfig.apiKey === 'REPLACE_ME') {
  document.getElementById('gateTitle').textContent = 'Not configured';
  document.getElementById('gateMsg').textContent =
    'This project has no registered web app, so Hosting has no SDK config to serve. ' +
    'Run: firebase apps:create web "Inn Codes" — then redeploy hosting.';
  document.getElementById('signIn').hidden = true;
  throw new Error('Firebase web app not registered');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fns = getFunctions(app, functionsRegion);

const call = {
  preview: httpsCallable(fns, 'previewInnCode'),
  issue: httpsCallable(fns, 'issueInnCode'),
  list: httpsCallable(fns, 'listInnCodes'),
  retire: httpsCallable(fns, 'retireInnCode'),
  bootstrap: httpsCallable(fns, 'bootstrapInnCodeAdmin'),
  grant: httpsCallable(fns, 'grantInnCodeAdmin'),
  revoke: httpsCallable(fns, 'revokeInnCodeAdmin'),
};

const $ = (id) => document.getElementById(id);
const STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT ' +
  'NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' ');

let records = [];
let candidate = null;
let previewToken = 0;

/* ---------------------------------------------------------------- helpers */

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function setVerdict(kind, text) {
  $('verdict').innerHTML = kind ? `<div class="flag ${kind}">${esc(text)}</div>` : '';
}

function renderTrace(steps) {
  $('trace').innerHTML = (steps ?? [])
    .map((s) => `<div class="trow"><div class="rid">${esc(s.rule)}</div>` +
      `<div class="txt">${esc(s.detail)}</div></div>`)
    .join('');
}

function showCode(code) {
  $('candidate').textContent = code ? code.split('').join(' ') : '— — — — —';
}

/** A callable rejection carries the rule that refused it in `details`. */
function explain(err) {
  const d = err?.details;
  if (d?.rule) return { message: err.message, rule: d.rule, trace: d.trace };
  if (err?.code === 'functions/permission-denied') {
    return { message: 'Your account does not have inn code access.', rule: null, trace: null };
  }
  if (err?.code === 'functions/unauthenticated') {
    return { message: 'Session expired — sign in again.', rule: null, trace: null };
  }
  return { message: err?.message ?? 'Something went wrong.', rule: null, trace: null };
}

/* ------------------------------------------------------------------ setup */

async function loadBrands() {
  const res = await fetch('./brands.json');
  const data = await res.json();
  const select = $('brand');
  select.innerHTML = '<option value="">Select a flag…</option>';
  const chains = data.chains ?? {};
  const groups = new Map();
  for (const b of data.brands) {
    if (!groups.has(b.chainCode)) groups.set(b.chainCode, []);
    groups.get(b.chainCode).push(b);
  }
  for (const [chainCode, brands] of [...groups].sort()) {
    const group = document.createElement('optgroup');
    group.label = `${chainCode} — ${chains[chainCode] ?? chainCode}`;
    for (const b of brands) {
      const option = document.createElement('option');
      option.value = b.code;
      option.textContent = `${b.code} — ${b.name}${b.retired ? ' (retired)' : ''}`;
      group.appendChild(option);
    }
    select.appendChild(group);
  }
}

function buildStates() {
  $('state').innerHTML = STATES
    .map((s) => `<option value="${s}"${s === 'IN' ? ' selected' : ''}>${s}</option>`)
    .join('');
}

/* --------------------------------------------------------------- preview */

function formValues() {
  return {
    name: $('name').value.trim(),
    city: $('city').value.trim(),
    state: $('state').value,
    brandCode: $('brand').value,
    submarket: $('submarket').value.trim(),
    franchisorCode: $('franchisor').value.trim(),
    marketOverride: $('override').value.trim(),
    status: $('status').value,
  };
}

let debounce;
function schedulePreview() {
  clearTimeout(debounce);
  debounce = setTimeout(preview, 250);
}

async function preview() {
  const values = formValues();
  candidate = null;
  $('issue').disabled = true;

  if (!values.city || !values.brandCode) {
    showCode(null);
    renderTrace([{ rule: '…', detail: 'Enter a city and a flag to derive a code.' }]);
    setVerdict('', '');
    return;
  }

  const token = ++previewToken;
  try {
    const { data } = await call.preview(values);
    if (token !== previewToken) return; // a newer keystroke won
    if (data.ok) {
      showCode(data.candidate.code);
      renderTrace(data.trace);
      setVerdict('ok', `Clear to issue. ${data.candidate.code} is unique across the registry.`);
      candidate = data.candidate;
      $('issue').disabled = false;
    } else {
      showCode(null);
      renderTrace(data.trace);
      const soft = data.failure.code === 'submarket_required';
      setVerdict(soft ? 'warn' : 'bad', data.failure.message);
    }
  } catch (err) {
    if (token !== previewToken) return;
    const info = explain(err);
    showCode(null);
    renderTrace(info.trace ?? []);
    setVerdict('bad', info.message);
  }
}

/* ----------------------------------------------------------------- issue */

async function issue() {
  if (!candidate) return;
  $('issue').disabled = true;
  $('note').textContent = 'Issuing…';
  try {
    const { data } = await call.issue(formValues());
    $('note').textContent = `Issued ${data.record.code}.`;
    $('name').value = '';
    await refresh();
    await preview();
  } catch (err) {
    const info = explain(err);
    setVerdict('bad', info.message);
    if (info.trace) renderTrace(info.trace);
    $('note').textContent = '';
    $('issue').disabled = false;
  }
}

async function retire(code) {
  $('note').textContent = `Retiring ${code}…`;
  try {
    await call.retire({ code });
    $('note').textContent = `${code} retired. The code stays claimed forever (G3).`;
    await refresh();
  } catch (err) {
    $('note').textContent = explain(err).message;
  }
}

/* -------------------------------------------------------------- registry */

function renderRegistry() {
  const body = $('registry');
  if (!records.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">No codes issued yet.</td></tr>';
  } else {
    body.innerHTML = '';
    for (const r of [...records].sort((a, b) => a.code.localeCompare(b.code))) {
      const tr = document.createElement('tr');
      if (r.status === 'retired') tr.className = 'retired';
      const label = r.status === 'pipeline' ? 'Pipeline' : r.status === 'retired' ? 'Retired' : 'Active';
      tr.innerHTML =
        `<td class="mono">${esc(r.code)}</td>` +
        `<td>${esc(r.name)}${r.predecessorCode ? `<br><span class="hint">was ${esc(r.predecessorCode)}</span>` : ''}</td>` +
        `<td class="mono">${esc(r.brandCode)}</td>` +
        `<td>${esc(r.city)}, ${esc(r.state)}</td>` +
        `<td>${r.submarket ? esc(r.submarket) : '—'}</td>` +
        `<td class="mono">${r.franchisorCode ? esc(r.franchisorCode) : '—'}</td>` +
        `<td><span class="pill ${esc(r.status)}">${label}</span></td>` +
        '<td style="text-align:right"></td>';
      if (r.status !== 'retired') {
        const button = document.createElement('button');
        button.className = 'ghost';
        button.style.cssText = 'font-size:11px;padding:3px 8px';
        button.textContent = 'Retire';
        button.onclick = () => retire(r.code);
        tr.lastElementChild.appendChild(button);
      }
      body.appendChild(tr);
    }
  }
  const by = (s) => records.filter((r) => r.status === s).length;
  $('count').textContent =
    `${records.length} issued · ${by('active')} active · ${by('pipeline')} pipeline · ${by('retired')} retired`;
}

async function refresh() {
  try {
    const { data } = await call.list();
    records = data.records ?? [];
    renderRegistry();
  } catch (err) {
    $('count').textContent = explain(err).message;
  }
}

/* ------------------------------------------------------------------ auth */

$('signIn').onclick = async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    $('gateMsg').textContent = err?.message ?? 'Sign-in failed.';
  }
};
$('signOut').onclick = () => signOut(auth);

/** Called after a claim changes — a cached token won't carry the new claim. */
async function refreshClaims() {
  const user = auth.currentUser;
  if (!user) return false;
  await user.getIdToken(true);
  const token = await user.getIdTokenResult();
  return token.claims.mhgAdmin === true;
}

$('enable').onclick = async () => {
  $('enable').disabled = true;
  $('enableNote').textContent = 'Enabling…';
  try {
    await call.bootstrap({});
    if (await refreshClaims()) {
      $('enableNote').textContent = '';
      await showApp();
      return;
    }
    $('enableNote').textContent = 'Granted, but the token did not refresh. Reload the page.';
  } catch (err) {
    $('enableNote').textContent = explain(err).message;
  }
  $('enable').disabled = false;
};

async function showApp() {
  $('gate').hidden = true;
  $('app').hidden = false;
  await loadBrands();
  await refresh();
  await preview();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $('app').hidden = true;
    $('who').hidden = true;
    $('gate').hidden = false;
    $('gateTitle').textContent = 'Sign in';
    $('gateMsg').textContent = 'MHG corporate access only.';
    $('signIn').hidden = false;
    $('enable').hidden = true;
    $('enableNote').textContent = '';
    return;
  }

  $('whoEmail').textContent = user.email ?? '';
  $('who').hidden = false;

  const token = await user.getIdTokenResult();
  if (token.claims.mhgAdmin !== true) {
    $('app').hidden = true;
    $('gate').hidden = false;
    $('gateTitle').textContent = 'No access';
    $('gateMsg').textContent =
      `${user.email} is signed in but has no inn code access. ` +
      'If you are setting this up for the first time, enable it below. ' +
      'Otherwise ask someone who already has access to grant it.';
    $('signIn').hidden = true;
    $('enable').hidden = false;
    return;
  }

  await showApp();
});

/* ----------------------------------------------------------- team access */

async function changeAccess(fn, verb) {
  const email = $('grantEmail').value.trim();
  if (!email) return;
  $('grantNote').textContent = `${verb}…`;
  try {
    await fn({ email });
    $('grantNote').textContent = `${email} — access ${verb === 'Granting' ? 'granted' : 'revoked'}. They need to reload.`;
    $('grantEmail').value = '';
  } catch (err) {
    $('grantNote').textContent = explain(err).message;
  }
}

$('grant').onclick = () => changeAccess(call.grant, 'Granting');
$('revoke').onclick = () => changeAccess(call.revoke, 'Revoking');

/* ------------------------------------------------------------------ wire */

buildStates();
for (const id of ['name', 'city', 'submarket', 'franchisor', 'override']) {
  $(id).addEventListener('input', schedulePreview);
}
for (const id of ['state', 'brand', 'status']) {
  $(id).addEventListener('change', preview);
}
$('issue').onclick = issue;
$('clear').onclick = () => {
  for (const id of ['name', 'city', 'submarket', 'franchisor', 'override']) $(id).value = '';
  $('brand').value = '';
  $('note').textContent = '';
  preview();
};
