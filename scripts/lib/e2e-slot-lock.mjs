/**
 * e2e-slot-lock.mjs — P1607: the self-hosted TEST server admits a fixed number of e2e runs at once.
 *
 * Hosted TEST stays at one run at a time (P1541's measured limit; see e2e-test-db-lock.mjs). The
 * self-hosted server is a different, larger machine, so its lock is a set of slots:
 *
 *   e2e-test-db-selfhosted.slot-<n>.lock     one directory per running one-slot run (atomic, like P1541's)
 *   e2e-test-db-selfhosted.exclusive.lock    the claim of a run that touches server-wide state
 *   e2e-test-db-selfhosted.lock              the OLD single lock, see "Compatibility"
 *
 * THE LIMIT is SELFHOSTED_SLOT_LIMIT below, the one setting. E2E_SELFHOSTED_SLOTS=<n> overrides it for
 * one run (the load test uses this). Slots are counted, not indexed: a checkout with a lower limit
 * still sees slots held under a higher one.
 *
 * ADMISSION is serialized by a short mutex directory (e2e-test-db-selfhosted.admission.lock) held only for the
 * scan-and-take of one attempt: scan the claim, the slots and the old lock, decide, take, release. Every
 * decision therefore sees every earlier decision, so occupied never exceeds the limit through a race between
 * two new runs (an earlier version re-counted after taking and could admit an older-started waiter beside two
 * newer holders). A mutex holder that dies is reclaimed like any other owner.
 *
 * EXCLUSIVE runs (they change server-wide state, so they cannot overlap anything): take the claim
 * first, which stops new one-slot runs entering while the slot holders drain (otherwise a stream of
 * one-slot runs starves it), then run only when no slot is held. A one-slot run takes its slot and THEN
 * re-checks the claim (the exclusive run does the reverse: claim, then look at slots), so whichever
 * order a race falls in, one of them sees the other and the one-slot run backs off.
 *
 * ONE DEV-SERVER PORT PER RUN: a shared dev server dies with the run that started it (P1234), so a run
 * whose port is already held waits.
 *
 * COMPATIBILITY (older worktrees run their own copy of this script against the single old directory):
 *  - A new run NEVER writes the old directory (no create, no rewrite, no reclaim). It only reads it.
 *  - A live owner of the old directory counts as ONE occupied slot for a one-slot run, and as the whole
 *    server for an exclusive run, so new runs wait for it. A stale old directory is ignored and left alone.
 *  - Known limitation, accepted for the switch: an older script does not read the new slots, so an
 *    older-script run can start while new runs hold slots. The one exposure that matters is an older-script
 *    run starting during an EXCLUSIVE run (server-wide specs then overlap it). The load test ran 5 runs at
 *    once on the server without a failure, so the overlap is tolerable for the time the older scripts last;
 *    it ends when every worktree runs this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  readOwner, isStale, describeOwner, tryAcquire, reclaim, sameOwner, sleepSync, uniq,
} from './e2e-lock-primitives.mjs';

/**
 * The one setting: how many one-slot runs may share the self-hosted server. Set from the load test in the
 * P1607 spec: 3 runs at once kept the 4-CPU server near half its CPU; a 4th reached its limit. Re-measure with
 * scripts/e2e-load-test.mjs when the machine changes.
 */
export const SELFHOSTED_SLOT_LIMIT = 3;
export const MAX_SLOTS = 16;
const POLL_MS = 5_000;
const REPORT_EVERY_MS = 30_000;
const DEFAULT_WAIT_MS = 10 * 60_000;

/** The limit for this run: E2E_SELFHOSTED_SLOTS when it is a whole number from 1 to MAX_SLOTS, else the default. */
export function slotLimit(env = process.env) {
  const raw = env.E2E_SELFHOSTED_SLOTS;
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return SELFHOSTED_SLOT_LIMIT;
  const n = Number(raw);
  return n >= 1 && n <= MAX_SLOTS ? n : SELFHOSTED_SLOT_LIMIT;
}

