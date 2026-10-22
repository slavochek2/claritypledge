/**
 * e2e-test-db-lock.mjs — P1541: one e2e run at a time against the shared TEST database.
 *
 * TEST is the smallest Supabase compute size and every Claude session on this machine runs
 * Playwright against it. Two full runs at once took it down (2026-10-21). This lock makes the
 * second run wait in line, says who holds it, and never hangs forever.
 *
 * Lifecycle (measured on Playwright 1.64, not assumed): the config is evaluated in the main runner
 * BEFORE the dev server starts and before global setup, and again in every worker. So the lock is
 * taken at config load in the main runner only (workers, --list, --ui and CI skip it), and released
 * when that process exits, which is after global teardown and its user sweep.
 *
 * The lock is a directory (mkdir is atomic) in the git common dir, so every worktree shares it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const LOCK_WAIT_EXIT_CODE = 75; // EX_TEMPFAIL: try again later, not an app failure
const LOCK_NAME = 'e2e-test-db.lock';
const DEFAULT_WAIT_MS = 10 * 60_000;
const POLL_MS = 5_000;
const REPORT_EVERY_MS = 30_000;

/** Why this invocation must not take the lock, or null when it must. */
export function lockSkipReason({ argv = process.argv, env = process.env, isTestDb }) {
  if (env.TEST_WORKER_INDEX !== undefined || env.TEST_PARALLEL_INDEX !== undefined) return 'worker process';
  if (env.E2E_TEST_DB_LOCK_HELD && heldBy(env.E2E_TEST_DB_LOCK_HELD)) return 'lock already held by the parent run';
  if (env.CI) return 'CI runs on its own machine';
  if (!isTestDb) return 'not the TEST database';
  const args = argv.slice(2);
  if (args[0] !== 'test') return 'not a test run'; // `test` is a subcommand, never the default (Playwright 1.64)
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

export function lockDirFor(repoDir) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoDir })
    .toString().trim();
  return path.join(common, LOCK_NAME);
}

function processStart(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null;
  } catch {
    return null;
  }
}

function readOwner(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

const OWNERLESS_GRACE_MS = 10_000;

/** Is the process alive? EPERM means it exists but we may not signal it: alive, never "gone". */
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

/**
 * A lock is stale only when its owner has ended: the process is gone, or its PID now belongs to a
 * different process (start time differs). There is no age limit: a live run is never evicted
 * (Codex review), so a hung run makes waiters give up and name it rather than overlap it. When the
 * start time cannot be read, the owner counts as alive: in doubt, wait.
 * A lock with no readable owner is stale only once it is older than a grace window: the owner
 * file is written inside the directory before it is published, so a missing one means a crash.
 */
export function isStale(owner, { alive = isAlive, startOf = processStart, dirAgeMs = Infinity } = {}) {
  if (!owner || !owner.pid) return dirAgeMs > OWNERLESS_GRACE_MS;
  if (!alive(owner.pid)) return true;
  const start = startOf(owner.pid);
  return !!start && !!owner.processStart && start !== owner.processStart;
}

export function describeOwner(owner, now = Date.now()) {
  if (!owner) return 'an unknown run';
  const mins = Math.max(0, Math.round((now - owner.acquiredAt) / 60_000));
  return `${owner.worktree} (${owner.branch}, pid ${owner.pid}, running ${mins} min)`;
}

/**
 * Publish a fully written lock atomically: build it in a private sibling directory, then rename it
 * into place. rename(2) onto an existing non-empty directory fails, so exactly one run wins, and no
 * one ever sees the lock without its owner file.
 */
function tryAcquire(dir, me) {
  const staging = `${dir}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging, 'owner.json'), JSON.stringify(me));
  try {
    fs.renameSync(staging, dir);
    return true;
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST' || err.code === 'ENOTDIR') return false;
    throw err;
  }
}

const sameOwner = (a, b) => !!a && !!b && a.pid === b.pid && a.acquiredAt === b.acquiredAt;

/**
 * Take a stale lock out of the way without touching a lock someone else took meanwhile: move it
 * aside (atomic, only one mover wins), then check that what moved is the lock judged stale. If a
 * fresh lock was moved by mistake, put it back.
 */
export function reclaim(dir, stale) {
  const trash = `${dir}.${process.pid}.${Date.now()}.stale`;
  try { fs.renameSync(dir, trash); } catch { return; } // someone else moved or released it first
  const moved = readOwner(trash);
  if (stale && !sameOwner(moved, stale)) {
    try { fs.renameSync(trash, dir); return; } catch { /* a new lock is already in place; ours stays trashed */ }
  }
  fs.rmSync(trash, { recursive: true, force: true });
}

export function release(dir, pid = process.pid) {
  const owner = readOwner(dir);
  if (!owner || owner.pid !== pid) return false; // never remove a lock this process does not hold
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

// Synchronous on purpose: the guard runs at config load, and a top-level await breaks every tool
// that loads playwright.config.ts as CommonJS (Vite's loader in p1480-worktree-ports.test.ts).
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

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
    last = status ? `HTTP ${status}` : `no answer in ${timeoutMs / 1000}s`;
    if (i < attempts - 1) sleepSync(gapMs);
  }
  return { ok: false, reason: last };
}

/** Called from playwright.config.ts. Exits the process (code 75) rather than run against a full DB. */
export function guardTestDbRun({ repoDir, isTestDb, url, anonKey, env = process.env, argv = process.argv }) {
  const skip = lockSkipReason({ argv, env, isTestDb });
  if (skip) return { skipped: skip };
  const dir = lockDirFor(repoDir);
  const branch = (() => {
    try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir }).toString().trim(); } catch { return '?'; }
  })();
  const me = {
    pid: process.pid, processStart: processStart(process.pid), acquiredAt: Date.now(),
    worktree: path.basename(repoDir), branch,
  };
  const waitMs = parseWaitMs(env.E2E_TEST_DB_LOCK_WAIT_MS);
  const held = acquire(dir, me, { waitMs });
  if (!held) {
    console.error(`[P1541][infra] TEST database is in use by ${describeOwner(readOwner(dir))}; gave up after ${Math.round(waitMs / 1000)}s. ` +
      'Not an app failure. Retry later, run the command in the background, or raise E2E_TEST_DB_LOCK_WAIT_MS.');
    process.exit(LOCK_WAIT_EXIT_CODE);
  }
  env.E2E_TEST_DB_LOCK_HELD = String(process.pid); // only while this process lives (see heldBy)
  // No signal handlers: Playwright handles Ctrl-C itself so teardown runs, then exits, which fires
  // this. A run killed outright leaves the lock behind, and isStale reclaims it (owner gone).
  process.on('exit', () => release(dir));

  // E2E_TEST_DB_PROBE_URL exists only to prove the overloaded path against a host that never answers.
  const probe = probeTestDb(env.E2E_TEST_DB_PROBE_URL || url, anonKey);
  if (!probe.ok) {
    console.error(`[P1541][infra] TEST database is overloaded (${probe.reason}); not running the suite. Not an app failure.`);
    process.exit(LOCK_WAIT_EXIT_CODE);
  }
  console.log(`[P1541] e2e lock held by ${me.worktree} (${branch}); TEST database answered in ${probe.ms}ms`);
  return { held: true };
}
