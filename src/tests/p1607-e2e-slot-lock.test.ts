/**
 * @file p1607-e2e-slot-lock.test.ts
 * @description P1607: the self-hosted TEST server admits a fixed number of e2e runs at once (slots),
 * a run touching server-wide state takes the whole server, and the old single-directory lock stays
 * respected during the switch. Real directories and real child processes; no mock of the lock itself.
 * Hosted TEST keeps exactly one run at a time (P1541's measured limit): tested here too.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import {
  MAX_SLOTS, SELFHOSTED_SLOT_LIMIT, slotLimit, slotPaths, acquireSlot,
} from '../../scripts/lib/e2e-slot-lock.mjs';
import { TEST_PROJECT_REF } from '../../scripts/lib/test-target.mjs';
import { acquire, guardTestDbRun, lockPlan, slotLockBase, sweepBlockers, lockSkipReason } from '../../scripts/lib/e2e-test-db-lock.mjs';

const HOSTED_URL = `https://${TEST_PROJECT_REF}.supabase.co`; // from the one definition, never typed (P1591)
const dirs: string[] = [];
const kids: ChildProcess[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p1607-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const k of kids.splice(0)) { try { k.kill('SIGKILL'); } catch { /* gone */ } }
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const startOf = (pid: number) => spawnSync('ps', ['-p', String(pid), '-o', 'lstart=']).stdout.toString().trim();
/** A distinct, genuinely live process id per simulated run. */
function runner(worktree: string, over: Record<string, unknown> = {}) {
  const k = spawn('sleep', ['120'], { stdio: 'ignore' });
  kids.push(k);
  return {
    pid: k.pid!, processStart: startOf(k.pid!), acquiredAt: Date.now() + kids.length, // distinct, ordered
    worktree, branch: `feature/${worktree}`, port: 5000 + kids.length * 100, ...over,
  };
}
/** A run that has already exited: its pid is gone. */
function deadRunner(worktree: string, over: Record<string, unknown> = {}) {
  const r = spawnSync('sh', ['-c', 'echo $$']);
  return { pid: Number(r.stdout.toString().trim()), processStart: 'Mon Jan  1 00:00:00 2001', acquiredAt: 1, worktree, branch: 'x', port: 1, ...over };
}
const opts = (over: Record<string, unknown> = {}) => ({ waitMs: 0, pollMs: 10, log: () => {}, limit: 2, ...over });
const ownerOf = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
const plant = (dir: string, owner: object) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify(owner));
};

const ADMIT = path.resolve('scripts/lib/e2e-slot-lock.mjs');
/** A child process that tries once to get a slot and reports HELD/WAIT, holding the slot for holdMs. */
function racer(base: string, name: string, acquiredAt: number, port: number, opts2: { pauseMs?: number; holdMs?: number; limit?: number; waitMs?: number } = {}) {
  return new Promise<{ name: string; out: string; t: number }>((resolve) => {
    const file = path.join(base, `racer-${name}.mjs`);
    fs.writeFileSync(file, `
      import { acquireSlot, slotPaths } from ${JSON.stringify(ADMIT)};
      import { execFileSync } from 'node:child_process';
      const start = execFileSync('ps', ['-p', String(process.pid), '-o', 'lstart=']).toString().trim();
      const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      const h = acquireSlot(slotPaths(${JSON.stringify(base)}), { pid: process.pid, processStart: start, acquiredAt: ${acquiredAt}, worktree: ${JSON.stringify(name)}, branch: 'b', port: ${port} },
        { limit: ${opts2.limit ?? 2}, waitMs: ${opts2.waitMs ?? 0}, pollMs: 20, log: () => {},
          onScanned: ${opts2.pauseMs ? `() => sleep(${opts2.pauseMs})` : 'undefined'} });
      console.log(h.held ? 'HELD' : 'WAIT');
      if (h.held) setTimeout(() => process.exit(0), ${opts2.holdMs ?? 1200});
    `);
    const t = Date.now();
    const c = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    c.stdout.on('data', d => { out += d; });
    c.on('exit', () => resolve({ name, out: out.trim(), t: Date.now() - t }));
  });
}

