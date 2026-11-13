/**
 * e2e-slot-lock.mjs — the self-hosted TEST server's E2E admission, decided on the VM (P1672; was P1607's
 * git-dir slot lock).
 *
 * WHY THE VM. P1607's slots were directories in one checkout's git common dir and P1541's lock skipped itself
 * whenever CI was set, so a run from another machine or a CI job was never held off. CPU is one pool for the whole
 * VM; databases are per environment (the main lane and each lane, P1672). So admission now lives in
 * scripts/selfhosted/lanes/vm/admit.py on the VM, and this module is only its client:
 *
 *   - ONE VM-WIDE CAPACITY across every environment. Default 3 (P1607's load test: 3 runs kept the 4-CPU server near
 *     half its CPU; a 4th reached its limit). The one setting is `capacity=N` in admit.conf on the VM;
 *     SELFHOSTED_SLOT_LIMIT below mirrors admit.py's default for documentation and tests. A client can no longer
 *     raise or lower it for itself (E2E_SELFHOSTED_SLOTS is gone): a per-client limit on a shared pool is no limit.
 *   - EXCLUSIVITY PER ENVIRONMENT. A run whose specs change server-wide state runs alone in ITS environment
 *     (env = process.env.CP_TEST_LANE || 'main'); runs in other environments keep going, because they use other
 *     databases. A waiting exclusive run holds a claim that keeps new runs out of its environment (no starvation).
 *   - ONE DEV-SERVER PORT PER MACHINE: a run whose machine and port match a live run waits (P1234/P1607).
 *   - A TICKET, not a process id, is the proof of admission. It expires after DEFAULT_TTL_S unless heartbeated, so a
 *     run killed outright frees its place within the TTL (P1607 reclaimed by noticing the pid had died; the VM cannot
 *     see a Mac's pids).
 *
 * TRANSPORT. Every call is `python3 scripts/selfhosted/lane.py vm -- admit...` (IAP SSH to lanectl). A hermetic test
 * sets CP_E2E_ADMIT_CMD to another command (`python3 <repo>/scripts/selfhosted/lanes/vm/admit.py` with
 * CP_ADMIT_STATE_DIR=<tmp>); it is split on whitespace. There is NO CI skip and no fallback: a VM that cannot be
 * reached, or an answer that cannot be read, throws AdmissionUnavailable and the run does not start.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** admit.py's default VM-wide capacity. The live value is `capacity=N` in admit.conf on the VM. */
export const SELFHOSTED_SLOT_LIMIT = 3;
export const ADMIT_EXIT_REFUSED = 4;   // heartbeat for a ticket the VM no longer holds
export const ADMIT_EXIT_TIMEOUT = 5;   // wait ran out: busy, not broken
export const DEFAULT_TTL_S = 240;      // a dead run's place comes back within this
export const HEARTBEAT_EVERY_MS = 60_000;
const CHUNK_WAIT_S = 60;               // one IAP call waits at most this long on the VM, then reports and asks again
const CALL_SLACK_S = 120;              // IAP SSH set-up on top of the wait
const DEFAULT_WAIT_MS = 10 * 60_000;

// path.dirname, not `new URL('..', import.meta.url)`: Vite rewrites the latter into an asset URL under vitest.
const LANE_PY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../selfhosted/lane.py');

/** Admission could not be decided (VM unreachable, lanectl missing, garbled answer). The run must not start. */
export class AdmissionUnavailable extends Error {}

/** The environment this run uses: the claimed lane (set by the resolver's vite-env overrides) or the main lane. */
export function admitEnv(env = process.env) {
  const v = (env.CP_TEST_LANE ?? '').trim();
  return v || 'main';
}

/**
 * CP_E2E_ADMIT_CMD sends admission somewhere other than the VM, so it is honoured only together with
 * CP_E2E_ADMIT_CMD_PROOF=hermetic-test (the hermetic tests set both). Set alone, or with any other value, it is refused
 * (AdmissionUnavailable): a stray export must never quietly take a real run off the VM's admission.
 */
export const ADMIT_CMD_PROOF_VALUE = 'hermetic-test';

