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
  requireFlagOn,
} from '../../scripts/lib/branch-functions-verdict.mjs';

const r = (status: number | null, stdout: string) => parseCheckResult({ status, stdout });

describe('P1312 parseCheckResult: the container start line and the detail', () => {
  it('reads the container start from the second line of a match', () => {
    expect(r(0, 'match: 14 file(s)\nSTARTED: 1788000000123456789\n')).toMatchObject({ state: 'match', started: '1788000000123456789' });
  });
  it('a match without a container start is unknown (cannot be compared at the end)', () => {
    expect(r(0, 'match: 14 file(s)\n').state).toBe('unknown');
    expect(r(0, 'match: 14 file(s)\nSTARTED: soon\n').state).toBe('unknown');
    expect(r(0, 'match: 14 file(s)\nsomething\nSTARTED: 5\n').state).toBe('unknown');
  });
  it('keeps the rest of the output, without the bookkeeping line', () => {
    const o = r(1, 'differs: fn-a (x)\nSTARTED: 5\nFix: deploy:\n  scripts/selfhosted/deploy-functions.sh fn-a\n');
    expect(o.state).toBe('differs');
    expect(o.detail).toBe('Fix: deploy:\n  scripts/selfhosted/deploy-functions.sh fn-a');
    expect(o.detail).not.toMatch(/STARTED/);
  });
  it('keeps what an unknown says clears it', () => {
    expect(r(2, 'unknown: stuck deploy lock\nrm -r x\n').detail).toBe('rm -r x');
  });
});

describe('P1312 parseCheckResult', () => {
  it('reads each of the four statuses with its exit code', () => {
    expect(r(0, 'no changed functions\n').state).toBe('none');
    expect(r(0, 'match: 14 file(s)\nSTARTED: 1\n').state).toBe('match');
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
  const same = { startStarted: '1000', endStarted: '1000', startHead: 'aaa', endHead: 'aaa' };
  it('match to match on one container and one commit: trusted, passes with or without the flag', () => {
    expect(functionsVerdict({ start: 'match', end: 'match', requireFlag: false, ...same })).toMatchObject({ verdict: 'trusted', action: 'pass' });
    expect(functionsVerdict({ start: 'match', end: 'match', requireFlag: true, ...same })).toMatchObject({ verdict: 'trusted', action: 'pass' });
  });
  it('none to none is not-applicable, passes under the flag, and is never called trusted', () => {
    expect(functionsVerdict({ start: 'none', end: 'none', requireFlag: true, startHead: 'aaa', endHead: 'aaa' })).toMatchObject({ verdict: 'not-applicable', action: 'pass' });
    expect(functionsVerdict({ start: 'none', end: 'none', requireFlag: false })).toMatchObject({ verdict: 'not-applicable', action: 'pass' });
  });
  it('M4: any change of state between the start and the end is untrusted', () => {
    for (const [s, e] of [['match', 'none'], ['none', 'match']]) {
      expect(functionsVerdict({ start: s, end: e, requireFlag: false, ...same })).toMatchObject({ verdict: 'changed-during-run', action: 'warn' });
      expect(functionsVerdict({ start: s, end: e, requireFlag: true, ...same })).toMatchObject({ verdict: 'changed-during-run', action: 'fail' });
    }
  });
  it('M4: a HEAD that moved is untrusted, even for none to none', () => {
    const moved = { startHead: 'aaa', endHead: 'bbb' };
    expect(functionsVerdict({ start: 'match', end: 'match', requireFlag: true, startStarted: '1', endStarted: '1', ...moved })).toMatchObject({ verdict: 'changed-during-run', action: 'fail' });
    expect(functionsVerdict({ start: 'none', end: 'none', requireFlag: true, ...moved })).toMatchObject({ verdict: 'changed-during-run', action: 'fail' });
  });
  it('H1: a container that restarted between the start and the end is untrusted although the files match', () => {
    const v = functionsVerdict({ start: 'match', end: 'match', requireFlag: true, startStarted: '1000', endStarted: '2000', startHead: 'a', endHead: 'a' });
    expect(v).toMatchObject({ verdict: 'changed-during-run', action: 'fail' });
    expect(v.message).toMatch(/restarted/);
  });
  it('H1: a container start that is missing at either end is not trusted', () => {
    expect(functionsVerdict({ start: 'match', end: 'match', requireFlag: true, startStarted: '', endStarted: '1', startHead: 'a', endHead: 'a' }).action).toBe('fail');
    expect(functionsVerdict({ start: 'match', end: 'match', requireFlag: true, startStarted: '1', startHead: 'a', endHead: 'a' }).action).toBe('fail');
  });
  it('the flag: 1 and true are on, anything else is off', () => {
    expect(requireFlagOn('1')).toBe(true);
    expect(requireFlagOn('true')).toBe(true);
    expect(requireFlagOn('TRUE')).toBe(true);
    expect(requireFlagOn('0')).toBe(false);
    expect(requireFlagOn('')).toBe(false);
    expect(requireFlagOn(undefined)).toBe(false);
  });
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
    expect(functionsVerdict({ start: undefined as unknown as string, end: 'match', requireFlag: true, ...same }).action).toBe('fail');
    expect(functionsVerdict({ start: 'garbage', end: 'match', requireFlag: true, ...same }).action).toBe('fail');
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
