/**
 * e2e-test-db-lock.mjs — P1541: one e2e run at a time against the shared TEST database.
 *
 * TEST is the smallest Supabase compute size and every Claude session on this machine runs
 * Playwright against it. Two full runs at once took it down (2026-10-21). This lock makes the
 * second run wait in line, says who holds it, and never hangs forever.
 *
 * Lifecycle (measured on Playwright 1.64, not assumed): the config is evaluated in the main runner
 * BEFORE the dev server starts and before global setup, and again in every worker. So the lock is
 * taken at config load in the main runner only (workers, --list and --ui skip it), and released
 * when that process exits, which is after global teardown and its user sweep.
 *
 * P1607: hosted TEST keeps this one-run-at-a-time lock. P1672: the self-hosted server's admission is decided
 * on the VM (scripts/lib/e2e-slot-lock.mjs is its client, scripts/selfhosted/lanes/vm/admit.py the authority):
 * one VM-wide capacity, exclusivity per environment (main lane or a lane). guardTestDbRun picks between the two
 * with lockPlan. CI is no longer exempt: a CI job against self-hosted TEST is admitted like any other run.
 *
 * The hosted lock is a directory (mkdir is atomic) in the git common dir, so every worktree of this repository
 * shares it. A separate clone of the repository has its own lock and is not held off (P1572: no such
 * clone exists here).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testRefForUrl, SELFHOSTED_TEST_REF } from './test-target.mjs';
import {
  processStart, readOwner, isStale, describeOwner, tryAcquire, reclaim, sleepSync,
} from './e2e-lock-primitives.mjs';
import {
  acquireSlot, otherRunsLive, admitEnv, admitCommand, AdmissionUnavailable, SWEEP_QUERY_TIMEOUT_MS,
} from './e2e-slot-lock.mjs';
import { detectForArgv } from './e2e-exclusive-specs.mjs';
import { NOT_A_RUN } from './hosted-test-guard.mjs';

// Older importers (tests, other worktrees' copies of callers) keep importing these from here.
export { isStale, describeOwner, reclaim };

export const LOCK_WAIT_EXIT_CODE = 75; // EX_TEMPFAIL: try again later, not an app failure
// P1672: admission could not be decided (VM unreachable, lanectl without admit). Configuration to fix, not load.
export const ADMISSION_UNAVAILABLE_EXIT_CODE = 1;
const LOCK_NAME = 'e2e-test-db.lock';
// P1557: one lock per database. Hosted TEST keeps the name every session already uses; the
// self-hosted server is a different database, so its runs never queue behind hosted ones (P1672: and
// its admission lives on the VM, not here).
const DEFAULT_WAIT_MS = 10 * 60_000;
const POLL_MS = 5_000;
const REPORT_EVERY_MS = 30_000;

/** Why this invocation must not take the lock, or null when it must. */
export function lockSkipReason({ argv = process.argv, env = process.env, isTestDb }) {
  if (env.TEST_WORKER_INDEX !== undefined || env.TEST_PARALLEL_INDEX !== undefined) return 'worker process';
  if (env.E2E_TEST_DB_LOCK_HELD && heldBy(env.E2E_TEST_DB_LOCK_HELD)) return 'lock already held by the parent run';
  // P1672: no CI exemption. CI shares the self-hosted VM's CPU like any other client.
  if (!isTestDb) return 'not the TEST database';
  const args = argv.slice(2);
  // `test` is a subcommand, never the default (Playwright 1.64). Global flags may stand before it
  // (`playwright -c x test ...`): any doubt means it is a run, because a run that skips the lock overlaps unseen.
  const sub = args.find(a => !a.startsWith('-'));
  if (sub !== 'test' && !(args.includes('test') && !NOT_A_RUN.has(sub))) return 'not a test run';
  for (const flag of ['--list', '--ui', '--help', '-h', '--ui-host', '--ui-port']) {
    if (args.some(a => a === flag || a.startsWith(`${flag}=`))) return `${flag} never takes the lock`;
  }
  return null;
}