/** The command that reaches admit.py: the VM through lane.py, or CP_E2E_ADMIT_CMD (hermetic tests, with the proof). */
export function admitCommand(env = process.env) {
  const custom = (env.CP_E2E_ADMIT_CMD ?? '').trim();
  if (custom) {
    if (env.CP_E2E_ADMIT_CMD_PROOF !== ADMIT_CMD_PROOF_VALUE) {
      throw new AdmissionUnavailable(`CP_E2E_ADMIT_CMD is set (${custom}) without CP_E2E_ADMIT_CMD_PROOF=${ADMIT_CMD_PROOF_VALUE}. ` +
        'It is a hermetic-test seam that takes admission off the TEST VM, so it is refused: unset CP_E2E_ADMIT_CMD for a real run. ' +
        'The run was NOT started.');
    }
    return { argv: custom.split(/\s+/), viaVm: false, label: `CP_E2E_ADMIT_CMD (${custom})` };
  }
  return { argv: ['python3', LANE_PY, 'vm', '--'], viaVm: true, label: 'the TEST VM (lane.py vm)' };
}

const childEnv = env => (env === process.env ? process.env : { ...process.env, ...env });

/** One synchronous call. Never throws on a non-zero exit: the caller reads `status`. */
export function runAdmit(args, { env = process.env, timeoutMs = (CALL_SLACK_S * 1000) } = {}) {
  const { argv } = admitCommand(env);
  const r = spawnSync(argv[0], [...argv.slice(1), ...args], {
    stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(env), timeout: timeoutMs, encoding: 'utf8',
  });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

function lastJson(text) {
  const line = text.trim().split('\n').filter(Boolean).pop();
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
}

function failure(what, r, env) {
  const how = r.error ? r.error.message : r.signal ? `killed by ${r.signal}` : `exit ${r.status}`;
  const tail = r.stderr.trim().split('\n').slice(-3).join(' / ');
  const via = admitCommand(env);
  const hint = via.viaVm
    ? ' Check that gcloud is logged in and the VM answers (python3 scripts/selfhosted/lane.py vm -- admit-status), and that lanectl is installed with admit support (lane.py vm-install).'
    : '';
  return new AdmissionUnavailable(`E2E admission could not ${what} through ${via.label} (${how})${tail ? `: ${tail}` : ''}. ` +
    `The run was NOT started: an unadmitted run could overload the shared TEST server.${hint}`);
}

export function holderText(me) {
  return `${me.worktree} (${me.branch}, pid ${me.pid}${me.machine ? ` on ${me.machine}` : ''})`;
}

/**
 * What a run does when the VM says its ticket is gone: it is no longer admitted, so another run (an exclusive one in
 * this environment, or one past the capacity) may already be in. It must stop, never continue unadmitted.
 *
 * Mechanism: SIGINT to this process, which in a Playwright run is the main runner (the config, and so this module,
 * loads there). Playwright 1.64 treats SIGINT as an interrupt (runner SigIntWatcher): it stops the workers, runs
 * global teardown, and exits 130 (cli/testActions.js: "interrupted" maps to 130). If the process is still alive
 * after LOST_BACKSTOP_MS (the signal was swallowed, or teardown hangs), it exits LOST_TICKET_EXIT_CODE outright.
 */
export const LOST_TICKET_EXIT_CODE = 75; // [infra], not an app failure: report it, never retry-loop it
export const LOST_BACKSTOP_MS = 120_000;
export function terminateLostRun(ticket, { why = 'the VM no longer holds it (expired or revoked)', pid = process.pid, backstopMs = LOST_BACKSTOP_MS } = {}) {
  process.stderr.write(`[P1672][infra] admission ticket ${ticket} was lost: ${why}, ` +
    'so this run is no longer admitted and another run may already be using its environment. Stopping the run. Not an app failure.\n');
  const backstop = setTimeout(() => process.exit(LOST_TICKET_EXIT_CODE), backstopMs);
  backstop.unref();
  try { process.kill(pid, 'SIGINT'); } catch { process.exit(LOST_TICKET_EXIT_CODE); }
}

/** A heartbeat subprocess is killed after this long, so a hung SSH never stalls the next beat. */
export const HEARTBEAT_TIMEOUT_MS = 45_000;

/**
 * How long before the ticket's TTL runs out, with no heartbeat having reached the VM, the run gives itself up: a
 * quarter of the TTL, at most 60 s (TTL 240 s: after 180 s without a successful beat). By then the VM is about to expire
 * the ticket, or has (clocks differ), and the run must not carry on unadmitted.
 */
export const unreachableLimitMs = ttlS => ttlS * 1000 - Math.min(60_000, (ttlS * 1000) / 4);

/**
 * Keep a ticket alive while the run lasts. Asynchronous and unref'd, so it never holds the process open. Returns stop().
 * The run is stopped (onLost(ticket, why), terminateLostRun by default) when
 *   - the VM refuses a heartbeat (exit 4: ticket expired or unknown), or
 *   - no heartbeat has REACHED the VM for unreachableLimitMs(ttlS) since admission or the last successful beat
 *     (SSH errors, timeouts, a VM that is down): the VM expires the ticket at its TTL whether or not we hear about it.
 * A shorter outage is retried on the next beat. `admittedAt` is when the VM last extended the ticket.
 */
function startHeartbeat(ticket, { env, ttlS, everyMs, admittedAt, timeoutMs = HEARTBEAT_TIMEOUT_MS, onLost = terminateLostRun, now = Date.now }) {
  let inflight = false;
  let stopped = false;
  let lastOk = admittedAt;
  const limit = unreachableLimitMs(ttlS);
  const lose = (why) => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    onLost(ticket, why);
  };
  const checkReach = () => {
    const silent = now() - lastOk;
    if (silent >= limit) {
      lose(`no heartbeat has reached the VM for ${Math.round(silent / 1000)}s and the ticket's TTL is ${ttlS}s, so the VM expires it`);
    }
  };
  const beat = () => {
    if (stopped) return;
    checkReach();
    if (inflight || stopped) return;
    let argv;
    try { ({ argv } = admitCommand(env)); } catch { checkReach(); return; }
    inflight = true;
    const c = spawn(argv[0], [...argv.slice(1), 'admit-heartbeat', '--ticket', ticket, '--ttl', String(ttlS)],
      { stdio: 'ignore', env: childEnv(env), timeout: timeoutMs, killSignal: 'SIGKILL' });
    c.on('error', () => { inflight = false; checkReach(); });
    c.on('exit', (code) => {
      inflight = false;
      if (code === 0) { lastOk = now(); return; }
      if (code === ADMIT_EXIT_REFUSED) { lose('the VM no longer holds it (expired or revoked)'); return; }
      checkReach();
    });
    c.unref();
  };
  const timer = setInterval(beat, everyMs);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}

