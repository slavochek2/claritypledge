/**
 * @file p1653-replay.spec.ts
 * @description P1653 replay harness ("p1653-replay"), two modes on a fresh TEST canvas per try, REAL model, signed-in owner. It MEASURES and never asserts
 * product behaviour; the only assertions are about the probe itself (fresh canvas, the control has a run row, the ceiling, the function checks, the log join,
 * and the two spec proofs that read the engine's own input selector).
 *
 *   before (default): the founder's three first messages, a positive control and a staged unreadable link.
 *   after  (P1653_MODE=after): the same five, plus "one more card here they are angry" on a canvas that already has a draft, a two-message follow-up
 *   (the second run's input must hold BOTH messages), and a link then a tap through the real UI ("Yes, this is my business", and on another canvas "Not mine",
 *   then a later run whose input must hold no page).
 *
 * Per step it records: the reply the owner sees (read through the run's reply_message_id), the buttons and the Try again control on screen, the run rows of THIS
 * canvas's draft re-read until they settle (state, error_code, attempts, cost), what the link read kept, the box contents, the joined `canvas-draft: parsed`
 * counts (one JSON line after a prefix, joined by run_id from the TEST functions container log), and the allowed-facts flags: every word in a reply or a box
 * that is outside the owner's own words, the box titles, the fixed product words (and, while a page may be used, the page's own words). Flags are reported, never auto-passed.
 *
 * The model's raw points, note and questions are never persisted and are not recorded; only counts are. Reads are service-role SELECTs plus one STABLE read-only
 * RPC (_canvas_draft_effective_input). Nothing here changes product code, the evidence checks or any row.
 *
 * Run (TEST only; skipped unless P1653_REPLAY=1; retries must be 0 so a retry cannot double the model calls):
 *   E2E_REQUIRE_FUNCTIONS=1 P1653_REPLAY=1 P1653_MODE=after P1653_OUT=test-results/p1653-replay-after.json \
 *     npx playwright test e2e/p1653-replay.spec.ts --retries=0 --workers=1 --reporter=list > run.log 2>&1
 * NOTE (cleanup): the counts-only measurement line (`canvas-draft: parsed`, canvas-measure.ts) was removed from the product after the 2026-11 replays. The parsed-log
 * join below is therefore OFF by default and only runs with P1653_LOGS=1 against a build that still logs the line; without it the records carry no `serverLog`
 * and the "control proves the chain" check is not made. Everything else (replies, run rows, buttons, material, flags, spec proofs) is unchanged.
 * Env: P1653_TRIES (1 to 5, all fixtures) or P1653_TRIES_<FIXTURE> (e.g. P1653_TRIES_LINK_NO); P1653_LOGS=1 turns the server log read, the join and the
 * control proof ON (default off); P1653_GCP_PROJECT, P1653_GCP_ZONE, P1653_GCP_VM, P1653_FUNCS_CONTAINER (defaults: the self-hosted TEST server of scripts/e2e-load-test.mjs).
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';
import { PAGE_BUTTONS, WORDS } from '../supabase/functions/_shared/canvas-reply-table.ts';

test.skip(process.env.P1653_REPLAY !== '1', 'P1653 replay runs only with P1653_REPLAY=1');
test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'not a TEST project');
test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(3_000_000);

const AFTER = process.env.P1653_MODE === 'after';
/**
 * The ceiling on claim attempts (summed from run rows; a claim is not a confirmed model call) for the whole file. Each try is checked BEFORE it starts against
 * its known cost in claims (a group stops, recorded as budget_stopped, rather than start a try it cannot afford), and the ceiling is ENFORCED at the end (the file
 * fails if it was exceeded). It does not bound the attempts inside a single send, so the end check is the real guard. Sends are counted separately.
 */
const MAX_ATTEMPTS = (() => {
  const raw = process.env.P1653_MAX_CLAIMS; // a deliberate, recorded raise of the cap by the person who owns it (written into the output as maxClaimAttempts)
  const n = raw === undefined ? (AFTER ? 50 : 30) : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error(`P1653_MAX_CLAIMS must be a whole number from 1 to 200, got "${raw}"`);
  return n;
})();
type Plan = { id: string; tries: number; cost: number };
/** Fixtures in run order with their default tries and the claims one try costs. After mode defaults fit the 50-claim cap (5 each would need about 75). */
const PLAN: Plan[] = AFTER
  ? [{ id: 'F1', tries: 5, cost: 1 }, { id: 'F2', tries: 5, cost: 1 }, { id: 'F3', tries: 5, cost: 1 }, { id: 'F4-control', tries: 3, cost: 1 }, { id: 'F5-unreadable', tries: 3, cost: 1 },
    { id: 'angry', tries: 3, cost: 2 }, { id: 'followup', tries: 3, cost: 2 }, { id: 'link-yes', tries: 3, cost: 2 }, { id: 'link-no', tries: 3, cost: 3 }]
  : [{ id: 'F1', tries: 5, cost: 1 }, { id: 'F2', tries: 5, cost: 1 }, { id: 'F3', tries: 5, cost: 1 }, { id: 'F4-control', tries: 5, cost: 1 }, { id: 'F5-unreadable', tries: 5, cost: 1 }];
const OUT = process.env.P1653_OUT ?? 'test-results/p1653-replay.json';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPLY_WAIT_MS = 180_000;
const SETTLE_WAIT_MS = 45_000;
const GCP = {
  project: process.env.P1653_GCP_PROJECT ?? 'gen-lang-client-0869694595',
  zone: process.env.P1653_GCP_ZONE ?? 'asia-southeast1-a',
  vm: process.env.P1653_GCP_VM ?? 'cp-test-supabase',
  container: process.env.P1653_FUNCS_CONTAINER ?? 'supabase-edge-functions',
};
const LOG_PREFIX = 'canvas-draft: parsed ';
/**
 * Failure codes that mean the run reached the parse stage on the draft path, so the server must have logged a parsed line for it (canvas-run.ts logs it right
 * after parseDraft, before any write). Order in runDraft: parseDraft, draftOffer, the line, then unparsable / empty / blocked / nothing_supported, then 'write'.
 * NOT in this set, on purpose: 'internal' and 'gone' (also set BEFORE the parse), SQL codes returned through closedRun, the choice paths, and 'stale_button'.
 * A "Not mine" tap run is done with no model call and no line: its record carries expectParsed=false and is skipped by the join check.
 */
const PARSE_STAGE_CODES = new Set(['nothing_supported', 'unparsable', 'empty', 'blocked', 'write']);

