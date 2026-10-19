#!/usr/bin/env node
/**
 * bootstrap-align-agent.mjs — P1030, one-time, founder-run, idempotent.
 *
 * Creates (or adopts) the prod auth user + `profiles` row that `/align-create-letter`
 * signs in as when it files a reverse story. Run once; safe to re-run.
 *
 * WHY A SCRIPT AND NOT A MIGRATION: profiles are created by the auth callback in the
 * app, never by a DB trigger (`.claude/rules/database.md`). And `stories` INSERT RLS
 * requires `is_verified = true`, which `guard_profile_trust_columns` pins against
 * anon/authenticated — only the service role can set it. So this has to be an
 * out-of-band service-role write.
 *
 * ASSERT, DO NOT ASSUME: the agent address is the standing service-signup identity,
 * so an auth user may already exist on it. This script looks first and adopts what it
 * finds; it never blind-creates and never overwrites a name that is already set.
 *
 * NO LITERALS: the address and keys come from .env.local or the keychain by variable name.
 * The prod ref comes from .env.prod ONLY — .env.local overrides VITE_SUPABASE_URL with
 * the TEST ref, and test and prod are different projects. This file contains no
 * address, no key and no project ref.
 *
 * Usage:  node scripts/bootstrap-align-agent.mjs [--dry-run]
 */

import { readFileSync } from 'node:fs';
import { linkSession } from './lib/link-session.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

/** Parse a dotenv file into a plain object. Never mutates process.env — the two files
 *  disagree on VITE_SUPABASE_URL by design and merging them is the bug this avoids. */
