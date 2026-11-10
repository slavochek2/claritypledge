/**
 * @file p1653-replay.spec.ts
 * @description P1653 replay harness ("p1653-replay"): the founder's three first messages, a positive control and a staged unreadable link, each
 * sent as the first message on a fresh TEST canvas with the REAL model, as a signed-in owner. It MEASURES and never asserts product behaviour;
 * the only assertions are about the probe itself (fresh canvas, the control has a run row, the model-call ceiling, the function checks, the log join).
 *
 * Per try it records: the reply the owner sees (read through the run's reply_message_id), the run rows of THIS canvas's draft re-read until they
 * settle (state, error_code, kind, input_kind, attempts, cost), what the link read kept (label, chars, first 300 characters of the page text),
 * the box contents, an inference of what the evidence checks dropped taken from the reply wording, and the counts line `canvas-draft: parsed`
 * (one JSON line after a prefix) joined by run_id from the TEST functions container log.
 *
 * The model's raw points, note and questions are never persisted and are not recorded. What is recorded is counts only: the log line carries
 * rawActions (actions the model returned, before any filter), actionsForm and the drop counters, and exists only on a server that runs this
 * branch's temporary log line. The join fails the file when a run that reached the parse stage has no line, so a server without the line, a
 * missing container or an unreadable log is a failure and never a quiet "no line".
 *
 * Reads are service-role SELECTs only. Nothing here changes product code, the evidence checks or any row.
 *
 * Run (TEST only; skipped unless P1653_REPLAY=1; retries must be 0 so a retry cannot double the model calls):
 *   E2E_REQUIRE_FUNCTIONS=1 P1653_REPLAY=1 P1653_OUT=test-results/p1653-replay.json \
 *     npx playwright test e2e/p1653-replay.spec.ts --retries=0 --workers=1
 * Env: P1653_TRIES integer 1 to 5 (default 5 sends per fixture, 25 in all), P1653_LOGS=0 to skip the server log read (the join check and the control's end-to-end proof are then skipped, and the numbers are not log-backed),
 * P1653_GCP_PROJECT, P1653_GCP_ZONE, P1653_GCP_VM, P1653_FUNCS_CONTAINER (defaults: the self-hosted TEST server named in scripts/e2e-load-test.mjs).
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(process.env.P1653_REPLAY !== '1', 'P1653 replay runs only with P1653_REPLAY=1');
test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'not a TEST project');
test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(3_000_000);

/**
 * The ceiling on claim attempts (summed from run rows; a claim is not a confirmed model call) for the whole file. It is checked BEFORE each send, which refuses once
 * the count has reached the ceiling, and ENFORCED at the end of the file (the file fails if it was exceeded). It does not bound the attempts inside
 * a single send: one send can add several attempts, so the end check is the real guard. Sends are counted separately from claim attempts.
 */
const MAX_ATTEMPTS = 30;
/** Every fixture, in run order: the output lists all of them, so a fixture that never ran (an earlier group aborted) is visible. */
const FIXTURES = ['F1', 'F2', 'F3', 'F4-control', 'F5-unreadable'];
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
 * Failure codes that mean the run reached the parse stage on the draft path, so the server must have logged a parsed line for it (the line is written in
 * canvas-run.ts failureOf, right after parseDraft and draftOffer, before any write). Order in runDraft: parseDraft, draftOffer, failureOf (logs the line, then
 * sets unparsable / empty / blocked / nothing_supported), completeDraft (sets 'write' when the write rpc fails, after the line was logged).
 * NOT in this set, on purpose: 'internal' and 'gone' (also set BEFORE the parse, by a crash in gatherLinks or a closed run), SQL codes returned through closedRun
 * (unknown values), and the choice paths ('choice_stale', 'choice_write', 'choice_read', and 'write' from the choice run), which parse through a different
 * function that logs no line. A draftOffer run (state done, no line) is likewise not logged; the empty-canvas fixtures here cannot reach it.
 */
const PARSE_STAGE_CODES = new Set(['nothing_supported', 'unparsable', 'empty', 'blocked', 'write']);

