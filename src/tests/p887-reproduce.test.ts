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
 * Handoff contract for /fix (asserted here):
 *   A. prod, non-interactive stdin, no --yes → print every pending migration
 *      filename upfront, apply NOTHING, exit non-zero
 *   B. prod, --yes → apply, then run `node "$SCRIPT_DIR/prod-smoke-test.mjs"`;
 *      exit 0 when smoke passes
 *   C. prod, --yes, smoke exits non-zero → exit non-zero with a loud
 *      smoke-failure message
 *   D. test env (no --env prod) → behavior unchanged: no ack required,
 *      no smoke run
 *
 * Canary gate:
 *   Before fix: scenarios A–C fail — guarded by `it.fails`, so the suite
 *               stays green while the bug is open.
 *   After fix:  assertions pass → `it.fails` flips RED → /fix must convert
 *               A–C to plain `it()`. Scenario D passes before AND after.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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

  // curl stub: schema_migrations SELECT → only baseline applied;
  // history INSERT → silent success; anything else (the apply) → HTTP 201 + []
  writeFileSync(
    join(dir, 'bin', 'curl'),
    `#!/bin/bash
ARGS="$*"
echo "CURL_CALL: $ARGS" >> "${join(dir, 'curl-calls.log')}"
if [[ "$ARGS" == *"SELECT version FROM supabase_migrations"* ]]; then
  printf '[{"version":"20260101000000"}]\\n200\\n'
elif [[ "$ARGS" == *"INSERT INTO supabase_migrations"* ]]; then
  exit 0
else
  printf '[]\\n201\\n'
fi
`,
  );

  // security stub: no keychain PAT → forces the env-file token fallback
  writeFileSync(join(dir, 'bin', 'security'), '#!/bin/bash\nexit 1\n');

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
    join('scripts', 'stamp-deploy-manifest.sh'),
    join('scripts', 'prod-smoke-test.mjs'),
  ]) {
    chmodSync(join(dir, f), 0o755);
  }
  return dir;
}

function runMigrate(args: string[], opts: { smokeExit?: number } = {}) {
  const res = spawnSync('bash', [join(sandbox, 'scripts', 'migrate.sh'), ...args], {
    env: {
      ...process.env,
      PATH: `${join(sandbox, 'bin')}:${process.env.PATH ?? ''}`,
      P887_SMOKE_MARKER: smokeMarker,
      P887_SMOKE_EXIT: String(opts.smokeExit ?? 0),
    },
    input: '', // stdin is a closed pipe → non-interactive
    encoding: 'utf-8',
    timeout: 30_000,
  });
  return { status: res.status, output: `${res.stdout}\n${res.stderr}` };
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

describe('P887: migrate.sh prod pending-ack + post-migrate smoke', () => {
  // Scenario A — the P886 replay: held-back migration must be named and held
  it.fails('prod, non-interactive, no --yes: lists pending migrations, applies nothing, exits non-zero', () => {
    const { status, output } = runMigrate(['--env', 'prod']);
    // Upfront pending list names the held-back migration
    expect(output).toContain(PENDING_FILE);
    // Refuses to proceed without explicit ack
    expect(status).not.toBe(0);
    // Nothing was applied
    expect(appliedPending()).toBe(false);
    // No DB mutation happened → no smoke run either
    expect(existsSync(smokeMarker)).toBe(false);
  });

  // Scenario B — acknowledged apply must end in an automatic smoke run
  it.fails('prod, --yes: applies pending migrations, then auto-runs the prod smoke test', () => {
    const { status } = runMigrate(['--env', 'prod', '--yes']);
    expect(appliedPending()).toBe(true);
    expect(existsSync(smokeMarker)).toBe(true);
    expect(status).toBe(0);
  });

  // Scenario C — a failing smoke after apply must be loud
  it.fails('prod, --yes, smoke fails: exits non-zero with a loud smoke-failure message', () => {
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
});
