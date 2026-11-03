/**
 * e2e-lock-primitives.mjs — the owner-directory primitives shared by the single TEST-database lock
 * (P1541, hosted TEST) and the self-hosted slot lock (P1607). Moved here unchanged in behaviour so
 * both can import them without a cycle; e2e-test-db-lock.mjs re-exports them for older importers.
 *
 * A lock is a directory holding owner.json, published atomically (build a private sibling, rename it
 * into place), so no one ever sees a lock without its owner. Stale means the owner process has ended.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const OWNERLESS_GRACE_MS = 10_000;

let counter = 0;
/** Unique per call, so two acquisitions in one process and one millisecond never share a staging name. */
export const uniq = () => `${process.pid}.${Date.now()}.${counter++}.${Math.random().toString(36).slice(2, 8)}`;

export function processStart(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null;
  } catch {
    return null;
  }
}

export function readOwner(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Is the process alive? EPERM means it exists but we may not signal it: alive, never "gone". */
export function isAlive(pid) {
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
 * into place. rename(2) onto an existing non-empty directory fails, so exactly one run wins.
 */
export function tryAcquire(dir, me) {
  const staging = `${dir}.${uniq()}.tmp`;
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

export const sameOwner = (a, b) => !!a && !!b && a.pid === b.pid && a.acquiredAt === b.acquiredAt;

/**
 * Take a stale lock out of the way without touching a lock someone else took meanwhile: move it
 * aside (atomic, only one mover wins), then check that what moved is the lock judged stale. If a
 * fresh lock was moved by mistake, put it back.
 */
export function reclaim(dir, stale) {
  const trash = `${dir}.${uniq()}.stale`;
  try { fs.renameSync(dir, trash); } catch { return; } // someone else moved or released it first
  const moved = readOwner(trash);
  if (stale && !sameOwner(moved, stale)) {
    try { fs.renameSync(trash, dir); return; } catch { /* a new lock is already in place; ours stays trashed */ }
  }
  fs.rmSync(trash, { recursive: true, force: true });
}

// Synchronous on purpose: the guard runs at config load, and a top-level await breaks every tool
// that loads playwright.config.ts as CommonJS (Vite's loader in p1480-worktree-ports.test.ts).
export const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
