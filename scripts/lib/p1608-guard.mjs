/**
 * p1608-guard.mjs: P1608's refusal, decided before any browser, dev server or network call.
 *
 * The transcription end-to-end test spends real money (paid Gemini calls) and writes audio to the TEST bucket, so it
 * starts only when ALL of these hold:
 *   1. the command is an explicit opt-in (P1608_LIVE=1), except a listing (`--list`), which starts nothing;
 *   2. the resolved database URL is the SELF-HOSTED TEST origin (never hosted TEST, never prod, never anything else);
 *   3. the active TEST server (scripts/selfhosted/flip-test-env.py active) is self-hosted;
 *   4. Playwright retries stay at zero (a retry would call the paid API again).
 * Returns the refusal text, or null when the run may go ahead. Pure apart from `resolveActive`, which tests replace.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELFHOSTED_TEST_REF, testRefForUrl } from './test-target.mjs';

export const LIVE_ENV = 'P1608_LIVE';
const RESOLVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../selfhosted/flip-test-env.py');

export function resolveActiveTest(env = process.env) {
  const args = [RESOLVER, 'active'];
  if (env.CP_ACTIVE_TEST_FILE) args.push('--file', env.CP_ACTIVE_TEST_FILE);
  const r = spawnSync('python3', args, { encoding: 'utf8', timeout: 5000 });
  const out = (r.stdout ?? '').trim();
  return r.status === 0 && (out === 'selfhosted' || out === 'hosted') ? out : 'unresolved';
}

export const isListing = (argv) => argv.slice(2).some((a) => a === '--list');

export function p1608Refusal({ url, env = process.env, argv = process.argv, resolveActive = resolveActiveTest }) {
  if (isListing(argv)) return null; // a listing opens no browser and calls no network
  if (env[LIVE_ENV] !== '1') {
    return `this test spends real money (paid Gemini) and runs only on purpose: set ${LIVE_ENV}=1 on the command (npm run test:e2e:p1608).`;
  }
  const ref = testRefForUrl(url, env);
  if (ref !== SELFHOSTED_TEST_REF) {
    return `the database URL is not the self-hosted TEST server (${ref ? 'it is hosted TEST' : 'it is not a TEST server at all'}). `
      + 'This test never runs against hosted TEST or production.';
  }
  const active = resolveActive(env);
  if (active !== 'selfhosted') return `the active TEST server is "${active}", not self-hosted. Nothing was started.`;
  return null;
}