/** An integer from 1 to 5, or a throw: a NaN would run zero tries and report an empty success. */
function triesFor(p: Plan): number {
  const key = `P1653_TRIES_${p.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const raw = process.env[key] ?? process.env.P1653_TRIES ?? String(p.tries);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`${key} / P1653_TRIES must be an integer from 1 to 5, got "${raw}"`);
  return n;
}

// Fixtures, verbatim from the founder's messages.
const F1 = 'airbnb.com - make canvas';
const F2 = 'https://www.airbnb.com/ this canvas';
const F3 = 'its a car selling buisness';
// Positive control: who they sell to, what, what it costs.
const CONTROL = 'We sell used cars to young families in Tallinn. Each car comes with a one year warranty and costs between 8000 and 15000 euros. Today families struggle to find a reliable cheap car.';
// Unreadable link, staged with no network: "localhost" is refused by name before any DNS or fetch (canvas-hosts.ts), so no external site is involved.
const UNREADABLE = 'https://localhost/our-shop make a canvas from this';
// After mode. The seed makes a draft that already holds points (as the P1625 real run does); ANGRY is the founder's own message.
const SEED = 'I sell juice to office workers. They want juice and they are thirsty, and the machines are far away from their desks.';
const ANGRY = 'one more card here they are angry';
// The answer to the follow-up question: who buys and what is sold (recorded in the output).
const ANSWER = 'I sell used cars to young families who need a cheap reliable car.';
// A later clear statement after "Not mine", on the same canvas.
const LATER = 'We sell used cars to young families in Tallinn with a one year warranty.';

const composer = (p: Page) => p.getByTestId('composer').getByRole('textbox').first();
const panel = (p: Page) => p.getByTestId('thread-panel');
const messages = (p: Page) => panel(p).getByTestId('message');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class Hang extends Error {}
/**
 * A page call that never answers ends as a recorded Hang after `ms`. Locator.count(), innerText() and evaluate() carry no timeout of their own and the
 * config sets no action timeout, so a frozen tab or a stuck browser connection would otherwise wait for the whole test timeout (the first after-build
 * run lost 45 minutes this way, killed with a bare locator.count() pending).
 */
function bounded<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Hang(`hang: ${label} did not answer in ${ms} ms`)), ms); });
  return Promise.race([work, stop]).finally(() => clearTimeout(timer));
}
/** The last console errors and page errors of the browser, kept for the diagnostics of a hang. */
const consoleTail: string[] = [];
const hangs: Row[] = [];

type Row = Record<string, unknown> & { id?: string; draft_id?: string; state?: string; attempts?: number; spend_id?: string | null; reply_message_id?: string | null; error_code?: string | null };
type Check = { status: string; started: string };
let admin: SupabaseClient | null = null;
/** Created on first use inside a test, never at module load, so loading this file (for --list) needs no environment. */
const db = (): SupabaseClient => (admin ??= createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Every database read ends: a stalled TEST server (another session's run shares it) must not hold this file past 30 s per call.
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }) },
}));

let sends = 0; // messages sent or buttons tapped, whether or not a run row or a model call followed
const seenDrafts = new Set<string>();
const seenCanvases = new Set<string>();
const records: Row[] = [];
const proofs: Row[] = [];
const groups: Row[] = PLAN.map((p) => ({ fixture: p.id, status: 'not_run', triesPlanned: null, triesRecorded: 0, aborted: false, budgetStopped: false, error: null }));
/** Test users stay until ALL collection (the afterAll re-read and the log join) is finished; deleted at the very end of afterAll. */
const createdUsers: string[] = [];

/**
 * Claim attempts: the sum of run rows' `attempts`, which the database increments when a run is CLAIMED (migration 20261103010000, _canvas_draft_run_begin:
 * `attempts = r.attempts + 1`), before any model call. It is NOT a count of model calls. Confirmed model calls are the joined parsed log lines plus the
 * provider-failure codes (http_*, network, timeout in flight); this counter only bounds claims.
 */
/**
 * P1653_PRIOR_CLAIMS: claims already spent by an earlier run of this file whose results are kept (a resume). It counts toward the cap, so the cap holds
 * across both runs. P1653_ONLY: comma list of fixture ids to run (the rest are recorded as skipped_by_env, never resent).
 */
const PRIOR_CLAIMS = (() => {
  const n = Number(process.env.P1653_PRIOR_CLAIMS ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new Error(`P1653_PRIOR_CLAIMS must be a whole number, got "${process.env.P1653_PRIOR_CLAIMS}"`);
  return n;
})();
const ONLY = process.env.P1653_ONLY ? process.env.P1653_ONLY.split(',').map((s) => s.trim()) : null;
const claimAttemptsNow = () => PRIOR_CLAIMS + records.flatMap((r) => r.runs as Row[]).reduce((s, x) => s + (Number(x.attempts) || 0), 0);
class BudgetStop extends Error {}
/** For gating only: the larger of the recorded claims and one claim per send, so a step whose run row was never recorded (a hang) still counts. */
const claimsEstimate = () => Math.max(claimAttemptsNow(), PRIOR_CLAIMS + sends);
const functionChecks: { start?: Check; end?: Check; serverLogRead?: string; incompleteAtEnd?: string[]; controlProven?: boolean; cleanup?: string; budgetStopped?: string[] } = {};
let harnessStart = Date.now();

const flush = () => {
  mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ harness: 'e2e/p1653-replay.spec.ts', mode: AFTER ? 'after' : 'before', only: ONLY, priorClaims: PRIOR_CLAIMS, hangs, sends, claimAttempts: claimAttemptsNow(), maxClaimAttempts: MAX_ATTEMPTS, confirmedModelCallsNote: 'confirmed model calls are the joined parsed log lines (serverLog) plus provider-failure codes; claimAttempts counts claims, not model calls', functionChecks, groups, proofs, records }, null, 2));
};

/** A read error is a harness failure, never an empty result. */
const rows = (what: string, r: { data: unknown; error: { message: string } | null }): Row[] => {
  if (r.error) throw new Error(`P1653 harness read failed (${what}): ${r.error.message}`);
  return (r.data ?? []) as Row[];
};

/**
 * Runs scripts/selfhosted/branch-functions-check.sh. Passing needs exit 0, a first line that starts with "match:" (the server serves this
 * branch's functions: "no changed functions" makes no network call and proves nothing) and a STARTED: line. Anything else throws.
 */
function functionsCheck(when: string): Check {
  let out: string;
  try {
    out = execFileSync('bash', ['scripts/selfhosted/branch-functions-check.sh'], { cwd: REPO, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    throw new Error(`P1653 branch-functions-check ${when} exited ${err.status ?? 'unknown'}: ${(err.stdout ?? '').split('\n').slice(0, 3).join(' | ')} ${(err.stderr ?? '').slice(0, 200)}`);
  }
  const lines = out.split('\n');
  const status = lines[0] ?? '';
  const started = lines.find((l) => l.startsWith('STARTED:'));
  if (!status.startsWith('match:') || !started) throw new Error(`P1653 branch-functions-check ${when}: exit 0 but status "${status}" with${started ? '' : 'out'} a STARTED line; need "match:" and STARTED`);
  return { status, started };
}

/** The remote command. The READ_OK sentinel prints only after the container exists AND its log was read; a missing line is then a real "none". */
const remoteLogCommand = (sinceMinutes: number) =>
  `set -o pipefail; sudo docker inspect -f '{{.State.StartedAt}}' ${GCP.container} >/dev/null || { echo NO_CONTAINER; exit 3; }; `
  + `L=$(sudo docker logs --since ${sinceMinutes}m ${GCP.container} 2>&1) || { echo LOGS_FAILED; exit 4; }; echo READ_OK; `
  + `printf '%s\\n' "$L" | grep -F '${LOG_PREFIX.trim()}'; true`;

/** Read-only: the `canvas-draft: parsed` lines from the TEST functions container (same ssh shape as scripts/e2e-load-test.mjs). */
function readServerLog(sinceMinutes: number): Promise<{ ok: boolean; lines: string[]; why?: string }> {
  return new Promise((resolve) => {
    const p = spawn('gcloud', ['compute', 'ssh', GCP.vm, `--project=${GCP.project}`, `--zone=${GCP.zone}`, '--tunnel-through-iap', '--quiet', '--command', remoteLogCommand(sinceMinutes)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill('SIGTERM'), 90_000);
    p.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      if (code === 0 && lines.includes('READ_OK')) resolve({ ok: true, lines: lines.filter((l) => l.includes(LOG_PREFIX)) });
      else resolve({ ok: false, lines: [], why: `ssh exit ${code}, sentinel ${lines.includes('READ_OK') ? 'seen' : 'missing'}${lines.includes('NO_CONTAINER') ? ', container not found' : ''}${lines.includes('LOGS_FAILED') ? ', docker logs failed' : ''}` });
    });
    p.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, lines: [], why: e.message }); });
  });
}

/**
 * The JSON after the prefix of the log lines for a run id (matched exactly, never by substring): the LAST one, and how many lines the run had
 * (a run can parse more than once). Null when there is none.
 */
function parsedByRun(lines: string[], runId: string): { line: Row; linesFound: number } | null {
  let last: Row | null = null;
  let count = 0;
  for (const l of lines) {
    const at = l.indexOf(LOG_PREFIX);
    if (at < 0) continue;
    try {
      const j = JSON.parse(l.slice(at + LOG_PREFIX.length)) as Row;
      if (j.run_id === runId) { last = j; count += 1; }
    } catch { /* a line that is not our JSON is not a match */ }
  }
  return last ? { line: last, linesFound: count } : null;
}

// ── the allowed-facts check ─────────────────────────────────────────────────────────────────────────────────────────────────
const STOP = new Set('the an and or of to in on for with is are was were be it its this that they them their you your my we our us at as by from not no yes do does did has have had can could will would so if then than but about into out up one more here there what who how when which also each per'.split(' '));
const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** The comparable words of a text: lower case, letters and digits, no stop words, one-letter words dropped, plural 's' folded. */
const wordsOf = (t: string): string[] => (t.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
/** Words of the fixed product text (the approved reply table and the two buttons) and of the reply templates canvas-reply.ts composes. */
const FIXED_VOCAB = new Set(wordsOf([
  ...Object.values(WORDS).map((v) => (typeof v === 'function' ? (v as (d: string) => string)('x') : String(v))),
  PAGE_BUTTONS.question, PAGE_BUTTONS.yes.label, PAGE_BUTTONS.no.label,
  'Draft ready boxes Updated I added from your words I left out points could not tie Nothing changed on the canvas noted reworded moved dropped kept because replaced box point see all',
].join(' ')));

/** The flags of one step: every word outside what the owner said, the box titles, the fixed text and (while allowed) the page's own words. Never an auto-pass. */
type FlagCtx = { sent: string[]; pageAllowed: boolean; pageText: string };
/**
 * `checked` is false when there was nothing to check (no reply and no box text) or a box could not be read: flagCount 0 then means NOT CHECKED, never clean.
 * afterAll recomputes the flags of every re-read step from its final reply, with the inputs step() stored in `flagInputs`.
 */
function flagsOf(ctx: FlagCtx, reply: string | null, lists: Record<string, string>, titles: string, unreadBoxes: string[] = []): Row {
  const allowed = new Set([...wordsOf(ctx.sent.join(' ')), ...wordsOf(titles), ...wordsOf('box boxes canvas'), ...FIXED_VOCAB, ...(ctx.pageAllowed ? wordsOf(ctx.pageText) : [])]);
  const out: { word: string; in: string }[] = [];
  const seen = new Set<string>();
  const scan = (where: string, text: string) => { for (const w of wordsOf(text)) if (!allowed.has(w) && !seen.has(`${where}|${w}`)) { seen.add(`${where}|${w}`); out.push({ word: w, in: where }); } };
  if (reply) scan('reply', reply);
  for (const [tag, text] of Object.entries(lists)) scan(`box:${tag.replace('canvas:', '')}`, text);
  return { allowedFrom: { ownerMessages: ctx.sent.length, pageWordsAllowed: ctx.pageAllowed, pageWords: ctx.pageAllowed ? wordsOf(ctx.pageText).length : 0 }, flaggedWords: out, flagCount: out.length, checked: (reply !== null || Object.keys(lists).length > 0) && unreadBoxes.length === 0, unreadBoxes };
}

// ── one canvas, one try ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Ctx = { p: Page; userId: string; canvas: string; canvasName: string; draftId: string | null; seenRunIds: Set<string>; sent: string[]; pageText: string; pageAllowed: boolean };

async function openTry(p: Page, userId: string): Promise<Ctx> {
  await p.goto('/artifacts');
  await p.getByRole('tab', { name: 'Canvases' }).click();
  await p.getByTestId('artifacts-new-canvas').click();
  await p.waitForURL(/\/p\/[^/]+\/canvas\//, { timeout: 45_000 });
  await expect(p.getByTestId('canvas-opener')).toBeVisible({ timeout: 40_000 });
  const canvas = new URL(p.url()).pathname;
  if (seenCanvases.has(canvas)) throw new Error(`P1653 harness: try did not start on a fresh canvas (${canvas} already used)`);
  seenCanvases.add(canvas);
  const canvasName = canvas.split('/canvas/')[1] ?? '';
  if (!canvasName) throw new Error(`P1653 harness: cannot read the canvas name from ${canvas}`);
  return { p, userId, canvas, canvasName, draftId: null, seenRunIds: new Set(), sent: [], pageText: '', pageAllowed: true };
}

type Boxes = { lists: Record<string, string>; titles: string; errors: string[] };
/** Each box is read on its own, bounded: a box that cannot be read is named in `errors` (and makes the step's flags unchecked), it never blanks the other boxes. */
async function boxes(p: Page): Promise<Boxes> {
  const tags = await bounded(p.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('canvas-box-', ''))), 10_000, 'list the boxes');
  const lists: Record<string, string> = {};
  const titles: string[] = [];
  const errors: string[] = [];
  for (const tag of tags) {
    try {
      const section = p.getByTestId(`canvas-box-${tag}`);
      const list = section.getByTestId('canvas-box-list');
      lists[tag] = await bounded((async () => ((await list.count()) === 0 ? '' : norm(await list.innerText({ timeout: 5_000 }))))(), 8_000, `read box ${tag}`);
      titles.push(norm((await bounded(section.innerText({ timeout: 5_000 }), 8_000, `read title ${tag}`)).split('\n')[0] ?? ''));
    } catch (e) {
      errors.push(`${tag}: ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  return { lists, titles: titles.join(' '), errors };
}

