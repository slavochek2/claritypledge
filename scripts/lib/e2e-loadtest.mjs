/**
 * e2e-loadtest.mjs — P1607: the switch that lets the load driver (scripts/e2e-load-test.mjs) run several
 * Playwright runs from ONE checkout at the same time, on the self-hosted TEST server only.
 *
 * Why it exists: the limit of the slot lock (e2e-slot-lock.mjs) has to be measured by real runs, and a
 * measurement must not be held up by the lock it is measuring, nor by another worktree's older-script run.
 * What the switch does: the run skips the lock, takes the checkout's port plus its index, and writes its
 * output to its own directories. It never touches any lock directory.
 *
 * It is OFF unless E2E_LOADTEST=<1-9> is set, and it refuses to start unless
 *   1. the database URL is the self-hosted TEST server (never hosted TEST, never anything else), and
 *   2. E2E_LOADTEST_DRIVER_PID names a live process: only the driver sets it, by hand it is a deliberate act.
 * A refusal throws at config load, before anything connects.
 */
import { execFileSync } from 'node:child_process';
import { testRefForUrl, SELFHOSTED_TEST_REF } from './test-target.mjs';
import { WORKLOAD } from './e2e-load-workload.mjs';

/** The run index from the environment: null when the switch is off; throws on a malformed value. */
export function loadTestIndex(env = process.env) {
  const raw = env.E2E_LOADTEST;
  if (raw === undefined || raw === '') return null;
  if (!/^[1-9]$/.test(raw)) throw new Error(`[P1607] E2E_LOADTEST must be a single digit 1-9, got "${raw}"`);
  return Number(raw);
}

const psField = (field, pid) => {
  try { return execFileSync('ps', ['-o', `${field}=`, '-p', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
};
const parentOf = pid => Number(psField('ppid', pid)) || 0;
const commandOf = pid => psField('command', pid);

/** Is `ancestor` one of the processes above `pid` (its real parent chain)? */
export function isAncestor(ancestor, pid, ppidOf = parentOf) {
  let cur = pid;
  for (let i = 0; i < 40 && cur > 1; i++) {
    cur = ppidOf(cur);
    if (cur === ancestor) return true;
  }
  return false;
}

/** The spec files a command line selects: the plain words after `test`. */
export function selectedSpecs(argv) {
  const i = argv.indexOf('test');
  return i < 0 ? null : argv.slice(i + 1).filter(a => !a.startsWith('-'));
}

/**
 * Why this load-test run must not start, or null. Every condition must hold:
 *  1. the database is the self-hosted TEST server;
 *  2. E2E_LOADTEST_DRIVER_PID names a live process that is an ANCESTOR of this one (its real parent chain)
 *     and whose command line is the load driver, so the switch cannot be set by hand in a shell;
 *  3. in the main runner (`argv` given), the specs selected are exactly the driver's fixed workload.
 * What an agent could still do: write its own script called e2e-load-test.mjs that starts Playwright with the
 * workload's file names. That is a deliberate forgery of the driver, not a slip; it is stated here, not closed.
 */
export function loadTestRefusal({
  url, env = process.env, argv = null, pid = process.pid, ancestorCheck = true,
  ppidOf = parentOf, cmdOf = commandOf, workload = WORKLOAD,
}) {
  if (testRefForUrl(url ?? '', env) !== SELFHOSTED_TEST_REF) {
    return 'E2E_LOADTEST only runs against the self-hosted TEST server; this URL is not it (hosted TEST and production are never load tested)';
  }
  const driver = Number(env.E2E_LOADTEST_DRIVER_PID);
  if (!driver) return 'E2E_LOADTEST is set by the load driver (scripts/e2e-load-test.mjs), which also sets E2E_LOADTEST_DRIVER_PID';
  try { process.kill(driver, 0); } catch (err) {
    if (err.code !== 'EPERM') return `E2E_LOADTEST_DRIVER_PID ${driver} is not a live process: the load driver is not running`;
  }
  if (!/e2e-load-test\.mjs/.test(cmdOf(driver))) return `E2E_LOADTEST_DRIVER_PID ${driver} is not the load driver (scripts/e2e-load-test.mjs)`;
  if (ancestorCheck && !isAncestor(driver, pid, ppidOf)) return `the load driver (pid ${driver}) is not a parent of this run: E2E_LOADTEST is for the driver's own runs`;
  if (argv) {
    const got = selectedSpecs(argv);
    const ok = got && got.length === workload.length && workload.every(f => got.includes(f));
    if (!ok) return 'a load-test run covers exactly the driver\'s fixed workload and nothing else';
  }
  return null;
}

/** The checkout's port plus the run index, so concurrent runs from one checkout never share a dev server. */
export const loadTestPort = (basePort, index) => basePort + index;
