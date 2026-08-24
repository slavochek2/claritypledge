/**
 * P887 Canary — migrate.sh prod path must gate on a pending-migration ack
 * and auto-run the prod smoke test after a successful apply.
 *
 * Bug (P886 incident): `migrate.sh --env prod` applies ALL pending migrations
 * silently — no upfront pending list, no acknowledgment, no `--yes` flag — and
 * never runs scripts/prod-smoke-test.mjs afterward. A held-back client-breaking
 * grants migration was swept into an unrelated backend ship and broke prod auth
 * for ~1.5h, detected by an end user instead of tooling.
 *
 * Harness: hermetic sandbox in tmpdir — a fresh copy of the real
 * scripts/migrate.sh (copied from HEAD at each run, so this canary tracks the
 * live script) runs against stub `curl`/`security`/`npx` binaries on PATH plus
 * stubbed sibling scripts. Zero network, zero real DB.
 *
 * Prod-gate contract (asserted here):
 *   A. prod, non-interactive stdin, no --yes → print every pending migration
 *      filename upfront, apply NOTHING, exit non-zero
 *   B. prod, --yes → apply, then run `node "$SCRIPT_DIR/prod-smoke-test.mjs"`;
 *      exit 0 when smoke passes
 *   C. prod, --yes, smoke exits non-zero → exit non-zero with a loud
 *      smoke-failure message
 *   D. test env (no --env prod) → behavior unchanged: no ack required,
 *      no smoke run
 *   E. prod, zero pending → no ack needed, smoke still runs
 *   F. prod, --yes, pending file carries "-- requires-frontend: <sha>" with
 *      the sha NOT on origin/main → hard-block before any apply (--yes does
 *      not bypass the coupling gate)
 *   G. same marker but sha IS deployed → coupling OK, applies + smoke runs
 *   H. indented marker still arms the gate (a ^-- anchor would let leading
 *      whitespace silently bypass the coupling check — review finding)
 *   Plus a separate block covering scripts/check-migration-client-safety.sh
 *   (the pre-commit annotation gate): violation / annotated / benign+prose.
 *
 * Canary gate (resolved):
 *   Before the fix, scenarios A–C failed and were guarded by `it.fails` to
 *   keep the suite green while the bug was open. The fix landed both gates
 *   in migrate.sh (pending-list ack + post-migrate smoke), so A–C are now
 *   plain `it()` regression guards. Scenario D passes before AND after.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/** Unique string inside the pending migration's SQL body — its presence in the
 * curl log proves the apply POST for that file was actually sent. */
const PENDING_SENTINEL = 'P887_PENDING_SENTINEL';
const PENDING_FILE = '20260602160000_p877_grants_gate.sql';
const APPLIED_FILE = '20260101000000_baseline.sql';
/** Extra fixture for the coupling-marker scenarios (F/G) — written per-test,
 * removed in afterEach so scenarios A–E keep a single pending migration. */
const COUPLED_FILE = '20260603000000_p887_coupled.sql';
const COUPLED_SHA = 'abc123def4567';

let sandbox: string;
let smokeMarker: string;
let curlLog: string;

function buildSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p887-'));
  mkdirSync(join(dir, 'bin'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true });

  // Real script under test — fresh copy so the canary follows the live script
  copyFileSync(resolve(process.cwd(), 'scripts/migrate.sh'), join(dir, 'scripts', 'migrate.sh'));

  // migrate.sh sources its guards from scripts/lib/ and FAILS CLOSED when one is
  // missing (P1042) — a sandbox without them aborts before reaching the prod gates
  // this file tests. Copy the real guards in rather than stubbing them, so the
  // sandbox mirrors the shipped layout.
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  for (const lib of readdirSync(resolve(process.cwd(), 'scripts/lib'))) {
    copyFileSync(
      resolve(process.cwd(), 'scripts/lib', lib),
      join(dir, 'scripts', 'lib', lib),
    );
    chmodSync(join(dir, 'scripts', 'lib', lib), 0o755);
  }

  // Fake env files — no real credentials anywhere in this harness
  const envBody = [
    'VITE_SUPABASE_URL=https://fakeproject.supabase.co',
    'SUPABASE_DB_URL=postgresql://postgres:CHANGE_ME_fake@db.fakeproject.supabase.co:5432/postgres', // gitleaks:allow — fake fixture, not a credential
    'SUPABASE_ACCESS_TOKEN=sbp_fake_pat_for_harness',
  ].join('\n');
  writeFileSync(join(dir, '.env.prod'), envBody);
  writeFileSync(join(dir, '.env.local'), envBody);

  // Migrations: one already applied (per curl stub below), one PENDING —
  // simulates the held-back client-breaking grants migration of P886
  writeFileSync(join(dir, 'supabase', 'migrations', APPLIED_FILE), 'SELECT 1;\n');
  writeFileSync(
    join(dir, 'supabase', 'migrations', PENDING_FILE),
    `-- ${PENDING_SENTINEL}: simulates a held-back client-breaking grants migration\nSELECT 1;\n`,
  );

  // curl stub: schema_migrations SELECT → applied set controlled by
  // (Matched on 'SELECT version' + 'supabase_migrations' rather than the full SQL
  // literal: P1042 added the `name` column to that query, and an exact-string match
  // silently stopped matching — the stub then fell through to the apply branch and
  // every migration read as pending. A stub pinned to a literal is a fixture that
  // breaks on unrelated edits and blames the code.)
  // P887_ALL_APPLIED (zero-pending scenario) vs default (one pending);
  // history INSERT → silent success; anything else (the apply) → HTTP 201 + []
  writeFileSync(
    join(dir, 'bin', 'curl'),
    `#!/bin/bash
ARGS="$*"
echo "CURL_CALL: $ARGS" >> "${join(dir, 'curl-calls.log')}"
if [[ "$ARGS" == *"SELECT version"*"supabase_migrations"* ]]; then
  if [ "$P887_ALL_APPLIED" = "1" ]; then
    printf '[{"version":"20260101000000"},{"version":"20260602160000"}]\\n200\\n'
  else
    printf '[{"version":"20260101000000"}]\\n200\\n'
  fi
elif [[ "$ARGS" == *"INSERT INTO supabase_migrations"* ]]; then
  exit 0
else
  printf '[]\\n201\\n'
fi
`,
  );

  // security stub: no keychain PAT → forces the env-file token fallback
  writeFileSync(join(dir, 'bin', 'security'), '#!/bin/bash\nexit 1\n');

  // git stub: coupling-gate ancestry check — exit code injectable per scenario
  // (0 = sha is an ancestor of origin/main = frontend deployed; 1 = not)
  writeFileSync(
    join(dir, 'bin', 'git'),
    `#!/bin/bash
if [[ "$*" == *"merge-base --is-ancestor"* ]]; then
  exit "$P887_GIT_ANCESTOR_EXIT"
fi
exit 0
`,
  );

  // npx stub: test-env CLI path (`supabase migration list` / `db push`) succeeds
  writeFileSync(join(dir, 'bin', 'npx'), '#!/bin/bash\necho "npx-stub: $*"\nexit 0\n');

  // Sibling-script stubs
  writeFileSync(
    join(dir, 'scripts', 'stamp-deploy-manifest.sh'),
    '#!/bin/bash\necho "stub: stamp-deploy-manifest $*"\nexit 0\n',
  );
  // Smoke stub: records that it ran via marker file; exit code injectable
  writeFileSync(
    join(dir, 'scripts', 'prod-smoke-test.mjs'),
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.P887_SMOKE_MARKER, 'smoke executed');
process.exit(Number(process.env.P887_SMOKE_EXIT ?? '0'));
`,
  );

  for (const f of [
    join('scripts', 'migrate.sh'),
    join('bin', 'curl'),
    join('bin', 'security'),
    join('bin', 'npx'),
    join('bin', 'git'),
    join('scripts', 'stamp-deploy-manifest.sh'),
    join('scripts', 'prod-smoke-test.mjs'),
  ]) {
    chmodSync(join(dir, f), 0o755);
  }
  return dir;
}

function runMigrate(
  args: string[],
  opts: { smokeExit?: number; allApplied?: boolean; gitAncestorExit?: number } = {},
) {
  const res = spawnSync('bash', [join(sandbox, 'scripts', 'migrate.sh'), ...args], {
    env: {
      ...process.env,
      PATH: `${join(sandbox, 'bin')}:${process.env.PATH ?? ''}`,
      P887_SMOKE_MARKER: smokeMarker,
      P887_SMOKE_EXIT: String(opts.smokeExit ?? 0),
      P887_ALL_APPLIED: opts.allApplied ? '1' : '0',
      P887_GIT_ANCESTOR_EXIT: String(opts.gitAncestorExit ?? 1),
    },
    input: '', // stdin is a closed pipe → non-interactive
    encoding: 'utf-8',
    timeout: 30_000,
  });
  return { status: res.status, output: `${res.stdout}\n${res.stderr}` };
}

/** Write the marker-carrying pending migration for the coupling scenarios. */
function writeCoupledMigration(): void {
  writeFileSync(
    join(sandbox, 'supabase', 'migrations', COUPLED_FILE),
    `-- requires-frontend: ${COUPLED_SHA}\nSELECT 1;\n`,
  );
}

/** True when the apply POST for the pending migration reached the (stub) API. */
function appliedPending(): boolean {
  if (!existsSync(curlLog)) return false;
  return readFileSync(curlLog, 'utf-8').includes(PENDING_SENTINEL);
}

beforeAll(() => {
  sandbox = buildSandbox();
  smokeMarker = join(sandbox, 'smoke-ran.marker');
  curlLog = join(sandbox, 'curl-calls.log');
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(smokeMarker, { force: true });
  rmSync(curlLog, { force: true });
});

afterEach(() => {
  // Scenarios F/G add a marker-carrying migration; A–E expect it absent.
  rmSync(join(sandbox, 'supabase', 'migrations', COUPLED_FILE), { force: true });
});

describe('P887: migrate.sh prod pending-ack + post-migrate smoke', () => {
  // Scenario A — the P886 replay: held-back migration must be named and held
  it('prod, non-interactive, no --yes: lists pending migrations, applies nothing, exits non-zero', () => {
    const { status, output } = runMigrate(['--env', 'prod']);
    // Upfront pending list names the held-back migration
    expect(output).toContain(PENDING_FILE);
    // Refuses to proceed without explicit ack
    expect(status).not.toBe(0);
    // The list was computed from remote state (SELECT ran)…
    expect(readFileSync(curlLog, 'utf-8')).toContain('SELECT version');
    // …but nothing was applied
    expect(appliedPending()).toBe(false);
    // No DB mutation happened → no smoke run either
    expect(existsSync(smokeMarker)).toBe(false);
  });

  // Scenario B — acknowledged apply must end in an automatic smoke run.
  // Flags deliberately in reverse order: the old for+shift parser misparsed
  // "--yes --env prod" into ENV_NAME="--env" (review finding); the while/case
  // parser must accept any order.
  it('prod, --yes (reversed flag order): applies pending migrations, then auto-runs the prod smoke test', () => {
    const { status } = runMigrate(['--yes', '--env', 'prod']);
    expect(appliedPending()).toBe(true);
    expect(existsSync(smokeMarker)).toBe(true);
    expect(status).toBe(0);
  });

  // Scenario C — a failing smoke after apply must be loud
  it('prod, --yes, smoke fails: exits non-zero with a loud smoke-failure message', () => {
    const { status, output } = runMigrate(['--env', 'prod', '--yes'], { smokeExit: 1 });
    expect(existsSync(smokeMarker)).toBe(true); // smoke did run
    expect(status).not.toBe(0);
    expect(output).toMatch(/smoke/i);
    expect(output).toMatch(/fail/i);
  });

  // Scenario D — regression guard: passes today and must keep passing after the fix
  it('test env (no --env prod): behavior unchanged — exits 0, no ack demanded, no smoke run', () => {
    const { status } = runMigrate([]);
    expect(status).toBe(0);
    expect(existsSync(smokeMarker)).toBe(false);
  });

  // Scenario E — zero pending on prod: no ack needed (nothing to acknowledge),
  // nothing applied, but the smoke gate still runs. Guards against a future
  // early-exit on "No pending migrations" silently disabling the smoke.
  it('prod, zero pending, no --yes: proceeds without ack, applies nothing, still runs smoke', () => {
    const { status, output } = runMigrate(['--env', 'prod'], { allApplied: true });
    expect(output).toContain('No pending migrations');
    expect(appliedPending()).toBe(false);
    expect(existsSync(smokeMarker)).toBe(true);
    expect(status).toBe(0);
  });

  // Scenario F — coupling gate: a pending migration whose requires-frontend
  // sha is NOT on origin/main hard-blocks the prod apply. --yes must NOT
  // bypass it. This is the mechanical P886 prevention.
  it('prod, --yes, requires-frontend sha undeployed: hard-blocks before any apply', () => {
    writeCoupledMigration();
    const { status, output } = runMigrate(['--env', 'prod', '--yes'], { gitAncestorExit: 1 });
    expect(output).toContain('BLOCKED');
    expect(output).toContain(COUPLED_FILE);
    expect(status).not.toBe(0);
    // Refused before ANY SQL ran — neither the coupled nor the plain pending file
    expect(appliedPending()).toBe(false);
    expect(existsSync(smokeMarker)).toBe(false);
  });

  // Scenario G — coupling satisfied: sha is an ancestor of origin/main →
  // both pending migrations apply and the smoke gate runs.
  it('prod, --yes, requires-frontend sha deployed: coupling OK, applies and runs smoke', () => {
    writeCoupledMigration();
    const { status, output } = runMigrate(['--env', 'prod', '--yes'], { gitAncestorExit: 0 });
    expect(output).toContain('coupling OK');
    expect(appliedPending()).toBe(true);
    expect(existsSync(smokeMarker)).toBe(true);
    expect(status).toBe(0);
  });

  // Scenario H — an INDENTED marker must still arm the gate (review HIGH
  // finding: a ^-- anchor let leading whitespace bypass the check entirely).
  it('prod, --yes, indented requires-frontend marker, sha undeployed: still hard-blocks', () => {
    writeFileSync(
      join(sandbox, 'supabase', 'migrations', COUPLED_FILE),
      `  -- requires-frontend: ${COUPLED_SHA}\nSELECT 1;\n`,
    );
    const { status, output } = runMigrate(['--env', 'prod', '--yes'], { gitAncestorExit: 1 });
    expect(output).toContain('BLOCKED');
    expect(status).not.toBe(0);
    expect(appliedPending()).toBe(false);
  });
});

describe('P887: check-migration-client-safety.sh (pre-commit annotation gate)', () => {
  function runChecker(files: string[]) {
    const checker = resolve(process.cwd(), 'scripts', 'check-migration-client-safety.sh');
    const res = spawnSync('bash', [checker, ...files], { encoding: 'utf-8', timeout: 15_000 });
    return { status: res.status, output: `${res.stdout}\n${res.stderr}` };
  }

  function fixture(name: string, content: string): string {
    const p = join(sandbox, name);
    writeFileSync(p, content);
    return p;
  }

  it('flags a client-breaking migration without annotation', () => {
    const f = fixture('violating.sql', 'REVOKE SELECT ON public.profiles FROM anon, authenticated;\n');
    const { status, output } = runChecker([f]);
    expect(output).toContain('VIOLATION');
    expect(status).not.toBe(0);
  });

  it('accepts requires-frontend (even indented) and client-safe annotations', () => {
    const coupled = fixture(
      'coupled.sql',
      '  -- requires-frontend: 529544d8abc\nDROP POLICY "x" ON public.profiles;\n',
    );
    const safe = fixture(
      'safe.sql',
      '-- client-safe: column unused by any deployed client\nALTER TABLE public.profiles DROP COLUMN tmp_col;\n',
    );
    const { status } = runChecker([coupled, safe]);
    expect(status).toBe(0);
  });

  it('ignores benign migrations and keyword mentions inside SQL comments', () => {
    const benign = fixture('benign.sql', 'CREATE TABLE public.widgets (id uuid primary key);\n');
    const prose = fixture(
      'prose.sql',
      '-- this migration does not REVOKE anything FROM anon\nCREATE INDEX widgets_idx ON public.widgets (id);\n',
    );
    const { status } = runChecker([benign, prose]);
    expect(status).toBe(0);
  });
});