export function slotPaths(base) {
  return {
    slot: i => path.join(base, `e2e-test-db-selfhosted.slot-${i}.lock`),
    claim: path.join(base, 'e2e-test-db-selfhosted.exclusive.lock'),
    admission: path.join(base, 'e2e-test-db-selfhosted.admission.lock'),
    legacy: path.join(base, 'e2e-test-db-selfhosted.lock'),
  };
}

/**
 * Everyone else on the server, read-only: live slot holders, another run's exclusive claim, a live holder of
 * the old single lock. Descriptions, empty when nobody. Nothing is reclaimed or written.
 */
export function otherRunsLive(paths, { pid = process.pid, now = Date.now } = {}) {
  const out = [];
  const mine = o => o && o.pid === pid;
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const o = peekLive(paths.slot(i), now);
    if (o && !mine(o)) out.push(describeHolder(o, 'slot', now()));
  }
  const claim = peekLive(paths.claim, now);
  if (claim && !mine(claim)) out.push(describeHolder(claim, 'claim', now()));
  const legacy = peekLive(paths.legacy, now);
  if (legacy && !mine(legacy)) out.push(describeHolder(legacy, 'legacy', now()));
  return out;
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

function describeHolder(owner, kind, now) {
  if (!owner || owner.unknown) return 'a run whose lock cannot be read yet';
  const base = describeOwner(owner, now).slice(0, -1); // drop ")"
  const parts = [base];
  if (owner.port) parts.push(`port ${owner.port}`);
  if (kind === 'claim') parts.push(owner.phase === 'draining' ? 'waiting to run alone' : 'running alone');
  if (kind === 'legacy') parts.push('older checkout holding the whole server');
  return `${parts.join(', ')})`;
}

/**
 * The live owner of a lock directory, or null when it is absent. A stale lock is reclaimed first
 * (and logged), so a dead run never blocks anyone. An unreadable owner inside the grace window counts
 * as a live, unknown holder.
 */
function liveOwner(dir, label, log, now) {
  for (let i = 0; i < 3; i++) {
    let ageMs;
    try { ageMs = now() - fs.statSync(dir).mtimeMs; } catch { return null; }
    const owner = readOwner(dir);
    if (!isStale(owner, { dirAgeMs: ageMs })) return owner ?? { unknown: true };
    log(`[P1607] reclaiming a stale e2e ${label} from ${describeOwner(owner, now())}`);
    reclaim(dir, owner);
  }
  return null;
}

function liveSlots(paths, log, now) {
  const out = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const o = liveOwner(paths.slot(i), 'slot', log, now);
    if (o) out.push({ i, owner: o });
  }
  return out;
}

/** Replace owner.json inside a held directory atomically (same filesystem rename). */
function rewriteOwner(dir, owner) {
  const tmp = path.join(dir, `owner.json.${uniq()}`);
  fs.writeFileSync(tmp, JSON.stringify(owner));
  fs.renameSync(tmp, path.join(dir, 'owner.json'));
}

