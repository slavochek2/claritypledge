#!/usr/bin/env node
/**
 * @file prod-smoke-test.mjs
 * @description Post-deploy smoke test against production.
 *
 * Verifies that core data flows work end-to-end on the live prod DB.
 * Run after any significant deployment.
 *
 * Usage:
 *   node scripts/prod-smoke-test.mjs
 *   node scripts/prod-smoke-test.mjs --pre-enforcement   # before P1510 is applied on prod
 *
 * Requires in .env.local: PROD_TEST_AGENT_EMAIL, PROD_SUPABASE_ANON_KEY.
 * The prod service-role key comes from the keychain (one dialog per run): it
 * mints a sign-in link for the smoke account, nothing else. Every data request
 * below runs under the smoke account's own session, so RLS is still exercised.
 *
 * P1510: prod refuses password sign-in, so the session comes from an emailed
 * link (scripts/lib/link-session.mjs), and step 6 sets a random password on the
 * smoke account and asserts it is refused. --pre-enforcement skips step 6, for
 * the run that proves this script before the prod change lands.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { linkSession } from './lib/link-session.mjs';
import { keyringGet } from './lib/keyring.mjs';

// Load .env.local
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch { /* .env.local optional */ }
}
loadEnv();

const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const TEST_EMAIL = process.env.PROD_TEST_AGENT_EMAIL;
const ANON = process.env.PROD_SUPABASE_ANON_KEY;
const PRE_ENFORCEMENT = process.argv.includes('--pre-enforcement');

if (!TEST_EMAIL || !ANON) {
  console.error('Missing PROD_TEST_AGENT_EMAIL or PROD_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓', label); pass++; }
  else { console.log('  ✗', label, detail ? `(${detail})` : ''); fail++; }
}

console.log('\n=== Prod Smoke Test ===');
console.log('URL:', PROD_URL);
console.log('Agent:', TEST_EMAIL);
console.log('');

// ── 1. Auth ──────────────────────────────────────────────────────────────────
console.log('1. Auth');
let signIn = {};
let SERVICE_KEY = '';
try {
  const serviceKey = SERVICE_KEY = keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', 'prod smoke test: mint a sign-in link for the smoke account');
  signIn = await linkSession({ url: PROD_URL, anonKey: ANON, serviceKey, email: TEST_EMAIL });
} catch (e) {
  signIn = { error_description: e.message };
}

ok('link sign-in succeeds', !!signIn.access_token, signIn.error_description);
if (!signIn.access_token) { console.log('\nFATAL: cannot authenticate\n'); process.exit(1); }

const userId = signIn.user.id;
const jwt = signIn.access_token;
const authH = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

// ── 2. Profile ────────────────────────────────────────────────────────────────
// P877/P886: profiles has NO table-level SELECT for anon/authenticated — only a
// column-level GRANT on non-sensitive columns. An implicit select=* (or selecting
// email/linkedin_url/reason directly) returns 42501. Whitelisted columns only here;
// PII reads go through the SECURITY DEFINER accessors (get_profile_by_id etc.).
console.log('\n2. Profile');
const profile = await fetch(`${PROD_URL}/rest/v1/profiles?id=eq.${userId}&select=id,is_verified`, {
  headers: authH,
}).then(r => r.json());

ok('test agent profile exists', profile.length === 1);
ok('profile is_verified = true', profile[0]?.is_verified === true);

// ── 3. Story roundtrip ────────────────────────────────────────────────────────
console.log('\n3. Story roundtrip');
const created = await fetch(`${PROD_URL}/rest/v1/stories`, {
  method: 'POST',
  headers: { ...authH, Prefer: 'return=representation' },
  body: JSON.stringify({
    author_id: userId,
    content: `[smoke-test] ${new Date().toISOString()}`,
    visibility: 'private',
    tags: ['smoke-test'],
  }),
}).then(r => r.json());

const storyId = created[0]?.id;
ok('INSERT story succeeds', !!storyId, created[0]?.message || JSON.stringify(created).substring(0, 80));