/** What the reply wording says about the evidence checks (inference from canvas-reply.ts failedLine, labelled as such). */
function inferDrops(reply: string): string {
  const r = norm(reply);
  if (/I could not tie what I found to your own words/.test(r)) return 'INFERRED droppedUnverified > 0 (long failed line)';
  if (/I could not draft a canvas from that, so nothing was changed\./.test(r)) return 'INFERRED droppedUnverified = 0 (short failed line); droppedNames not distinguishable from the reply';
  if (/I left out \d+ point/.test(r)) return 'MEASURED-BY-WORDING droppedUnverified >= 1 on a drafted reply';
  return 'no drop wording in the reply';
}

/** What a page that stopped answering looks like: a heartbeat, a screenshot and the browser's last console errors, each bounded, kept in the output. At most 5 are taken. */
async function diagnose(p: Page, where: string): Promise<void> {
  if (hangs.length >= 5) return;
  const n = hangs.length + 1;
  const shot = `test-results/p1653-hang-${n}.png`;
  const d: Row = { where, at: new Date().toISOString(), url: p.url(), closed: p.isClosed(), consoleTail: consoleTail.slice(-15) };
  d.heartbeat = await bounded(p.evaluate(() => ({ ready: document.readyState, messages: document.querySelectorAll('[data-testid="message"]').length })), 8_000, 'heartbeat evaluate').catch((e: Error) => e.message);
  d.screenshot = await bounded(p.screenshot({ path: shot, timeout: 10_000 }).then(() => shot), 15_000, 'screenshot').catch((e: Error) => e.message);
  hangs.push(d);
  flush();
}

