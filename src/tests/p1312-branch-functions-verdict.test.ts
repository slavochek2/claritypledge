/**
 * P1312: the verdict a branch's E2E run reaches about whether TEST served the branch's edge
 * functions (scripts/lib/branch-functions-verdict.mjs). Pure: the script's exit status and first
 * line go in, a verdict comes out. The table is the spec's Step 3 table.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCheckResult,
  functionsVerdict,
  functionsSkipReason,
  functionsLine,
} from '../../scripts/lib/branch-functions-verdict.mjs';

const r = (status: number | null, stdout: string) => parseCheckResult({ status, stdout });

describe('P1312 parseCheckResult', () => {
  it('reads each of the four statuses with its exit code', () => {
    expect(r(0, 'no changed functions\n').state).toBe('none');
    expect(r(0, 'match: 14 file(s)\n').state).toBe('match');
    expect(r(1, 'differs: fn-a (server has main from 2026-11-05T10:00:00Z)\nFix: x\n').state).toBe('differs');
    expect(r(2, 'unknown: server did not answer\n').state).toBe('unknown');
  });
  it('keeps only the first line as the status text', () => {
    expect(r(1, 'differs: fn-a\nFix: deploy\n').line).toBe('differs: fn-a');
  });
  it('treats anything else as unknown, never a pass', () => {
    expect(r(0, '').state).toBe('unknown');
    expect(r(0, 'all good\n').state).toBe('unknown');
    expect(r(0, 'differs: fn-a\n').state).toBe('unknown'); // right prefix, wrong exit code
    expect(r(1, 'match: 3 file(s)\n').state).toBe('unknown');
    expect(r(2, 'match: 3 file(s)\n').state).toBe('unknown');
    expect(r(3, 'match: 3 file(s)\n').state).toBe('unknown');
    expect(r(null, 'match: 3 file(s)\n').state).toBe('unknown'); // killed / not spawned
    expect(r(0, undefined as unknown as string).state).toBe('unknown');
  });
  it('keeps the reason when the output is malformed', () => {
    expect(r(0, 'all good\n').line).toMatch(/unexpected/i);
  });
});

describe('P1312 functionsVerdict: the table', () => {
  const ok = ['match', 'none'];
  const bad = ['differs', 'unknown'];
  for (const s of ok) for (const e of ok) {
    it(`start ${s}, end ${e}: trusted, passes with or without the flag`, () => {
      expect(functionsVerdict({ start: s, end: e, requireFlag: false })).toMatchObject({ verdict: 'trusted', action: 'pass' });
      expect(functionsVerdict({ start: s, end: e, requireFlag: true })).toMatchObject({ verdict: 'trusted', action: 'pass' });
    });
  }
  for (const e of bad) {
    it(`start match, end ${e}: untrusted; warns, and fails under the flag`, () => {
      expect(functionsVerdict({ start: 'match', end: e, requireFlag: false })).toMatchObject({ verdict: 'changed-during-run', action: 'warn' });
      expect(functionsVerdict({ start: 'match', end: e, requireFlag: true })).toMatchObject({ verdict: 'changed-during-run', action: 'fail' });
    });
  }
  for (const s of bad) for (const e of [...ok, ...bad, null]) {
    it(`start ${s}, end ${e}: started on other code; warns, refused under the flag`, () => {
      expect(functionsVerdict({ start: s, end: e, requireFlag: false })).toMatchObject({ verdict: 'started-on-other-code', action: 'warn' });
      expect(functionsVerdict({ start: s, end: e, requireFlag: true })).toMatchObject({ verdict: 'started-on-other-code', action: 'fail' });
    });
  }
  it('a start the check never produced is not trusted', () => {
    expect(functionsVerdict({ start: undefined as unknown as string, end: 'match', requireFlag: true }).action).toBe('fail');
    expect(functionsVerdict({ start: 'garbage', end: 'match', requireFlag: true }).action).toBe('fail');
  });
  it('a missing end after a good start is unconfirmed, not trusted', () => {
    expect(functionsVerdict({ start: 'match', end: null, requireFlag: true })).toMatchObject({ verdict: 'changed-during-run', action: 'fail' });
  });
  it('carries a message that names the consequence', () => {
    expect(functionsVerdict({ start: 'match', end: 'differs', requireFlag: true }).message).toMatch(/untrusted/i);
    expect(functionsVerdict({ start: 'differs', end: null, requireFlag: true }).message).toMatch(/untrusted/i);
  });
});

describe('P1312 functionsSkipReason: the gate', () => {
  const base = { hasWebServer: true, env: {}, argv: ['node', 'playwright', 'test'] };
  it('runs for a local run with a webServer', () => {
    expect(functionsSkipReason(base)).toBeNull();
  });
  it('skips with no webServer (the remote smoke modes)', () => {
    expect(functionsSkipReason({ ...base, hasWebServer: false })).toMatch(/webServer/);
  });
  it('skips in CI, VERIFY_PROD and a load-test run', () => {
    expect(functionsSkipReason({ ...base, env: { CI: '1' } })).toMatch(/CI/);
    expect(functionsSkipReason({ ...base, env: { VERIFY_PROD: '1' } })).toMatch(/VERIFY_PROD/);
    expect(functionsSkipReason({ ...base, env: { E2E_LOADTEST: '2' } })).toMatch(/E2E_LOADTEST/);
  });
  it('skips --ui and --list, also spelled with =', () => {
    expect(functionsSkipReason({ ...base, argv: ['node', 'playwright', 'test', '--ui'] })).toMatch(/--ui/);
    expect(functionsSkipReason({ ...base, argv: ['node', 'playwright', 'test', '--list'] })).toMatch(/--list/);
    expect(functionsSkipReason({ ...base, argv: ['node', 'playwright', 'test', '--ui-port=9'] })).toMatch(/--ui-port/);
  });
  it('an empty-string flag value is still off', () => {
    expect(functionsSkipReason({ ...base, env: { CI: '' } })).toBeNull();
  });
});

describe('P1312 functionsLine', () => {
  it('is one line starting FUNCTIONS: with no shell redirect tokens', () => {
    const l = functionsLine({ verdict: 'trusted', start: 'match', end: 'match' });
    expect(l).toMatch(/^FUNCTIONS: /);
    expect(l).not.toMatch(/[<>|\n]/);
  });
  it('names both ends and the verdict', () => {
    expect(functionsLine({ verdict: 'changed-during-run', start: 'match', end: 'differs' })).toBe(
      'FUNCTIONS: changed-during-run (start match, end differs)');
  });
  it('says so when the end was not checked', () => {
    expect(functionsLine({ verdict: 'started-on-other-code', start: 'differs', end: null })).toMatch(/end not checked/);
  });
});