if (storyId) {
  const readBack = await fetch(`${PROD_URL}/rest/v1/stories?id=eq.${storyId}&select=id`, {
    headers: authH,
  }).then(r => r.json());
  ok('author can SELECT own story', readBack[0]?.id === storyId);

  // Delete via own JWT (tests DELETE RLS too)
  await fetch(`${PROD_URL}/rest/v1/stories?id=eq.${storyId}`, {
    method: 'DELETE',
    headers: authH,
  });

  const afterDelete = await fetch(`${PROD_URL}/rest/v1/stories?id=eq.${storyId}&select=id`, {
    headers: authH,
  }).then(r => r.json());
  ok('story gone after DELETE', afterDelete.length === 0);
}

// ── 4. Public profile readable by anon ───────────────────────────────────────
console.log('\n4. Public access');
const slava = await fetch(`${PROD_URL}/rest/v1/profiles?slug=eq.slava&select=id,slug`, {
  headers: { apikey: ANON },
}).then(r => r.json());
ok("slava's public profile readable by anon", slava[0]?.slug === 'slava');

// ── 5. PII column gate canary (P877/P886) ────────────────────────────────────
// The incident class this guards: the profiles column gate silently rolled back
// (or never applied), leaving email/linkedin_url/reason bulk-readable via the
// public anon key. Mirror of e2e/integration/p877-reproduce.spec.ts S1.
// 42501 = permission denied (HTTP 403); PGRST301 = the PostgREST JWT variant.
console.log('\n5. PII column gate');
const piiRes = await fetch(`${PROD_URL}/rest/v1/profiles?select=email&limit=1`, {
  headers: { apikey: ANON },
});
const piiBody = await piiRes.json().catch(() => null);
ok(
  'anon select=email is denied (column gate active)',
  piiRes.status >= 400 && /42501|PGRST301/.test(piiBody?.code ?? ''),
  `status=${piiRes.status} code=${piiBody?.code ?? 'none'}`
);

// ── 6. Password sign-in refused (P1510) ─────────────────────────────────────
// Canary for a platform upgrade that silently drops the auth.users trigger:
// give the smoke account a fresh random password through the admin API (one of
// the paths the trigger must neutralise), then try it. Any session = fail.
// --pre-enforcement skips this step: the password would really be set.
console.log('\n6. Password sign-in');
if (PRE_ENFORCEMENT) {
  console.log('  ⚠ skipped (--pre-enforcement: P1510 not yet applied on prod)');
} else {
  const probePw = `p1510-${randomBytes(18).toString('base64url')}`;
  const setRes = await fetch(`${PROD_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: probePw }),
  });
  ok('admin password write accepted by the API', setRes.ok, `HTTP ${setRes.status}`);
  // Pass ONLY on the auth server's own credential rejection (HTTP 400,
  // invalid_credentials). A network error, 429 or 5xx is "could not test",
  // which is a failure, never a vacuous pass.
  const pwRes = await fetch(`${PROD_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: probePw }),
  }).catch((e) => ({ status: 0, json: async () => ({ error_code: `network: ${e.message}` }) }));
  const pwBody = await pwRes.json().catch(() => ({}));
  ok('password sign-in is refused as invalid credentials',
    pwRes.status === 400 && pwBody.error_code === 'invalid_credentials' && !pwBody.access_token,
    `status=${pwRes.status} code=${pwBody.error_code ?? pwBody.error ?? 'none'}${pwBody.access_token ? ' — A PASSWORD PRODUCED A SESSION: the P1510 trigger is gone' : ''}`);
  if (pwBody.access_token) {
    // Do not leave a working password behind: overwrite it with one nobody holds.
    await fetch(`${PROD_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: randomBytes(32).toString('base64url') }),
    }).catch(() => {});
  }
}

// ── 7. Prod is enforcing (P1510) ────────────────────────────────────────────
// Step 6 proves NEW passwords are stripped. This proves the rest: the marker
// says prod, and no account still holds a stored password (catches a migration
// that landed before the marker, a flipped marker, or a restore).
console.log('\n7. Password enforcement state');
if (PRE_ENFORCEMENT) {
  console.log('  ⚠ skipped (--pre-enforcement)');
} else {
  const stRes = await fetch(`${PROD_URL}/rest/v1/rpc/p1510_status`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const st = (await stRes.json().catch(() => []))?.[0] ?? {};
  ok("marker password_signin = 'forbidden'", st.mode === 'forbidden', `HTTP ${stRes.status} mode=${st.mode ?? 'absent'}`);
  ok('no account holds a stored password', Number(st.password_hashes) === 0, `password_hashes=${st.password_hashes ?? 'unknown'}`);
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
