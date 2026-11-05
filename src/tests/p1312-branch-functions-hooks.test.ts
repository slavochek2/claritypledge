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
vi.mock('../../scripts/lib/e2e-test-db-lock.mjs', () => ({ sweepBlockers: () => [] }));
vi.mock('../../e2e/helpers/run-ledger', () => ({ currentRunId: () => 'run-1', readLedger: () => [], removeLedger: () => {} }));

import globalTeardown from '../../e2e/global-teardown';
import { functionsAtSetup } from '../../e2e/helpers/branch-functions';

const config = { webServer: { url: 'http://localhost:59999' } } as never;
let dir: string;
const KEYS = ['CP_BRANCH_FUNCTIONS_CHECK', 'CP_FUNCTION_CHECK_RECEIPT', 'E2E_REQUIRE_FUNCTIONS', 'CI', 'VERIFY_PROD', 'E2E_LOADTEST',
  'CP_FN_CHECK_START', 'CP_FN_CHECK_START_LINE', 'CP_FN_CHECK_REFUSED', 'STUB_QUEUE', 'STUB_COUNT'];
const saved: Record<string, string | undefined> = {};

function stub(queue: string[]) {
  const script = path.join(dir, 'check.sh');
  fs.writeFileSync(path.join(dir, 'queue'), queue.join('\n') + '\n');
  fs.writeFileSync(script, [
    '#!/bin/bash',
    `q="${dir}/queue"; echo x >> "${dir}/count"`,
    'line="$(head -1 "$q")"; tail -n +2 "$q" > "$q.n"; mv "$q.n" "$q"',
    'code="${line%%|*}"; echo "${line#*|}"; exit "$code"',
  ].join('\n'));
  process.env.CP_BRANCH_FUNCTIONS_CHECK = script;
}
const checks = () => (fs.existsSync(path.join(dir, 'count')) ? fs.readFileSync(path.join(dir, 'count'), 'utf8').split('\n').filter(Boolean).length : 0);
const receipts = () => fs.readFileSync(path.join(dir, 'receipt.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; Reflect.deleteProperty(process.env, k); }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1312-hooks-'));
  process.env.CP_FUNCTION_CHECK_RECEIPT = path.join(dir, 'receipt.jsonl');
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

const MATCH = '0|match: 3 file(s)';
const DIFFERS = '1|differs: fn-a (server has other from 2026-11-05T10:00:00Z)';
const UNKNOWN = '2|unknown: the server did not answer';

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