/** An integer from 1 to 5, or a throw: a NaN would run zero tries and report an empty success. */
function triesFromEnv(): number {
  const raw = process.env.P1653_TRIES ?? '5';
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`P1653_TRIES must be an integer from 1 to 5, got "${raw}"`);
  return n;
}

// Fixtures, verbatim from the founder's messages.
const F1 = 'airbnb.com - make canvas';
const F2 = 'https://www.airbnb.com/ this canvas';
const F3 = 'its a car selling buisness';
// Positive control: who they sell to, what, what it costs.
const CONTROL = 'We sell used cars to young families in Tallinn. Each car comes with a one year warranty and costs between 8000 and 15000 euros. Today families struggle to find a reliable cheap car.';
// Unreadable link, staged with no network: the host name "localhost" is refused by name before any DNS or fetch (canvas-hosts.ts hostIsPublic,
// canvas-material.ts readLink 'blocked' = "not a public web address"), so the outcome cannot depend on any external site being up.
const UNREADABLE = 'https://localhost/our-shop make a canvas from this';

const composer = (p: Page) => p.getByTestId('composer').getByRole('textbox').first();
const panel = (p: Page) => p.getByTestId('thread-panel');
const messages = (p: Page) => panel(p).getByTestId('message');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

type Row = Record<string, unknown> & { id?: string; draft_id?: string; state?: string; attempts?: number; spend_id?: string | null; reply_message_id?: string | null; error_code?: string | null };
type Check = { status: string; started: string };
let admin: SupabaseClient | null = null;
/** Created on first use inside a test, never at module load, so loading this file (for --list) needs no environment. */
const db = (): SupabaseClient => (admin ??= createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }));

let sends = 0; // messages sent, whether or not a run row or a model call followed
const seenDrafts = new Set<string>();
const seenCanvases = new Set<string>();
const records: Row[] = [];
const groups: Row[] = FIXTURES.map((fixture) => ({ fixture, status: 'not_run', triesPlanned: null, triesRecorded: 0, aborted: false, error: null }));
/** Test users stay until ALL collection (the afterAll re-read and the log join) is finished; deleted at the very end of afterAll. */
const createdUsers: string[] = [];

/**
 * Claim attempts: the sum of run rows' `attempts`, which the database increments when a run is CLAIMED (migration 20261103010000, _canvas_draft_run_begin:
 * `attempts = r.attempts + 1`), before any model call. It is NOT a count of model calls: a claimed run can fail before the model is reached. Confirmed
 * model calls are the joined `canvas-draft: parsed` lines plus the provider-failure codes (http_*, network, timeout in flight); this counter only bounds claims.
 */
const claimAttemptsNow = () => records.flatMap((r) => r.runs as Row[]).reduce((s, x) => s + (Number(x.attempts) || 0), 0);
const functionChecks: { start?: Check; end?: Check; serverLogRead?: string; incompleteAtEnd?: string[]; controlProven?: boolean; cleanup?: string } = {};
let harnessStart = Date.now();

const flush = () => {
  mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ harness: 'e2e/p1653-replay.spec.ts', sends, claimAttempts: claimAttemptsNow(), maxClaimAttempts: MAX_ATTEMPTS, confirmedModelCallsNote: 'confirmed model calls are the joined parsed log lines (serverLog) plus provider-failure codes; claimAttempts counts claims, not model calls', functionChecks, groups, records }, null, 2));
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

async function open(p: Page): Promise<{ canvas: string; canvasName: string }> {
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
  return { canvas, canvasName };
}

async function boxes(p: Page): Promise<Record<string, string>> {
  const tags = await p.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('canvas-box-', '')));
  const out: Record<string, string> = {};
  for (const tag of tags) {
    const list = p.getByTestId(`canvas-box-${tag}`).getByTestId('canvas-box-list');
    out[tag] = (await list.count()) === 0 ? '' : norm(await list.innerText());
  }
  return out;
}

