/**
 * @file p1541-e2e-test-db-lock.test.ts
 * @description P1541: one e2e run at a time against the shared TEST database. Real lock directory in
 * a temp dir and real child processes for the dead-owner case; no mocks of the lock itself.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  acquire, release, isStale, lockSkipReason, describeOwner, probeTestDb, parseWaitMs, reclaim, lockDirFor,
} from '../../scripts/lib/e2e-test-db-lock.mjs';

const dirs: string[] = [];
const tmpLock = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p1541-'));
  dirs.push(d);
  return path.join(d, 'e2e-test-db.lock');
};
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const startOfSelf = () => {
  const r = spawnSync('ps', ['-p', String(process.pid), '-o', 'lstart=']);
  return r.stdout.toString().trim();
};
const me = (over: Record<string, unknown> = {}) => ({
  pid: process.pid, processStart: startOfSelf(), acquiredAt: Date.now(), worktree: 'w16', branch: 'feature/x', ...over,
});

describe('lockSkipReason: who must not take the lock', () => {
  const run = ['node', 'playwright', 'test'];
  it('a plain test run against TEST takes it', () => {
    expect(lockSkipReason({ argv: run, env: {}, isTestDb: true })).toBeNull();
  });
  it('only the test subcommand counts, and --flag=value forms are caught (review HIGH 3)', () => {
    expect(lockSkipReason({ argv: ['node', 'pw', 'show-trace', 'test'], env: {}, isTestDb: true })).toMatch(/not a test run/);
    expect(lockSkipReason({ argv: [...run, '--ui-port=8080'], env: {}, isTestDb: true })).toMatch(/--ui-port/);
  });
  it('a held marker from a process that has exited is ignored (review MEDIUM 6)', () => {
    expect(lockSkipReason({ argv: run, env: { E2E_TEST_DB_LOCK_HELD: '999999' }, isTestDb: true })).toBeNull();
    expect(lockSkipReason({ argv: run, env: { E2E_TEST_DB_LOCK_HELD: String(process.pid) }, isTestDb: true })).toMatch(/parent/);
  });
  it('workers, --list, --ui, CI, a held parent and other databases never do', () => {
    expect(lockSkipReason({ argv: run, env: { TEST_WORKER_INDEX: '0' }, isTestDb: true })).toMatch(/worker/);
    expect(lockSkipReason({ argv: [...run, '--list'], env: {}, isTestDb: true })).toMatch(/--list/);
    expect(lockSkipReason({ argv: [...run, '--ui'], env: {}, isTestDb: true })).toMatch(/--ui/);
    expect(lockSkipReason({ argv: run, env: { CI: 'true' }, isTestDb: true })).toMatch(/CI/);
    expect(lockSkipReason({ argv: run, env: {}, isTestDb: false })).toMatch(/not the TEST/);
    expect(lockSkipReason({ argv: ['node', 'playwright', 'show-report'], env: {}, isTestDb: true })).toMatch(/not a test run/);
  });
});

describe('acquire and release', () => {
  it('the first run takes the lock; a second waits, reports the holder, and gives up when the wait runs out', () => {
    const dir = tmpLock();
    expect(acquire(dir, me(), { waitMs: 0, log: () => {} })).toBe(true);
    const lines: string[] = [];
    const second = acquire(dir, me({ worktree: 'w5' }), { waitMs: 60, pollMs: 20, log: l => lines.push(l) });
    expect(second).toBe(false);
    expect(lines.join('\n')).toMatch(/TEST database busy: waiting for w16 \(feature\/x, pid \d+/);
  });

  it('a waiting run starts as soon as the holder releases', () => {
    const dir = tmpLock();
    acquire(dir, me(), { waitMs: 0, log: () => {} });
    // The wait blocks this process, so the release comes from another one, as it does for real.
    spawn(process.execPath, ['-e', `setTimeout(() => require('fs').rmSync(${JSON.stringify(dir)}, { recursive: true, force: true }), 150)`]);
    const t0 = Date.now();
    expect(acquire(dir, me({ worktree: 'w5' }), { waitMs: 5_000, pollMs: 20, log: () => {} })).toBe(true);
    expect(Date.now() - t0).toBeLessThan(4_000);
  });

  it('a run that gives up at once still names the holder', () => {
    const dir = tmpLock();
    acquire(dir, me(), { waitMs: 0, log: () => {} });
    const lines: string[] = [];
    expect(acquire(dir, me({ worktree: 'w5' }), { waitMs: 0, log: l => lines.push(l) })).toBe(false);
    expect(lines.join('\n')).toMatch(/waiting for w16/);
  });

  it('release never removes a lock whose owner it cannot read (review HIGH 4)', () => {
    const dir = tmpLock();
    fs.mkdirSync(dir);
    expect(release(dir, process.pid)).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('release never removes a lock another process holds', () => {
    const dir = tmpLock();
    acquire(dir, me({ pid: process.pid }), { waitMs: 0, log: () => {} });
    expect(release(dir, process.pid + 1)).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
    expect(release(dir, process.pid)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('stale locks are reclaimed', () => {
  it('owner killed outright (kill -9): the next run takes over', () => {
    const dir = tmpLock();
    const child = spawnSync('sh', ['-c', 'echo $$']);
    const deadPid = Number(child.stdout.toString().trim()); // exited by now
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify(me({ pid: deadPid, processStart: 'Mon Jan  1 00:00:00 2001' })));
    const lines: string[] = [];
    expect(acquire(dir, me(), { waitMs: 0, log: l => lines.push(l) })).toBe(true);
    expect(lines.join('\n')).toMatch(/reclaiming a stale e2e lock/);
  });

  it('a reused PID with a different start time counts as gone', () => {
    expect(isStale(me({ processStart: 'not the same start' }))).toBe(true);
    expect(isStale(me())).toBe(false);
  });

  it('a live owner is never evicted, however long it runs (Codex HIGH 3)', () => {
    expect(isStale(me({ acquiredAt: Date.now() - 24 * 3_600_000 }))).toBe(false);
  });

  it('an owner whose start time cannot be read counts as alive: in doubt, wait (Codex HIGH 2)', () => {
    expect(isStale(me(), { startOf: () => null })).toBe(false);
    expect(isStale(me({ pid: 999_999 }), { alive: () => true, startOf: () => null })).toBe(false);
    expect(isStale(me({ pid: 999_999 }), { alive: () => false })).toBe(true);
  });

  it('a lock with no readable owner is stale only after the grace window', () => {
    expect(isStale(null, { dirAgeMs: 1_000 })).toBe(false);
    expect(isStale(null, { dirAgeMs: 60_000 })).toBe(true);
  });

  it('a late reclaimer never removes the lock a faster reclaimer just took (review HIGH 2)', () => {
    const dir = tmpLock();
    const dead = me({ pid: 999_999, processStart: 'gone' });
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify(dead));
    reclaim(dir, dead);                                   // B moves the stale lock aside
    acquire(dir, me({ worktree: 'wB' }), { waitMs: 0, log: () => {} }); // and takes it
    reclaim(dir, dead);                                   // C acts on its earlier, now outdated, verdict
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')).worktree).toBe('wB');
    expect(fs.readdirSync(path.dirname(dir)).filter(f => f.endsWith('.stale') || f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('probeTestDb', () => {
  it('answers ok on the first healthy read', () => {
    expect(probeTestDb('https://x.supabase.co', 'k', { get: () => 200, gapMs: 0 }).ok).toBe(true);
  });
  it('retries, then reports overloaded with the last reason', () => {
    let calls = 0;
    const r = probeTestDb('https://x.supabase.co', 'k', { get: () => { calls++; return 0; }, gapMs: 0, attempts: 3, timeoutMs: 8_000 });
    expect(r).toEqual({ ok: false, reason: 'no answer in 8s' });
    expect(calls).toBe(3);
  });
  it('recovers when a later attempt answers', () => {
    let calls = 0;
    expect(probeTestDb('https://x.supabase.co', 'k', { get: () => (++calls < 2 ? 503 : 200), gapMs: 0 }).ok).toBe(true);
  });
  it('a real curl against a host that never answers reports no answer', () => {
    const r = probeTestDb('http://10.255.255.1', 'k', { attempts: 1, timeoutMs: 1_000, gapMs: 0 });
    expect(r).toEqual({ ok: false, reason: 'no answer in 1s' });
  });
});

it('describeOwner names worktree, branch, pid and minutes', () => {
  expect(describeOwner(me({ acquiredAt: Date.now() - 5 * 60_000 }))).toMatch(/^w16 \(feature\/x, pid \d+, running 5 min\)$/);
});

it('E2E_TEST_DB_LOCK_WAIT_MS=0 means do not wait; junk falls back to the default (review MEDIUM 5)', () => {
  expect(parseWaitMs('0')).toBe(0);
  expect(parseWaitMs('1500')).toBe(1500);
  expect(parseWaitMs(undefined)).toBe(600_000);
  expect(parseWaitMs('soon')).toBe(600_000);
});

it('lockDirFor puts the lock in the git common dir, shared by every worktree', () => {
  const d = lockDirFor(process.cwd());
  expect(d.endsWith(path.join('.git', 'e2e-test-db.lock'))).toBe(true);
});
