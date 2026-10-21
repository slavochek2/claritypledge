#!/usr/bin/env node
/**
 * P1453: artist banners for AGENT profiles, through the operator-only generate-agent-banner
 * edge function (service-role bearer; the function refuses non-agent ids and never replaces a
 * banner unless --replace is given).
 *
 * Usage:
 *   node scripts/agent-banner.mjs --env test|prod --profile-id <uuid> [--replace]
 *       One agent. Used by /provision-agent (Step 5c) and to fix a bad banner (--replace).
 *   node scripts/agent-banner.mjs --env test|prod --all-missing [--apply] [--cap N]
 *       Backfill: every agent with no banner. DRY RUN by default (lists ids and a count, needs
 *       no key); --apply generates, one at a time, at most --cap (default 25) per run, and stops
 *       on the first 429 or 403 (spend cap or key problem — a hard stop, not a retry).
 *
 * Every success is read back over the ANON key: the public read path must return a banner whose
 * credit is bound to it (banner_credit.url === banner_url), or the run counts it as failed.
 *
 * Keys: test reads TEST_SUPABASE_SERVICE_ROLE_KEY from .env.local; prod reads the locked
 * PROD_SUPABASE_SERVICE_ROLE_KEY through the keyring (one dialog, answer Allow — never Always
 * Allow). The key is sent in a request header only, never in argv or output.
 * Run scripts/check-gemini-prod-key.sh before a prod backfill.
 *
 * Exit: 0 all done (or dry run) · 1 usage/config error · 2 any profile failed · 3 stopped on 429/403
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyringGet } from './lib/keyring.mjs';

const URLS = {
  test: 'https://ayibkeoyukulbsjpxgaw.supabase.co',
  prod: 'https://besjtuodziykmjidubzw.supabase.co',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 500;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// <main>/.claude/worktrees/wN: a worktree reads the env files the main checkout holds.
const WT_MARK = '/.claude/worktrees/';
const ROOTS = REPO_ROOT.includes(WT_MARK) ? [REPO_ROOT, REPO_ROOT.slice(0, REPO_ROOT.indexOf(WT_MARK))] : [REPO_ROOT];

function die(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function readEnvFile(name) {
  const p = ROOTS.map((r) => resolve(r, name)).find((f) => existsSync(f));
  if (!p) return {};
  return Object.fromEntries(
    readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

function parseArgs(argv) {
  const a = { env: null, profileId: null, replace: false, allMissing: false, apply: false, cap: 25 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--env') a.env = argv[++i];
    else if (v === '--profile-id') a.profileId = argv[++i];
    else if (v === '--replace') a.replace = true;
    else if (v === '--all-missing') a.allMissing = true;
    else if (v === '--apply') a.apply = true;
    else if (v === '--cap') a.cap = Number(argv[++i]);
    else die(`unknown argument: ${v}`);
  }
  if (a.env !== 'test' && a.env !== 'prod') die('--env test|prod is required');
  if (!!a.profileId === a.allMissing) die('give exactly one of --profile-id <uuid> or --all-missing');
  if (a.profileId && !UUID_RE.test(a.profileId)) die('--profile-id must be a UUID');
  if (a.replace && !a.profileId) die('--replace applies to one --profile-id only');
  if (a.apply && !a.allMissing) die('--apply applies to --all-missing only');
  if (!Number.isInteger(a.cap) || a.cap < 1) die('--cap must be a positive integer');
  return a;
}

function anonKey(env) {
  const k = readEnvFile(env === 'test' ? '.env.test.local' : '.env.prod').VITE_SUPABASE_ANON_KEY;
  if (!k) die(`no anon key for ${env}`);
  return k;
}

function serviceKey(env, reason) {
  if (env === 'test') {
    const k = readEnvFile('.env.local').TEST_SUPABASE_SERVICE_ROLE_KEY;
    if (!k) die('TEST_SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    return k;
  }
  try {
    return keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', reason);
  } catch (e) {
    die(e.message);
  }
}

async function getJson(url, key) {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) die(`read failed: HTTP ${res.status} ${url.split('?')[0]}`);
  return res.json();
}

/** Agents with no banner, read over anon (agent_accounts ids and profiles.banner_url are public). */
async function missingAgents(base, anon) {
  const ids = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await getJson(`${base}/rest/v1/agent_accounts?select=profile_id&order=profile_id&limit=${PAGE}&offset=${offset}`, anon);
    ids.push(...rows.map((r) => r.profile_id));
    if (rows.length < PAGE) break; // paginated to exhaustion
  }
  const missing = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await getJson(`${base}/rest/v1/profiles?select=id,banner_url&id=in.(${chunk.join(',')})`, anon);
    for (const r of rows) if (!r.banner_url) missing.push(r.id);
  }
  return { total: ids.length, missing };
}

/** Public read-back: the profile must show a banner with a credit bound to that exact URL. */
async function readBack(base, anon, id) {
  const res = await fetch(`${base}/rest/v1/rpc/get_profile_by_id`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
  });
  if (!res.ok) return { ok: false, why: `read-back HTTP ${res.status}` };
  const p = await res.json();
  if (!p?.banner_url) return { ok: false, why: 'no banner_url on read-back' };
  if (p.banner_credit?.url !== p.banner_url) return { ok: false, why: 'credit not bound to the banner on read-back' };
  return { ok: true, sig: p.banner_credit.sig, ink: p.banner_credit.ink };
}

async function generate(base, key, id, replace) {
  const res = await fetch(`${base}/functions/v1/generate-agent-banner`, {
    method: 'POST',
    // apikey and Authorization must be identical for a new-format secret key.
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId: id, replace }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, body };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = URLS[args.env];
  const anon = anonKey(args.env);

  let targets;
  if (args.allMissing) {
    const { total, missing } = await missingAgents(base, anon);
    console.log(`env: ${args.env} · agents: ${total} · without a banner: ${missing.length}`);
    for (const id of missing) console.log(`  ${id}`);
    if (!args.apply) {
      console.log('DRY RUN: nothing generated. Re-run with --apply to generate these.');
      return 0;
    }
    targets = missing.slice(0, args.cap);
    if (missing.length > targets.length) console.log(`cap: generating ${targets.length} of ${missing.length} this run`);
  } else {
    targets = [args.profileId];
  }
  if (targets.length === 0) return 0;

  const key = serviceKey(args.env, `agent-banner: generate ${targets.length} agent banner(s) on ${args.env}`);
  let failed = 0;
  for (const id of targets) {
    const { status, body } = await generate(base, key, id, args.replace);
    if (status === 429 || status === 403) {
      console.error(`STOP ${id}: HTTP ${status} ${body.error ?? ''} — spend cap, key or not an agent; not retrying`);
      return 3;
    }
    if (status !== 200) {
      failed++;
      console.error(`FAIL ${id}: HTTP ${status} ${body.code ?? body.error ?? ''}`);
      continue;
    }
    const rb = await readBack(base, anon, id);
    if (!rb.ok) {
      failed++;
      console.error(`FAIL ${id}: ${rb.why}`);
      continue;
    }
    console.log(`OK   ${id}: after ${rb.sig} (${rb.ink} ink, vision ${body.credit?.fidelity ?? '?'})`);
  }
  console.log(`done: ${targets.length - failed} ok, ${failed} failed`);
  return failed ? 2 : 0;
}

main().then((code) => process.exit(code), (e) => die(e.message));
