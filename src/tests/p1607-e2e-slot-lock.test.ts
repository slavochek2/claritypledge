/**
 * @file p1607-e2e-slot-lock.test.ts
 * @description P1607 + P1672: self-hosted TEST admission is decided on the VM (scripts/selfhosted/lanes/vm/admit.py):
 * one VM-wide capacity across every environment, exclusivity per environment, one dev-server port per machine,
 * tickets that expire unless heartbeated, and no CI exemption. Every test runs the REAL admit.py against a temp
 * state directory through the real Node client (CP_E2E_ADMIT_CMD is the hermetic seam); nothing is mocked.
 * Hosted TEST keeps exactly one run at a time (P1541's measured limit): tested here too.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  SELFHOSTED_SLOT_LIMIT, acquireSlot, otherRunsLive, admitEnv, admitCommand, AdmissionUnavailable, SWEEP_QUERY_TIMEOUT_MS,
} from '../../scripts/lib/e2e-slot-lock.mjs';
import { TEST_PROJECT_REF } from '../../scripts/lib/test-target.mjs';
import { guardTestDbRun, lockPlan, sweepBlockers, lockSkipReason } from '../../scripts/lib/e2e-test-db-lock.mjs';

const HOSTED_URL = `https://${TEST_PROJECT_REF}.supabase.co`; // from the one definition, never typed (P1591)
const SELF = 'https://test-db.example.org';
const ADMIT_PY = path.resolve('scripts/selfhosted/lanes/vm/admit.py');
const ADMIT_CMD = `python3 ${ADMIT_PY}`;

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p1672-admit-'));
  dirs.push(d);
  return d;
};
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/**
 * process.env without anything that selects a lane, a TEST origin or an admission path. vite.config.ts applies this
 * worktree's TEST lane to process.env when it loads (P1672 test-lane-apply), so a claimed worktree's unit run would
 * otherwise carry SELFHOSTED_TEST_ORIGIN / CP_TEST_LANE into every scenario below.
 */
const AMBIENT = ['SELFHOSTED_TEST_ORIGIN', 'CP_TEST_LANE', 'CP_TEST_LANE_GENERATION', 'CP_E2E_ADMIT_CMD', 'CP_E2E_ADMIT_CMD_PROOF',
  'CP_ADMIT_STATE_DIR', 'CP_E2E_ADMIT_TICKET', 'E2E_TEST_DB_LOCK_HELD', 'E2E_LOADTEST', 'CI', 'VITE_SUPABASE_URL'];
const base = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !AMBIENT.includes(k))) as NodeJS.ProcessEnv;
/** The hermetic seam is honoured only with this (scripts/lib/e2e-slot-lock.mjs ADMIT_CMD_PROOF_VALUE). */
const PROOF = { CP_E2E_ADMIT_CMD_PROOF: 'hermetic-test' };

/** A fresh, empty VM admission state, reached the way a Mac client reaches it. */
function vm(extra: Record<string, string> = {}) {
  const state = tmp();
  const env = { ...base(), ...PROOF, CP_E2E_ADMIT_CMD: ADMIT_CMD, CP_ADMIT_STATE_DIR: state, ...extra } as NodeJS.ProcessEnv;
  const admit = (...args: string[]) => spawnSync('python3', [ADMIT_PY, ...args], { env, encoding: 'utf8' });
  const tickets = () => JSON.parse(admit('admit-status', '--json').stdout).tickets as Array<Record<string, string>>;
  return { state, env, admit, tickets };
}
let n = 0;
const me = (worktree: string, over: Record<string, unknown> = {}) =>
  ({ pid: 40_000 + (n++), worktree, branch: `feature/${worktree}`, port: 5000 + n, machine: 'mac-a', ...over });
const opts = (env: NodeJS.ProcessEnv, over: Record<string, unknown> = {}) => ({ env, waitMs: 0, log: () => {}, ...over });