function makeHandle(ans, { env, exclusive, ttlS, log, admittedAt }) {
  let done = false;
  let stop = () => {};
  return {
    held: true, exclusive, ticket: ans.ticket, env: ans.env, used: ans.used, capacity: ans.capacity,
    slot: ans.ticket, // P1607 callers read `slot`; it is now the ticket
    startHeartbeat({ everyMs = HEARTBEAT_EVERY_MS, timeoutMs = HEARTBEAT_TIMEOUT_MS, onLost = terminateLostRun } = {}) {
      stop();
      stop = startHeartbeat(ans.ticket, { env, ttlS, everyMs, timeoutMs, onLost, admittedAt });
    },
    release() {
      if (done) return;
      done = true;
      stop();
      const r = runAdmit(['admit-release', '--ticket', ans.ticket], { env, timeoutMs: 60_000 });
      if (r.status !== 0) {
        log(`[P1672] could not release admission ticket ${ans.ticket} (${r.error?.message ?? `exit ${r.status}`}); the VM frees it within ${ttlS}s.`);
      }
    },
  };
}

/**
 * Wait, bounded, for admission. Returns a handle ({ held: true, ticket, release(), startHeartbeat() }) or
 * { held: false, blockers } when the wait ran out. Throws AdmissionUnavailable when the VM cannot decide.
 * The first attempt never waits, so a busy server is reported at once with every holder named; after that each
 * call waits up to CHUNK_WAIT_S on the VM and the wait is reported after each one.
 */
