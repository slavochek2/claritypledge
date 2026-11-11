/**
 * P1666: proves, in CI as well as on a laptop, that the real vite.config.ts keeps env files out of a
 * unit run. CI has no env file, so the canary in p1666-unit-env-hermetic.test.ts would stay green
 * there even if the suppression were removed. This test writes its own contaminated .env.local into
 * a temp root and resolves the real config against it, in a child node process: Vite's config
 * loader does not run under jsdom (esbuild's TextEncoder check).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'p1666-'));
  writeFileSync(join(root, '.env.local'), 'VITE_P1666_SENTINEL=from-env-file\n');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * Resolve the real config against the contaminated root, with a VITE_* value exported in the child's
 * shell too, so CI (which has neither) exercises both halves. VITEST decides the unit-run branch.
 */
function resolveInChild(vitest: boolean): { envDir: unknown; sentinel: unknown; shell: unknown } {
  const script = `
    const { resolveConfig } = await import('vite');
    const c = await resolveConfig({ configFile: ${JSON.stringify(join(REPO, 'vite.config.ts'))},
      root: ${JSON.stringify(root)}, logLevel: 'silent' }, 'serve', 'test');
    process.stdout.write('\\nP1666RESULT' + JSON.stringify({ envDir: c.envDir,
      sentinel: c.env.VITE_P1666_SENTINEL ?? null, shell: c.env.VITE_P1666_SHELL_SENTINEL ?? null }));
  `;
  const env: NodeJS.ProcessEnv = { ...process.env, VITE_P1666_SHELL_SENTINEL: 'from-shell' };
  if (vitest) env.VITEST = 'true';
  else delete env.VITEST;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: REPO,
    env,
    encoding: 'utf8',
    timeout: 45_000, // below the 60s test deadline, which cannot interrupt a synchronous child
  });
  return JSON.parse(out.slice(out.lastIndexOf('P1666RESULT') + 'P1666RESULT'.length));
}

describe('P1666: env files never reach a unit run', () => {
  it('CONTROL: outside vitest the same config sees the env-file and shell sentinels', () => {
    // Proves both fixtures are ones Vite picks up, so the next test's absence means suppression.
    const r = resolveInChild(false);
    expect(r.sentinel).toBe('from-env-file');
    expect(r.shell).toBe('from-shell');
  }, 60_000);

  it('under vitest the real vite.config.ts sees neither', () => {
    const r = resolveInChild(true);
    expect(r.envDir).toBe(false);
    expect(r.sentinel).toBeNull();
    expect(r.shell).toBeNull();
  }, 60_000);
});