type PollResult ={ ok: true } | { ok: false; kind: 'timeout' | 'page_closed' | 'error'; error?: string };
/**
 * Polls `read` until `done(value)`. Distinguishes the three ways it can end badly: the deadline passed with every read succeeding (a timeout), the
 * page was closed, or the reads kept failing (a locator, navigation or page error: recorded with its message, never called "no reply").
 */
async function pollUntil<T>(p: Page, read: () => Promise<T>, done: (v: T) => boolean, timeoutMs: number): Promise<PollResult & { last?: T }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;
  let last: T | undefined;
  let diagnosed = false;
  while (Date.now() < deadline) {
    if (p.isClosed()) return { ok: false, kind: 'page_closed', last };
    try {
      last = await bounded(read(), 15_000, 'poll read'); // one read that never answers must not outlast the deadline
      lastError = undefined;
      if (done(last)) return { ok: true, last };
    } catch (e) {
      lastError = String((e as Error).message ?? e).split('\n')[0];
      if (e instanceof Hang && !diagnosed) { diagnosed = true; await diagnose(p, 'poll read'); }
    }
    await pause(500);
  }
  return lastError ? { ok: false, kind: 'error', error: lastError, last } : { ok: false, kind: 'timeout', last };
}

/**
 * The publish spot's state. 'absent' ONLY when the element is genuinely not in the page (count 0); 'no_state' when it is there without a data-state
 * value. Any locator, navigation or page error propagates, so pollUntil records it on its error path and never calls it absent.
 */
async function spotState(p: Page): Promise<string> {
  const el = p.getByTestId('publish-spot');
  if ((await el.count()) === 0) return 'absent';
  return (await el.getAttribute('data-state', { timeout: 2_000 })) ?? 'no_state';
}

type Wait = { replyArrived: boolean; settled: boolean; spot: string | null; replyEnd: string | null; settleEnd: string | null; error: string | null };
/** Two separate waits: the reply arriving in the thread, then the publish spot showing an explicit non-updating state. Each records how it ended. */
async function waitForRun(p: Page, before: number): Promise<Wait> {
  const w: Wait = { replyArrived: false, settled: false, spot: null, replyEnd: null, settleEnd: null, error: null };
  const reply = await pollUntil(p, () => messages(p).count(), (n) => n >= before + 2, REPLY_WAIT_MS);
  w.replyArrived = reply.ok;
  w.replyEnd = reply.ok ? 'ok' : reply.kind;
  if (!reply.ok) { w.error = reply.error ?? null; return w; }
  const settle = await pollUntil(p, () => spotState(p), (s) => s !== 'updating' && s !== 'absent' && s !== 'no_state', SETTLE_WAIT_MS);
  w.settled = settle.ok;
  w.spot = (settle.last as string | undefined) ?? null;
  w.settleEnd = settle.ok ? 'ok' : settle.kind === 'timeout' && (w.spot === 'absent' || w.spot === 'no_state') ? `spot_${w.spot}` : settle.kind;
  if (!settle.ok) w.error = settle.error ?? null;
  return w;
}

const TERMINAL = new Set(['done', 'failed', 'capped', 'cancelled', 'undone']);
const RUN_COLUMNS = 'id,draft_id,kind,state,error_code,input_kind,attempts,spend_id,started_at,finished_at,reply_message_id';

/** The draft of THIS canvas (by the canvas name in the URL): null when none is found yet, unique, and new (`requireNew` false only for the late re-resolve in afterAll). */
async function draftOfCanvas(userId: string, canvasName: string, requireNew = true): Promise<string | null> {
  const found = rows('canvas_drafts', await db().from('canvas_drafts').select('id').eq('owner_id', userId).eq('canvas_name', canvasName));
  if (found.length === 0) return null;
  if (found.length > 1) throw new Error(`P1653 harness: ${found.length} drafts for canvas ${canvasName}`);
  const id = String(found[0].id);
  if (requireNew && seenDrafts.has(id)) throw new Error(`P1653 harness: draft ${id} was already used by an earlier try (not a fresh canvas)`);
  return id;
}

const runsOfDraft = async (draftId: string): Promise<Row[]> => rows('canvas_draft_runs', await db().from('canvas_draft_runs').select(RUN_COLUMNS).eq('draft_id', draftId).order('created_at'));