/** What the reply wording says about the evidence checks (inference from canvas-reply.ts failedLine, labelled as such). */
function inferDrops(reply: string): string {
  const r = norm(reply);
  if (/I could not tie what I found to your own words/.test(r)) return 'INFERRED droppedUnverified > 0 (long failed line)';
  if (/I could not draft a canvas from that, so nothing was changed\./.test(r)) return 'INFERRED droppedUnverified = 0 (short failed line); droppedNames not distinguishable from the reply';
  if (/I left out \d+ point/.test(r)) return 'MEASURED-BY-WORDING droppedUnverified >= 1 on a drafted reply';
  return 'no drop wording in the reply';
}

type PollResult = { ok: true } | { ok: false; kind: 'timeout' | 'page_closed' | 'error'; error?: string };
/**
 * Polls `read` until `done(value)`. Distinguishes the three ways it can end badly: the deadline passed with every read succeeding (a timeout), the
 * page was closed, or the reads kept failing (a locator, navigation or page error: recorded with its message, never called "no reply").
 */
async function pollUntil<T>(p: Page, read: () => Promise<T>, done: (v: T) => boolean, timeoutMs: number): Promise<PollResult & { last?: T }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;
  let last: T | undefined;
  while (Date.now() < deadline) {
    if (p.isClosed()) return { ok: false, kind: 'page_closed', last };
    try {
      last = await read();
      lastError = undefined;
      if (done(last)) return { ok: true, last };
    } catch (e) {
      lastError = String((e as Error).message ?? e).split('\n')[0];
    }
    await new Promise((r) => setTimeout(r, 500));
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

/** Everything read from the database about one draft's runs: run rows with cost, the reply the run posted, the link material. One path for one() and the afterAll re-read. */
async function collect(draftId: string | null, runs: Row[]): Promise<{ runs: Row[]; reply: string | null; material: Row[] }> {
  const spendIds = runs.map((r) => r.spend_id).filter(Boolean) as string[];
  const spend = spendIds.length ? rows('mirror_ai_spend', await db().from('mirror_ai_spend').select('id,actual_usd,state').in('id', spendIds)) : [];
  const material = draftId ? rows('canvas_draft_material', await db().from('canvas_draft_material').select('kind,label,chars,text').eq('draft_id', draftId).order('created_at')) : [];
  const replyId = [...runs].reverse().find((r) => r.reply_message_id)?.reply_message_id as string | undefined;
  const reply = replyId ? norm(String(rows('chat_messages', await db().from('chat_messages').select('body').eq('id', replyId))[0]?.body ?? '')) : null;
  return { runs: runs.map((r) => ({ ...r, actual_usd: spend.find((s) => s.id === r.spend_id)?.actual_usd ?? null })), reply, material };
}

async function one(p: Page, userId: string, fixture: string, text: string, n: number, control: boolean) {
  if (claimAttemptsNow() >= MAX_ATTEMPTS) throw new Error(`P1653 harness: ceiling of ${MAX_ATTEMPTS} claim attempts reached; refusing to send`);
  const { canvas, canvasName } = await open(p);
  const before = await messages(p).count();
  await composer(p).fill(text);
  await composer(p).press('Enter');
  sends += 1;
  const wait = await waitForRun(p, before);
  await p.waitForTimeout(2500).catch(() => undefined);

  // The draft is resolved from this canvas's name, then ITS runs are read until terminal (a late failure code and cost land after the reply), at most 30 s.
  const draftId = await draftOfCanvas(userId, canvasName);
  let runs: Row[] = draftId ? await runsOfDraft(draftId) : [];
  for (let i = 0; i < 15 && draftId && runs.some((r) => !TERMINAL.has(String(r.state))); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    runs = await runsOfDraft(draftId);
  }
  // An empty read (no draft found, or no run row) is never "complete": a send happened, so the try stays unresolved and incomplete, with its lookup keys,
  // and afterAll resolves it again.
  const unresolved = !draftId || runs.length === 0;
  const incomplete = unresolved || runs.some((r) => !TERMINAL.has(String(r.state)));
  if (draftId) seenDrafts.add(draftId);

  const got = await collect(draftId, runs);
  runs = got.runs;
  const material = got.material;
  const reply = got.reply;
  const last = runs.at(-1);
  const uiReply = wait.replyArrived && !p.isClosed() ? norm(await messages(p).last().innerText().catch(() => '')) : null;

  const rec: Row = {
    fixture, try: n, canvas, sent: text, draftId,
    lookup: { userId, canvasName },
    waits: wait,
    unresolved,
    incomplete,
    runs,
    outcome: unresolved ? 'UNRESOLVED (no draft or no run row read)' : incomplete ? 'INCOMPLETE (a run was not terminal after the re-read)' : last?.state ?? (wait.replyArrived ? 'reply but no run row' : wait.replyEnd === 'timeout' ? 'NO_REPLY' : `WAIT_${String(wait.replyEnd).toUpperCase()}`),
    failureCode: last?.error_code ?? null,
    reply,
    uiReply,
    linkMaterial: material.map((m) => ({ kind: m.kind, label: m.label, chars: m.chars, textHead: norm(String(m.text)).slice(0, 300) })),
    boxes: p.isClosed() ? null : await boxes(p).catch(() => null),
    evidenceChecksDropped: reply ? inferDrops(reply) : 'no reply',
    serverLog: null,
    rawModelOutput: null,
    rawModelOutputWhy: 'never persisted: only counts are available, through the server log line (serverLog) when this branch\'s log line is deployed',
  };
  records.push(rec);
  flush();
  console.log(`P1653 ${fixture} try ${n}: outcome=${rec.outcome} code=${rec.failureCode} replyEnd=${wait.replyEnd} settleEnd=${wait.settleEnd} | ${(reply ?? '').slice(0, 140)}`);

  // Probe integrity: a reply that arrived must have a run row; the control must have one on every try.
  if (wait.replyArrived && runs.length === 0) throw new Error(`P1653 harness BLIND: a reply arrived but no run row was found (${fixture} try ${n})`);
  if (control) expect(runs.length, `control try ${n} must yield a run row`).toBeGreaterThan(0);
}

async function group(page: Page, name: string, fixture: string, text: string, control = false) {
  const tries = triesFromEnv();
  const status = groups.find((g) => g.fixture === fixture);
  if (!status) throw new Error(`P1653 harness: fixture ${fixture} is not in FIXTURES`);
  Object.assign(status, { status: 'running', triesPlanned: tries });
  const { createTestUser, setTestSession } = await import('./helpers/test-user');
  const user = await createTestUser({ name });
  const id = user.user.id; // TestUser is { user, email, slug, name }
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) throw new Error(`P1653 harness: test user id is not a uuid: ${id}`);
  createdUsers.push(id); // deleted at the very end of afterAll, after the re-read and the log join have used the rows
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, user.email);
    for (let i = 1; i <= tries; i++) {
      await one(page, id, fixture, text, i, control);
      status.triesRecorded = i;
    }
    status.status = 'done';
  } catch (e) {
    // An integrity throw skips the remaining tries (and, in serial mode, every later fixture): say so in the output, so the JSON explains itself.
    Object.assign(status, { status: 'aborted', aborted: true, error: String((e as Error).message ?? e).split('\n')[0] });
    flush();
    throw e;
  }
}

