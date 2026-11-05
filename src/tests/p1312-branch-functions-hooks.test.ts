/**
 * P1312: the setup and teardown hooks around the branch function check. The check script is a stub
 * (CP_BRANCH_FUNCTIONS_CHECK) that answers from a queue, and the user-purge module is mocked, so
 * nothing here contacts a server. The real Playwright runs of the same hooks are in
 * scripts/test-p1312-branch-functions-check.sh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const calls: string[] = [];
const target = vi.hoisted(() => ({ isTest: true }));
vi.mock('../../scripts/sweep-e2e-test-users', () => ({
  isTestProjectUrl: () => target.isTest,
  purgeUserIds: vi.fn(async () => { calls.push('purge'); return { deleted: 0, failed: 0, requests: 0, stopped: 'done' }; }),
  sweepE2eTestUsers: vi.fn(async () => { calls.push('sweep'); }),
}));
const blockers = vi.hoisted(() => ({ fn: (): string[] => [] }));
vi.mock('../../scripts/lib/e2e-test-db-lock.mjs', () => ({ sweepBlockers: () => blockers.fn() }));
vi.mock('../../e2e/helpers/run-ledger', () => ({ currentRunId: () => 'run-1', readLedger: () => [], removeLedger: () => {} }));

import globalTeardown from '../../e2e/global-teardown';
import { functionsAtSetup, retryWaitMs } from '../../e2e/helpers/branch-functions';

const config = { webServer: { url: 'http://localhost:59999' } } as never;
let dir: string;
const KEYS = ['CP_BRANCH_FUNCTIONS_CHECK', 'CP_FUNCTION_CHECK_RECEIPT', 'E2E_REQUIRE_FUNCTIONS', 'CI', 'VERIFY_PROD', 'E2E_LOADTEST',
  'CP_FN_CHECK_START', 'CP_FN_CHECK_START_LINE', 'CP_FN_CHECK_REFUSED', 'CP_FN_CHECK_START_STARTED', 'CP_FN_CHECK_START_HEAD',
  'CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS', 'STUB_QUEUE', 'STUB_COUNT'];
const saved: Record<string, string | undefined> = {};

function stub(queue: string[]) {
  const script = path.join(dir, 'check.sh');
  fs.writeFileSync(path.join(dir, 'queue'), queue.join('\n') + '\n');
  fs.writeFileSync(script, [
    '#!/bin/bash',
    `q="${dir}/queue"; echo x >> "${dir}/count"`,
    'line="$(head -1 "$q")"; tail -n +2 "$q" > "$q.n"; mv "$q.n" "$q"',
    'nl=$\'\\n\'; rest="${line#*|}"; code="${line%%|*}"; printf \'%s\\n\' "${rest//;;/$nl}"; exit "$code"',
  ].join('\n'));
  process.env.CP_BRANCH_FUNCTIONS_CHECK = script;
}
const checks = () => (fs.existsSync(path.join(dir, 'count')) ? fs.readFileSync(path.join(dir, 'count'), 'utf8').split('\n').filter(Boolean).length : 0);
const receipts = () => fs.readFileSync(path.join(dir, 'receipt.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; Reflect.deleteProperty(process.env, k); }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1312-hooks-'));
  process.env.CP_FUNCTION_CHECK_RECEIPT = path.join(dir, 'receipt.jsonl');
  process.env.CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS = '0';
  blockers.fn = () => [];
  calls.length = 0;
  target.isTest = true;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) Reflect.deleteProperty(process.env, k); else process.env[k] = saved[k]; }
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const MATCH = '0|match: 3 file(s);;STARTED: 1000';
const MATCH_RESTARTED = '0|match: 3 file(s);;STARTED: 2000';
const NONE = '0|no changed functions';
const DIFFERS = '1|differs: fn-a (server has other from 2026-11-05T10:00:00Z);;STARTED: 1000;;Fix: deploy this branch\'s functions to TEST:;;  scripts/selfhosted/deploy-functions.sh fn-a';
const UNKNOWN = '2|unknown: the server did not answer';
const lastLog = () => {
  const logged = (console.log as unknown as { mock: { calls: string[][] } }).mock.calls.map(c => c[0]);
  return logged[logged.length - 1];
};

describe('P1312 setup', () => {
  it('warns and continues by default when the run starts on other code', () => {
    stub([DIFFERS]);
    expect(() => functionsAtSetup(config)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
    expect(process.env.CP_FN_CHECK_REFUSED).toBeUndefined();
  });
  it('refuses under the flag, and marks the run refused', () => {
    stub([DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    expect(() => functionsAtSetup(config)).toThrow(/Refused/);
    expect(process.env.CP_FN_CHECK_REFUSED).toBe('1');
  });
  it('refuses on unknown under the flag too', () => {
    stub([UNKNOWN]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    expect(() => functionsAtSetup(config)).toThrow(/unknown/);
  });
  it('passes quietly on match', () => {
    stub([MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    expect(() => functionsAtSetup(config)).not.toThrow();
    expect(process.env.CP_FN_CHECK_START).toBe('match');
  });
  for (const [name, env] of [['CI', { CI: '1' }], ['VERIFY_PROD', { VERIFY_PROD: '1' }], ['E2E_LOADTEST', { E2E_LOADTEST: '1' }]] as const) {
    it(`runs no check under ${name}`, () => {
      stub([DIFFERS]);
      Object.assign(process.env, env);
      functionsAtSetup(config);
      expect(checks()).toBe(0);
    });
  }
  it('runs no check without a webServer', () => {
    stub([DIFFERS]);
    functionsAtSetup({ webServer: undefined } as never);
    expect(checks()).toBe(0);
  });
});

describe('P1312 teardown', () => {
  it('does nothing when setup recorded nothing (skipped or never reached)', async () => {
    stub([MATCH]);
    await globalTeardown(config);
    expect(checks()).toBe(0);
    expect(fs.existsSync(path.join(dir, 'receipt.jsonl'))).toBe(false);
  });
  it('trusted run: receipt, FUNCTIONS line, no failure', async () => {
    stub([MATCH, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).resolves.toBeUndefined();
    expect(receipts()).toHaveLength(1);
    expect(receipts()[0]).toMatchObject({ verdict: 'trusted', requireFlag: true, start: { state: 'match' }, end: { state: 'match' } });
    const logged = (console.log as unknown as { mock: { calls: string[][] } }).mock.calls.map(c => c[0]);
    expect(logged[logged.length - 1]).toBe('FUNCTIONS: trusted (start match, end match)');
  });
  it('an end that differs fails under the flag, and the cleanup ran first', async () => {
    stub([MATCH, DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow(/untrusted/);
    expect(calls).toContain('purge');
    expect(receipts()[0].verdict).toBe('changed-during-run');
  });
  it('an end that differs only warns without the flag', async () => {
    stub([MATCH, DIFFERS]);
    functionsAtSetup(config);
    await expect(globalTeardown(config)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
  it('retries an unknown end once, and a recovered end is trusted', async () => {
    stub([MATCH, UNKNOWN, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).resolves.toBeUndefined();
    expect(checks()).toBe(3);
  });
  it('an unknown end after the retry fails under the flag', async () => {
    stub([MATCH, UNKNOWN, UNKNOWN]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow();
    expect(checks()).toBe(3);
  });
  it('checks even when the target is not the test project (the check runs before that return)', async () => {
    target.isTest = false;
    stub([MATCH, DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow(/untrusted/);
    expect(checks()).toBe(2);
    expect(calls).toEqual([]);
  });
  it('after a refused setup: no second check, cleanup still runs, no second error', async () => {
    stub([DIFFERS, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    expect(() => functionsAtSetup(config)).toThrow();
    await expect(globalTeardown(config)).resolves.toBeUndefined();
    expect(checks()).toBe(1);
    expect(calls).toContain('purge');
    expect(receipts()[0]).toMatchObject({ verdict: 'started-on-other-code', end: null });
  });
});

describe('P1312 review fixes: false passes', () => {
  it('H1: the same files but a recreated container (a deploy happened) is untrusted, and fails under the flag', async () => {
    stub([MATCH, MATCH_RESTARTED]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow(/restarted/);
    expect(receipts()[0].verdict).toBe('changed-during-run');
  });
  it('H1: a stable container passes', async () => {
    stub([MATCH, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).resolves.toBeUndefined();
  });
  it('M4: a HEAD that moved between setup and teardown is untrusted', async () => {
    stub([MATCH, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    expect(process.env.CP_FN_CHECK_START_HEAD).toMatch(/^[0-9a-f]{40}$/);
    process.env.CP_FN_CHECK_START_HEAD = 'deadbeef';
    await expect(globalTeardown(config)).rejects.toThrow(/commit/);
  });
  it('M4: none at the start and match at the end is untrusted under the flag', async () => {
    stub([NONE, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow(/untrusted/);
  });
  it('M4/L3: none to none passes under the flag but is not-applicable, never trusted', async () => {
    stub([NONE, NONE]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).resolves.toBeUndefined();
    expect(lastLog()).toBe('FUNCTIONS: not-applicable (start none, end none)');
    expect(receipts()[0].verdict).toBe('not-applicable');
  });
  it('L5: a throw inside the end check fails the run under the flag', async () => {
    stub([MATCH, MATCH]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    const broken = { get webServer(): never { throw new Error('boom'); } } as never;
    await expect(globalTeardown(broken)).rejects.toThrow(/boom/);
    expect(calls).toContain('purge');
  });
  it('L5: the same throw only warns without the flag', async () => {
    stub([MATCH, MATCH]);
    functionsAtSetup(config);
    const broken = { get webServer(): never { throw new Error('boom'); } } as never;
    await expect(globalTeardown(broken)).resolves.toBeUndefined();
  });
  it('L8: the flag spelled true means on', async () => {
    stub([MATCH, DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = 'true';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow(/untrusted/);
  });
  it('Gemini 2: setup clears inherited hand-off values first', () => {
    process.env.CP_FN_CHECK_REFUSED = '1';
    process.env.CP_FN_CHECK_START = 'differs';
    process.env.CP_FN_CHECK_START_STARTED = '999';
    stub([MATCH]);
    functionsAtSetup(config);
    expect(process.env.CP_FN_CHECK_REFUSED).toBeUndefined();
    expect(process.env.CP_FN_CHECK_START).toBe('match');
    expect(process.env.CP_FN_CHECK_START_STARTED).toBe('1000');
  });
  it('Gemini 2: a skipped setup leaves no inherited state behind for teardown', async () => {
    process.env.CP_FN_CHECK_START = 'match';
    process.env.CP_FN_CHECK_START_STARTED = '1000';
    process.env.CI = '1';
    stub([MATCH]);
    functionsAtSetup(config);
    expect(process.env.CP_FN_CHECK_START).toBeUndefined();
  });
});

describe('P1312 review fixes: the fix commands are shown', () => {
  it('a refused setup shows the full check output, fix lines included', () => {
    stub([DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    expect(() => functionsAtSetup(config)).toThrow(/deploy-functions\.sh fn-a/);
  });
  it('a warning at setup shows them too', () => {
    stub([DIFFERS]);
    functionsAtSetup(config);
    const warned = (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls.map(c => c[0]).join('\n');
    expect(warned).toMatch(/deploy-functions\.sh fn-a/);
  });
  it('a failing teardown shows them', async () => {
    stub([MATCH, DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    await expect(globalTeardown(config)).rejects.toThrow(/deploy-functions\.sh fn-a/);
  });
  it('the STARTED bookkeeping line is not shown as part of the fix', async () => {
    stub([MATCH, DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    const err = await globalTeardown(config).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/STARTED/);
  });
});

describe('P1312 review fixes: retry and cleanup errors', () => {
  it('the unknown retry waits first, so a live deploy can finish (20 s by default)', async () => {
    expect(retryWaitMs({})).toBe(20_000);
    expect(retryWaitMs({ CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS: '0' })).toBe(0);
    process.env.CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS = '400';
    stub([MATCH, UNKNOWN, MATCH]);
    functionsAtSetup(config);
    const t0 = Date.now();
    await globalTeardown(config);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
  });
  it('L6: when the run failed and cleanup failed too, the cleanup error is logged', async () => {
    stub([MATCH, DIFFERS]);
    process.env.E2E_REQUIRE_FUNCTIONS = '1';
    functionsAtSetup(config);
    Reflect.deleteProperty(process.env, 'P1522_SKIP_SWEEP');
    blockers.fn = () => { throw new Error('sweep blew up'); };
    await expect(globalTeardown(config)).rejects.toThrow(/untrusted/);
    const warned = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => c.map(String).join(' ')).join('\n');
    expect(warned).toMatch(/sweep blew up/);
  });
});
