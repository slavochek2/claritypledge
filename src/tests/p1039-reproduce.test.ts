/**
 * P1039 Canary — pre-commit gate must block a new/modified migration that
 * contains an unscoped `USING(true)` / `WITH CHECK(true)` (or role-identity
 * function) non-SELECT RLS policy.
 *
 * Bug (P1035 incident): 5 RLS policies on prod (`points`, `point_positions`
 * x3, `profiles`) were named/commented as service-role-only test-data
 * bypasses but missing `TO service_role` — defaulting to every role,
 * including unauthenticated. The identical pattern recurred once already in
 * this codebase's history (a scoped-only fix was reintroduced unscoped 5
 * days later). Six months of prod exposure followed before an unrelated
 * adversarial-review pass caught it. This canary proves
 * scripts/check-migration-rls-scope.sh would have hard-blocked the exact
 * shape at authoring time, and stays a regression guard against the check
 * itself silently drifting out of sync with that shape.
 *
 * Harness: spawns the real script (bash, no stubs — the script has no
 * external dependencies beyond python3) against fixture SQL files in a
 * tmpdir sandbox.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let sandbox: string;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'p1039-rls-scope-'));
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function runChecker(files: string[]) {
  const checker = resolve(process.cwd(), 'scripts', 'check-migration-rls-scope.sh');
  const res = spawnSync('bash', [checker, ...files], { encoding: 'utf-8', timeout: 15_000 });
  return { status: res.status, output: `${res.stdout}\n${res.stderr}` };
}

function fixture(name: string, content: string): string {
  const p = join(sandbox, name);
  writeFileSync(p, content);
  return p;
}

describe('P1039: check-migration-rls-scope.sh (unscoped RLS policy gate)', () => {
  it('flags the exact P1035 shape: non-SELECT, role-identity WITH CHECK, no TO clause', () => {
    const f = fixture(
      'p1035-shape.sql',
      'CREATE POLICY "points_test_data_service_role_only" ON public.points\n' +
        '  FOR INSERT\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('flags a bare USING(true) non-SELECT policy with FOR omitted (implicit ALL)', () => {
    const f = fixture(
      'implicit-all.sql',
      'CREATE POLICY "everything_bypass" ON public.points\n' +
        '  USING (true)\n' +
        '  WITH CHECK (true);\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('accepts the same policy scoped with TO service_role', () => {
    const f = fixture(
      'scoped.sql',
      'CREATE POLICY "points_test_data_service_role_only" ON public.points\n' +
        '  FOR INSERT\n' +
        '  TO service_role\n' +
        "  WITH CHECK (current_setting('role') = 'service_role');\n",
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });

  it('accepts an unscoped policy carrying the -- intentionally-public annotation', () => {
    const f = fixture(
      'annotated.sql',
      '-- intentionally-public: anyone may submit anonymous feedback\n' +
        'CREATE POLICY "anyone_can_submit_feedback" ON public.feedback\n' +
        '  FOR INSERT\n' +
        '  WITH CHECK (true);\n',
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });

  it('never flags SELECT policies, even with USING(true) and no TO clause', () => {
    const f = fixture(
      'select-public.sql',
      'CREATE POLICY "points_visible_by_visibility" ON public.points\n' +
        '  FOR SELECT\n' +
        '  USING (true);\n',
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });

  it('does not flag a normal owner-scoped policy with no literal true', () => {
    const f = fixture(
      'owner-scoped.sql',
      'CREATE POLICY "owner_can_update" ON public.profiles\n' +
        '  FOR UPDATE\n' +
        '  USING (auth.uid() = user_id);\n',
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });

  it('ignores prose mentioning USING(true)/TO inside SQL comments', () => {
    const f = fixture(
      'prose.sql',
      '-- this migration does not use USING(true) anywhere for writes, no TO needed\n' +
        'CREATE TABLE public.widgets (id uuid primary key);\n',
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });
});