describe('one VM-wide capacity across every environment', () => {
  it('three runs in three environments are admitted; a fourth, in any environment, waits and names every holder', () => {
    const v = vm();
    const a = acquireSlot(me('w1'), opts(v.env, { envName: 'main' }));
    const b = acquireSlot(me('w2'), opts(v.env, { envName: 'lane1' }));
    const c = acquireSlot(me('w3'), opts(v.env, { envName: 'lane2' }));
    expect([a.held, b.held, c.held]).toEqual([true, true, true]);
    for (const envName of ['main', 'lane1', 'lane2']) {
      const lines: string[] = [];
      const d = acquireSlot(me('w4'), opts(v.env, { envName, log: (l: string) => lines.push(l) }));
      expect(d.held).toBe(false);
      expect(lines.join('\n')).toMatch(/capacity 3 in use.*w1 \(feature\/w1.*w2 \(feature\/w2.*w3 \(feature\/w3/);
    }
  });

  it('control: below the capacity a run is admitted; the default matches SELFHOSTED_SLOT_LIMIT', () => {
    const v = vm();
    const a = acquireSlot(me('w1'), opts(v.env));
    expect(a.held).toBe(true);
    expect(a.capacity).toBe(SELFHOSTED_SLOT_LIMIT);
    expect(a.used).toBe(1);
  });

  it('the capacity is the one setting in admit.conf on the VM; junk falls back to the default', () => {
    const v = vm();
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=1\n');
    expect(acquireSlot(me('w1'), opts(v.env, { envName: 'main' })).held).toBe(true);
    expect(acquireSlot(me('w2'), opts(v.env, { envName: 'lane1' })).held).toBe(false);
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=lots\n');
    expect(acquireSlot(me('w2'), opts(v.env, { envName: 'lane1' })).held).toBe(true); // default 3
  });

  it('a client can no longer choose the limit for itself (E2E_SELFHOSTED_SLOTS is ignored)', () => {
    const v = vm({ E2E_SELFHOSTED_SLOTS: '16' });
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=1\n');
    expect(acquireSlot(me('w1'), opts(v.env)).held).toBe(true);
    expect(acquireSlot(me('w2'), opts(v.env)).held).toBe(false);
  });

  it('racing processes never exceed the capacity (6 separate processes, capacity 2)', async () => {
    const v = vm();
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=2\n');
    const one = (i: number) => new Promise<number>((resolve) => {
      const c = spawn('python3', [ADMIT_PY, 'admit', '--env', i % 2 ? 'main' : 'lane1', '--mode', 'shared', '--holder', `r${i}`, '--ttl', '60'],
        { env: v.env, stdio: 'ignore' });
      c.on('exit', code => resolve(code ?? -1));
    });
    const codes = await Promise.all([0, 1, 2, 3, 4, 5].map(one));
    expect(codes.filter(c => c === 0).length).toBe(2);
    expect(codes.filter(c => c === 5).length).toBe(4);
    expect(v.tickets().length).toBe(2);
  }, 30_000);

  it('release frees exactly that run, and releasing twice is harmless', () => {
    const v = vm();
    const a = acquireSlot(me('w1'), opts(v.env));
    const b = acquireSlot(me('w2'), opts(v.env));
    a.release();
    a.release();
    expect(v.tickets().map(t => t.ticket)).toEqual([b.ticket]);
    expect(JSON.parse(v.admit('admit-release', '--ticket', a.ticket!).stdout)).toEqual({ released: false });
  });
});

describe('exclusivity is per environment', () => {
  it('an exclusive run in lane1 does not block a main-lane run', () => {
    const v = vm();
    expect(acquireSlot(me('wx'), opts(v.env, { envName: 'lane1', exclusive: true })).held).toBe(true);
    expect(acquireSlot(me('wm'), opts(v.env, { envName: 'main' })).held).toBe(true);
    // ...and a second exclusive run elsewhere is not blocked by either of them.
    expect(acquireSlot(me('wl2'), opts(v.env, { envName: 'lane2', exclusive: true })).held).toBe(true);
  });

  it('an exclusive run blocks a second run in the SAME environment, shared or exclusive, and names itself', () => {
    const v = vm();
    const x = acquireSlot(me('wx'), opts(v.env, { envName: 'lane1', exclusive: true }));
    expect(x.held).toBe(true);
    const lines: string[] = [];
    expect(acquireSlot(me('w2'), opts(v.env, { envName: 'lane1', log: (l: string) => lines.push(l) })).held).toBe(false);
    expect(lines.join('\n')).toMatch(/wx \(feature\/wx.*exclusive in lane1/);
    expect(acquireSlot(me('w3'), opts(v.env, { envName: 'lane1', exclusive: true })).held).toBe(false);
    x.release();
    expect(acquireSlot(me('w2'), opts(v.env, { envName: 'lane1' })).held).toBe(true); // control: freed
  });

  it('an exclusive run waits for runs already in its environment, never for runs elsewhere', () => {
    const v = vm();
    const other = acquireSlot(me('wm'), opts(v.env, { envName: 'main' }));
    expect(acquireSlot(me('wx'), opts(v.env, { envName: 'lane1', exclusive: true })).held).toBe(true);
    const inLane2 = acquireSlot(me('wl'), opts(v.env, { envName: 'lane2' }));
    expect(acquireSlot(me('wy'), opts(v.env, { envName: 'lane2', exclusive: true })).held).toBe(false);
    inLane2.release();
    expect(acquireSlot(me('wy'), opts(v.env, { envName: 'lane2', exclusive: true })).held).toBe(true);
    expect(other.held).toBe(true);
  });

  it('a waiting exclusive run claims its environment: a new shared run there is refused while it drains (no starvation)', async () => {
    const v = vm();
    const holder = acquireSlot(me('w1'), opts(v.env, { envName: 'lane1' }));
    // The exclusive waiter is another process, waiting on the VM for up to 6 s.
    const waiter = new Promise<{ code: number; out: string }>((resolve) => {
      const c = spawn('python3', [ADMIT_PY, 'admit', '--env', 'lane1', '--mode', 'exclusive', '--holder', 'wX', '--ttl', '60', '--wait', '6'],
        { env: v.env, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      c.stdout.on('data', d => { out += d; });
      c.on('exit', code => resolve({ code: code ?? -1, out }));
    });
    for (let i = 0; i < 40 && !v.tickets().some(t => t.phase === 'waiting'); i++) await new Promise(r => setTimeout(r, 50));
    const lines: string[] = [];
    expect(acquireSlot(me('w5'), opts(v.env, { envName: 'lane1', log: (l: string) => lines.push(l) })).held).toBe(false);
    expect(lines.join('\n')).toMatch(/wX \(waiting to run alone in lane1/);
    expect(acquireSlot(me('w6'), opts(v.env, { envName: 'main' })).held).toBe(true); // control: other envs unaffected
    holder.release();
    const w = await waiter;
    expect(w.code).toBe(0);
    expect(JSON.parse(w.out.trim()).mode).toBe('exclusive');
  }, 20_000);

  it('an exclusive waiter that gives up leaves no claim behind', () => {
    const v = vm();
    acquireSlot(me('w1'), opts(v.env, { envName: 'lane1' }));
    const r = v.admit('admit', '--env', 'lane1', '--mode', 'exclusive', '--holder', 'wX', '--ttl', '60', '--wait', '1');
    expect(r.status).toBe(5);
    expect(v.tickets().filter(t => t.phase === 'waiting')).toEqual([]);
    expect(acquireSlot(me('w2'), opts(v.env, { envName: 'lane1' })).held).toBe(true); // control: not blocked by a leftover
  });
});

describe('a dev-server port is held by one run per machine (a shared server dies with the run that started it)', () => {
  it('the same machine and port waits even in another environment; another port or another machine does not', () => {
    const v = vm();
    expect(acquireSlot(me('w1', { port: 5100 }), opts(v.env, { envName: 'main' })).held).toBe(true);
    const lines: string[] = [];
    expect(acquireSlot(me('w1b', { port: 5100 }), opts(v.env, { envName: 'lane1', log: (l: string) => lines.push(l) })).held).toBe(false);
    expect(lines.join('\n')).toMatch(/same dev-server port 5100 on mac-a/);
    expect(acquireSlot(me('w4', { port: 5400 }), opts(v.env, { envName: 'lane1' })).held).toBe(true);
    expect(acquireSlot(me('w1c', { port: 5100, machine: 'ci-runner' }), opts(v.env, { envName: 'lane2' })).held).toBe(true);
  });
});

describe('tickets expire unless heartbeated', () => {
  it('an un-heartbeated ticket is swept after its TTL, freeing the place; heartbeat for it is refused (exit 4)', () => {
    const v = vm();
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=1\n');
    const a = acquireSlot(me('w1'), opts(v.env, { ttlS: 1 }));
    expect(acquireSlot(me('w2'), opts(v.env)).held).toBe(false);        // control: it is held now
    execFileSync('sleep', ['1.3']);
    expect(acquireSlot(me('w2'), opts(v.env)).held).toBe(true);
    expect(v.admit('admit-heartbeat', '--ticket', a.ticket!, '--ttl', '60').status).toBe(4);
  });

  it('the client heartbeat keeps a ticket alive past its TTL; without it the same ticket expires (control)', async () => {
    const v = vm();
    const kept = acquireSlot(me('w1'), opts(v.env, { ttlS: 2 }));
    const dropped = acquireSlot(me('w2'), opts(v.env, { ttlS: 2 }));
    const lost: string[] = [];
    kept.startHeartbeat({ everyMs: 300, onLost: (t: string) => lost.push(t) }); // never SIGINT the test worker
    await new Promise(r => setTimeout(r, 3_000));
    const live = v.tickets().map(t => t.ticket);
    kept.release();
    expect(live).toContain(kept.ticket);
    expect(live).not.toContain(dropped.ticket);
    expect(lost).toEqual([]); // a live ticket is never reported lost
  }, 15_000);

  it('a hung heartbeat is killed at its timeout, so the next beat still runs', async () => {
    const v = vm();
    const pids = path.join(v.state, 'hung-pids');
    const hang = path.join(v.state, 'hang.sh');
    fs.writeFileSync(hang, `echo $$ >> ${pids}\nexec sleep 30\n`);
    const lost: string[] = [];
    // Admitted normally; the handle keeps this env object and reads the command from it at every beat, so swapping
    // the command afterwards makes every heartbeat hang, as a stalled IAP SSH would.
    const live = acquireSlot(me('w1'), opts(v.env));
    v.env.CP_E2E_ADMIT_CMD = `sh ${hang}`;
    live.startHeartbeat({ everyMs: 150, timeoutMs: 400, onLost: (t: string) => lost.push(t) });
    await new Promise(r => setTimeout(r, 2_000));
    v.env.CP_E2E_ADMIT_CMD = ADMIT_CMD;
    live.release();
    await new Promise(r => setTimeout(r, 800)); // the beat in flight at stop() reaches its 400 ms bound too
    const started = fs.readFileSync(pids, 'utf8').trim().split('\n').map(Number);
    expect(started.length).toBeGreaterThanOrEqual(2); // a later beat ran: the first hung one did not stall it
    const alive = started.filter(p => { try { process.kill(p, 0); return true; } catch { return false; } });
    expect(alive).toEqual([]);                          // every hung heartbeat was killed
    expect(lost).toEqual([]);                           // a timeout is not a lost ticket
  }, 15_000);
});

describe('a lost ticket stops the run (fail closed); a live one does not', () => {
  const LIB = path.resolve('scripts/lib/e2e-slot-lock.mjs');
  /** A stand-in for the Playwright main runner: admitted, heartbeating, and otherwise idle until something stops it. */
  function runner(v: ReturnType<typeof vm>, mode: 'plain' | 'swallow-sigint',
    { ttlS = 240, env = v.env, waitMs = 0 }: { ttlS?: number; env?: NodeJS.ProcessEnv; waitMs?: number } = {}) {
    const file = path.join(v.state, `runner-${mode}.mjs`);
    fs.writeFileSync(file, `
      import { acquireSlot, terminateLostRun } from ${JSON.stringify(LIB)};
      ${mode === 'swallow-sigint' ? "process.on('SIGINT', () => console.log('SIGINT-SWALLOWED'));" : ''}
      const h = acquireSlot({ pid: process.pid, worktree: 'wR', branch: 'b', port: 5999, machine: 'mac-r' }, { waitMs: ${waitMs}, ttlS: ${ttlS}, log: () => {} });
      console.log('TICKET ' + h.ticket);
      h.startHeartbeat({ everyMs: 150, onLost: (t, why) => terminateLostRun(t, { why, backstopMs: 600 }) });
      setInterval(() => {}, 1000); // keeps the process alive, as a running suite does
    `);
    const c = spawn(process.execPath, [file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { err += d; });
    const exited = new Promise<{ code: number | null; signal: string | null }>(r => c.on('exit', (code, signal) => r({ code, signal })));
    const ticket = async () => {
      for (let i = 0; i < 100 && !/TICKET \S+/.test(out); i++) await new Promise(r => setTimeout(r, 50));
      return /TICKET (\S+)/.exec(out)![1];
    };
    return { c, exited, ticket, output: () => ({ out, err }) };
  }
  const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<'still running'>(r => setTimeout(() => r('still running'), ms))]);

  it('the VM dropping the ticket ends the run by SIGINT (Playwright interrupt: teardown, exit 130) with an [infra] line', async () => {
    const v = vm();
    const r = runner(v, 'plain');
    const t = await r.ticket();
    v.admit('admit-release', '--ticket', t); // the VM no longer holds it (as after an expiry)
    const res = await within(r.exited, 5_000);
    if (res === 'still running') r.c.kill('SIGKILL');
    expect(res).toEqual({ code: null, signal: 'SIGINT' });
    expect(r.output().err).toMatch(new RegExp(`\\[P1672\\]\\[infra\\] admission ticket ${t} was lost`));
  }, 15_000);

  it('if SIGINT is swallowed, the backstop still ends the run, non-zero (75)', async () => {
    const v = vm();
    const r = runner(v, 'swallow-sigint');
    const t = await r.ticket();
    v.admit('admit-release', '--ticket', t);
    const res = await within(r.exited, 5_000);
    if (res === 'still running') r.c.kill('SIGKILL');
    expect(r.output().out).toMatch(/SIGINT-SWALLOWED/);
    expect(res).toEqual({ code: 75, signal: null });
  }, 15_000);

  /** An admission command that fails (no answer, exit 1) while a flag file exists, as an SSH to a down VM would. */
  function flaky(v: ReturnType<typeof vm>) {
    const flag = path.join(v.state, 'vm-down');
    const wrapper = path.join(v.state, 'flaky.sh');
    fs.writeFileSync(wrapper, `[ -e ${flag} ] && exit 1\nexec python3 ${ADMIT_PY} "$@"\n`);
    return { flag, env: { ...v.env, CP_E2E_ADMIT_CMD: `sh ${wrapper}` } as NodeJS.ProcessEnv };
  }

  it('heartbeats that stop REACHING the VM for TTL minus the margin end the run the same way (SIGINT, [infra] line)', async () => {
    const v = vm();
    const f = flaky(v);
    const r = runner(v, 'plain', { ttlS: 2, env: f.env }); // limit: 2 s minus a quarter = 1.5 s of silence
    const t = await r.ticket();
    fs.writeFileSync(f.flag, '');                          // the VM stops answering; no exit 4 ever arrives
    const res = await within(r.exited, 6_000);
    if (res === 'still running') r.c.kill('SIGKILL');
    expect(res).toEqual({ code: null, signal: 'SIGINT' });
    expect(r.output().err).toMatch(new RegExp(`\\[P1672\\]\\[infra\\] admission ticket ${t} was lost: no heartbeat has reached the VM for \\d+s`));
  }, 15_000);

  it('control: an outage shorter than the margin does not stop the run', async () => {
    const v = vm();
    const f = flaky(v);
    const r = runner(v, 'plain', { ttlS: 2, env: f.env });
    const t = await r.ticket();
    fs.writeFileSync(f.flag, '');
    await new Promise(res => setTimeout(res, 500));        // well under the 1.5 s limit
    fs.rmSync(f.flag);
    const res = await within(r.exited, 3_000);
    r.c.kill('SIGKILL');
    expect(res).toBe('still running');
    expect(r.output().err).not.toMatch(/was lost/);
    expect(v.tickets().map(x => x.ticket)).toContain(t);   // beats resumed and kept it past its 2 s TTL
  }, 15_000);

  /** Capacity 1, held by another run that leaves after `holdMs`: the runner's admit call waits on the VM that long. */
  function queuedBehind(v: ReturnType<typeof vm>, holdMs: number) {
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=1\n');
    const other = acquireSlot(me('wQ'), opts(v.env));
    setTimeout(() => other.release(), holdMs);
  }

  it('a run that waited in the queue longer than its reach limit is NOT stopped once admitted (the clock starts at admission)', async () => {
    const v = vm();
    queuedBehind(v, 2_200);                                 // longer than the 1.5 s limit of a 2 s TTL
    const r = runner(v, 'plain', { ttlS: 2, waitMs: 10_000 });
    const t = await r.ticket();                             // returns only once admitted, about 2.2 s in
    const res = await within(r.exited, 3_000);              // heartbeats reach the VM: it must keep running
    r.c.kill('SIGKILL');
    expect(res).toBe('still running');
    expect(r.output().err).not.toMatch(/was lost/);
    expect(v.tickets().map(x => x.ticket)).toContain(t);
  }, 20_000);

  it('control: the same long-waited admission whose heartbeats then go silent is still stopped', async () => {
    const v = vm();
    const f = flaky(v);
    queuedBehind(v, 2_200);
    const r = runner(v, 'plain', { ttlS: 2, waitMs: 10_000, env: f.env });
    const t = await r.ticket();
    fs.writeFileSync(f.flag, '');                           // silence starts after admission
    const res = await within(r.exited, 6_000);
    if (res === 'still running') r.c.kill('SIGKILL');
    expect(res).toEqual({ code: null, signal: 'SIGINT' });
    expect(r.output().err).toMatch(new RegExp(`admission ticket ${t} was lost: no heartbeat has reached the VM`));
  }, 20_000);

  it('the reach limit is the TTL minus a quarter of it, never more than 60 s early', async () => {
    const { unreachableLimitMs } = await import('../../scripts/lib/e2e-slot-lock.mjs');
    expect(unreachableLimitMs(240)).toBe(180_000);
    expect(unreachableLimitMs(2)).toBe(1_500);
    expect(unreachableLimitMs(3600)).toBe(3_540_000);
  });

  it('control: with the ticket still held, the same runner keeps running', async () => {
    const v = vm();
    const r = runner(v, 'plain');
    const t = await r.ticket();
    const res = await within(r.exited, 2_000);
    r.c.kill('SIGKILL');
    expect(res).toBe('still running');
    expect(r.output().err).not.toMatch(/was lost/);
    expect(v.tickets().map(x => x.ticket)).toContain(t);
  }, 15_000);
});

describe('an unreachable VM fails admission; it never runs unadmitted', () => {
  const bad = (cmd: string) => ({ ...base(), ...PROOF, CP_E2E_ADMIT_CMD: cmd } as NodeJS.ProcessEnv);
  it.each([
    ['a command that fails', 'false'],
    ['a command that does not exist', '/nonexistent/admit-cmd'],
    ['an answer that is not JSON', 'echo garbage'],
  ])('%s throws AdmissionUnavailable', (_what, cmd) => {
    expect(() => acquireSlot(me('w1'), opts(bad(cmd)))).toThrow(AdmissionUnavailable);
  });

  it('guardTestDbRun exits 1 with an [infra] line, with or without CI set, and is never "held" or "skipped"', () => {
    for (const ci of [{}, { CI: '1' }]) {
      let code: number | null = null;
      const r = guardTestDbRun({
        repoDir: tmp(), isTestDb: true, url: SELF, anonKey: 'k', port: 5900, register: false,
        env: { SELFHOSTED_TEST_ORIGIN: SELF, E2E_TEST_DB_LOCK_WAIT_MS: '0', ...PROOF, CP_E2E_ADMIT_CMD: 'false', ...ci } as NodeJS.ProcessEnv,
        argv: ['node', 'playwright', 'test', 'e2e/x.spec.ts'], probe: () => ({ ok: true, ms: 1 }),
        exit: (c: number) => { code = c; }, detect: () => ({ exclusive: false, serverWideFiles: [] }),
      });
      expect(code).toBe(1);
      expect(r).toMatchObject({ gaveUp: true, unavailable: true });
    }
  });

  it('CP_E2E_ADMIT_CMD without CP_E2E_ADMIT_CMD_PROOF=hermetic-test is refused, and nothing reaches the state', () => {
    const v = vm();
    for (const proof of [undefined, '', 'yes', 'hermetic']) {
      const env = { ...v.env, CP_E2E_ADMIT_CMD_PROOF: proof } as NodeJS.ProcessEnv;
      if (proof === undefined) delete env.CP_E2E_ADMIT_CMD_PROOF;
      expect(() => admitCommand(env)).toThrow(/CP_E2E_ADMIT_CMD_PROOF=hermetic-test/);
      expect(() => acquireSlot(me('w1'), opts(env))).toThrow(AdmissionUnavailable);
    }
    expect(v.tickets()).toEqual([]);
    expect(acquireSlot(me('w1'), opts(v.env)).held).toBe(true); // control: with the proof the same command admits
  });

  it('guardTestDbRun refuses a proof-less seam with exit 1 and an [infra] line; the teardown sweep is skipped', () => {
    const v = vm();
    const env = { ...v.env, SELFHOSTED_TEST_ORIGIN: SELF, E2E_TEST_DB_LOCK_WAIT_MS: '0' } as NodeJS.ProcessEnv;
    delete env.CP_E2E_ADMIT_CMD_PROOF;
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.join(' ')); };
    let code: number | null = null;
    let r;
    try {
      r = guardTestDbRun({
        repoDir: tmp(), isTestDb: true, url: SELF, anonKey: 'k', port: 5900, register: false, env,
        argv: ['node', 'playwright', 'test', 'e2e/x.spec.ts'], probe: () => ({ ok: true, ms: 1 }),
        exit: (c: number) => { code = c; }, detect: () => ({ exclusive: false, serverWideFiles: [] }),
      });
    } finally { console.error = orig; }
    expect(code).toBe(1);
    expect(r).toMatchObject({ gaveUp: true, unavailable: true });
    expect(errs.join('\n')).toMatch(/\[P1672\]\[infra\] CP_E2E_ADMIT_CMD is set .* without CP_E2E_ADMIT_CMD_PROOF=hermetic-test/);
    expect(v.tickets()).toEqual([]);
    expect(sweepBlockers({ repoDir: process.cwd(), url: SELF, env }).join(' ')).toMatch(/could not be read.*CP_E2E_ADMIT_CMD_PROOF/);
  });

  it('the default transport is lane.py vm (the real VM), not a local file', () => {
    const c = admitCommand({} as NodeJS.ProcessEnv);
    expect(c.viaVm).toBe(true);
    expect(c.argv.slice(-2)).toEqual(['vm', '--']);
    expect(c.argv[1].endsWith(path.join('scripts', 'selfhosted', 'lane.py'))).toBe(true);
  });
});

describe('guardTestDbRun: every client, CI included, is admitted in its own environment', () => {
  const guard = (env: NodeJS.ProcessEnv, exclusive = false) => {
    let code: number | null = null;
    const r = guardTestDbRun({
      repoDir: tmp(), isTestDb: true, url: SELF, anonKey: 'k', port: 5900 + (n++), register: false, env,
      argv: ['node', 'playwright', 'test', 'e2e/x.spec.ts'], probe: () => ({ ok: true, ms: 1 }),
      exit: (c: number) => { code = c; }, detect: () => ({ exclusive, serverWideFiles: [] }),
    });
    return { r, code };
  };

  it('a CI=1 run takes a ticket on the VM like any other, in the lane named by CP_TEST_LANE', () => {
    const v = vm();
    const env = { ...v.env, SELFHOSTED_TEST_ORIGIN: SELF, E2E_TEST_DB_LOCK_WAIT_MS: '0', CI: '1', CP_TEST_LANE: 'lane1' } as NodeJS.ProcessEnv;
    const { r } = guard(env);
    expect(r).toMatchObject({ held: true, env: 'lane1' });
    expect(env.CP_E2E_ADMIT_TICKET).toBe(r.ticket);
    expect(v.tickets()).toEqual([expect.objectContaining({ ticket: r.ticket, env: 'lane1', mode: 'shared' })]);
  });

  it('two independent clients, one with CI=1, share the one capacity: the second gives up with 75 (control: room admits it)', () => {
    const v = vm();
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=1\n');
    const base = { SELFHOSTED_TEST_ORIGIN: SELF, E2E_TEST_DB_LOCK_WAIT_MS: '0' };
    const first = guard({ ...v.env, ...base, CI: '1' } as NodeJS.ProcessEnv);
    expect(first.r).toMatchObject({ held: true });
    const second = guard({ ...v.env, ...base, CP_TEST_LANE: 'lane2' } as NodeJS.ProcessEnv);
    expect(second.code).toBe(75);
    fs.writeFileSync(path.join(v.state, 'admit.conf'), 'capacity=2\n');
    expect(guard({ ...v.env, ...base, CP_TEST_LANE: 'lane2' } as NodeJS.ProcessEnv).r).toMatchObject({ held: true });
  });

  it('admitEnv: the claimed lane, else the main lane', () => {
    expect(admitEnv({} as NodeJS.ProcessEnv)).toBe('main');
    expect(admitEnv({ CP_TEST_LANE: '' } as NodeJS.ProcessEnv)).toBe('main');
    expect(admitEnv({ CP_TEST_LANE: 'lane2' } as NodeJS.ProcessEnv)).toBe('lane2');
  });
});

describe('hosted TEST is unchanged: one run at a time, on the shared name every session uses', () => {
  it('lockPlan: hosted gets the single git-dir lock, self-hosted goes to the VM in its environment', () => {
    const env = { SELFHOSTED_TEST_ORIGIN: SELF, CP_TEST_LANE: 'lane1' };
    const hosted = lockPlan(process.cwd(), HOSTED_URL, env);
    expect(hosted.mode).toBe('single');
    expect(hosted.dir!.endsWith(path.join('.git', 'e2e-test-db.lock'))).toBe(true);
    expect(lockPlan(process.cwd(), SELF, env)).toEqual({ mode: 'vm', env: 'lane1' });
    expect(lockPlan(process.cwd(), SELF, { SELFHOSTED_TEST_ORIGIN: SELF })).toEqual({ mode: 'vm', env: 'main' });
  });

  it('a hosted run still waits for the one holder and gives up with 75', () => {
    const repo = tmp();
    execFileSync('git', ['init', '-q', repo]);
    const env = { E2E_TEST_DB_LOCK_WAIT_MS: '0' };
    const dir = lockPlan(repo, HOSTED_URL, env).dir!;
    const holder = spawn('sleep', ['30'], { stdio: 'ignore' });
    try {
      const start = spawnSync('ps', ['-p', String(holder.pid), '-o', 'lstart=']).stdout.toString().trim();
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: holder.pid, processStart: start, acquiredAt: Date.now(), worktree: 'w1', branch: 'b' }));
      let code: number | null = null;
      guardTestDbRun({
        repoDir: repo, isTestDb: true, url: HOSTED_URL, anonKey: 'k', env: env as NodeJS.ProcessEnv, register: false,
        argv: ['node', 'playwright', 'test', 'e2e/x.spec.ts'], port: 5900, probe: () => ({ ok: true, ms: 1 }),
        exit: (c: number) => { code = c; }, detect: () => ({ exclusive: false, serverWideFiles: [] }),
      });
      expect(code).toBe(75);
    } finally { holder.kill('SIGKILL'); }
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

describe('decision 6, per environment: the older-leftovers sweep runs only when nobody else uses THIS database', () => {
  const blockers = (env: NodeJS.ProcessEnv) => sweepBlockers({ repoDir: process.cwd(), url: SELF, env: { SELFHOSTED_TEST_ORIGIN: SELF, ...env } as NodeJS.ProcessEnv });

  it('nobody else in this environment: the sweep may run, and this run own ticket is not "someone else"', () => {
    const v = vm();
    expect(blockers({ ...v.env, CP_TEST_LANE: 'lane1' })).toEqual([]);
    const own = acquireSlot(me('w4'), opts(v.env, { envName: 'lane1' }));
    expect(blockers({ ...v.env, CP_TEST_LANE: 'lane1', CP_E2E_ADMIT_TICKET: own.ticket! })).toEqual([]);
  });

  it('another run in the same environment blocks it; the same run in another environment does not (control)', () => {
    const v = vm();
    acquireSlot(me('w1'), opts(v.env, { envName: 'lane1' }));
    expect(blockers({ ...v.env, CP_TEST_LANE: 'lane1' }).join(' ')).toMatch(/w1 \(feature\/w1/);
    expect(blockers({ ...v.env })).toEqual([]);                       // main lane: other database
    expect(blockers({ ...v.env, CP_TEST_LANE: 'lane2' })).toEqual([]);
  });

  it('a waiting exclusive claim in the same environment blocks it too', () => {
    const v = vm();
    acquireSlot(me('w1'), opts(v.env, { envName: 'main' }));
    const own = acquireSlot(me('w2'), opts(v.env, { envName: 'main' }));
    own.release();
    v.admit('admit', '--env', 'lane1', '--mode', 'shared', '--holder', 'wS', '--ttl', '60');
    // Plant a waiting claim in lane1 by starting an exclusive waiter that cannot get in while wS runs.
    const c = spawn('python3', [ADMIT_PY, 'admit', '--env', 'lane1', '--mode', 'exclusive', '--holder', 'wX', '--ttl', '60', '--wait', '3'], { env: v.env, stdio: 'ignore' });
    try {
      let seen: string[] = [];
      for (let i = 0; i < 40; i++) {
        seen = blockers({ ...v.env, CP_TEST_LANE: 'lane1' });
        if (seen.join(' ').includes('wX')) break;
        execFileSync('sleep', ['0.05']);
      }
      expect(seen.join(' ')).toMatch(/wX \(waiting to run alone in lane1\)/);
    } finally { c.kill('SIGKILL'); }
  });

  it('a load-test run never sweeps; an unreachable VM never sweeps; CI is not exempt; hosted is unaffected', () => {
    const v = vm();
    expect(blockers({ ...v.env, E2E_LOADTEST: '1' }).join(' ')).toMatch(/load-test/);
    expect(blockers({ ...v.env, CP_E2E_ADMIT_CMD: 'false' }).join(' ')).toMatch(/could not be read/);
    acquireSlot(me('w1'), opts(v.env));
    expect(blockers({ ...v.env, CI: 'true' }).join(' ')).toMatch(/w1/);
    expect(sweepBlockers({ repoDir: process.cwd(), url: HOSTED_URL, env: {} as NodeJS.ProcessEnv })).toEqual([]);
  });

  it('otherRunsLive throws (never answers "nobody") when the VM cannot be asked', () => {
    expect(() => otherRunsLive({ envName: 'main', env: { ...base(), ...PROOF, CP_E2E_ADMIT_CMD: 'false' } as NodeJS.ProcessEnv })).toThrow(AdmissionUnavailable);
  });

  it('a VM that hangs cannot hold teardown: the query is bounded (30 s by default) and a timeout skips the sweep', () => {
    expect(SWEEP_QUERY_TIMEOUT_MS).toBe(30_000);
    const hang = path.join(tmp(), 'hang.sh');
    fs.writeFileSync(hang, 'exec sleep 60\n'); // ignores the admit arguments, as a stalled SSH would
    const t0 = Date.now();
    const b = sweepBlockers({ repoDir: process.cwd(), url: SELF, timeoutMs: 1_000,
      env: { ...base(), ...PROOF, SELFHOSTED_TEST_ORIGIN: SELF, CP_E2E_ADMIT_CMD: `sh ${hang}` } as NodeJS.ProcessEnv });
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(900); // it really asked and waited for the bound, not refused up front
    expect(took).toBeLessThan(5_000);
    expect(b.join(' ')).toMatch(/could not be read/);
  });

  it('control: a VM that answers inside the bound is read normally', () => {
    const v = vm();
    acquireSlot(me('w1'), opts(v.env));
    expect(sweepBlockers({ repoDir: process.cwd(), url: SELF, timeoutMs: 10_000, env: { ...v.env, SELFHOSTED_TEST_ORIGIN: SELF } as NodeJS.ProcessEnv }).join(' ')).toMatch(/w1/);
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