function readEnvFile(name) {
  try {
    const out = {};
    for (const line of readFileSync(resolve(REPO_ROOT, name), 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return null;
  }
}

const die = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

const envProd = readEnvFile('.env.prod') ?? die('.env.prod not found — the prod ref must come from it, never from .env.local');
const envLocal = readEnvFile('.env.local') ?? die('.env.local not found — credentials live there');

// ── Prod ref: .env.prod ONLY ────────────────────────────────────────────────
const PROD_URL = (envProd.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
if (!PROD_URL) die('VITE_SUPABASE_URL missing from .env.prod');
if (envLocal.VITE_SUPABASE_URL && envLocal.VITE_SUPABASE_URL.replace(/\/+$/, '') === PROD_URL) {
  die('.env.local VITE_SUPABASE_URL equals the prod ref — that is unexpected; stopping rather than guessing which project is which');
}

// ── Credentials: .env.local, by variable name ───────────────────────────────
// The agent lives on the ops service address, which .env.local already carries as
// OPS_EMAIL. An earlier draft asked for a second variable holding the same value;
// that was duplication, not a second fact. PROD_ALIGN_AGENT_EMAIL still wins when
// present, so the agent can be moved off the ops address without editing this file.
const AGENT_EMAIL = envLocal.PROD_ALIGN_AGENT_EMAIL || envLocal.OPS_EMAIL;
const ANON_KEY = envLocal.PROD_SUPABASE_ANON_KEY;

const missing = Object.entries({
  'OPS_EMAIL (or PROD_ALIGN_AGENT_EMAIL)': AGENT_EMAIL,
  PROD_SUPABASE_ANON_KEY: ANON_KEY,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) die(`Missing from .env.local: ${missing.join(', ')}`);

// The prod service key comes through the per-access lock (P1239/P1316), never from
// .env.local. keyringGet throws on a declined dialog — no plaintext fallback, no empty value.
const { keyringGet } = await import('./lib/keyring.mjs');
let SERVICE_KEY;
try {
  SERVICE_KEY = keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', 'bootstrap-align-agent: provision the agent identity on prod');
} catch (err) {
  die(err.message);
}

// ── No password (P1510) ─────────────────────────────────────────────────────
// Prod refuses password sign-in. The identity is created without one, and
// /align-create-letter signs in through a service-role-minted link
// (scripts/lib/link-session.mjs) — the same route a person takes, by email link.

const AGENT_NAME = 'Clarity Agent';
const AGENT_SLUG = 'clarity-agent';

const svc = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

/** Mask an address for logging — this runs against prod and the output may be pasted. */
const mask = (e) => e.replace(/^(.).*(@.*)$/, (_, a, d) => `${a}***${d}`);

console.log('\n=== bootstrap-align-agent (P1030) ===');
console.log('Project ref :', PROD_URL.match(/\/\/([^.]+)/)?.[1] ?? '(unparsed)');
console.log('Agent       :', mask(AGENT_EMAIL), `— "${AGENT_NAME}"`);
console.log('Mode        :', DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (writes to prod)');
console.log('');

// ── 1. Does an auth user already exist on this address? ─────────────────────
const listRes = await fetch(
  `${PROD_URL}/auth/v1/admin/users?filter=${encodeURIComponent(AGENT_EMAIL)}`,
  { headers: svc }
);
if (!listRes.ok) die(`admin/users lookup failed: ${listRes.status} ${await listRes.text()}`);
const listed = await listRes.json();
const existing = (listed.users ?? []).find(
  (u) => (u.email ?? '').toLowerCase() === AGENT_EMAIL.toLowerCase()
);

let userId;
if (existing) {
  userId = existing.id;
  console.log('1. Auth user       : ADOPTED (already existed) —', userId);
  console.log('   confirmed_at    :', existing.email_confirmed_at ?? '(not confirmed)');
  if (!existing.email_confirmed_at) {
    console.log('   ⚠ not email-confirmed; setting email_confirm so the identity is usable.');
    console.log('     Re-run without --dry-run to set email_confirm on the existing user.');
    if (!DRY_RUN) {
      const conf = await fetch(`${PROD_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT', headers: svc, body: JSON.stringify({ email_confirm: true }),
      });
      console.log('   confirm patch   :', conf.ok ? 'ok' : `FAILED ${conf.status}`);
    }
  }
} else if (DRY_RUN) {
  console.log('1. Auth user       : would CREATE (email_confirm: true)');
  userId = '(dry-run)';
} else {
  const createRes = await fetch(`${PROD_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email: AGENT_EMAIL, email_confirm: true }),
  });
  const created = await createRes.json();
  if (!created.id) die(`admin create failed: ${createRes.status} ${JSON.stringify(created).slice(0, 200)}`);
  userId = created.id;
  console.log('1. Auth user       : CREATED —', userId);
}

// ── 2. Profile row: must exist and be is_verified ───────────────────────────
// stories INSERT RLS requires is_verified = true (p586:207-211).
if (DRY_RUN) {
  console.log('2. Profile         : skipped (dry run)');
} else {
  const profRes = await fetch(
    `${PROD_URL}/rest/v1/profiles?id=eq.${userId}&select=id,name,slug,is_verified,has_pledged`,
    { headers: svc }
  );
  const rows = await profRes.json();
  if (!Array.isArray(rows)) die(`profiles lookup failed: ${JSON.stringify(rows).slice(0, 200)}`);

  if (rows.length > 1) die(`profiles returned ${rows.length} rows for one id — refusing to guess`);

  if (rows.length === 1) {
    const p = rows[0];
    console.log('2. Profile         : ADOPTED —', p.slug, `(is_verified: ${p.is_verified})`);
    if (!p.is_verified) {
      const patch = await fetch(`${PROD_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
        body: JSON.stringify({ is_verified: true }),
      });
      console.log('   is_verified     :', patch.ok ? 'set to true' : `FAILED ${patch.status}`);
    }
    // P1378: a system identity is not a pledger. has_pledged defaults to true at the table,
    // so an adopted row must be switched off explicitly or it lists on /pledgers.
    if (p.has_pledged !== false) {
      const patch = await fetch(`${PROD_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
        body: JSON.stringify({ has_pledged: false }),
      });
      if (!patch.ok) die(`has_pledged repair failed: ${patch.status} — the agent would list on /pledgers`);
      console.log('   has_pledged     : set to false');
    }
    // Deliberately does NOT rename an adopted profile — if this address already
    // belongs to something else, silently relabelling it is the wrong repair.
    if (p.name !== AGENT_NAME) {
      console.log(`   ⚠ name is "${p.name}", not "${AGENT_NAME}" — left as-is on purpose.`);
      console.log('     The letter will render this name to the reader. Rename by hand if wrong.');
    }
  } else {
    const insRes = await fetch(`${PROD_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify({
        id: userId, email: AGENT_EMAIL, name: AGENT_NAME,
        slug: AGENT_SLUG, is_verified: true, has_pledged: false, avatar_color: '#0044CC', // P1378
      }),
    });
    const ins = await insRes.json();
    if (!insRes.ok) die(`profile insert failed: ${insRes.status} ${JSON.stringify(ins).slice(0, 200)}`);
    console.log('2. Profile         : CREATED —', AGENT_SLUG);
  }
}

// ── 3. Prove link sign-in works — the thing the skill depends on (P1510) ─────
if (DRY_RUN) {
  console.log('3. Link sign-in    : skipped (dry run)');
  console.log('\nDry run complete. Nothing was written.\n');
  process.exit(0);
}

try {
  await linkSession({ url: PROD_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY, email: AGENT_EMAIL });
} catch (e) {
  die(`link sign-in FAILED: ${e.message}
   The agent profile exists but /align-create-letter cannot sign in as it.`);
}
console.log('3. Link sign-in    : ok — the skill can authenticate as this agent');

// ── 4. Report ───────────────────────────────────────────────────────────────
console.log('\n=== done ===');
console.log('Agent profile id:', userId);
console.log('Put nothing from this output into a tracked file.\n');