test.beforeAll(() => {
  triesFromEnv(); // fail before any send on a bad value
  harnessStart = Date.now();
  functionChecks.start = functionsCheck('at start'); // throws unless the server serves this branch's functions
});

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
    // Runs that were not terminal when their try ended: re-read once, with the same fields one() collects (run state, cost, reply, link material).
    // Still not terminal stays flagged and fails the file.
    try {
      for (const r of records.filter((x) => x.incomplete)) {
        // An unresolved try (no draft or no run row at its first read) resolves its draft again from the kept lookup keys.
        const lookup = r.lookup as { userId: string; canvasName: string };
        const draftId = r.draftId ? String(r.draftId) : await draftOfCanvas(lookup.userId, lookup.canvasName, false);
        const fresh = draftId ? await runsOfDraft(draftId) : [];
        r.draftId = draftId;
        if (fresh.length) {
          const got = await collect(draftId, fresh);
          const last = got.runs.at(-1);
          r.runs = got.runs;
          r.reply = got.reply;
          r.evidenceChecksDropped = got.reply ? inferDrops(got.reply) : 'no reply';
          r.linkMaterial = got.material.map((m) => ({ kind: m.kind, label: m.label, chars: m.chars, textHead: norm(String(m.text)).slice(0, 300) }));
          r.failureCode = last?.error_code ?? null;
          r.unresolved = false;
          r.incomplete = got.runs.some((x) => !TERMINAL.has(String(x.state)));
          r.outcome = r.incomplete ? 'INCOMPLETE (a run was not terminal after the re-read)' : last?.state ?? r.outcome;
        } else {
          r.unresolved = true; // still empty while a send happened: never complete
        }
      }
      const still = records.filter((x) => x.incomplete && !x.unresolved).map((x) => `${x.fixture} try ${x.try}`);
      const empty = records.filter((x) => x.unresolved).map((x) => `${x.fixture} try ${x.try}`);
      functionChecks.incompleteAtEnd = [...still, ...empty.map((e) => `${e} (unresolved)`)];
      if (still.length) failures.push(`runs still not terminal at the end (recorded as incomplete, not final): ${still.join(', ')}`);
      if (empty.length) failures.push(`no draft or no run row could be read at the end although a message was sent (recorded as unresolved, never complete): ${empty.join(', ')}`);
    } catch (err) {
      failures.push(`end re-read failed: ${(err as Error).message}`);
    }

    if (process.env.P1653_LOGS !== '0' && records.length > 0) {
      const log = await readServerLog(Math.ceil((Date.now() - harnessStart) / 60_000) + 5);
      functionChecks.serverLogRead = log.ok ? `ok, ${log.lines.length} parsed line(s)` : `unavailable: ${log.why}`;
      if (!log.ok) failures.push(`the server log could not be read (${log.why}); counts are unmeasured`);
      for (const r of records) {
        const runs = (r.runs as Row[]);
        r.serverLog = log.ok ? runs.map((x) => { const p = parsedByRun(log.lines, String(x.id)); return { run_id: x.id, linesFound: p?.linesFound ?? 0, line: p?.line ?? null }; }) : `unavailable: ${log.why}`;
        if (log.ok) {
          for (const x of runs) {
            const reachedParse = PARSE_STAGE_CODES.has(String(x.error_code)) || x.state === 'done';
            if (reachedParse && !parsedByRun(log.lines, String(x.id))) failures.push(`no parsed log line for run ${x.id} (${r.fixture} try ${r.try}, state ${x.state}, code ${x.error_code}): the server may not run the log line`);
          }
        }
      }
      // The control proves the whole chain (model, parse, log line, ssh read, join): at least one F4 control run is done AND has its parsed line.
      const controlProven = log.ok && records.some((r) => r.fixture === 'F4-control' && (r.runs as Row[]).some((x) => x.state === 'done' && parsedByRun(log.lines, String(x.id))));
      functionChecks.controlProven = controlProven;
      if (!controlProven) failures.push('the F4 control did not prove the chain end to end: need at least one control run with state done AND a joined parsed log line');
    }
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

test('F1 bare domain: airbnb.com - make canvas', async ({ page }) => { await group(page, 'P1653 Replay F1', 'F1', F1); });
test('F2 https link: https://www.airbnb.com/ this canvas', async ({ page }) => { await group(page, 'P1653 Replay F2', 'F2', F2); });
test('F3 vague statement: its a car selling buisness', async ({ page }) => { await group(page, 'P1653 Replay F3', 'F3', F3); });
test('F4 positive control: clear multi-sentence statement', async ({ page }) => { await group(page, 'P1653 Replay F4', 'F4-control', CONTROL, true); });
test('F5 staged unreadable link (blocked by name, no network)', async ({ page }) => { await group(page, 'P1653 Replay F5', 'F5-unreadable', UNREADABLE); });