/** Everything read from the database about some runs of one draft: run rows with cost, the reply the newest run posted, the link material. One path for step() and the afterAll re-read. */
async function collect(draftId: string | null, runs: Row[]): Promise<{ runs: Row[]; reply: string | null; material: Row[] }> {
  const spendIds = runs.map((r) => r.spend_id).filter(Boolean) as string[];
  const spend = spendIds.length ? rows('mirror_ai_spend', await db().from('mirror_ai_spend').select('id,actual_usd,state').in('id', spendIds)) : [];
  const material = draftId ? rows('canvas_draft_material', await db().from('canvas_draft_material').select('kind,label,chars,text').eq('draft_id', draftId).order('created_at')) : [];
  const replyId = [...runs].reverse().find((r) => r.reply_message_id)?.reply_message_id as string | undefined;
  const reply = replyId ? norm(String(rows('chat_messages', await db().from('chat_messages').select('body').eq('id', replyId))[0]?.body ?? '')) : null;
  return { runs: runs.map((r) => ({ ...r, actual_usd: spend.find((s) => s.id === r.spend_id)?.actual_usd ?? null })), reply, material };
}

/**
 * What a run read as input, from the engine's OWN selector (_canvas_draft_effective_input, STABLE and read-only): the owner messages and the material rows.
 * A message whose text is exactly a button token is a tap: the engine filters taps out afterwards, so it is listed but marked.
 */
async function inputOf(draftId: string, runId: string, ctx: Ctx): Promise<Row> {
  const { data, error } = await db().rpc('_canvas_draft_effective_input', { p_draft: draftId, p_run: runId });
  if (error) throw new Error(`P1653 harness read failed (_canvas_draft_effective_input): ${error.message}`);
  const ids = data as { message_ids: string[]; material_ids: string[] };
  const msgs = ids.message_ids.length ? rows('chat_messages', await db().from('chat_messages').select('id,body').in('id', ids.message_ids)) : [];
  const mats = ids.material_ids.length ? rows('canvas_draft_material', await db().from('canvas_draft_material').select('id,kind,label,chars,text').in('id', ids.material_ids)) : [];
  const tokens = new Set<string>([PAGE_BUTTONS.yes.token, PAGE_BUTTONS.no.token]);
  const owner = new Set(wordsOf(ctx.sent.join(' ')));
  const pageOnly = new Set(wordsOf(ctx.pageText).filter((w) => !owner.has(w)));
  return {
    messages: ids.message_ids.map((id) => { const b = norm(String(msgs.find((m) => m.id === id)?.body ?? '')); return tokens.has(b) ? `${b} [tap token, filtered by the engine]` : b; }),
    materials: mats.map((m) => ({ kind: m.kind, label: m.label, chars: m.chars, hasPageWords: wordsOf(String(m.text)).some((w) => pageOnly.has(w)) })),
    pageOnlyWords: [...pageOnly],
  };
}

/** The structured result of one step. `act` is typing a message or tapping a button by test id. */
async function step(ctx: Ctx, meta: { fixture: string; n: number; name: string }, act: { text?: string; click?: string }, opts: { control?: boolean; expectParsed?: boolean } = {}): Promise<Row> {
  const p = ctx.p;
  // The cap is checked before EVERY step that can claim (not only a try's first), against the conservative estimate (a send is one claim even when its
  // run row was never recorded). A step the cap cannot cover stops the group gracefully (BudgetStop), never mid-way through an unrecorded send.
  if (claimsEstimate() + 1 > MAX_ATTEMPTS) throw new BudgetStop(`ceiling of ${MAX_ATTEMPTS} claims: ${claimsEstimate()} used or sent, refusing the next step (${meta.fixture} try ${meta.n} ${meta.name})`);
  // Every page call below is bounded: the actions by the page's default timeout (set in group()), the counts and reads by bounded().
  const before = await bounded(messages(p).count(), 20_000, 'messages count before send').catch(async (e) => { await diagnose(p, 'before send'); throw e; });
  if (act.text !== undefined) {
    await composer(p).fill(act.text, { timeout: 30_000 });
    await composer(p).press('Enter', { timeout: 30_000 });
    ctx.sent.push(act.text);
  } else {
    const btn = p.getByTestId(act.click!);
    if ((await bounded(btn.count(), 20_000, `count of ${act.click}`)) === 0) throw new Error(`P1653 harness: button ${act.click} is not on the page`);
    await btn.first().click({ timeout: 30_000 });
  }
  sends += 1;
  const wait = await waitForRun(p, before);
  await pause(2500);

  // The draft is resolved from this canvas's name once, then ITS runs not seen in an earlier step are read until terminal (at most 30 s).
  if (!ctx.draftId) {
    ctx.draftId = await draftOfCanvas(ctx.userId, ctx.canvasName);
    if (ctx.draftId) seenDrafts.add(ctx.draftId);
  }
  const draftId = ctx.draftId;
  const fresh = async () => (draftId ? (await runsOfDraft(draftId)).filter((r) => !ctx.seenRunIds.has(String(r.id))) : []);
  let runs = await fresh();
  for (let i = 0; i < 15 && draftId && runs.some((r) => !TERMINAL.has(String(r.state))); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    runs = await fresh();
  }
  // An empty read (no draft found, or no run row for this step) is never "complete": the step stays unresolved and incomplete, with its lookup keys, and afterAll resolves it again.
  const unresolved = !draftId || runs.length === 0;
  const incomplete = unresolved || runs.some((r) => !TERMINAL.has(String(r.state)));
  runs.forEach((r) => ctx.seenRunIds.add(String(r.id)));

  const got = await collect(draftId, runs);
  runs = got.runs;
  const last = runs.at(-1);
  const links = got.material.filter((m) => m.kind === 'link');
  if (links.length) ctx.pageText = norm(links.map((m) => String(m.text)).join(' '));
  const closed = p.isClosed();
  // What the owner sees: read in one bounded block per item. A read that fails or hangs is recorded as such in `observationErrors`, never as an empty screen.
  const observationErrors: string[] = [];
  const see = async <T,>(label: string, work: () => Promise<T>, fallback: T, ms = 20_000): Promise<T> => {
    try { return await bounded(work(), ms, label); } catch (e) { observationErrors.push(`${label}: ${String((e as Error).message).split('\n')[0]}`); if (e instanceof Hang) await diagnose(p, label); return fallback; }
  };
  const ui = closed ? null : {
    linkYes: await see('count canvas-link-yes', () => p.getByTestId('canvas-link-yes').count(), -1),
    linkNo: await see('count canvas-link-no', () => p.getByTestId('canvas-link-no').count(), -1),
    buttonLabels: [await see('label yes', () => p.getByTestId('canvas-link-yes').first().innerText({ timeout: 5_000 }), ''), await see('label no', () => p.getByTestId('canvas-link-no').first().innerText({ timeout: 5_000 }), '')].filter(Boolean),
    tryAgain: await see('count canvas-retry-button', () => p.getByTestId('canvas-retry-button').count(), -1),
    replyEndsWithPageQuestion: got.reply ? got.reply.endsWith(PAGE_BUTTONS.question) : false,
  };
  const bx: Boxes = closed ? { lists: {}, titles: '', errors: ['page closed'] } : await see('boxes', () => boxes(p), { lists: {}, titles: '', errors: ['boxes could not be read (see observationErrors)'] }, 120_000);
  const uiReply = wait.replyArrived && !closed ? norm(await see('last message text', () => messages(p).last().innerText({ timeout: 5_000 }), '')) : null;

  const rec: Row = {
    fixture: meta.fixture, try: meta.n, step: meta.name, canvas: ctx.canvas, action: act.text ?? `tap ${act.click}`, draftId,
    lookup: { userId: ctx.userId, canvasName: ctx.canvasName },
    expectParsed: opts.expectParsed !== false,
    waits: wait,
    unresolved,
    incomplete,
    runs,
    outcome: unresolved ? 'UNRESOLVED (no draft or no run row read)' : incomplete ? 'INCOMPLETE (a run was not terminal after the re-read)' : last?.state ?? (wait.replyArrived ? 'reply but no run row' : wait.replyEnd === 'timeout' ? 'NO_REPLY' : `WAIT_${String(wait.replyEnd).toUpperCase()}`),
    failureCode: last?.error_code ?? null,
    reply: got.reply,
    uiReply,
    ui,
    observationErrors,
    linkMaterial: got.material.map((m) => ({ kind: m.kind, label: m.label, chars: m.chars, textHead: norm(String(m.text)).slice(0, 300) })),
    boxes: closed ? null : bx.lists,
    flagInputs: { sent: [...ctx.sent], pageText: ctx.pageText, pageAllowed: ctx.pageAllowed, titles: bx.titles, boxErrors: bx.errors },
    fixedFallbackShown: got.reply === WORDS.fallbackQuestion, // F3: true means the model's own question was NOT shown (the fixed fallback was)
    flags: flagsOf(ctx, got.reply, bx.lists, bx.titles, bx.errors),
    evidenceChecksDropped: got.reply ? inferDrops(got.reply) : 'no reply',
    serverLog: null,
    rawModelOutput: null,
    rawModelOutputWhy: 'never persisted: only counts are available, through the server log line (serverLog)',
  };
  records.push(rec);
  flush();
  console.log(`P1653 ${meta.fixture} try ${meta.n} ${meta.name}: outcome=${rec.outcome} code=${rec.failureCode} replyEnd=${wait.replyEnd} buttons=${ui?.linkYes ?? '?'}/${ui?.linkNo ?? '?'} retry=${ui?.tryAgain ?? '?'} | ${(got.reply ?? '').slice(0, 140)}`);

  // Probe integrity: a reply that arrived must have a run row; the control must have one on every try.
  if (wait.replyArrived && runs.length === 0) throw new Error(`P1653 harness BLIND: a reply arrived but no run row was found (${meta.fixture} try ${meta.n} ${meta.name})`);
  if (opts.control) expect(runs.length, `control try ${meta.n} must yield a run row`).toBeGreaterThan(0);
  return rec;
}

