/**
 * P1672: the TEST lane glue for the dev server, Playwright and the e2e psql helper.
 * scripts/lib/test-lane.mjs asks the resolver (stubbed here through its `run` seam) and applies the answer to a
 * given env object; e2e/helpers/test-psql.ts builds the remote psql command from that env.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testLaneOverrides, applyTestLaneEnv, REFUSED_ENV } from '../../scripts/lib/test-lane.mjs';
import { selfHostedPsqlCommand } from '../../e2e/helpers/test-psql';

const LANE_ORIGIN = 'https://lane-host.example-tailnet.ts.net:8443';
const CLAIMED = {
  VITE_SUPABASE_URL: LANE_ORIGIN, VITE_SUPABASE_ANON_KEY: 'anon-fake', SUPABASE_SERVICE_ROLE_KEY: 'service-fake',
  SELFHOSTED_TEST_ORIGIN: LANE_ORIGIN, CP_TEST_LANE: 'lane1', CP_TEST_LANE_GENERATION: '3',
};
type Res = { status: number | null; stdout?: string; stderr?: string; error?: Error };
const stub = (res: Res) => vi.fn((..._a: unknown[]) => res);

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'p1672-lane-'));
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere\n'); // a linked worktree has a .git FILE
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('testLaneOverrides', () => {
  it('unclaimed worktree: the resolver answers {} and nothing is overridden', () => {
    expect(testLaneOverrides(root, {}, stub({ status: 0, stdout: '{}' }))).toEqual({});
  });
  it('claimed worktree: returns the lane overrides; asks lane.py with vite-env and this worktree', () => {
    const run = stub({ status: 0, stdout: JSON.stringify(CLAIMED) });
    expect(testLaneOverrides(root, {}, run)).toEqual(CLAIMED);
    const [cmd, args] = run.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('python3');
    expect(args[0]).toBe(path.join(root, 'scripts/selfhosted/lane.py'));
    expect(args.slice(1)).toEqual(['resolve', '--format', 'vite-env', '--worktree', root]);
  });
  it('a refused claim throws, with the resolver message', () => {
    const run = stub({ status: 2, stderr: 'lane: this worktree\'s claim of lane1 is revoked.' });
    expect(() => testLaneOverrides(root, {}, run)).toThrow(/refused.*revoked/s);
  });
  it('a resolver that cannot run, or answers garbage, throws', () => {
    expect(() => testLaneOverrides(root, {}, stub({ status: null, error: new Error('ENOENT') }))).toThrow(/cannot ask/);
    expect(() => testLaneOverrides(root, {}, stub({ status: 0, stdout: 'not json' }))).toThrow(/not JSON/);
    expect(() => testLaneOverrides(root, {}, stub({ status: 0, stdout: '[]' }))).toThrow(/unexpected/);
  });
  it('VERCEL and a directory with no .git skip the resolver entirely', () => {
    const run = stub({ status: 2, stderr: 'must not be asked' });
    expect(testLaneOverrides(root, { VERCEL: '1' }, run)).toEqual({});
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'p1672-bare-'));
    try { expect(testLaneOverrides(bare, {}, run)).toEqual({}); } finally { fs.rmSync(bare, { recursive: true, force: true }); }
    expect(run).not.toHaveBeenCalled();
  });
  it('CI does not skip: a refusal still throws there', () => {
    expect(() => testLaneOverrides(root, { CI: 'true' }, stub({ status: 2, stderr: 'refused' }))).toThrow(/refused/);
  });
});

describe('applyTestLaneEnv', () => {
  it('claimed: writes the overrides into the env, over values already there', () => {
    const env: Record<string, string | undefined> = { VITE_SUPABASE_URL: 'https://main.example.org' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: JSON.stringify(CLAIMED) }));
    expect(env.VITE_SUPABASE_URL).toBe(LANE_ORIGIN);
    expect(env.CP_TEST_LANE).toBe('lane1');
    expect(env[REFUSED_ENV]).toBeUndefined();
  });
  it('unclaimed: the env is untouched', () => {
    const env: Record<string, string | undefined> = { VITE_SUPABASE_URL: 'https://main.example.org' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env).toEqual({ VITE_SUPABASE_URL: 'https://main.example.org' });
  });
  it('refused outside VITEST: throws, so the dev server and Playwright do not start', () => {
    expect(() => applyTestLaneEnv(root, {}, stub({ status: 2, stderr: 'claim expired' }))).toThrow(/claim expired/);
  });
  it('refused under VITEST: does not throw (unit tests still run), records CP_TEST_LANE_REFUSED, applies nothing', () => {
    const env: Record<string, string | undefined> = { VITEST: 'true' };
    expect(applyTestLaneEnv(root, env, stub({ status: 2, stderr: 'claim expired' }))).toEqual({});
    expect(env[REFUSED_ENV]).toMatch(/claim expired/);
    expect(env.VITE_SUPABASE_URL).toBeUndefined();
  });
  it('unclaimed: lane variables left by a shell reused from a claimed worktree are removed', () => {
    const env: Record<string, string | undefined> = { CP_TEST_LANE: 'lane1', CP_TEST_LANE_GENERATION: '3', [REFUSED_ENV]: 'old', KEEP: 'x' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env).toEqual({ KEEP: 'x' });
  });
  const LANE_VALUES = { ...CLAIMED, VITE_STORY_GUIDE_EDGE_FN_URL: `${LANE_ORIGIN}/functions/v1/story-guide` };
  const TARGET_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SELFHOSTED_TEST_ORIGIN', 'VITE_STORY_GUIDE_EDGE_FN_URL'];
  it('unclaimed after a claimed context: the lane origin, keys and story-guide URL are deleted so dotenv refills main', () => {
    const env: Record<string, string | undefined> = { ...LANE_VALUES, KEEP: 'x' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env).toEqual({ KEEP: 'x' });
  });
  it('a lane origin alone (no CP_TEST_LANE) is enough to clear the target variables', () => {
    const env: Record<string, string | undefined> = { SELFHOSTED_TEST_ORIGIN: 'https://h.example.ts.net:8444', VITE_SUPABASE_ANON_KEY: 'stale' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env).toEqual({});
  });
  it('refused under VITEST: the same stale lane values are cleared', () => {
    const env: Record<string, string | undefined> = { VITEST: 'true', ...LANE_VALUES };
    applyTestLaneEnv(root, env, stub({ status: 2, stderr: 'claim revoked' }));
    for (const k of TARGET_KEYS) expect(env[k]).toBeUndefined();
    expect(env[REFUSED_ENV]).toMatch(/claim revoked/);
  });
  it('non-lane values are never deleted, even when CP_TEST_LANE is stale', () => {
    const main = { VITE_SUPABASE_URL: 'https://136-85-1-126.sslip.io', VITE_SUPABASE_ANON_KEY: 'anon-main', SELFHOSTED_TEST_ORIGIN: 'https://136-85-1-126.sslip.io' };
    const env: Record<string, string | undefined> = { ...main, CP_TEST_LANE: 'lane1', CP_TEST_LANE_GENERATION: '3' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env).toEqual(main);
  });
  it('main values with no lane context are untouched', () => {
    const main = { VITE_SUPABASE_URL: 'https://136-85-1-126.sslip.io', VITE_SUPABASE_ANON_KEY: 'anon-main' };
    const env: Record<string, string | undefined> = { ...main };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env).toEqual(main);
  });
  it('hosted TEST values are untouched too', () => {
    const hosted = { VITE_SUPABASE_URL: 'https://ayibkeoyukulbsjpxgaw.supabase.co', CP_TEST_LANE: 'lane1' };
    const env: Record<string, string | undefined> = { ...hosted };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: '{}' }));
    expect(env.VITE_SUPABASE_URL).toBe(hosted.VITE_SUPABASE_URL);
  });
  it('claimed: a stale refusal marker is cleared and the lane pair is the resolver\'s', () => {
    const env: Record<string, string | undefined> = { CP_TEST_LANE: 'lane2', CP_TEST_LANE_GENERATION: '9', [REFUSED_ENV]: 'old' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: JSON.stringify(CLAIMED) }));
    expect(env.CP_TEST_LANE).toBe('lane1');
    expect(env.CP_TEST_LANE_GENERATION).toBe('3');
    expect(env[REFUSED_ENV]).toBeUndefined();
  });
  it('refused under VITEST: a stale lane pair is cleared, only the refusal marker remains', () => {
    const env: Record<string, string | undefined> = { VITEST: 'true', CP_TEST_LANE: 'lane1', CP_TEST_LANE_GENERATION: '3' };
    applyTestLaneEnv(root, env, stub({ status: 2, stderr: 'claim revoked' }));
    expect(env.CP_TEST_LANE).toBeUndefined();
    expect(env.CP_TEST_LANE_GENERATION).toBeUndefined();
    expect(env[REFUSED_ENV]).toMatch(/claim revoked/);
  });
  it('throwOnRefusal: a refusal throws even under VITEST (the live integration lane)', () => {
    const env: Record<string, string | undefined> = { VITEST: 'true' };
    expect(() => applyTestLaneEnv(root, env, stub({ status: 2, stderr: 'claim revoked' }), { throwOnRefusal: true })).toThrow(/claim revoked/);
    expect(env[REFUSED_ENV]).toBeUndefined();
  });
  it('under VITEST a good answer applies only the lane name, never keys or origin (unit runs stay hermetic)', () => {
    const env: Record<string, string | undefined> = { VITEST: 'true' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: JSON.stringify(CLAIMED) }));
    expect(env.CP_TEST_LANE).toBe(CLAIMED.CP_TEST_LANE);
    expect(env.CP_TEST_LANE_GENERATION).toBe(CLAIMED.CP_TEST_LANE_GENERATION);
    expect(env.VITE_SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.SELFHOSTED_TEST_ORIGIN).toBeUndefined();
  });

  it('the integration config (throwOnRefusal) under VITEST still gets the full lane answer', () => {
    const env: Record<string, string | undefined> = { VITEST: 'true' };
    applyTestLaneEnv(root, env, stub({ status: 0, stdout: JSON.stringify(CLAIMED) }), { throwOnRefusal: true });
    expect(env.VITE_SUPABASE_URL).toBe(LANE_ORIGIN);
  });
});

// Config files cannot be imported into a unit run, so the wiring is pinned from source: the integration lane
// asks the resolver strictly (a refusal throws) and lets the lane win over the parsed env file; the p1608
// Playwright config applies the lane first.
describe('config wiring', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');
  it('the integration vitest config applies the lane strictly, and its overrides follow the parsed env file', () => {
    const src = read('src/tests/integration/vitest.config.ts');
    expect(src).toMatch(/applyTestLaneEnv\([^)]*throwOnRefusal: true/);
    expect(src.indexOf('...parsed,')).toBeGreaterThan(-1);
    expect(src.indexOf('...laneOverrides,')).toBeGreaterThan(src.indexOf('...parsed,'));
  });
  it.each(['playwright.config.ts', 'playwright.p1608.config.ts', 'vite.config.ts'])('%s imports the lane apply module before anything else', (f) => {
    const firstImport = read(f).split('\n').find((l) => /^import\s/.test(l));
    expect(firstImport).toMatch(/test-lane-apply\.mjs/);
  });
});

describe('selfHostedPsqlCommand', () => {
  it('no lane: psql in the main lane db container, as before', () => {
    vi.stubEnv('CP_TEST_LANE', ''); vi.stubEnv('CP_TEST_LANE_GENERATION', ''); vi.stubEnv(REFUSED_ENV, '');
    expect(selfHostedPsqlCommand()).toMatch(/^sudo docker exec -i supabase-db psql /);
  });
  it('a lane: lanectl psql with that lane and generation', () => {
    vi.stubEnv(REFUSED_ENV, ''); vi.stubEnv('CP_TEST_LANE', 'lane2'); vi.stubEnv('CP_TEST_LANE_GENERATION', '7');
    expect(selfHostedPsqlCommand()).toBe('sudo /opt/supabase/lanes/bin/lanectl psql --lane lane2 --gen 7 --at');
  });
  it.each([['lane1; reboot', '1'], ['laneX', '1'], ['lane1', ''], ['lane1', '1 2'], ['lane1', 'x']])('malformed lane %j generation %j throws', (lane, gen) => {
    vi.stubEnv(REFUSED_ENV, ''); vi.stubEnv('CP_TEST_LANE', lane); vi.stubEnv('CP_TEST_LANE_GENERATION', gen);
    expect(() => selfHostedPsqlCommand()).toThrow(/malformed/);
  });
  it('a refused claim throws, even with no lane set', () => {
    vi.stubEnv('CP_TEST_LANE', ''); vi.stubEnv(REFUSED_ENV, 'claim revoked');
    expect(() => selfHostedPsqlCommand()).toThrow(/refused.*claim revoked/s);
  });
  it('importing the helper reads no lane environment (arguments are built at call time)', async () => {
    vi.stubEnv(REFUSED_ENV, 'claim revoked');
    vi.resetModules();
    await expect(import('../../e2e/helpers/test-psql')).resolves.toBeTruthy();
  });
});