/** E2E_TEST_DB_LOCK_HELD carries the holder's pid; it counts only while that process is alive. */
function heldBy(value) {
  const pid = Number(value);
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** E2E_TEST_DB_LOCK_WAIT_MS, where 0 means "do not wait"; anything unparsable falls back to the default. */
export function parseWaitMs(value) {
  if (value === undefined || value === '') return DEFAULT_WAIT_MS;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WAIT_MS;
}

/** The hosted TEST lock directory; null for the self-hosted server, whose admission lives on the VM (P1672). */
export function lockDirFor(repoDir, url, env = process.env) {
  const plan = lockPlan(repoDir, url, env);
  return plan.mode === 'single' ? plan.dir : null;
}

/**
 * Hosted TEST: one lock directory in the git common dir. Self-hosted: admission on the VM, in this run's
 * environment (CP_TEST_LANE, else the main lane). No git directory is read for the self-hosted server.
 */
export function lockPlan(repoDir, url, env = process.env) {
  if (testRefForUrl(url, env) === SELFHOSTED_TEST_REF) return { mode: 'vm', env: admitEnv(env) };
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoDir, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
  return { mode: 'single', dir: path.join(common, LOCK_NAME) };
}

/**
 * Decision 6, per environment since P1672: who else is using THIS run's database right now, as descriptions
 * (empty = nobody). The older-leftovers sweep deletes users other runs may still be using, so it runs only when
 * this is empty. Runs in other environments (other lanes, the main lane) use other databases and never block it.
 * This run's own ticket (CP_E2E_ADMIT_TICKET, set by guardTestDbRun) is not "someone else".
 * Fails safe: when the VM cannot be asked, the answer is "someone", so the sweep is skipped.
 */
export function sweepBlockers({ repoDir, url, env = process.env, timeoutMs = SWEEP_QUERY_TIMEOUT_MS }) {
  if (env.E2E_LOADTEST) return ['a load-test run (other runs on this server are not tracked)'];
  try {
    const plan = lockPlan(repoDir, url, env);
    if (plan.mode === 'single') return []; // hosted TEST: one run at a time, and it is this one
    // Bounded (30 s by default): this runs in global teardown, and an unreachable VM means "skip the sweep".
    return otherRunsLive({ envName: plan.env, ticket: env.CP_E2E_ADMIT_TICKET ?? '', env, timeoutMs });
  } catch (err) {
    return [`the admission state could not be read (${err.message})`];
  }
}

export function release(dir, pid = process.pid) {
  const owner = readOwner(dir);
  if (!owner || owner.pid !== pid) return false; // never remove a lock this process does not hold
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * Wait for the lock, bounded. Returns true when held; false when the wait ran out.
 * `log` receives every line meant for the person or agent running the suite.
 */
export function acquire(dir, me, {
  waitMs = DEFAULT_WAIT_MS, pollMs = POLL_MS, log = console.log, now = Date.now,
} = {}) {
  const started = now();
  let lastReport = -Infinity;
  for (;;) {
    if (tryAcquire(dir, me)) return true;
    const owner = readOwner(dir);
    let dirAgeMs = 0;
    try { dirAgeMs = now() - fs.statSync(dir).mtimeMs; } catch { continue; } // released meanwhile
    if (isStale(owner, { dirAgeMs })) {
      log(`[P1541] reclaiming a stale e2e lock from ${describeOwner(owner, now())}`);
      reclaim(dir, owner);
      continue;
    }
    const waited = now() - started;
    // Report before the time check, so even a run that gives up at once says who holds the lock.
    if (now() - lastReport >= REPORT_EVERY_MS) {
      lastReport = now();
      log(`[P1541] TEST database busy: waiting for ${describeOwner(owner, now())}; waited ${Math.round(waited / 1000)}s of ${Math.round(waitMs / 1000)}s`);
    }
    if (waited >= waitMs) return false;
    sleepSync(Math.max(1, Math.min(pollMs, waitMs - waited)));
  }
}

/** One timed GET with curl; returns the HTTP status, or 0 when nothing answered in time. */
function curlStatus(target, anonKey, timeoutMs) {
  try {
    const out = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', String(timeoutMs / 1000),
      '-H', `apikey: ${anonKey}`, target], { stdio: ['ignore', 'pipe', 'ignore'] });
    return Number(out.toString().trim()) || 0;
  } catch (err) {
    return Number(err.stdout?.toString().trim()) || 0;
  }
}

/** One timed read of TEST, retried briefly: the previous run's load needs seconds to drain. */
export function probeTestDb(url, anonKey, { attempts = 3, timeoutMs = 8_000, gapMs = 5_000, get = curlStatus } = {}) {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    const t0 = Date.now();
    const status = get(`${url}/rest/v1/profiles?select=id&limit=1`, anonKey, timeoutMs);
    if (status >= 200 && status < 300) return { ok: true, ms: Date.now() - t0 };
    // P1572: TEST answered and refused (wrong key or URL). That is configuration, not load: no retry.
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) return { ok: false, config: true, reason: `HTTP ${status}` };
    last = status ? `HTTP ${status}` : `no answer in ${timeoutMs / 1000}s`;
    if (i < attempts - 1) sleepSync(gapMs);
  }
  return { ok: false, reason: last };
}

/**
 * Called from playwright.config.ts. Exits the process (code 75) rather than run against a full DB.
 * `probe`, `exit`, `detect` and `register` are test seams; the config passes none of them.
 */