const lastRunId = (rec: Row): string | null => ((rec.runs as Row[]).at(-1)?.id as string | undefined) ?? null;

/**
 * The engine's input for a step's newest run, recorded on the step. A missing draft or run, or a read that fails (a busy TEST server), marks the step
 * `inputUnresolved` with the reason and returns null: the group goes on, and afterAll fails the file for it. It never aborts the group.
 */
async function readInput(rec: Row, ctx: Ctx): Promise<Row | null> {
  const runId = lastRunId(rec);
  if (!ctx.draftId || !runId) { rec.inputUnresolved = true; rec.input = { error: 'no draft or run to read the input of' }; return null; }
  try {
    const input = await inputOf(ctx.draftId, runId, ctx);
    rec.input = input;
    return input;
  } catch (e) {
    rec.inputUnresolved = true;
    rec.input = { error: String((e as Error).message ?? e).split('\n')[0] };
    return null;
  }
}

// ── the scenarios, one function per fixture, one fresh canvas per call ────────────────────────────────────────────────────────
const single = (text: string, control = false) => async (p: Page, userId: string, fixture: string, n: number) => {
  const ctx = await openTry(p, userId);
  await step(ctx, { fixture, n, name: 'send' }, { text }, { control });
};

/** A canvas that already holds a draft, then the founder's "one more card" message. */
async function angry(p: Page, userId: string, fixture: string, n: number) {
  const ctx = await openTry(p, userId);
  await step(ctx, { fixture, n, name: 'seed' }, { text: SEED });
  const rec = await step(ctx, { fixture, n, name: 'angry' }, { text: ANGRY });
  const problem = String((rec.boxes as Record<string, string> | null)?.['canvas:problem'] ?? '');
  rec.extra = { angryInProblemBox: /angry/i.test(problem) };
}

/** Send, answer the agent's question, and prove from the engine's own input selector that the second run read BOTH messages (F1). */
async function followup(p: Page, userId: string, fixture: string, n: number) {
  const ctx = await openTry(p, userId);
  await step(ctx, { fixture, n, name: 'first' }, { text: F3 });
  const rec = await step(ctx, { fixture, n, name: 'answer' }, { text: ANSWER });
  const input = await readInput(rec, ctx);
  if (!input) { proofs.push({ fixture, try: n, claim: 'the second run read BOTH messages (F1)', ok: false, detail: `input unresolved: ${JSON.stringify(rec.input)}` }); return; }
  const msgs = input.messages as string[];
  const ok = msgs.includes(norm(F3)) && msgs.includes(norm(ANSWER));
  proofs.push({ fixture, try: n, claim: 'the second run read BOTH messages (F1)', ok, detail: ok ? 'both messages are in the run input' : `input messages: ${JSON.stringify(msgs)}` });
}

