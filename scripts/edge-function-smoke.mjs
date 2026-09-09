#!/usr/bin/env node
/**
 * @file edge-function-smoke.mjs
 * @description P890 — post-deploy / scheduled smoke for Supabase edge functions.
 *
 * The gap this closes: `deploy-functions.sh` checks secrets BEFORE deploying and
 * nothing after it. A bundle that uploads fine but throws at invocation time
 * (bad import, missing global, Deno-only API used wrong) exits 0 and 500s for
 * every real user until Sentry or a person surfaces it.
 *
 * ── What each probe actually proves (read before trusting a green run) ────────
 *
 * OPTIONS (no credentials) — THE BOOT PROOF.
 *   Measured against prod on 2026-09-09: the Supabase gateway does NOT require a
 *   JWT for OPTIONS, so the request reaches the function's own handler. A reply
 *   that matches the handler's coded OPTIONS branch therefore proves the module
 *   loaded and ran. A boot failure answers 5xx; an undeployed function answers
 *   404 `{"code":"NOT_FOUND"}` from the gateway.
 *
 * POST {} (no credentials) — THE CALLER-GATE PROOF (P1207), NOT a boot proof.
 *   For the 13 functions deployed WITH gateway JWT verification this 401 comes
 *   from the GATEWAY, before any function code runs. It proves the gate is up.
 *   It says nothing about the function behind it — that is what OPTIONS is for.
 *   `create-and-sign` is the exception (deployed --no-verify-jwt), so its 400
 *   does come from the handler.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 * Every request is credential-free and lands on a documented refusal path. No
 * email is sent, no payment moves, no row is written. Deny paths are asserted to
 * be 4xx by a unit test, so a future table edit cannot quietly turn a probe into
 * a real invocation.
 *
 * Usage:
 *   node scripts/edge-function-smoke.mjs                       # all, against prod
 *   node scripts/edge-function-smoke.mjs --only a,b            # named subset
 *   node scripts/edge-function-smoke.mjs --base-url <url>      # other project
 *   EDGE_SMOKE_BASE_URL=... node scripts/edge-function-smoke.mjs
 *
 * Exit codes: 0 all pass · 1 at least one function failed · 2 misconfiguration
 * (table/filesystem drift, bad args) — a distinct code so "the smoke is broken"
 * never reads as "prod is broken".
 */

import { readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const PROD_FUNCTIONS_URL = 'https://besjtuodziykmjidubzw.supabase.co/functions/v1';
const SMOKE_ORIGIN = 'https://claritypledge.com';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Per-function expectations, each recorded from a real prod response on
 * 2026-09-09 (see the header for what each half proves).
 *
 *   options.status      — the handler's own OPTIONS reply
 *   options.expectCors  — the handler answers preflight with an
 *                         Access-Control-Allow-Origin header. False for the two
 *                         functions with no OPTIONS branch, which answer from
 *                         their auth / method guard instead.
 *   deny.status         — credential-free POST {} must be refused with this 4xx
 *   deny.bodyIncludes   — optional substring that must appear in that refusal
 */
export const EDGE_FUNCTION_EXPECTATIONS = {
  'confirm-letter-response': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'create-and-open-letter': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  // Deployed --no-verify-jwt (anonymous invitees exchange a signed token for a
  // session), so the deny reply is the HANDLER's input validation, not the
  // gateway's. That makes this the one function whose deny path is also a boot
  // proof.
  'create-and-sign': {
    options: { status: 200, expectCors: true },
    deny: { status: 400, bodyIncludes: 'INVALID_INPUT' },
  },
  // No OPTIONS branch: cron-only, authorised by CRON_SECRET. Its 401 on OPTIONS
  // is the handler's own refusal, which is exactly the boot proof we need.
  'dispatch-event-emails': {
    options: { status: 401, expectCors: false },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  // No OPTIONS branch either: the handler's method guard answers 405 first.
  //
  // ⚠ The deny status below records a state that looks WRONG for this function's real
  // caller, and is deliberately recorded rather than smoothed over. Its caller is the
  // `tx_jobs_enqueue` AFTER INSERT trigger, which sends `x-webhook-secret` and NO
  // `Authorization` header (20260813120000_p1064_tx_jobs_enqueue_from_vault.sql). This
  // function is deployed WITH gateway JWT verification (deploy-functions.sh gives
  // --no-verify-jwt to create-and-sign alone), and prod answers a credential-free POST
  // with the gateway's own `UNAUTHORIZED_NO_AUTH_HEADER` — measured 2026-09-08. So the
  // trigger's request appears unable to reach this handler at all, which is the P1256
  // shape exactly: a loud, recorded refusal nobody reads. NOT fixed here — the remedy is
  // either --no-verify-jwt for this function or sending the anon key from the trigger,
  // and that is a security call for the founder. Raised in the P890 report.
  'enqueue-transcription': {
    options: { status: 405, expectCors: false },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'explain-back-signed-url': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'gcs-signed-url': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'generate-banner': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'generate-event-banner': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'generate-story-image-url': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'request-letter-response-signin': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'send-agreement-emails': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'send-event-emails': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
  'send-letter-emails': {
    options: { status: 200, expectCors: true },
    deny: { status: 401, bodyIncludes: 'Missing authorization header' },
  },
};

/** Function directories on disk — the filesystem is the source of truth. */
export function discoverFunctionDirs(functionsDir) {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
}

/**
 * Fail loudly on drift in either direction. A new function with no row would
 * otherwise be silently unsmoked, and the run would still be green.
 */
export function assertTableCoversDisk(functionsDir) {
  const onDisk = discoverFunctionDirs(functionsDir);
  const inTable = Object.keys(EDGE_FUNCTION_EXPECTATIONS).sort();
  const missing = onDisk.filter((n) => !inTable.includes(n));
  const extra = inTable.filter((n) => !onDisk.includes(n));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`no expectation row for: ${missing.join(', ')}`);
    if (extra.length) parts.push(`row with no function directory: ${extra.join(', ')}`);
    throw new Error(`edge-function-smoke table drift — ${parts.join('; ')}`);
  }
  return onDisk;
}

/** `--only` selection, preserving the caller's order; unknown names are fatal. */
export function selectFunctions(allNames, only) {
  if (!only) return allNames;
  const unknown = only.filter((n) => !allNames.includes(n));
  if (unknown.length) {
    throw new Error(`unknown edge function(s): ${unknown.join(', ')}`);
  }
  return only;
}

async function request(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Run both probes for one function. Never throws on a network error — collects it. */
export async function smokeFunction(name, { baseUrl, fetchImpl }) {
  const exp = EDGE_FUNCTION_EXPECTATIONS[name];
  if (!exp) return { name, ok: false, failures: [`no expectation row for ${name}`] };
  const url = `${baseUrl}/${name}`;
  const failures = [];

  // ── boot proof ──
  try {
    const res = await request(fetchImpl, url, {
      method: 'OPTIONS',
      headers: { Origin: SMOKE_ORIGIN },
    });
    if (res.status !== exp.options.status) {
      const body = (await res.text()).slice(0, 200);
      failures.push(
        `boot probe: OPTIONS returned ${res.status}, expected ${exp.options.status} — ${body}`,
      );
    } else if (exp.options.expectCors) {
      const origin = res.headers.get('access-control-allow-origin');
      if (origin !== SMOKE_ORIGIN) {
        failures.push(
          `cors: OPTIONS Access-Control-Allow-Origin was ${origin ?? '(absent)'}, expected ${SMOKE_ORIGIN}`,
        );
      }
    }
  } catch (err) {
    failures.push(`boot probe: request failed — ${err?.message ?? err}`);
  }

  // ── caller-gate proof (P1207) ──
  try {
    const res = await request(fetchImpl, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: SMOKE_ORIGIN },
      body: '{}',
    });
    const body = await res.text();
    if (res.status !== exp.deny.status) {
      failures.push(
        `deny path: credential-free POST returned ${res.status}, expected ${exp.deny.status} — ${body.slice(0, 200)}`,
      );
    } else if (exp.deny.bodyIncludes && !body.includes(exp.deny.bodyIncludes)) {
      failures.push(
        `deny path: refusal body did not contain ${JSON.stringify(exp.deny.bodyIncludes)} — ${body.slice(0, 200)}`,
      );
    }
  } catch (err) {
    failures.push(`deny path: request failed — ${err?.message ?? err}`);
  }

  return { name, ok: failures.length === 0, failures };
}

export async function runEdgeSmoke({ names, baseUrl, fetchImpl, log = console.log }) {
  log(`\n=== Edge function smoke ===`);
  log(`Target: ${baseUrl}`);
  log(`Functions: ${names.length}\n`);

  const results = [];
  for (const name of names) {
    const res = await smokeFunction(name, { baseUrl, fetchImpl });
    results.push(res);
    if (res.ok) {
      log(`  ✓ ${name}`);
    } else {
      log(`  ✗ ${name}`);
      for (const f of res.failures) log(`      ${f}`);
    }
  }

  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  log('');
  if (failed.length) {
    log(`FAIL — ${failed.length}/${names.length} function(s) unhealthy: ${failed.join(', ')}`);
  } else {
    log(`PASS — ${names.length}/${names.length} function(s) healthy`);
  }
  return { exitCode: failed.length ? 1 : 0, failed, results };
}

function parseArgs(argv) {
  const out = { only: null, baseUrl: process.env.EDGE_SMOKE_BASE_URL || PROD_FUNCTIONS_URL };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') out.only = splitList(argv[++i]);
    else if (a.startsWith('--only=')) out.only = splitList(a.slice('--only='.length));
    else if (a === '--base-url') out.baseUrl = argv[++i];
    else if (a.startsWith('--base-url=')) out.baseUrl = a.slice('--base-url='.length);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.baseUrl) throw new Error('--base-url is empty');
  out.baseUrl = out.baseUrl.replace(/\/+$/, '');
  return out;
}

function splitList(v) {
  if (!v) throw new Error('--only needs a comma- or space-separated list of function names');
  const names = v.split(/[,\s]+/).filter(Boolean);
  if (!names.length) throw new Error('--only was empty');
  return names;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/functions');
  let names;
  let baseUrl;
  try {
    const args = parseArgs(process.argv.slice(2));
    baseUrl = args.baseUrl;
    names = selectFunctions(assertTableCoversDisk(functionsDir), args.only);
  } catch (err) {
    console.error(`edge-function-smoke: ${err.message}`);
    process.exit(2);
  }
  const { exitCode } = await runEdgeSmoke({ names, baseUrl, fetchImpl: fetch });
  process.exit(exitCode);
}
