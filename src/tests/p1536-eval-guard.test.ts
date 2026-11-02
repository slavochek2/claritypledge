/**
 * P1536 real-model eval: the script must read its key without printing it and must refuse any target that is not TEST. The script touches no
 * database (the engine's database calls are faked), so "target" means two things: the Supabase project named in the environment, and whether the
 * key is one a prod environment file holds. `refuseNonTest` is the one place that decides, and these tests prove it refuses and allows.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refuseNonTest } from '../../scripts/p1536-eval-guard';

const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const TEST_URL = 'https://not-the-prod-project.supabase.co';
const KEY = 'AIzaFAKE-test-key-0001';

describe('refuseNonTest', () => {
  it('refuses when the environment names the prod project, by any of the URL variables', () => {
    for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_TEST_URL']) {
      expect(refuseNonTest({ key: KEY, env: { [name]: PROD_URL }, prodValues: [] }), name).toMatch(/prod/i);
    }
  });
  it('refuses a key that any prod environment file also holds, whatever the variable is called', () => {
    expect(refuseNonTest({ key: KEY, env: {}, prodValues: ['something', KEY] })).toMatch(/production/i);
  });
  it('refuses an empty key', () => {
    expect(refuseNonTest({ key: '', env: {}, prodValues: [] })).toMatch(/key/i);
  });
  it('CONTROL: allows a test project URL, no URL at all, and a key no prod file holds', () => {
    expect(refuseNonTest({ key: KEY, env: { SUPABASE_URL: TEST_URL }, prodValues: ['other'] })).toBeNull();
    expect(refuseNonTest({ key: KEY, env: {}, prodValues: ['other'] })).toBeNull();   // premise changed (server review, Opus 11): [] is no evidence, see p1536-sr-engine.test.ts
  });
  it('the refusal never contains the key', () => {
    const msg = refuseNonTest({ key: KEY, env: {}, prodValues: [KEY] })!;
    expect(msg).not.toContain(KEY);
  });
});

describe('the script itself', () => {
  const run = (env: Record<string, string>) => spawnSync('npx', ['tsx', 'scripts/p1536-real-model-eval.ts', '--packs', 'cafe'], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env }, encoding: 'utf8', timeout: 60_000,
  });
  it('exits 2 and prints no key when the key is one a prod file holds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evalguard-'));
    const prodFile = join(dir, '.env.prod');
    writeFileSync(prodFile, `SOME_NAME=${KEY}\n`);
    const r = run({ EVAL_GEMINI_KEY: KEY, EVAL_PROD_ENV_FILE: prodFile });
    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).not.toContain(KEY);
  });
  it('exits 2 when the environment names the prod project', () => {
    expect(run({ EVAL_GEMINI_KEY: KEY, SUPABASE_URL: PROD_URL, EVAL_PROD_ENV_FILE: '/nonexistent' }).status).toBe(2);
  });
  it('a rejected key (the model answers 400) is never echoed in the output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evalguard-'));
    const prodFile = join(dir, '.env.prod');
    writeFileSync(prodFile, 'OTHER=nothing\n');
    const r = run({ EVAL_GEMINI_KEY: KEY, EVAL_PROD_ENV_FILE: prodFile });
    expect(`${r.stdout}${r.stderr}`).not.toContain(KEY);
  }, 90_000);
});
