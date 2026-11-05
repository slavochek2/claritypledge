/**
 * P1312: the E2E run's check that TEST serves this branch's edge functions, at the start (global
 * setup) and the end (global teardown). The decision logic is scripts/lib/branch-functions-verdict.mjs
 * (pure, unit-tested); this file only spawns scripts/selfhosted/branch-functions-check.sh, keeps the
 * hand-off between the two hooks in process.env (both run in the Playwright runner process), and
 * writes the receipt.
 *
 * Test seams (environment, never set in real runs):
 *   CP_BRANCH_FUNCTIONS_CHECK         path of a script to run instead of the real check (a stub)
 *   CP_FUNCTION_CHECK_RECEIPT         receipt file to append to instead of <git-common-dir>/cp-function-checks.jsonl
 *   CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS wait before the end check's one retry of an unknown (default 20000)
 * E2E_REQUIRE_FUNCTIONS=1 (or true) turns an untrusted result from a warning into a failure (evidence runs).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FullConfig } from '@playwright/test';
import {
  parseCheckResult,
  functionsVerdict,
  functionsSkipReason,
  functionsLine,
  requireFlagOn,
} from '../../scripts/lib/branch-functions-verdict.mjs';

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const START_STATE = 'CP_FN_CHECK_START';
const START_LINE = 'CP_FN_CHECK_START_LINE';
const START_STARTED = 'CP_FN_CHECK_START_STARTED';
const START_HEAD = 'CP_FN_CHECK_START_HEAD';
const REFUSED = 'CP_FN_CHECK_REFUSED';
const OWN_ENV = [START_STATE, START_LINE, START_STARTED, START_HEAD, REFUSED];
const DEFAULT_RETRY_WAIT_MS = 20_000;

type Result = { state: string; line: string; started: string; detail: string };

/** True when E2E_REQUIRE_FUNCTIONS is on (1 or true). */
export const functionsRequired = () => requireFlagOn(process.env.E2E_REQUIRE_FUNCTIONS);
const skipReason = (config: FullConfig) =>
  functionsSkipReason({ hasWebServer: !!config.webServer?.url, env: process.env, argv: process.argv });

/** How long teardown waits before retrying an unknown end check, so a deploy in flight can finish. */
export function retryWaitMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS);
  return env.CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS !== undefined && env.CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS !== '' && Number.isFinite(n) && n >= 0
    ? n
    : DEFAULT_RETRY_WAIT_MS;
}

function sleepSync(ms: number): void {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runCheck(): Result {
  const script = process.env.CP_BRANCH_FUNCTIONS_CHECK || path.join(REPO_DIR, 'scripts/selfhosted/branch-functions-check.sh');
  const r = spawnSync('bash', [script], { cwd: REPO_DIR, encoding: 'utf8', timeout: 60_000, env: process.env });
  return parseCheckResult({ status: r.status, stdout: r.stdout });
}

function git(...args: string[]): string {
  const r = spawnSync('git', args, { cwd: REPO_DIR, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

/** The check's own words: its first line, then the fix lines or the reason an unknown clears by. */
const said = (r: { line: string; detail: string }) => (r.detail ? `${r.line}\n${r.detail}` : r.line);

function writeReceipt(entry: Record<string, unknown>): void {
  try {
    const file = process.env.CP_FUNCTION_CHECK_RECEIPT
      || path.join(git('rev-parse', '--path-format=absolute', '--git-common-dir') || path.join(REPO_DIR, '.git'), 'cp-function-checks.jsonl');
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.warn('[P1312] could not write the function-check receipt:', (err as Error).message);
  }
}

/** Global setup: check at the start. Throws, under E2E_REQUIRE_FUNCTIONS=1, when the run would start on other code. */
export function functionsAtSetup(config: FullConfig): void {
  // Values inherited from a parent run or a shell must never influence this one.
  for (const k of OWN_ENV) Reflect.deleteProperty(process.env, k);
  if (skipReason(config)) return;
  const start = runCheck();
  process.env[START_STATE] = start.state;
  process.env[START_LINE] = start.line;
  process.env[START_STARTED] = start.started;
  process.env[START_HEAD] = git('rev-parse', 'HEAD');
  if (start.state === 'match' || start.state === 'none') {
    console.log(`[P1312] ${start.line}`);
    return;
  }
  const v = functionsVerdict({ start: start.state, end: null, requireFlag: functionsRequired() });
  const msg = `[P1312] ${said(start)}\n[P1312] ${v.message}`;
  if (v.action === 'fail') {
    process.env[REFUSED] = '1';
    throw new Error(`${msg}\n[P1312] Refused: E2E_REQUIRE_FUNCTIONS is set. Run the fix printed above, then re-run.`);
  }
  console.warn(`${msg}\n[P1312] Continuing: this run was not asked to require it (E2E_REQUIRE_FUNCTIONS=1 makes this a failure).`);
}

/**
 * Global teardown: check at the end, write the receipt, print the FUNCTIONS: line. Returns the error
 * to throw once cleanup is done (never throws itself), or null.
 */
export function functionsAtTeardown(config: FullConfig): { failure: Error | null; line: string | null } {
  const none = { failure: null, line: null };
  const start = process.env[START_STATE];
  if (!start || skipReason(config)) return none;
  const refused = process.env[REFUSED] === '1';
  const requireFlag = functionsRequired();
  let end: Result | null = null;
  if (!refused) {
    end = runCheck();
    // A transient failure (a tunnel, or a deploy still in flight) must not turn a finished evidence
    // run red: one retry of unknown, after a wait long enough for a live deploy to finish.
    if (end.state === 'unknown') {
      sleepSync(retryWaitMs());
      end = runCheck();
    }
  }
  const startHead = process.env[START_HEAD] ?? '';
  const endHead = git('rev-parse', 'HEAD');
  const v = functionsVerdict({
    start, end: end?.state ?? null, requireFlag,
    startStarted: process.env[START_STARTED] ?? '', endStarted: end?.started ?? '',
    startHead, endHead,
  });
  const line = functionsLine({ verdict: v.verdict, start, end: end?.state ?? null });
  writeReceipt({
    time: new Date().toISOString(),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    sha: endHead,
    startSha: startHead,
    requireFlag,
    start: { state: start, line: process.env[START_LINE] ?? '', started: process.env[START_STARTED] ?? '' },
    end: end ? { state: end.state, line: end.line, started: end.started } : null,
    verdict: v.verdict,
  });
  let failure: Error | null = null;
  if (v.action !== 'pass' && !refused) {
    const msg = `[P1312] ${end ? said(end) : ''}\n[P1312] ${v.message}`;
    if (v.action === 'fail') failure = new Error(`${msg}\n[P1312] Failing the run: E2E_REQUIRE_FUNCTIONS is set.`);
    else console.warn(msg);
  }
  return { failure, line };
}
