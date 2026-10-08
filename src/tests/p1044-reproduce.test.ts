/**
 * P1044 / P1321 step 1 — the RLS-scope gate (scripts/check-rls-scope.py) had three
 * gaps found in P1041's adversarial review and re-confirmed on 2026-09-15:
 *
 *   1. Annotation smuggling — the `-- intentionally-public:` exemption was matched
 *      against RAW file content, so the phrase inside a string literal, a block
 *      comment or a dollar-quoted body exempted the whole file.
 *   2. Silent exemption — a file whose violations were exempted printed the same
 *      `ok` line as a genuinely clean file.
 *   3. Missed always-true forms — only the bare token `(true)` was recognised.
 *      `((true))`, `true::boolean`, `1=1`, `NOT false` all passed.
 *
 * Gap 3 is NOT fixed by widening the regex. P1207 found that enumerating spellings
 * of "true" is a losing game (`true AND true`, `2 > 1` defeated an allowlist in
 * under a minute — docs/audits/p1207-phase1-findings.md). The fix classifies a
 * predicate as CONSTANT when, after strings and comments are blanked, it names
 * nothing but SQL keywords, literals and operators — no column, no function. A
 * constant predicate cannot tell one row or caller from another, whatever its
 * spelling, so the tests below include forms nobody listed in P1044.
 *
 * Harness: spawns the real script against fixture files, no stubs. Written to fail
 * against the pre-fix checker, then pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let sandbox: string;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'p1044-rls-scope-'));
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function runChecker(files: string[]) {
  const checker = resolve(process.cwd(), 'scripts', 'check-rls-scope.py');
  const res = spawnSync('python3', [checker, ...files], { encoding: 'utf-8', timeout: 15_000 });
  return { status: res.status, output: `${res.stdout}\n${res.stderr}` };
}

let n = 0;
function fixture(content: string): string {
  n += 1;
  const p = join(sandbox, `f${n}.sql`);
  writeFileSync(p, content);
  return p;
}

const P1035_SHAPE =
  'CREATE POLICY "points_test_data_service_role_only" ON public.points\n' +
  '  FOR INSERT\n' +
  "  WITH CHECK (current_setting('role') = 'service_role');\n";

describe('P1044 gap 1: the exemption annotation must be a real -- line comment', () => {
  it('ignores the annotation phrase inside a single-quoted string value', () => {
    const f = fixture(
      "INSERT INTO public.docs (body) VALUES ('\n-- intentionally-public: example text shown in the docs page\n');\n\n" +
        P1035_SHAPE,
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  it('ignores the annotation phrase inside a /* */ block comment', () => {
    const f = fixture('/*\n-- intentionally-public: commented-out reasoning\n*/\n\n' + P1035_SHAPE);
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  it('ignores the annotation phrase inside a $$...$$ dollar-quoted body', () => {
    const f = fixture(
      'CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$\n' +
        '-- intentionally-public: inside a function body\n' +
        'SELECT 1;\n$$;\n\n' +
        P1035_SHAPE,
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  it('ignores the annotation phrase inside a tagged $body$ dollar-quoted body', () => {
    const f = fixture(
      'DO $body$\nBEGIN\n-- intentionally-public: smuggled\nPERFORM 1;\nEND\n$body$;\n\n' + P1035_SHAPE,
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  it('still honours a genuine -- line-comment annotation (no regression)', () => {
    const f = fixture('-- intentionally-public: anyone may submit a public feedback row\n' + P1035_SHAPE);
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });
});

describe('P1044 gap 2: an exempted violation is disclosed, not reported as clean', () => {
  it('names the exempted policy and says it was exempted', () => {
    const f = fixture('-- intentionally-public: anyone may submit a public feedback row\n' + P1035_SHAPE);
    const { status, output } = runChecker([f]);
    expect(status).toBe(0);
    expect(output).toMatch(/exempted/i);
    expect(output).toContain('points_test_data_service_role_only');
    expect(output).not.toContain('no unscoped role-restricting policies');
  });

  it('a genuinely clean file keeps the plain ok line and never says exempted', () => {
    const f = fixture(
      'CREATE POLICY "own_rows" ON public.points FOR INSERT WITH CHECK (auth.uid() = user_id);\n',
    );
    const { status, output } = runChecker([f]);
    expect(status).toBe(0);
    expect(output).toContain('no unscoped role-restricting policies');
    expect(output).not.toMatch(/exempted/i);
  });
});

describe('P1044 gap 3: every constant predicate is caught, however it is spelled', () => {
  // The four P1044 named, then forms P1207 used to defeat an enumerating detector.
  const CONSTANT_FORMS = [
    'WITH CHECK ((true))',
    'WITH CHECK (true::boolean)',
    'WITH CHECK (1=1)',
    'WITH CHECK (NOT false)',
    'WITH CHECK (true AND true)',
    'WITH CHECK (2 > 1)',
    'WITH CHECK ((SELECT true))',
    'WITH CHECK (1 = 1 /* ok */)',
    'WITH CHECK ($$x$$ IS NOT NULL)',
    "WITH CHECK ('a' = 'a')",
    'WITH CHECK (CAST(1 AS boolean))',
    'WITH CHECK (NULL IS NULL)',
  ];
  for (const form of CONSTANT_FORMS) {
    it(`flags INSERT ... ${form} with no TO clause`, () => {
      const f = fixture(`CREATE POLICY "bypass" ON public.points\n  FOR INSERT\n  ${form};\n`);
      const { status, output } = runChecker([f]);
      expect(output).toContain('VIOLATION');
      expect(status).toBe(1);
    });
  }

  it('flags a constant USING on UPDATE even when WITH CHECK names the caller (row hijack shape)', () => {
    const f = fixture(
      'CREATE POLICY "claim_any_row" ON public.points FOR UPDATE\n' +
        '  USING (1 = 1)\n  WITH CHECK (auth.uid() = user_id);\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  it('flags a constant predicate when FOR is omitted (defaults to ALL)', () => {
    const f = fixture('CREATE POLICY "all_open" ON public.points USING ((true));\n');
    const { status } = runChecker([f]);
    expect(status).toBe(1);
  });
});

describe('P1044 gap 3, controls: predicates that do discriminate are NOT flagged', () => {
  const ALLOWED = [
    ['caller identity', 'CREATE POLICY "p" ON public.points FOR INSERT WITH CHECK (auth.uid() = user_id);'],
    ['a column condition', "CREATE POLICY \"p\" ON public.points FOR INSERT WITH CHECK (status = 'draft');"],
    ['a helper function', 'CREATE POLICY "p" ON public.points FOR UPDATE USING (public.can_edit(id));'],
    ['a constant but scoped TO service_role', 'CREATE POLICY "p" ON public.points FOR INSERT TO service_role WITH CHECK (1 = 1);'],
    ['a constant SELECT (public reads are normal)', 'CREATE POLICY "p" ON public.points FOR SELECT USING ((true));'],
    ['a column named like a keyword prefix', 'CREATE POLICY "p" ON public.points FOR DELETE USING (true_owner = auth.uid());'],
  ];
  for (const [label, sql] of ALLOWED) {
    it(`does not flag ${label}`, () => {
      const f = fixture(sql + '\n');
      const { status, output } = runChecker([f]);
      expect(output).not.toContain('VIOLATION');
      expect(status).toBe(0);
    });
  }
});

describe('P1044 gap 3, deny controls: a plain `false` is a deny, not an opening', () => {
  // Every "... blocked" policy in the migration history is spelled this way (11 found by the
  // full-corpus scan); flagging them would teach people to annotate their way past the gate.
  for (const form of ['WITH CHECK (false)', 'WITH CHECK ((false))', 'WITH CHECK (false::boolean)']) {
    it(`does not flag INSERT ... ${form}`, () => {
      const f = fixture(`CREATE POLICY "blocked" ON public.points FOR INSERT ${form};\n`);
      const { status } = runChecker([f]);
      expect(status).toBe(0);
    });
  }

  // The gate does not evaluate SQL: a constant that is not literally `false` is flagged even
  // when it happens to be false. Rewriting it as `false` is the fix.
  for (const form of ['USING (1 = 0)', 'USING (NOT true)', 'USING (false OR true)']) {
    it(`flags DELETE ... ${form} (not a plain false)`, () => {
      const f = fixture(`CREATE POLICY "obscure" ON public.points FOR DELETE ${form};\n`);
      const { status } = runChecker([f]);
      expect(status).toBe(1);
    });
  }
});

// Round 2 — found by Codex review of the first fix (2026-10-08) and reproduced before fixing.
describe('P1321 review round: forms the first fix still missed', () => {
  it('ignores the annotation inside a dollar-quoted body with a non-ASCII tag ($é$)', () => {
    const f = fixture(
      'DO $é$\nBEGIN\n-- intentionally-public: inside an executable body\nNULL;\nEND\n$é$;\n' +
        'CREATE POLICY bypass ON public.points FOR INSERT WITH CHECK (1=1);\n',
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  for (const form of [
    'WITH CHECK (1e0 = 1e0)',
    'WITH CHECK (0x1F = 0x1F)',
    "WITH CHECK ('x' SIMILAR TO 'x')",
    "WITH CHECK (coalesce(true, false))",
    'WITH CHECK (1.5E+2 > 0)',
  ]) {
    it(`flags INSERT ... ${form} with no TO clause`, () => {
      const f = fixture(`CREATE POLICY "bypass" ON public.points FOR INSERT ${form};\n`);
      const { status, output } = runChecker([f]);
      expect(output).toContain('VIOLATION');
      expect(status).toBe(1);
    });
  }

  it('a TO inside the predicate (SIMILAR TO) is not a scoping clause — the P1035 shape still flags', () => {
    const f = fixture(
      "CREATE POLICY p ON public.points FOR INSERT WITH CHECK (current_setting('role') SIMILAR TO 'service_role');\n",
    );
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).toBe(1);
  });

  it('a real TO clause in the header still scopes the policy', () => {
    const f = fixture(
      "CREATE POLICY p ON public.points FOR INSERT TO service_role WITH CHECK ('x' SIMILAR TO 'x');\n",
    );
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });

  it('does not flag a quoted boolean column ("is_public") as constant', () => {
    const f = fixture('CREATE POLICY own_flag ON public.points FOR INSERT WITH CHECK ("is_public");\n');
    const { status, output } = runChecker([f]);
    expect(output).not.toContain('VIOLATION');
    expect(status).toBe(0);
  });

  it('does not flag an unknown helper function call (it may read the caller)', () => {
    const f = fixture('CREATE POLICY p ON public.points FOR UPDATE USING (public.is_admin());\n');
    const { status } = runChecker([f]);
    expect(status).toBe(0);
  });
});

describe('P1321 review round: keyword-with-paren forms stay constant', () => {
  for (const form of ['WITH CHECK (EXISTS (SELECT 1))', 'WITH CHECK (1 IN (1, 2))', 'WITH CHECK (1 = ANY (ARRAY[1]))', 'WITH CHECK (NOT (false))']) {
    it(`flags INSERT ... ${form}`, () => {
      const f = fixture(`CREATE POLICY "bypass" ON public.points FOR INSERT ${form};\n`);
      expect(runChecker([f]).status).toBe(1);
    });
  }
  it('does not flag EXISTS over a real table (it reads rows)', () => {
    const f = fixture('CREATE POLICY p ON public.points FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid()));\n');
    expect(runChecker([f]).status).toBe(0);
  });
});
