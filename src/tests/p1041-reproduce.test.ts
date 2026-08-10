/**
 * P1041 Canary — the P1039 RLS-scope gate (scripts/check-rls-scope.py) has false
 * negatives on its own target vulnerability. Found via /slava:think:adversarial-review
 * (5 hostile reviewers, diverse lenses) run against the just-shipped P1039 gate;
 * every finding here was independently reproduced (not taken on a reviewer's word)
 * before being written as a permanent regression test.
 *
 * Root cause: _strip_strings_and_comments() only blanks single-quoted strings and
 * `--` line comments. It does not blank double-quoted identifiers, `/* *\/` block
 * comments, or `$$...$$` dollar-quoted strings — each is a distinct bypass of the
 * TO-clause / role-identity detection this gate exists to enforce.
 *
 * These tests assert the CORRECT (expected) behavior and are written to FAIL
 * against the pre-fix checker — proving the bug — then pass once
 * scripts/check-rls-scope.py is fixed in this same P1041 branch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let sandbox: string;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'p1041-rls-scope-'));
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function runChecker(files: string[]) {
  const checker = resolve(process.cwd(), 'scripts', 'check-rls-scope.py');
  const res = spawnSync('python3', [checker, ...files], { encoding: 'utf-8', timeout: 15_000 });
  return { status: res.status, output: `${res.stdout}\n${res.stderr}` };
}

function fixture(name: string, content: string): string {
  const p = join(sandbox, name);
  writeFileSync(p, content);
  return p;
}

describe('P1041: double-quoted policy names bypass the gate (CRITICAL, real repo content)', () => {
  it('flags "Allow trigger to insert position history" (real migration, verbatim P1035 shape)', () => {
    const { status, output } = runChecker([
      'supabase/migrations/20260216_fix_position_history_rls.sql',
    ]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags "Allow trigger to insert story point history" (real migration)', () => {
    const { status, output } = runChecker([
      'supabase/migrations/20260220120000_story_point_history_cascade.sql',
    ]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags a synthetic policy name containing "for select" as an isolated word', () => {
    const f = fixture(
      'name-for-select.sql',
      'CREATE POLICY "Service role bypass for select and insert on points" ON public.points\n' +
        '  FOR INSERT\n' +
        '  WITH CHECK (true);\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });
});

describe('P1041: $$ dollar-quoted strings desync the tokenizer (CRITICAL)', () => {
  it('still flags a policy after an apostrophe inside a $$...$$ body earlier in the file', () => {
    const f = fixture(
      'dollar-quote-apostrophe.sql',
      "COMMENT ON TABLE public.points IS $$Points ledger. Don't edit rows by hand.$$;\n\n" +
        'CREATE POLICY "points_insert" ON public.points\n' +
        '  FOR INSERT\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });
});

describe('P1041: /* */ block comments are never stripped (CRITICAL/HIGH)', () => {
  it('still flags a policy after an apostrophe inside a preceding block comment', () => {
    const f = fixture(
      'block-comment-apostrophe.sql',
      "/* Fixes the user's profile RLS so seeding works. */\n" +
        'CREATE POLICY "profiles_test_data_service_role_only" ON public.profiles\n' +
        '  FOR INSERT\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('still flags a policy whose FOR clause has a trailing block comment containing "TO"', () => {
    const f = fixture(
      'block-comment-to.sql',
      'CREATE POLICY "points_insert" ON public.points\n' +
        '  FOR INSERT\n' +
        '  /* TODO: narrow this TO service_role in a follow-up */\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('still flags a policy whose block comment hides a semicolon before the real WITH CHECK', () => {
    const f = fixture(
      'block-comment-semicolon.sql',
      'CREATE POLICY "points_insert" ON public.points\n' +
        '  /* supersedes policy added in 20250101000000_points.sql; see P1035 */\n' +
        '  FOR INSERT\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });
});

describe('P1041: role-identity regex misses common Supabase/SQL idioms (HIGH)', () => {
  it('flags current_user (bare SQL keyword) as role-identity — real migration', () => {
    const { status, output } = runChecker([
      'supabase/migrations/20260302130000_story_versions_insert_policy_v2.sql',
    ]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags auth.jwt() ->> \'role\' (dominant modern Supabase idiom)', () => {
    const f = fixture(
      'authjwt-role.sql',
      'CREATE POLICY "points_service_role_writes" ON public.points\n' +
        '  FOR INSERT\n' +
        "  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags session_user as role-identity', () => {
    const f = fixture(
      'session-user.sql',
      'CREATE POLICY "points_session_check" ON public.points\n' +
        '  FOR UPDATE\n' +
        "  USING (session_user = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });
});

describe('P1041: TO PUBLIC is not sufficient scoping (HIGH)', () => {
  it('flags a policy with a bare TO PUBLIC clause', () => {
    const f = fixture(
      'to-public.sql',
      'CREATE POLICY "points_open" ON public.points\n' +
        '  FOR INSERT\n' +
        '  TO PUBLIC\n' +
        '  WITH CHECK (true);\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags a role list containing public alongside a real role', () => {
    const f = fixture(
      'to-role-list-public.sql',
      'CREATE POLICY "points_open2" ON public.points\n' +
        '  FOR INSERT\n' +
        '  TO service_role, public\n' +
        '  WITH CHECK (true);\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags ALTER POLICY ... TO PUBLIC widening an otherwise-correctly-scoped policy', () => {
    const f = fixture(
      'alter-policy-to-public.sql',
      'CREATE POLICY "points_seed" ON public.points\n' +
        '  FOR INSERT\n' +
        '  TO service_role\n' +
        '  WITH CHECK (true);\n\n' +
        'ALTER POLICY "points_seed" ON public.points TO public;\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('still accepts a real, non-public TO clause with no risky USING/WITH CHECK values', () => {
    const f = fixture(
      'to-real-role-ok.sql',
      'CREATE POLICY "points_scoped_ok" ON public.points\n' +
        '  FOR INSERT\n' +
        '  TO service_role\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });
});

describe('P1041: unreadable/missing staged file must fail closed, not silently pass (HIGH)', () => {
  it('reports an error and non-zero exit for a missing file', () => {
    const { status, output } = runChecker([join(sandbox, 'does-not-exist.sql')]);
    expect(status).not.toBe(0);
    expect(output.trim().length).toBeGreaterThan(0);
  });
});