export function guardTestDbRun({
  repoDir, isTestDb, url, anonKey, env = process.env, argv = process.argv, port,
  probe = probeTestDb, exit = code => process.exit(code), detect = detectForArgv, register = true,
}) {
  const skip = lockSkipReason({ argv, env, isTestDb });
  if (skip) return { skipped: skip };
  const plan = lockPlan(repoDir, url, env);
  const branch = (() => {
    try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir }).toString().trim(); } catch { return '?'; }
  })();
  const me = {
    pid: process.pid, processStart: processStart(process.pid), acquiredAt: Date.now(),
    worktree: path.basename(repoDir), branch, port, machine: os.hostname(),
  };
  const waitMs = parseWaitMs(env.E2E_TEST_DB_LOCK_WAIT_MS);
  let release_ = () => {};
  let extra = {};
  let heldDesc = '';
  if (plan.mode === 'vm') {
    const det = detect({ repoDir, argv: argv.slice(2), env });
    let via;
    try {
      via = admitCommand(env); // refuses CP_E2E_ADMIT_CMD without its proof variable
    } catch (err) {
      if (!(err instanceof AdmissionUnavailable)) throw err;
      console.error(`[P1672][infra] ${err.message}`);
      exit(ADMISSION_UNAVAILABLE_EXIT_CODE);
      return { gaveUp: true, unavailable: true };
    }
    if (!via.viaVm) process.stderr.write(`[P1672] E2E admission goes through ${via.label}, NOT the TEST VM: a test seam\n`);
    if (det.exclusive) {
      const why = det.forced ? `${'E2E_SELFHOSTED_EXCLUSIVE'} is set`
        : det.error ? `the run's specs could not be listed (${det.error}), so it is treated as server-wide`
          : `it covers ${det.serverWideFiles.length} server-wide spec(s): ${det.serverWideFiles.slice(0, 4).map(f => path.relative(repoDir, f)).join(', ')}${det.serverWideFiles.length > 4 ? ', ...' : ''}`;
      console.log(`[P1672] this run takes the ${plan.env} environment and runs alone in it (other environments keep running): ${why}`);
    }
    let handle;
    try {
      handle = acquireSlot(me, { envName: plan.env, exclusive: !!det.exclusive, waitMs, env });
    } catch (err) {
      if (!(err instanceof AdmissionUnavailable)) throw err;
      console.error(`[P1672][infra] ${err.message}`);
      exit(ADMISSION_UNAVAILABLE_EXIT_CODE);
      return { gaveUp: true, unavailable: true };
    }
    if (!handle.held) {
      console.error(`[P1672][infra] the self-hosted TEST server has no room for this run in ${plan.env}: held by ${handle.blockers.join('; ') || 'another run'}; gave up after ${Math.round(waitMs / 1000)}s. ` +
        'Not an app failure. Retry later, run the command in the background, or raise E2E_TEST_DB_LOCK_WAIT_MS.');
      exit(LOCK_WAIT_EXIT_CODE);
      return { gaveUp: true };
    }
    release_ = () => handle.release();
    if (register) handle.startHeartbeat();
    env.CP_E2E_ADMIT_TICKET = handle.ticket; // global teardown's sweep gate excludes this run's own ticket
    extra = {
      exclusive: !!det.exclusive, serverWideFiles: det.serverWideFiles ?? [], unknown: !!det.unknown,
      slot: handle.ticket, ticket: handle.ticket, env: plan.env,
    };
    heldDesc = det.exclusive ? `${plan.env} to itself (ticket ${handle.ticket})`
      : `a place in ${plan.env} (${handle.used ?? '?'} of ${handle.capacity ?? '?'} on the VM, ticket ${handle.ticket})`;
  } else {
    const held = acquire(plan.dir, me, { waitMs });
    // Hosted TEST is one run at a time already; the detection here only feeds the one-worker project for the
    // server-wide specs inside this run (decision 2).
    if (held) { const det = detect({ repoDir, argv: argv.slice(2), env }); extra = { serverWideFiles: det.serverWideFiles ?? [], unknown: !!det.unknown }; }
    if (!held) {
      console.error(`[P1541][infra] TEST database is in use by ${describeOwner(readOwner(plan.dir))}; gave up after ${Math.round(waitMs / 1000)}s. ` +
        'Not an app failure. Retry later, run the command in the background, or raise E2E_TEST_DB_LOCK_WAIT_MS.');
      exit(LOCK_WAIT_EXIT_CODE);
      return { gaveUp: true };
    }
    release_ = () => release(plan.dir);
    heldDesc = 'lock';
  }
  env.E2E_TEST_DB_LOCK_HELD = String(process.pid); // only while this process lives (see heldBy)
  // No signal handlers: Playwright handles Ctrl-C itself so teardown runs, then exits, which fires
  // this. A run killed outright leaves the lock behind, and isStale reclaims it (owner gone).
  if (register) process.on('exit', () => release_());

  // E2E_TEST_DB_PROBE_URL exists only to prove the overloaded path against a host that never answers.
  const result = probe(env.E2E_TEST_DB_PROBE_URL || url, anonKey);
  if (!result.ok && result.config) {
    console.error(`[P1541] TEST database refused the request (${result.reason}): check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ` +
      'A configuration error, not overload: fix it before running again.');
    exit(1);
    return { gaveUp: true };
  }
  if (!result.ok) {
    console.error(`[P1541][infra] TEST database is overloaded (${result.reason}); not running the suite. Not an app failure.`);
    exit(LOCK_WAIT_EXIT_CODE);
    return { gaveUp: true };
  }
  console.log(`[P1541] e2e ${heldDesc} held by ${me.worktree} (${branch}); TEST database answered in ${result.ms}ms`);
  return { held: true, ...extra };
}