/** "airbnb.com - make canvas", then (if the reply ends with the question) a tap through the real UI. */
async function linkTap(which: 'yes' | 'no', p: Page, userId: string, fixture: string, n: number) {
  const ctx = await openTry(p, userId);
  const first = await step(ctx, { fixture, n, name: 'first' }, { text: F1 });
  const ui = first.ui as { linkYes: number; linkNo: number; replyEndsWithPageQuestion: boolean } | null;
  if (!ui || !ui.replyEndsWithPageQuestion || ui.linkYes <= 0 || ui.linkNo <= 0) { // -1 means the count could not be read: not verified, so not tapped
    first.extra = { noButtons: true, why: 'the reply does not end with the page question, or a button is missing; nothing was tapped' };
    proofs.push({ fixture, try: n, claim: 'the reply ends with "Is this your business?" and shows both buttons', ok: false, detail: JSON.stringify(ui) });
    return;
  }
  const tap = await step(ctx, { fixture, n, name: `tap-${which}` }, { click: which === 'yes' ? 'canvas-link-yes' : 'canvas-link-no' }, { expectParsed: which === 'yes' });
  if (which === 'yes') { await readInput(tap, ctx); return; } // an unreadable input marks the step (inputUnresolved), it does not abort the group
  ctx.pageAllowed = false; // after "Not mine" the page's words are no longer allowed anywhere
  const later = await step(ctx, { fixture, n, name: 'later' }, { text: LATER });
  const input = await readInput(later, ctx);
  if (!input) { proofs.push({ fixture, try: n, claim: 'after "Not mine" a later run read no page', ok: false, detail: `input unresolved: ${JSON.stringify(later.input)}` }); return; }
  const mats = input.materials as { kind: string; hasPageWords: boolean }[];
  const outputWords = new Set(wordsOf(`${later.reply ?? ''} ${Object.values((later.boxes as Record<string, string> | null) ?? {}).join(' ')}`));
  const pageInOutput = (input.pageOnlyWords as string[]).filter((w) => outputWords.has(w));
  const ok = !mats.some((m) => m.kind === 'link') && !mats.some((m) => m.hasPageWords) && pageInOutput.length === 0;
  proofs.push({ fixture, try: n, claim: 'after "Not mine" a later run read no page (no link material in its input, no page-only word in its input or output)', ok,
    detail: ok ? `input materials: ${JSON.stringify(mats)}` : `input materials: ${JSON.stringify(mats)}; page-only words in output: ${JSON.stringify(pageInOutput)}` });
}

type Runner = (p: Page, userId: string, fixture: string, n: number) => Promise<void>;
async function group(page: Page, name: string, id: string, run: Runner) {
  const plan = PLAN.find((x) => x.id === id);
  const status = groups.find((g) => g.fixture === id);
  if (!plan || !status) throw new Error(`P1653 harness: fixture ${id} is not in the plan`);
  if (ONLY && !ONLY.includes(id)) { status.status = 'skipped_by_env'; flush(); return; } // a resume: this fixture's results are kept from the earlier run, never resent
  const tries = triesFor(plan);
  Object.assign(status, { status: 'running', triesPlanned: tries });
  // A hard bound on the whole test, sized to its work: tries x steps x 7 minutes (open, a 3 minute reply wait, settle, re-read) plus 5 minutes for setup.
  test.setTimeout(tries * Math.max(plan.cost, 1) * 7 * 60_000 + 5 * 60_000);
  page.setDefaultTimeout(30_000); // every locator action, wait and screenshot ends
  page.setDefaultNavigationTimeout(45_000);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleTail.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => { consoleTail.push(`pageerror: ${String(e.message).slice(0, 300)}`); });
  const { createTestUser, setTestSession } = await import('./helpers/test-user');
  const user = await createTestUser({ name });
  const uid = user.user.id; // TestUser is { user, email, slug, name }
  if (!/^[0-9a-f-]{36}$/.test(uid ?? '')) throw new Error(`P1653 harness: test user id is not a uuid: ${uid}`);
  createdUsers.push(uid); // deleted at the very end of afterAll, after the re-read and the log join have used the rows
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, user.email);
    for (let i = 1; i <= tries; i++) {
      if (claimsEstimate() + plan.cost > MAX_ATTEMPTS) { status.budgetStopped = true; break; } // never start a try the cap cannot cover
      await run(page, uid, id, i);
      status.triesRecorded = i;
    }
    status.status = status.budgetStopped ? 'budget_stopped' : 'done';
  } catch (e) {
    if (e instanceof BudgetStop) { // a step inside a try could not be covered: stop this group, keep what was recorded, and say so
      Object.assign(status, { status: 'budget_stopped', budgetStopped: true, error: e.message });
      flush();
      return;
    }
    // An integrity throw skips the remaining tries (and, in serial mode, every later fixture): say so in the output, so the JSON explains itself.
    Object.assign(status, { status: 'aborted', aborted: true, error: String((e as Error).message ?? e).split('\n')[0] });
    flush();
    throw e;
  }
}

test.beforeAll(() => {
  PLAN.forEach(triesFor); // fail before any send on a bad value
  for (const id of ONLY ?? []) if (!PLAN.some((x) => x.id === id)) throw new Error(`P1653_ONLY names an unknown fixture "${id}"`);
  harnessStart = Date.now();
  functionChecks.start = functionsCheck('at start'); // throws unless the server serves this branch's functions
});

/** The runs of a record at the end: its own known runs re-read, or, when it never saw one, the draft's runs no other record claims. */
async function ownRunsAtEnd(r: Row, draftId: string): Promise<Row[]> {
  const all = await runsOfDraft(draftId);
  const known = new Set((r.runs as Row[]).map((x) => String(x.id)));
  if (known.size) return all.filter((x) => known.has(String(x.id)));
  const others = new Set(records.filter((o) => o !== r && o.draftId === draftId).flatMap((o) => (o.runs as Row[]).map((x) => String(x.id))));
  return all.filter((x) => !others.has(String(x.id)));
}