function removeIfMine(dir, me) {
  if (!sameOwner(readOwner(dir), me)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function makeHandle(paths, me, { exclusive, slot }) {
  let done = false;
  return {
    held: true, exclusive, slot,
    release() {
      if (done) return;
      done = true;
      if (exclusive) removeIfMine(paths.claim, me); else removeIfMine(paths.slot(slot), me);
    },
  };
}

/**
 * The live owner of a directory this run must only READ (the old single lock): null when absent or when its
 * owner has ended. Nothing is moved, created or removed.
 */
function peekLive(dir, now) {
  let ageMs;
  try { ageMs = now() - fs.statSync(dir).mtimeMs; } catch { return null; }
  const owner = readOwner(dir);
  return isStale(owner, { dirAgeMs: ageMs }) ? null : (owner ?? { unknown: true });
}

/** One attempt. Returns { handle } or { blockers: string[] } (empty when it lost a race and should simply retry). */
function attempt(paths, me, { limit, exclusive, log, now, onScanned }) {
  const blockers = [];
  const legacy = peekLive(paths.legacy, now);
  const legacyDesc = legacy ? describeHolder(legacy, 'legacy', now()) : null;

  const claim = liveOwner(paths.claim, 'exclusive claim', log, now);
  const otherClaim = !!claim && !sameOwner(claim, me);
  if (otherClaim) blockers.push(describeHolder(claim, 'claim', now()));

  if (exclusive) {
    if (otherClaim) return { blockers };
    if (!claim && !tryAcquire(paths.claim, { ...me, exclusive: true, phase: 'draining' })) return { blockers: [] };
    const slots = liveSlots(paths, log, now);
    for (const s of slots) blockers.push(describeHolder(s.owner, 'slot', now()));
    if (legacyDesc) blockers.push(legacyDesc);
    if (legacy || slots.length) return { blockers };
    rewriteOwner(paths.claim, { ...me, exclusive: true, phase: 'running' });
    return { handle: makeHandle(paths, me, { exclusive: true, slot: 0 }) };
  }

  if (otherClaim) return { blockers };
  const slots = liveSlots(paths, log, now);
  const samePort = slots.filter(s => me.port && s.owner.port === me.port);
  if (samePort.length) {
    for (const s of samePort) blockers.push(`${describeHolder(s.owner, 'slot', now())} (same dev-server port ${me.port}: a shared server dies with the run that started it)`);
    return { blockers };
  }
  const legacyCount = legacy ? 1 : 0; // an older-script run holds one place
  if (slots.length + legacyCount >= limit) {
    for (const s of slots) blockers.push(describeHolder(s.owner, 'slot', now()));
    if (legacyDesc) blockers.push(legacyDesc);
    return { blockers };
  }
  const used = new Set(slots.map(s => s.i));
  let mine = 0;
  for (let i = 1; i <= MAX_SLOTS; i++) if (!used.has(i)) { mine = i; break; }
  onScanned?.(); // test seam: runs between the scan and the take, inside the admission mutex
  if (!mine || !tryAcquire(paths.slot(mine), me)) return { blockers: [] };
  return { handle: makeHandle(paths, me, { exclusive: false, slot: mine }) };
}

const ADMISSION_WAIT_MS = 5_000;

/**
 * Run one attempt inside the admission mutex. { busy: true } when the mutex could not be had in a few seconds
 * (the caller just tries again on its next poll). The mutex is released whatever the attempt does.
 */
function underAdmission(paths, me, log, now, fn) {
  const started = now();
  for (;;) {
    if (tryAcquire(paths.admission, { ...me, purpose: 'admission' })) break;
    liveOwner(paths.admission, 'admission lock', log, now); // reclaims a dead holder, like any other owner
    if (now() - started >= ADMISSION_WAIT_MS) return { blockers: [], busy: true };
    sleepSync(10 + Math.floor(Math.random() * 30));
  }
  try { return fn(); } finally { removeIfMine(paths.admission, me); }
}

/**
 * Wait, bounded, for a slot (or the whole server when exclusive). Returns a handle with release(), or
 * { held: false, blockers } when the wait ran out. `log` receives every line meant for the person
 * running the suite; the first report is immediate and names every holder.
 */
export function acquireSlot(paths, me, {
  limit = SELFHOSTED_SLOT_LIMIT, exclusive = false, waitMs = DEFAULT_WAIT_MS, pollMs = POLL_MS,
  log = console.log, now = Date.now, onScanned,
} = {}) {
  const started = now();
  let lastReport = -Infinity;
  for (;;) {
    const r = underAdmission(paths, me, log, now, () => attempt(paths, me, { limit, exclusive, log, now, onScanned }));
    if (r.handle) return r.handle;
    const waited = now() - started;
    if (r.blockers.length && now() - lastReport >= REPORT_EVERY_MS) {
      lastReport = now();
      const what = exclusive ? 'the whole server (this run changes server-wide state)' : `a slot (${limit} run${limit === 1 ? '' : 's'} at a time)`;
      log(`[P1607] self-hosted TEST server busy: waiting for ${what}; held by ${r.blockers.join('; ')}; waited ${Math.round(waited / 1000)}s of ${Math.round(waitMs / 1000)}s`);
    }
    if (waited >= waitMs) {
      if (exclusive) removeIfMine(paths.claim, me); // a waiter that gives up must not keep others out
      return { held: false, blockers: r.blockers };
    }
    const jitter = r.blockers.length ? 0 : Math.random() * pollMs;
    sleepSync(Math.max(1, Math.min(pollMs + jitter, waitMs - waited)));
  }
}
