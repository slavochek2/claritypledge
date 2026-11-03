/**
 * @file p1607-e2e-loadtest-switch.test.ts
 * @description P1607: the load-test switch (E2E_LOADTEST) is off unless set, refuses every database but the
 * self-hosted TEST server, needs the load driver as a real ancestor of the run, accepts only the driver's
 * fixed workload, and never touches a lock directory. Each refusal is proven with a failing control,
 * including through the REAL playwright.config.ts in child processes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { TEST_PROJECT_REF } from '../../scripts/lib/test-target.mjs';
import { loadTestIndex, loadTestRefusal, loadTestPort, isAncestor, selectedSpecs } from '../../scripts/lib/e2e-loadtest.mjs';
import { WORKLOAD } from '../../scripts/lib/e2e-load-workload.mjs';

const HOSTED_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const SELF = { SELFHOSTED_TEST_ORIGIN: 'https://test-db.example.org' };
const SELF_URL = 'https://test-db.example.org';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('loadTestIndex', () => {
  it('is off unless set, and takes a single digit 1-9', () => {
    expect(loadTestIndex({})).toBeNull();
    expect(loadTestIndex({ E2E_LOADTEST: '' })).toBeNull();
    expect(loadTestIndex({ E2E_LOADTEST: '1' })).toBe(1);
    expect(loadTestIndex({ E2E_LOADTEST: '9' })).toBe(9);
  });
  it.each(['0', '10', 'a', '1.5', '-1', ' 1'])('rejects %j loudly', (v) => {
    expect(() => loadTestIndex({ E2E_LOADTEST: v })).toThrow(/E2E_LOADTEST/);
  });
  it('port is the checkout port plus the index', () => {
    expect(loadTestPort(5400, 3)).toBe(5403);
  });
});

describe('the parent chain and the selected specs', () => {
  it('isAncestor follows the real chain and only it', () => {
    const chain: Record<number, number> = { 30: 20, 20: 10, 10: 1 };
    const ppid = (p: number) => chain[p] ?? 0;
    expect(isAncestor(20, 30, ppid)).toBe(true);
    expect(isAncestor(10, 30, ppid)).toBe(true);
    expect(isAncestor(99, 30, ppid)).toBe(false);
    expect(isAncestor(30, 30, ppid)).toBe(false); // a process is not its own parent
  });
  it('selectedSpecs takes the plain words after `test`, not flags', () => {
    expect(selectedSpecs(['test', '--reporter=json', '--repeat-each=6', 'a.spec.ts', 'b.spec.ts'])).toEqual(['a.spec.ts', 'b.spec.ts']);
    expect(selectedSpecs(['show-report'])).toBeNull();
  });
});

describe('loadTestRefusal (units, with the process lookups injected)', () => {
  const base = () => ({
    url: SELF_URL, env: { ...SELF, E2E_LOADTEST_DRIVER_PID: String(process.pid) } as NodeJS.ProcessEnv,
    argv: ['test', '--reporter=json', ...WORKLOAD], pid: 4242, ppidOf: (p: number) => (p === 4242 ? process.pid : 1),
    cmdOf: () => 'node scripts/e2e-load-test.mjs --level 2',
  });
  it('allows the self-hosted server, a real ancestor driver, and exactly the workload (legitimate input)', () => {
    expect(loadTestRefusal(base())).toBeNull();
  });
  it('refuses hosted TEST, production-shaped and unknown URLs, empty and missing ones', () => {
    for (const url of [HOSTED_URL, 'https://besjtuodziykmjidubzw.supabase.co', 'https://example.com', '', undefined]) {
      expect(loadTestRefusal({ ...base(), url: url as string })).toMatch(/self-hosted TEST server/);
    }
  });
  it('refuses without a driver pid, with junk, and with a pid that has exited', () => {
    expect(loadTestRefusal({ ...base(), env: SELF as NodeJS.ProcessEnv })).toMatch(/load driver/);
    expect(loadTestRefusal({ ...base(), env: { ...SELF, E2E_LOADTEST_DRIVER_PID: 'x' } as NodeJS.ProcessEnv })).toMatch(/load driver/);
    const dead = Number(spawnSync('sh', ['-c', 'echo $$']).stdout.toString().trim());
    expect(loadTestRefusal({ ...base(), env: { ...SELF, E2E_LOADTEST_DRIVER_PID: String(dead) } as NodeJS.ProcessEnv })).toMatch(/not a live process/);
  });
  it('refuses a live pid whose command is not the driver', () => {
    expect(loadTestRefusal({ ...base(), cmdOf: () => 'zsh -l' })).toMatch(/is not the load driver/);
  });
  it('refuses a driver that is not an ancestor of this run (a pid typed in by hand)', () => {
    expect(loadTestRefusal({ ...base(), ppidOf: () => 1 })).toMatch(/not a parent of this run/);
  });
  it('refuses any specs other than the workload: an extra spec, a missing one, a duplicate, none', () => {
    const b = base();
    expect(loadTestRefusal({ ...b, argv: [...b.argv, 'e2e/p1592-event-transcripts.spec.ts'] })).toMatch(/fixed workload/);
    expect(loadTestRefusal({ ...b, argv: ['test', ...WORKLOAD.slice(1)] })).toMatch(/fixed workload/);
    expect(loadTestRefusal({ ...b, argv: ['test', ...WORKLOAD, WORKLOAD[0]] })).toMatch(/fixed workload/);
    expect(loadTestRefusal({ ...b, argv: ['test'] })).toMatch(/fixed workload/);
    expect(loadTestRefusal({ ...b, argv: ['show-report'] })).toMatch(/fixed workload/);
  });
  it('a worker (no argv given) is held to the first three conditions only', () => {
    expect(loadTestRefusal({ ...base(), argv: null })).toBeNull();
  });
});

describe('through the real playwright.config.ts, from a driver process', () => {
  const repo = path.resolve('.');
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo }).toString().trim();
  const locks = () => fs.readdirSync(common).filter(f => f.includes('e2e-test-db')).sort()
    .map(f => `${f}:${fs.existsSync(path.join(common, f, 'owner.json')) ? fs.readFileSync(path.join(common, f, 'owner.json'), 'utf8') : ''}`);
  // The child must read the database from .env.test.local like a real run, not from vitest's own environment.
  const childEnv = (env: Record<string, string>) => {
    const base: Record<string, string | undefined> = { ...process.env };
    for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SELFHOSTED_TEST_ORIGIN', 'VITEST', 'CI']) Reflect.deleteProperty(base, k);
    return { ...base, ...env };
  };
  const cli = path.join(repo, 'node_modules/@playwright/test/cli.js');
  /** A process called `<name>` that starts Playwright (--list) with the switch set, the way the driver does. */
  function viaScript(name: string, args: string[], env: Record<string, string>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1607lt-'));
    dirs.push(dir);
    const file = path.join(dir, name);
    fs.writeFileSync(file, `import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, [${JSON.stringify(cli)}, 'test', '--list', '--reporter=json', ...${JSON.stringify(args)}], {
  cwd: ${JSON.stringify(repo)}, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  env: { ...process.env, E2E_LOADTEST: '2', E2E_LOADTEST_DRIVER_PID: String(process.pid), ...${JSON.stringify(env)} },
});
process.stdout.write(JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }));
`);
    const o = spawnSync(process.execPath, [file], { encoding: 'utf8', env: childEnv({}), maxBuffer: 256 * 1024 * 1024 });
    return JSON.parse(o.stdout) as { status: number; stdout: string; stderr: string };
  }

  it('legitimate: the driver, the workload, the self-hosted server: starts, own output directory, every lock untouched', () => {
    const before = locks();
    const r = viaScript('e2e-load-test.mjs', WORKLOAD, {});
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).config.projects[0].outputDir).toMatch(/test-results-loadtest-2$/);
    expect(locks()).toEqual(before);
  }, 90_000);

  it('failing control: a process that is not called the driver does not start', () => {
    const r = viaScript('some-other-script.mjs', WORKLOAD, {});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/\[P1607\].*is not the load driver/);
  }, 90_000);

  it('failing control: the driver with a different spec set does not start', () => {
    const r = viaScript('e2e-load-test.mjs', [...WORKLOAD, 'e2e/logo-navigation.spec.ts'], {});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/\[P1607\].*fixed workload/);
  }, 90_000);

  it('failing control: the driver against hosted TEST does not start', () => {
    const r = viaScript('e2e-load-test.mjs', WORKLOAD, { VITE_SUPABASE_URL: HOSTED_URL });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/\[P1607\].*self-hosted TEST server/);
  }, 90_000);

  it('failing control: a pid typed by hand (a live process that is not above the run) does not start', () => {
    const sleeper = spawn('sleep', ['60'], { stdio: 'ignore' });
    try {
      const r = viaScript('e2e-load-test.mjs', WORKLOAD, { E2E_LOADTEST_DRIVER_PID: String(sleeper.pid) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/\[P1607\].*(not the load driver|not a parent)/);
    } finally { sleeper.kill('SIGKILL'); }
  }, 90_000);

  it('failing control: set straight from the shell (this test process, which is not the driver) does not start', () => {
    const r = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json', ...WORKLOAD], {
      cwd: repo, encoding: 'utf8', env: childEnv({ E2E_LOADTEST: '1', E2E_LOADTEST_DRIVER_PID: String(process.pid) }),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/\[P1607\].*is not the load driver/);
  }, 90_000);

  it('failing control: a malformed index does not start', () => {
    const r = viaScript('e2e-load-test.mjs', WORKLOAD, { E2E_LOADTEST: '12' });
    expect(r.status).not.toBe(0);
  }, 90_000);

  it('legitimate: without the switch the output directory and the lock are the ordinary ones', () => {
    const r = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json', 'e2e/logo-navigation.spec.ts'], { cwd: repo, encoding: 'utf8', env: childEnv({}) });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).config.projects[0].outputDir).toMatch(/test-results$/);
  }, 90_000);
});