describe('the limit is one setting', () => {
  it('has a default, an env override, and ignores junk', () => {
    expect(slotLimit({})).toBe(SELFHOSTED_SLOT_LIMIT);
    expect(slotLimit({ E2E_SELFHOSTED_SLOTS: '3' })).toBe(3);
    expect(slotLimit({ E2E_SELFHOSTED_SLOTS: '1' })).toBe(1);
    for (const junk of ['0', '-1', 'two', '', '2.5', String(MAX_SLOTS + 1)]) {
      expect(slotLimit({ E2E_SELFHOSTED_SLOTS: junk })).toBe(SELFHOSTED_SLOT_LIMIT);
    }
  });
});

describe('slots: runs share the server up to the limit', () => {
  it('two runs hold slots at once; a third waits and names every holder', () => {
    const p = slotPaths(tmp());
    const a = acquireSlot(p, runner('w1'), opts());
    const b = acquireSlot(p, runner('w4'), opts());
    expect(a.held && b.held).toBe(true);
    const lines: string[] = [];
    const c = acquireSlot(p, runner('w5'), opts({ log: (l: string) => lines.push(l) }));
    expect(c.held).toBe(false);
    const said = lines.join('\n');
    expect(said).toMatch(/w1 \(feature\/w1, pid \d+/);
    expect(said).toMatch(/w4 \(feature\/w4, pid \d+/);
  });

  it('with the limit at 1 the second run waits: the old behaviour is one setting away', () => {
    const p = slotPaths(tmp());
    expect(acquireSlot(p, runner('w1'), opts({ limit: 1 })).held).toBe(true);
    expect(acquireSlot(p, runner('w4'), opts({ limit: 1 })).held).toBe(false);
  });

  it('a slot freed by a release admits the waiter', () => {
    const p = slotPaths(tmp());
    const a = acquireSlot(p, runner('w1'), opts({ limit: 1 }));
    // The wait blocks this process, so the release comes from another one, as it does for real.
    spawn(process.execPath, ['-e', `setTimeout(() => require('fs').rmSync(${JSON.stringify(p.slot(1))}, { recursive: true, force: true }), 200)`]);
    const t0 = Date.now();
    const b = acquireSlot(p, runner('w4'), opts({ limit: 1, waitMs: 5000, pollMs: 20 }));
    expect(a.held).toBe(true);
    expect(b.held).toBe(true);
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it('release frees exactly this run slot and never another run slot', () => {
    const p = slotPaths(tmp());
    const a = acquireSlot(p, runner('w1'), opts());
    const b = acquireSlot(p, runner('w4'), opts());
    a.release();
    expect(fs.existsSync(p.slot(1))).toBe(false);
    expect(ownerOf(p.slot(2)).worktree).toBe('w4');
    b.release();
    expect(fs.existsSync(p.slot(2))).toBe(false);
  });

  it('a lowered limit still counts slots held under the higher one (count-based, not index-based)', () => {
    const p = slotPaths(tmp());
    for (const i of [1, 2, 3]) plant(p.slot(i), runner(`w${i}`));
    expect(acquireSlot(p, runner('w9'), opts({ limit: 2 })).held).toBe(false);
    expect(acquireSlot(p, runner('w9'), opts({ limit: 3 })).held).toBe(false);
    expect(acquireSlot(p, runner('w9'), opts({ limit: 4 })).held).toBe(true);
  });

  it('a dead holder never blocks: its slot is reclaimed', () => {
    const p = slotPaths(tmp());
    plant(p.slot(1), deadRunner('wdead'));
    plant(p.slot(2), runner('w4'));
    const lines: string[] = [];
    const h = acquireSlot(p, runner('w5'), opts({ log: (l: string) => lines.push(l) }));
    expect(h.held).toBe(true);
    expect(lines.join('\n')).toMatch(/reclaiming a stale e2e slot from wdead/);
    expect(ownerOf(p.slot(1)).worktree).toBe('w5');
  });

  it('two racing runs never exceed the limit (separate processes, one free slot)', () => {
    const base = tmp();
    plant(slotPaths(base).slot(1), runner('w1'));
    return Promise.all([
      racer(base, 'wA', 100, 7001, { holdMs: 7000 }), racer(base, 'wB', 101, 7002, { holdMs: 7000 }), racer(base, 'wC', 102, 7003, { holdMs: 7000 }),
    ]).then((rs) => {
      expect(rs.filter(r => r.out === 'HELD').length).toBe(1); // limit 2, slot 1 held: exactly one place
      expect(rs.filter(r => r.out === 'WAIT').length).toBe(2);
    });
  });
});

describe('admission is serialized: occupied never exceeds the limit (review: rank recount admitted an older waiter beside two newer holders)', () => {
  const liveSlotCount = (base: string) => fs.readdirSync(base).filter(f => /slot-\d+\.lock$/.test(f)).length;
  const sleepMs = (ms: number) => new Promise(r => setTimeout(r, ms));

  it('reverse ordering: the OLDEST-started run is slow to publish while newer runs arrive; never more than the limit at once', async () => {
    const base = tmp();
    // The oldest run enters the admission first and stays in the scan-and-take for 1.5 s; two newer runs
    // arrive during that time. Before the fix the newer ones were admitted beside it and it was kept by rank.
    const oldest = racer(base, 'old', 1, 7001, { pauseMs: 1500, holdMs: 7000, waitMs: 0 });
    await sleepMs(150);
    const newer = [racer(base, 'new1', 1000, 7002, { holdMs: 7000, waitMs: 0 }), racer(base, 'new2', 2000, 7003, { holdMs: 7000, waitMs: 0 })];
    let peak = 0;
    const sampler = setInterval(() => { peak = Math.max(peak, liveSlotCount(base)); }, 20);
    const results = await Promise.all([oldest, ...newer]);
    clearInterval(sampler);
    expect(peak).toBeLessThanOrEqual(2);
    expect(results.filter(r => r.out === 'HELD').length).toBeLessThanOrEqual(2);
    expect(results.find(r => r.name === 'old')!.out).toBe('HELD'); // it got its place first
  }, 30_000);

  it('failing control: a run cannot scan while another is between its scan and its take (the mutex is what serializes them)', async () => {
    const base = tmp();
    const first = racer(base, 'a', 1, 7001, { pauseMs: 1500, holdMs: 7000, limit: 1, waitMs: 0 });
    await sleepMs(200);
    const second = await racer(base, 'b', 2, 7002, { limit: 1, waitMs: 0 }); // arrives mid-attempt, limit 1
    const firstResult = await first;
    expect(firstResult.out).toBe('HELD');
    expect(second.out).toBe('WAIT');
    // ...and without waiting at all it would have been told "busy" at the mutex, not given a second slot:
    expect(liveSlotCount(base)).toBeLessThanOrEqual(1);
  }, 30_000);

  it('many racers, several rounds: held is never above the limit and the oldest-started publishing last changes nothing', async () => {
    for (let round = 0; round < 3; round++) {
      const base = tmp();
      const rs = [6, 5, 4, 3, 2, 1].map((n, i) => racer(base, `r${n}`, n, 7100 + i, { holdMs: 7000, waitMs: 0, pauseMs: i === 5 ? 300 : 0 }));
      let peak = 0;
      const sampler = setInterval(() => { peak = Math.max(peak, liveSlotCount(base)); }, 15);
      const results = await Promise.all(rs);
      clearInterval(sampler);
      expect(peak).toBeLessThanOrEqual(2);
      expect(results.filter(r => r.out === 'HELD').length).toBeLessThanOrEqual(2);
    }
  }, 60_000);

  it('a dead admission holder is reclaimed like any other owner (a crash inside the scan-and-take blocks nobody)', () => {
    const p = slotPaths(tmp());
    plant(p.admission, deadRunner('wdead'));
    const lines: string[] = [];
    const h = acquireSlot(p, runner('w4'), opts({ log: (l: string) => lines.push(l) }));
    expect(h.held).toBe(true);
    expect(lines.join('\n')).toMatch(/reclaiming a stale e2e admission lock from wdead/);
    expect(fs.existsSync(p.admission)).toBe(false); // released after the attempt
  });

  it('the admission mutex is released after every attempt: granted, refused or exclusive', () => {
    const p = slotPaths(tmp());
    acquireSlot(p, runner('w1'), opts({ limit: 1 }));
    expect(acquireSlot(p, runner('w2'), opts({ limit: 1 })).held).toBe(false);
    expect(fs.existsSync(p.admission)).toBe(false);
    expect(acquireSlot(p, runner('w3'), opts({ exclusive: true })).held).toBe(false);
    expect(fs.existsSync(p.admission)).toBe(false);
  });
});

describe('a dev-server port is held by one run (a shared server dies with the run that started it)', () => {
  it('a second run on the same port waits although a slot is free, and says why', () => {
    const p = slotPaths(tmp());
    expect(acquireSlot(p, runner('w1', { port: 5100 }), opts()).held).toBe(true);
    const lines: string[] = [];
    const same = acquireSlot(p, runner('w1b', { port: 5100 }), opts({ log: (l: string) => lines.push(l) }));
    expect(same.held).toBe(false);
    expect(lines.join('\n')).toMatch(/port 5100/);
    expect(acquireSlot(p, runner('w4', { port: 5400 }), opts()).held).toBe(true);
  });
});

describe('exclusive runs take the whole server', () => {
  it('waits for slot holders to finish, naming them, then runs alone', () => {
    const p = slotPaths(tmp());
    const a = acquireSlot(p, runner('w1'), opts());
    const lines: string[] = [];
    const x = acquireSlot(p, runner('w4'), opts({ exclusive: true, log: (l: string) => lines.push(l) }));
    expect(x.held).toBe(false);
    expect(lines.join('\n')).toMatch(/w1 \(feature\/w1/);
    a.release();
    // The failed attempt gave up its claim: nothing is left behind.
    expect(fs.existsSync(p.claim)).toBe(false);
    expect(acquireSlot(p, runner('w4'), opts({ exclusive: true })).held).toBe(true);
  });

  it('while an exclusive run holds the server nobody else enters, and the wait names it', () => {
    const p = slotPaths(tmp());
    const x = acquireSlot(p, runner('w4'), opts({ exclusive: true }));
    expect(x.held).toBe(true);
    const lines: string[] = [];
    expect(acquireSlot(p, runner('w5'), opts({ log: (l: string) => lines.push(l) })).held).toBe(false);
    expect(lines.join('\n')).toMatch(/w4 \(feature\/w4.*alone/);
    expect(acquireSlot(p, runner('w6'), opts({ exclusive: true })).held).toBe(false);
    x.release();
    expect(acquireSlot(p, runner('w5'), opts()).held).toBe(true);
  });

  it('an exclusive waiter blocks new one-slot runs from taking free slots while it drains (no starvation)', () => {
    const p = slotPaths(tmp());
    expect(acquireSlot(p, runner('w1'), opts()).held).toBe(true);        // one of two slots used
    plant(p.claim, runner('wX', { exclusive: true }));                    // an exclusive run is queued behind it
    const lines: string[] = [];
    const late = acquireSlot(p, runner('w5'), opts({ log: (l: string) => lines.push(l) }));
    expect(late.held).toBe(false);                                        // a slot was free; still refused
    expect(lines.join('\n')).toMatch(/wX/);
  });

  it('a dead exclusive claim goes stale like any other owner', () => {
    const p = slotPaths(tmp());
    plant(p.claim, deadRunner('wX', { exclusive: true }));
    expect(acquireSlot(p, runner('w5'), opts()).held).toBe(true);
    const q = slotPaths(tmp());
    plant(q.claim, deadRunner('wX', { exclusive: true }));
    expect(acquireSlot(q, runner('w5'), opts({ exclusive: true })).held).toBe(true);
  });

  it('an exclusive waiter that gives up leaves no claim behind', () => {
    const p = slotPaths(tmp());
    acquireSlot(p, runner('w1'), opts());
    expect(acquireSlot(p, runner('w4'), opts({ exclusive: true })).held).toBe(false);
    expect(fs.existsSync(p.claim)).toBe(false);
  });
});

describe('the old single-directory lock: read, counted, never written', () => {
  const oldOwner = (name = 'w1') => { const r = runner(name, { port: undefined }); return { pid: r.pid, processStart: r.processStart, acquiredAt: r.acquiredAt, worktree: name, branch: 'feature/p1536' }; };
  const bytes = (dir: string) => fs.readFileSync(path.join(dir, 'owner.json'), 'utf8');

  it('a live old-style owner is ONE occupied slot: with a limit of 2 exactly one new run fits, and the wait names it', () => {
    const p = slotPaths(tmp());
    plant(p.legacy, oldOwner());
    expect(acquireSlot(p, runner('w4'), opts({ limit: 2 })).held).toBe(true);
    const lines: string[] = [];
    expect(acquireSlot(p, runner('w5'), opts({ limit: 2, log: (l: string) => lines.push(l) })).held).toBe(false);
    expect(lines.join('\n')).toMatch(/w1 \(feature\/p1536.*older checkout/);
  });
  it('with a limit of 1 a live old-style owner admits nobody', () => {
    const p = slotPaths(tmp());
    plant(p.legacy, oldOwner());
    expect(acquireSlot(p, runner('w4'), opts({ limit: 1 })).held).toBe(false);
  });
  it('a live old-style owner blocks an exclusive run, and names it', () => {
    const p = slotPaths(tmp());
    plant(p.legacy, oldOwner());
    const lines: string[] = [];
    expect(acquireSlot(p, runner('w4'), opts({ exclusive: true, log: (l: string) => lines.push(l) })).held).toBe(false);
    expect(lines.join('\n')).toMatch(/w1 \(feature\/p1536.*older checkout/);
    expect(fs.existsSync(p.claim)).toBe(false); // the failed attempt leaves no claim behind
  });
  it('a dead old-style owner is ignored AND left exactly as it was (a new run never reclaims it)', () => {
    const p = slotPaths(tmp());
    plant(p.legacy, deadRunner('wold'));
    const before = bytes(p.legacy);
    const h = acquireSlot(p, runner('w4'), opts({ limit: 1 }));
    expect(h.held).toBe(true);
    expect(bytes(p.legacy)).toBe(before);
    h.release();
    expect(bytes(p.legacy)).toBe(before);
  });
  it('failing control for "never written": with no old directory, none is created by admission or release', () => {
    const p = slotPaths(tmp());
    const a = acquireSlot(p, runner('w1'), opts());
    const x = acquireSlot(slotPaths(tmp()), runner('w4'), opts({ exclusive: true }));
    expect(a.held && x.held).toBe(true);
    expect(fs.existsSync(p.legacy)).toBe(false);
    a.release(); x.release();
    expect(fs.existsSync(p.legacy)).toBe(false);
  });
  it('a live old-style owner is byte-identical after a new run is admitted, runs and releases', () => {
    const p = slotPaths(tmp());
    plant(p.legacy, oldOwner());
    const before = bytes(p.legacy);
    const h = acquireSlot(p, runner('w4'), opts({ limit: 3 }));
    expect(h.held).toBe(true);
    expect(bytes(p.legacy)).toBe(before);
    h.release();
    expect(bytes(p.legacy)).toBe(before);
  });
  it('KNOWN LIMITATION, pinned: the OLD algorithm does not see new slots, so an older-script run can overlap new runs', () => {
    const p = slotPaths(tmp());
    expect(acquireSlot(p, runner('w1'), opts()).held).toBe(true);
    expect(acquire(p.legacy, runner('wold'), { waitMs: 0, log: () => {} })).toBe(true);
    // ...and from then on the new side counts it.
    expect(acquireSlot(p, runner('w4'), opts({ limit: 2 })).held).toBe(false);
  });
});

describe('hosted TEST is unchanged: one run at a time, on the shared name every session uses', () => {
  it('lockPlan: hosted gets the single lock, self-hosted gets slots', () => {
    const env = { SELFHOSTED_TEST_ORIGIN: 'https://test-db.example.org' };
    const hosted = lockPlan(process.cwd(), HOSTED_URL, env);
    const self = lockPlan(process.cwd(), 'https://test-db.example.org', env);
    expect(hosted.mode).toBe('single');
    expect(hosted.dir.endsWith(path.join('.git', 'e2e-test-db.lock'))).toBe(true);
    expect(self.mode).toBe('slots');
    expect(self.paths.legacy.endsWith(path.join('.git', 'e2e-test-db-selfhosted.lock'))).toBe(true);
  });

  it('a hosted run still waits for the one holder; a second self-hosted run does not wait for the first', () => {
    const repo = tmp();
    execFileSync('git', ['init', '-q', repo]);
    const env = (extra: Record<string, string> = {}) => ({ SELFHOSTED_TEST_ORIGIN: 'https://test-db.example.org', E2E_TEST_DB_LOCK_WAIT_MS: '0', ...extra });
    const run = (url: string, e: Record<string, string>) => {
      let exitCode: number | null = null;
      const r = guardTestDbRun({
        repoDir: repo, isTestDb: true, url, anonKey: 'k', env: e as NodeJS.ProcessEnv,
        argv: ['node', 'playwright', 'test', 'e2e/x.spec.ts'], port: 5900,
        probe: () => ({ ok: true, ms: 1 }), exit: (c: number) => { exitCode = c; throw new Error(`exit ${c}`); },
        detect: () => ({ exclusive: false, serverWideFiles: [] }), register: false,
      });
      return { r, exitCode };
    };
    // Hosted: the first run holds; the second gives up with 75.
    const url = HOSTED_URL;
    const other = runner('w1');
    plant(lockPlan(repo, url, env()).dir, other);
    let code: number | null = null;
    try { run(url, env()); } catch (e) { code = Number(/exit (\d+)/.exec((e as Error).message)?.[1]); }
    expect(code).toBe(75);
    // Self-hosted: an existing slot holder does not stop a second run.
    const self = 'https://test-db.example.org';
    const paths = lockPlan(repo, self, env()).paths;
    plant(paths.slot(1), other);
    expect(run(self, env()).r).toMatchObject({ held: true });
  });

  it('hosted --list and --ui runs still never take a lock', () => {
    for (const flag of ['--list', '--ui']) {
      const r = guardTestDbRun({
        repoDir: process.cwd(), isTestDb: true, url: HOSTED_URL, anonKey: 'k',
        env: {} as NodeJS.ProcessEnv, argv: ['node', 'playwright', 'test', flag], probe: () => ({ ok: true, ms: 1 }),
      });
      expect(r.skipped).toMatch(new RegExp(flag));
    }
  });
});

describe('E2E_SLOT_LOCK_BASE: a test-only way to prove the lock without the real lock directory', () => {
  it('is unset: the git common dir; set to a temp directory: that directory', () => {
    expect(slotLockBase('/real/common', {})).toBe('/real/common');
    const d = tmp();
    expect(slotLockBase('/real/common', { E2E_SLOT_LOCK_BASE: d, E2E_SLOT_LOCK_PROOF: 'overlap proof' })).toBe(fs.realpathSync(d));
  });
  it('failing controls: a directory outside the temp directory, the temp root, a missing path and a file are refused', () => {
    expect(() => slotLockBase('/c', { E2E_SLOT_LOCK_BASE: process.cwd(), E2E_SLOT_LOCK_PROOF: 'x' })).toThrow(/under the temp directory/);
    expect(() => slotLockBase('/c', { E2E_SLOT_LOCK_BASE: os.tmpdir(), E2E_SLOT_LOCK_PROOF: 'x' })).toThrow(/under the temp directory/);
    expect(() => slotLockBase('/c', { E2E_SLOT_LOCK_BASE: path.join(tmp(), 'nope'), E2E_SLOT_LOCK_PROOF: 'x' })).toThrow(/does not exist/);
    const f = path.join(tmp(), 'f'); fs.writeFileSync(f, 'x');
    expect(() => slotLockBase('/c', { E2E_SLOT_LOCK_BASE: f, E2E_SLOT_LOCK_PROOF: 'x' })).toThrow();
  });
  it('failing control: a valid temp directory WITHOUT the proof marker is refused (and a blank marker too)', () => {
    const d = tmp();
    expect(() => slotLockBase('/c', { E2E_SLOT_LOCK_BASE: d })).toThrow(/E2E_SLOT_LOCK_PROOF/);
    expect(() => slotLockBase('/c', { E2E_SLOT_LOCK_BASE: d, E2E_SLOT_LOCK_PROOF: '  ' })).toThrow(/E2E_SLOT_LOCK_PROOF/);
  });
  it('lockPlan moves only the self-hosted slots; hosted TEST ignores it', () => {
    const d = tmp();
    const env = { SELFHOSTED_TEST_ORIGIN: 'https://test-db.example.org', E2E_SLOT_LOCK_BASE: d, E2E_SLOT_LOCK_PROOF: 'overlap proof' };
    const self = lockPlan(process.cwd(), 'https://test-db.example.org', env);
    expect(path.dirname(self.paths.slot(1))).toBe(fs.realpathSync(d));
    const hosted = lockPlan(process.cwd(), HOSTED_URL, env);
    expect(hosted.dir.endsWith(path.join('.git', 'e2e-test-db.lock'))).toBe(true);
  });
});

describe('decision 6: the older-leftovers sweep runs only when nobody else is on the server', () => {
  const env = (base: string) => ({ SELFHOSTED_TEST_ORIGIN: 'https://test-db.example.org', E2E_SLOT_LOCK_BASE: base, E2E_SLOT_LOCK_PROOF: 'sweep gate' });
  const blockers = (repo: string, base: string, extra: Record<string, string> = {}, pid = process.pid) =>
    sweepBlockers({ repoDir: repo, url: 'https://test-db.example.org', env: { ...env(base), ...extra } as NodeJS.ProcessEnv, pid });
  it('nobody else: the sweep may run (legitimate input)', () => {
    const base = fs.realpathSync(tmp());
    expect(blockers(process.cwd(), base)).toEqual([]);
    const own = acquireSlot(slotPaths(base), { ...runner('w4'), pid: process.pid, processStart: startOf(process.pid) }, opts());
    expect(own.held).toBe(true);
    expect(blockers(process.cwd(), base)).toEqual([]); // this run's own slot is not "someone else"
  });
  it('another live slot, another run exclusive claim, or a live old-style owner each block the sweep', () => {
    const base = fs.realpathSync(tmp());
    const p = slotPaths(base);
    plant(p.slot(1), runner('w1'));
    expect(blockers(process.cwd(), base).join(' ')).toMatch(/w1/);
    const base2 = fs.realpathSync(tmp());
    plant(slotPaths(base2).claim, runner('wX', { exclusive: true }));
    expect(blockers(process.cwd(), base2).join(' ')).toMatch(/wX/);
    const base3 = fs.realpathSync(tmp());
    plant(slotPaths(base3).legacy, runner('wOld'));
    expect(blockers(process.cwd(), base3).join(' ')).toMatch(/wOld.*older checkout/);
  });
  it('a dead holder does not block it', () => {
    const base = fs.realpathSync(tmp());
    plant(slotPaths(base).slot(1), deadRunner('wdead'));
    expect(blockers(process.cwd(), base)).toEqual([]);
  });
  it('a load-test run never sweeps; an unreadable lock state never sweeps; CI and hosted are unaffected', () => {
    const base = fs.realpathSync(tmp());
    expect(blockers(process.cwd(), base, { E2E_LOADTEST: '1' }).join(' ')).toMatch(/load-test/);
    expect(sweepBlockers({ repoDir: process.cwd(), url: 'https://test-db.example.org', env: { SELFHOSTED_TEST_ORIGIN: 'https://test-db.example.org', E2E_SLOT_LOCK_BASE: base } as NodeJS.ProcessEnv }).join(' ')).toMatch(/could not be read/);
    expect(blockers(process.cwd(), base, { CI: 'true' })).toEqual([]);
    expect(sweepBlockers({ repoDir: process.cwd(), url: HOSTED_URL, env: {} as NodeJS.ProcessEnv })).toEqual([]);
  });
  it('the teardown asks before it sweeps, and the own-ledger cleanup stays ahead of the question', () => {
    const text = fs.readFileSync('e2e/global-teardown.ts', 'utf8');
    const iLedger = text.indexOf('purgeUserIds(ids');
    const iAsk = text.indexOf('sweepBlockers(');
    const iSweep = text.indexOf('await sweepE2eTestUsers(');
    expect(iLedger).toBeGreaterThan(0);
    expect(iAsk).toBeGreaterThan(iLedger);
    expect(iSweep).toBeGreaterThan(iAsk);
  });
});

describe('argv forms: a run is a run even with flags before `test`', () => {
  const skip = (...args: string[]) => lockSkipReason({ argv: ['node', 'playwright', ...args], env: {}, isTestDb: true });
  it('flags and their values before the subcommand do not make it "not a test run" (any doubt takes the lock)', () => {
    expect(skip('-c', 'other.config.ts', 'test', 'e2e/x.spec.ts')).toBeNull();
    expect(skip('--config=other.config.ts', 'test')).toBeNull();
    expect(skip('test', '-g', 'something', '--project', 'chromium')).toBeNull();
  });
  it('real non-runs stay free', () => {
    expect(skip('show-report')).toMatch(/not a test run/);
    expect(skip('show-trace', 'test')).toMatch(/not a test run/);
    expect(skip('--version')).toMatch(/not a test run/);
    expect(skip('-c', 'x', 'test', '--list')).toMatch(/--list/);
  });
});
