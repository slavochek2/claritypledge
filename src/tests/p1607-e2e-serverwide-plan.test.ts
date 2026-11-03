/**
 * @file p1607-e2e-serverwide-plan.test.ts
 * @description P1607 decision 2: specs that change server-wide state never race each other inside a run,
 * and the rest of the suite keeps its workers. Proven on Playwright itself (a fixture config with the same
 * project shape), on the real config's project list, and on the plan rules.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliWorkers, namesAProject, planServerWide, PLAN_ENV } from '../../scripts/lib/e2e-serverwide-plan.mjs';
import { workersFor } from '../../scripts/lib/e2e-slot-lock.mjs';
import { allServerWideSpecs, listingEnv } from '../../scripts/lib/e2e-exclusive-specs.mjs';

const repo = path.resolve('.');
const cli = path.join(repo, 'node_modules/@playwright/test/cli.js');
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('argv reading', () => {
  it('finds --workers in every spelling', () => {
    expect(cliWorkers(['test', '--workers=3'])).toBe('3');
    expect(cliWorkers(['test', '--workers', '3'])).toBe('3');
    expect(cliWorkers(['test', '-j', '4'])).toBe('4');
    expect(cliWorkers(['test', '-j4'])).toBe('4');
    expect(cliWorkers(['test', '--workers=50%'])).toBe('50%');
    expect(cliWorkers(['test', 'e2e/x.spec.ts'])).toBeNull();
  });
  it('knows when a project is named', () => {
    expect(namesAProject(['test', '--project=integration'])).toBe(true);
    expect(namesAProject(['test', '--project', 'integration'])).toBe(true);
    expect(namesAProject(['test', 'e2e/x.spec.ts'])).toBe(false);
  });
});

describe('planServerWide', () => {
  const argv = (...a: string[]) => ['node', 'playwright', ...a];
  const guard = (over: Record<string, unknown> = {}) => ({ held: true, serverWideFiles: ['/r/e2e/a.spec.ts', '/r/e2e/b.spec.ts'], unknown: false, ...over });
  it('no server-wide specs: nothing to plan', () => {
    expect(planServerWide({ argv: argv('test'), guard: { held: true, serverWideFiles: [] }, env: {} })).toMatchObject({ files: [], split: false, error: null });
    expect(planServerWide({ argv: argv('test'), guard: { skipped: 'worker process' }, env: {} })).toMatchObject({ files: [], split: false });
  });
  it('no project named: the specs move to their own project (split)', () => {
    expect(planServerWide({ argv: argv('test'), guard: guard(), env: {} })).toMatchObject({ split: true, error: null });
    expect(planServerWide({ argv: argv('test', '--workers=4'), guard: guard(), env: {} })).toMatchObject({ split: true, error: null }); // the project cap still holds
  });
  it('a project named: no split, one worker for the run, and a CLI --workers above 1 is refused with the reason', () => {
    expect(planServerWide({ argv: argv('test', '--project=integration'), guard: guard(), env: {} })).toMatchObject({ split: false, error: null });
    for (const w of [['--workers=3'], ['--workers', '2'], ['-j4'], ['--workers=50%']]) {
      const p = planServerWide({ argv: argv('test', '--project=integration', ...w), guard: guard(), env: {} });
      expect(p.error, w.join(' ')).toMatch(/one worker.*override/);
    }
    expect(planServerWide({ argv: argv('test', '--project=integration', '--workers=1'), guard: guard(), env: {} }).error).toBeNull();
  });
  it('is decided once: the main runner writes the plan (with its pid as owner) and ITS worker reads it back unchanged', () => {
    const env: Record<string, string> = {};
    const main = planServerWide({ argv: argv('test', '--project=integration'), guard: guard(), env, pid: 500, ppid: 1 });
    expect(env[PLAN_ENV]).toBeTruthy();
    expect(main.owner).toBe(500);
    const workerEnv = { ...env, TEST_WORKER_INDEX: '0' };
    const worker = planServerWide({ argv: ['node', 'workerProcessEntry.js'], guard: { skipped: 'worker process' }, env: workerEnv, pid: 777, ppid: 500 });
    expect(worker).toEqual(main);
    // the main process itself, evaluating the config a second time, also keeps its own plan
    expect(planServerWide({ argv: argv('test'), guard: { skipped: 'x' }, env, pid: 500, ppid: 1 })).toEqual(main);
  });
  it('failing controls: an inherited plan is ignored by a process that is neither the owner nor the owner\'s worker', () => {
    const planOf = (owner: number) => JSON.stringify({ files: ['/r/e2e/a.spec.ts'], unknown: false, split: true, error: null, owner });
    const empty = { files: [], split: false };
    // a shell that exported it, or a listing child: not a worker, not the owner
    expect(planServerWide({ argv: argv('test'), guard: { skipped: 'x' }, env: { [PLAN_ENV]: planOf(500) }, pid: 900, ppid: 500 })).toMatchObject(empty);
    // a worker of ANOTHER run
    expect(planServerWide({ argv: ['node', 'w.js'], guard: { skipped: 'x' }, env: { [PLAN_ENV]: planOf(500), TEST_WORKER_INDEX: '0' }, pid: 900, ppid: 600 })).toMatchObject(empty);
    // junk
    expect(planServerWide({ argv: argv('test'), guard: { skipped: 'x' }, env: { [PLAN_ENV]: '{not json' }, pid: 500, ppid: 1 })).toMatchObject(empty);
    // and a stray plan does not shape a real decision: this run works its own out
    const own = planServerWide({ argv: argv('test', '--project=integration'), guard: guard(), env: { [PLAN_ENV]: planOf(500) }, pid: 900, ppid: 1 });
    expect(own).toMatchObject({ split: false, owner: 900 });
  });
  it('the listing child never receives the plan or the JSON-report variables', () => {
    const env = listingEnv({ [PLAN_ENV]: '{"split":true}', PLAYWRIGHT_JSON_OUTPUT_NAME: '/x', PLAYWRIGHT_JSON_OUTPUT_DIR: '/y', KEEP: '1' });
    expect(env).toEqual({ KEEP: '1' });
  });
});

describe('worker count when the specs could not be moved (a project was named)', () => {
  it('one server-wide spec is enough: fullyParallel spreads the tests of one file over workers', () => {
    expect(workersFor({ requested: undefined, serverWideCount: 1, fallback: 2 })).toBe(1);
    expect(workersFor({ requested: '4', serverWideCount: 3, fallback: 2 })).toBe(1);
  });
  it('unknown spec set (forced or failed detection): one worker', () => {
    expect(workersFor({ requested: '4', serverWideCount: 0, unknown: true, fallback: 2 })).toBe(1);
  });
  it('legitimate inputs keep their count', () => {
    expect(workersFor({ requested: undefined, serverWideCount: 0, fallback: 2 })).toBe(2);
    expect(workersFor({ requested: '3', serverWideCount: 0, fallback: 2 })).toBe(3);
    expect(workersFor({ requested: 'junk', serverWideCount: 0, fallback: 2 })).toBe(2);
  });
});

describe('on Playwright itself: a one-worker project does not overlap, the rest does (2 workers)', () => {
  function fixture(sw: 'capped' | 'uncapped') {
    fs.mkdirSync(path.join(repo, 'tmp'), { recursive: true }); // gitignored; inside the repo so the fixture finds @playwright/test
    const root = fs.mkdtempSync(path.join(repo, 'tmp', 'p1607-fixture-'));
    dirs.push(root);
    const log = path.join(root, 'log.jsonl');
    const spec = (name: string) => `import { test } from '@playwright/test';
import fs from 'fs';
const nap = (ms: number) => new Promise(r => setTimeout(r, ms));
for (const t of ['one', 'two']) {
  test('${name} ' + t, async () => {
    const t0 = Date.now(); await nap(900);
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ f: '${name}', t0, t1: Date.now() }) + '\\n');
  });
}`;
    for (const n of ['sw1', 'sw2', 'ot1', 'ot2']) fs.writeFileSync(path.join(root, `${n}.spec.ts`), spec(n));
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', fullyParallel: true, workers: 2, retries: 0, reporter: 'list',
  projects: [
    { name: 'other', testMatch: /ot\\d\\.spec/ },
    { name: 'serverwide', testMatch: /sw\\d\\.spec/, ${sw === 'capped' ? 'fullyParallel: false, workers: 1,' : ''} },
  ],
});
`);
    return { root, log };
  }
  const run = (root: string) => spawnSync(process.execPath, [cli, 'test', '-c', path.join(root, 'playwright.config.ts')], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '' } });
  const rows = (log: string) => fs.readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l) as { f: string; t0: number; t1: number });
  const overlaps = (a: { t0: number; t1: number }, b: { t0: number; t1: number }) => a.t0 < b.t1 && b.t0 < a.t1;
  const anyOverlap = (rs: { t0: number; t1: number }[]) => rs.some((a, i) => rs.slice(i + 1).some(b => overlaps(a, b)));

  it('capped: no two server-wide tests overlap (two files, two tests each), while other tests do overlap', () => {
    const { root, log } = fixture('capped');
    const r = run(root);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const rs = rows(log);
    expect(rs).toHaveLength(8);
    expect(anyOverlap(rs.filter(x => x.f.startsWith('sw')))).toBe(false);
    expect(anyOverlap(rs.filter(x => x.f.startsWith('ot')))).toBe(true); // the rest of the suite keeps both workers
  }, 90_000);

  it('failing control: the same shape WITHOUT the cap does overlap its server-wide tests, so the check above can fail', () => {
    const { root, log } = fixture('uncapped');
    const r = run(root);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(anyOverlap(rows(log).filter(x => x.f.startsWith('sw')))).toBe(true);
  }, 90_000);
});

describe('the REAL config, listed with a plan', () => {
  const swFiles = () => [...allServerWideSpecs({ repoDir: repo }).keys()].filter(f => !f.includes('/e2e/offline/'));
  const list = (plan: object | null) => {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const k of ['CI', 'VITEST', PLAN_ENV]) Reflect.deleteProperty(env, k);
    // The child is shaped like a worker of this process (the only reader that trusts an inherited plan).
    if (plan) { env[PLAN_ENV] = JSON.stringify({ ...plan, owner: process.pid }); env.TEST_WORKER_INDEX = '0'; }
    const r = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], { cwd: repo, encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 });
    expect(r.status, r.stderr.slice(0, 400)).toBe(0);
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    const perProject = new Map<string, Set<string>>();
    const walk = (s: { file?: string; specs?: { tests?: { projectName: string }[]; file: string }[]; suites?: unknown[] }) => {
      for (const sp of s.specs ?? []) for (const t of sp.tests ?? []) {
        if (!perProject.has(t.projectName)) perProject.set(t.projectName, new Set());
        perProject.get(t.projectName)!.add(path.resolve(j.config.rootDir, sp.file));
      }
      for (const c of (s.suites ?? []) as typeof s[]) walk(c);
    };
    for (const s of j.suites) walk(s);
    return { names: j.config.projects.map((p: { name: string }) => p.name) as string[], perProject };
  };

  it('without a plan the projects are the two ordinary ones', () => {
    expect(list(null).names).toEqual(['chromium', 'integration']);
  }, 120_000);

  it('with a plan: a third project holds exactly the server-wide specs, and no spec is lost or duplicated', () => {
    const files = swFiles();
    expect(files.length).toBeGreaterThan(3);
    const plain = list(null);
    const split = list({ files, unknown: false, split: true, error: null });
    expect(split.names).toEqual(['chromium', 'integration', 'serverwide']);
    const sw = split.perProject.get('serverwide')!;
    expect([...sw].sort()).toEqual([...files].sort());
    for (const f of files) {
      expect(split.perProject.get('chromium')?.has(f) ?? false).toBe(false);
      expect(split.perProject.get('integration')?.has(f) ?? false).toBe(false);
    }
    const union = (m: Map<string, Set<string>>) => new Set([...m.values()].flatMap(s => [...s]));
    expect(union(split.perProject)).toEqual(union(plain.perProject));
  }, 180_000);

  it('a plan that does not split (a project was named) leaves the projects as they are', () => {
    const files = swFiles();
    expect(list({ files, unknown: false, split: false, error: null }).names).toEqual(['chromium', 'integration']);
  }, 120_000);

  it('the real config gives that project one worker and no file-level parallelism (read from the config source: Playwright does not echo it in --list)', () => {
    const text = fs.readFileSync(path.join(repo, 'playwright.config.ts'), 'utf8');
    const block = /name: 'serverwide',[\s\S]*?\n {4}\}\] : \[\]/.exec(text)?.[0] ?? '';
    expect(block).toMatch(/workers: 1,/);
    expect(block).toMatch(/fullyParallel: false,/);
  });
});