test.afterAll(async () => {
  const failures: string[] = [];
  try {
    functionChecks.end = functionsCheck('at end');
    const s = functionChecks.start?.started;
    if (s && functionChecks.end.started !== s) failures.push(`the functions container was recreated during the run (${s} -> ${functionChecks.end.started}); the numbers are void`);
  } catch (err) {
    failures.push((err as Error).message);
  }

  try {
    // Records that were not terminal or not resolved when their step ended: re-read once, with the same fields step() collects. Still unresolved fails the file.
    try {
      for (const r of records.filter((x) => x.incomplete)) {
        const lookup = r.lookup as { userId: string; canvasName: string };
        const draftId = r.draftId ? String(r.draftId) : await draftOfCanvas(lookup.userId, lookup.canvasName, false);
        const fresh = draftId ? await ownRunsAtEnd(r, draftId) : [];
        r.draftId = draftId;
        if (fresh.length) {
          const got = await collect(draftId, fresh);
          const last = got.runs.at(-1);
          r.runs = got.runs;
          r.reply = got.reply;
          r.evidenceChecksDropped = got.reply ? inferDrops(got.reply) : 'no reply';
          r.linkMaterial = got.material.map((m) => ({ kind: m.kind, label: m.label, chars: m.chars, textHead: norm(String(m.text)).slice(0, 300) }));
          r.failureCode = last?.error_code ?? null;
          // The flags are recomputed from the FINAL reply (and the final link material), never left as the 0 computed while the reply was still null.
          const inp = r.flagInputs as { sent: string[]; pageText: string; pageAllowed: boolean; titles: string; boxErrors: string[] };
          const links = got.material.filter((m) => m.kind === 'link');
          const flagCtx: FlagCtx = { sent: inp.sent, pageAllowed: inp.pageAllowed, pageText: links.length ? norm(links.map((m) => String(m.text)).join(' ')) : inp.pageText };
          r.flags = flagsOf(flagCtx, got.reply, (r.boxes as Record<string, string> | null) ?? {}, inp.titles, r.boxes ? inp.boxErrors : [...inp.boxErrors, 'no boxes were read at step time']);
          r.fixedFallbackShown = got.reply === WORDS.fallbackQuestion;
          r.unresolved = false;
          r.incomplete = got.runs.some((x) => !TERMINAL.has(String(x.state)));
          r.outcome = r.incomplete ? 'INCOMPLETE (a run was not terminal after the re-read)' : last?.state ?? r.outcome;
        } else {
          r.unresolved = true; // still empty while a send happened: never complete
        }
      }
      // A record that is still unresolved or incomplete was never checked: say so on its flags, so flagCount 0 cannot be read as clean.
      for (const r of records.filter((x) => x.incomplete || x.unresolved)) r.flags = { ...(r.flags as Row), checked: false, note: 'NOT CHECKED: the step is unresolved or incomplete' };
      for (const r of records.filter((x) => x.inputUnresolved)) failures.push(`the engine input of ${r.fixture} try ${r.try} ${r.step} could not be read (${JSON.stringify(r.input)}); its proof is unresolved`);
      functionChecks.budgetStopped = groups.filter((g) => g.status === 'budget_stopped').map((g) => String(g.fixture));
      const still = records.filter((x) => x.incomplete && !x.unresolved).map((x) => `${x.fixture} try ${x.try} ${x.step}`);
      const empty = records.filter((x) => x.unresolved).map((x) => `${x.fixture} try ${x.try} ${x.step}`);
      functionChecks.incompleteAtEnd = [...still, ...empty.map((e) => `${e} (unresolved)`)];
      if (still.length) failures.push(`runs still not terminal at the end (recorded as incomplete, not final): ${still.join(', ')}`);
      if (empty.length) failures.push(`no draft or no run row could be read at the end although a message was sent (recorded as unresolved, never complete): ${empty.join(', ')}`);
    } catch (err) {
      failures.push(`end re-read failed: ${(err as Error).message}`);
    }

    // OFF by default: the counts-only `canvas-draft: parsed` line was removed from the product after the 2026-11 replays, so there is nothing to read or join.
    // P1653_LOGS=1 is kept only for a build that still carries a measurement line (it then fails its own checks if no line is found, as before).
    if (process.env.P1653_LOGS === '1' && records.length > 0) {
      const log = await readServerLog(Math.ceil((Date.now() - harnessStart) / 60_000) + 5);
      functionChecks.serverLogRead = log.ok ? `ok, ${log.lines.length} parsed line(s)` : `unavailable: ${log.why}`;
      if (!log.ok) failures.push(`the server log could not be read (${log.why}); counts are unmeasured`);
      for (const r of records) {
        const runs = (r.runs as Row[]);
        r.serverLog = log.ok ? runs.map((x) => { const p = parsedByRun(log.lines, String(x.id)); return { run_id: x.id, linesFound: p?.linesFound ?? 0, line: p?.line ?? null }; }) : `unavailable: ${log.why}`;
        if (log.ok && r.expectParsed !== false) {
          for (const x of runs) {
            const reachedParse = PARSE_STAGE_CODES.has(String(x.error_code)) || x.state === 'done';
            if (reachedParse && !parsedByRun(log.lines, String(x.id))) failures.push(`no parsed log line for run ${x.id} (${r.fixture} try ${r.try} ${r.step}, state ${x.state}, code ${x.error_code}): the server may not run the log line`);
          }
        }
      }
      // The control proves the whole chain (model, parse, log line, ssh read, join): at least one F4 control run is done AND has its parsed line.
      const controlProven = log.ok && records.some((r) => r.fixture === 'F4-control' && (r.runs as Row[]).some((x) => x.state === 'done' && parsedByRun(log.lines, String(x.id))));
      functionChecks.controlProven = controlProven;
      if (!controlProven) failures.push('the F4 control did not prove the chain end to end: need at least one control run with state done AND a joined parsed log line');
    }
    // The spec's proofs (the follow-up read both messages; Not mine left no page; the buttons were there): a false proof fails the file, loudly.
    for (const pr of proofs.filter((x) => !x.ok)) failures.push(`proof failed (${pr.fixture} try ${pr.try}): ${pr.claim}: ${pr.detail}`);
    // Re-derived from every record, after the re-read, so a late attempt count is included.
    if (claimAttemptsNow() > MAX_ATTEMPTS) failures.push(`ceiling exceeded: ${claimAttemptsNow()} claim attempts > ${MAX_ATTEMPTS} (${sends} sends)`);
    if (groups.some((g) => g.aborted)) failures.push(`a fixture aborted; not run: ${groups.filter((g) => g.status === 'not_run').map((g) => g.fixture).join(', ') || 'none'}`);
    flush();
    if (failures.length) throw new Error(`P1653 harness failed its own checks:\n- ${failures.join('\n- ')}`);
  } finally {
    // The very last step: the test users were needed by the re-read and the join, so they go only now. A failed delete is logged, never masks a failure above.
    const { deleteTestUser } = await import('./helpers/test-user');
    const failed: string[] = [];
    for (const id of createdUsers) {
      try { await deleteTestUser(id); } catch (err) { failed.push(`${id}: ${(err as Error).message}`); }
    }
    functionChecks.cleanup = `deleted ${createdUsers.length - failed.length} of ${createdUsers.length} test users${failed.length ? `; failed: ${failed.join(' | ')}` : ''}`;
    flush();
  }
});

test('F1 bare domain: airbnb.com - make canvas', async ({ page }) => { await group(page, 'P1653 Replay F1', 'F1', single(F1)); });
test('F2 https link: https://www.airbnb.com/ this canvas', async ({ page }) => { await group(page, 'P1653 Replay F2', 'F2', single(F2)); });
test('F3 vague statement: its a car selling buisness', async ({ page }) => { await group(page, 'P1653 Replay F3', 'F3', single(F3)); });
test('F4 positive control: clear multi-sentence statement', async ({ page }) => { await group(page, 'P1653 Replay F4', 'F4-control', single(CONTROL, true)); });
test('F5 staged unreadable link (blocked by name, no network)', async ({ page }) => { await group(page, 'P1653 Replay F5', 'F5-unreadable', single(UNREADABLE)); });
if (AFTER) {
  test('A1 one more card here they are angry (on a canvas with a draft)', async ({ page }) => { await group(page, 'P1653 Replay A1', 'angry', angry); });
  test('A2 two-message follow-up (its a car selling buisness, then the answer)', async ({ page }) => { await group(page, 'P1653 Replay A2', 'followup', followup); });
  test('A3 link then tap "Yes, this is my business"', async ({ page }) => { await group(page, 'P1653 Replay A3', 'link-yes', (p, u, f, n) => linkTap('yes', p, u, f, n)); });
  test('A4 link then tap "Not mine", then a later message', async ({ page }) => { await group(page, 'P1653 Replay A4', 'link-no', (p, u, f, n) => linkTap('no', p, u, f, n)); });
}