export function acquireSlot(me, {
  envName = 'main', exclusive = false, waitMs = DEFAULT_WAIT_MS, ttlS = DEFAULT_TTL_S, weight = 1,
  log = console.log, env = process.env, now = Date.now,
} = {}) {
  const started = now();
  let first = true;
  for (;;) {
    const remainingS = Math.max(0, Math.ceil((waitMs - (now() - started)) / 1000));
    const chunk = first ? 0 : Math.min(remainingS, CHUNK_WAIT_S);
    first = false;
    const args = ['admit', '--env', envName, '--mode', exclusive ? 'exclusive' : 'shared', '--holder', holderText(me),
      '--ttl', String(ttlS), '--wait', String(chunk), '--weight', String(weight)];
    if (me.machine && me.port) args.push('--machine', me.machine, '--port', String(me.port));
    const r = runAdmit(args, { env, timeoutMs: (chunk + CALL_SLACK_S) * 1000 });
    if (r.status === 0) {
      // The reach window counts from the RETURN of the successful call, not its send: a call can wait on the VM for up
      // to CHUNK_WAIT_S before admission, and counting that wait would spend a healthy run's window before it starts.
      // The VM started the TTL at admission, a little before this return; the margin in unreachableLimitMs (TTL/4, at
      // most 60 s) covers that return latency.
      const admittedAt = Date.now();
      const ans = lastJson(r.stdout);
      if (!ans || typeof ans.ticket !== 'string' || !ans.ticket) throw failure('read the admission answer', { ...r, stderr: `unreadable answer: ${r.stdout.trim().slice(0, 200)}` }, env);
      return makeHandle(ans, { env, exclusive, ttlS, log, admittedAt });
    }
    if (r.status !== ADMIT_EXIT_TIMEOUT) throw failure('admit this run', r, env);
    const ans = lastJson(r.stdout);
    const blockers = Array.isArray(ans?.blockers) && ans.blockers.length ? ans.blockers : [r.stderr.trim() || 'another run'];
    const waited = now() - started;
    const what = exclusive ? `${envName} to itself (this run changes server-wide state)` : `a place on the VM in ${envName}`;
    log(`[P1672] self-hosted TEST busy: waiting for ${what}; held by ${blockers.join('; ')}; waited ${Math.round(waited / 1000)}s of ${Math.round(waitMs / 1000)}s`);
    if (waited >= waitMs || remainingS === 0) return { held: false, blockers };
  }
}

/**
 * Every other run in `envName`, as descriptions (empty = nobody else): admitted runs and waiting exclusive claims,
 * except this run's own ticket. Runs in other environments use other databases and are not listed.
 * Throws AdmissionUnavailable when the VM cannot be asked (the caller treats that as "someone"). The query is bounded
 * by `timeoutMs` (SWEEP_QUERY_TIMEOUT_MS): it runs in global teardown, which an unreachable VM must not hold up.
 */
export const SWEEP_QUERY_TIMEOUT_MS = 30_000;
export function otherRunsLive({ envName = 'main', ticket = '', env = process.env, timeoutMs = SWEEP_QUERY_TIMEOUT_MS } = {}) {
  const r = runAdmit(['admit-status', '--json'], { env, timeoutMs });
  if (r.status !== 0) throw failure('read who is running', r, env);
  const ans = lastJson(r.stdout);
  if (!ans || !Array.isArray(ans.tickets)) throw failure('read who is running', { ...r, stderr: 'unreadable status' }, env);
  return ans.tickets
    .filter(t => t.env === envName && t.ticket !== ticket)
    .map(t => `${t.holder} (${t.phase === 'waiting' ? 'waiting to run alone' : t.mode} in ${t.env})`);
}

/**
 * The global worker count when the server-wide specs could NOT be moved into their own one-worker project
 * (the command names a project). Any server-wide spec, even one, runs everything on one worker: with
 * fullyParallel the tests of a single file are spread over workers too. When the specs are not known (forced
 * exclusivity, failed detection) the answer is one worker as well.
 */
export function workersFor({ requested, serverWideCount, unknown = false, fallback }) {
  if (unknown || serverWideCount >= 1) return 1;
  const n = Number.parseInt(requested ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
