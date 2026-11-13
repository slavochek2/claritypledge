/**
 * test-lane.mjs — P1672: which self-hosted TEST environment the dev server and Playwright use.
 *
 * Asks the one resolver, scripts/selfhosted/lane.py, for this worktree's answer:
 *   unclaimed worktree  {}  nothing is overridden and the env files apply exactly as before
 *   claimed worktree    the lane's URL, keys and origin, which must beat the env files
 * FAILS CLOSED: a claim that is revoked, failed, expired or unreadable makes the resolver exit non-zero and this
 * THROWS, so the dev server and Playwright refuse to start in that worktree instead of quietly using the main lane.
 * One exception: under VITEST (unit tests, which touch no TEST server) a refusal does not throw, so the unit tests
 * still run; applyTestLaneEnv records the message in CP_TEST_LANE_REFUSED instead, and anything that would reach a
 * lane (selfHostedPsqlCommand in e2e/helpers/test-psql.ts) throws on it.
 *
 * Overrides go into process.env BEFORE any dotenv or Vite loadEnv runs, so they win over env files
 * (dotenv never overwrites a set variable; Vite gives already-set env vars precedence). Import
 * scripts/lib/test-lane-apply.mjs first in a config file to get that ordering: ES imports are hoisted, so a call
 * placed in the config body would run after the other imports have read the environment.
 *
 * Skipped (returns {}): Vercel builds (no claims, and python may be absent) and a directory that is not a git
 * checkout. CI is NOT skipped: a CI checkout has no claim records, so the resolver itself answers {}.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const REFUSED_ENV = 'CP_TEST_LANE_REFUSED';

/**
 * The env overrides for the checkout at repoRoot. Throws when the resolver refuses or cannot run.
 * `run` is a seam for tests (same shape as child_process.spawnSync).
 */
export function testLaneOverrides(repoRoot, env = process.env, run = spawnSync) {
  if (env.VERCEL) return {};
  if (!existsSync(path.join(repoRoot, '.git'))) return {};
  const r = run('python3', [path.join(repoRoot, 'scripts/selfhosted/lane.py'), 'resolve', '--format', 'vite-env', '--worktree', repoRoot],
    { encoding: 'utf8' });
  if (r.error) throw new Error(`[P1672] cannot ask the TEST lane resolver (${r.error.message}); refusing to start.`);
  if (r.status !== 0) {
    throw new Error(`[P1672] this worktree's TEST lane claim is refused (resolver exit ${r.status}); refusing to start.\n${(r.stderr || '').trim()}`);
  }
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new Error('[P1672] the TEST lane resolver answered something that is not JSON; refusing to start.'); }
  if (out === null || typeof out !== 'object' || Array.isArray(out)) throw new Error('[P1672] unexpected TEST lane resolver answer; refusing to start.');
  return out;
}

const LANE_ORIGIN_RE = /^https:\/\/[^/]+\.ts\.net:84(43|44)$/;
const LANE_VALUE_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SELFHOSTED_TEST_ORIGIN', 'VITE_STORY_GUIDE_EDGE_FN_URL'];

/**
 * The target variables to delete when this worktree holds NO lane but env still carries a claimed context's values
 * (CP_TEST_LANE set, or a lane origin in VITE_SUPABASE_URL / SELFHOSTED_TEST_ORIGIN). Deleting them lets dotenv and Vite
 * refill the main-lane values instead of HTTP going to the old lane. Empty when either origin holds a non-lane value:
 * those are never deleted.
 */
function laneLeftoversToClear(env) {
  const origins = [env.VITE_SUPABASE_URL, env.SELFHOSTED_TEST_ORIGIN].filter(Boolean);
  if (origins.some((o) => !LANE_ORIGIN_RE.test(o))) return [];
  if (!env.CP_TEST_LANE && origins.length === 0) return [];
  return LANE_VALUE_KEYS.filter((k) => k in env);
}

/**
 * testLaneOverrides, then written into process.env (overwriting). Returns the overrides.
 * A refusal throws, except under VITEST, where it is recorded in CP_TEST_LANE_REFUSED and {} is returned.
 * `options.throwOnRefusal` makes a refusal throw even under VITEST (the live integration lane touches TEST).
 *
 * Lane variables left in env by a shell reused from a claimed worktree are removed whenever this worktree does not
 * hold a lane (CP_TEST_LANE, CP_TEST_LANE_GENERATION, CP_TEST_LANE_REFUSED), so one run can never split across two
 * environments. A refusal under VITEST also clears the lane pair and leaves only CP_TEST_LANE_REFUSED set.
 */
export function applyTestLaneEnv(repoRoot, env = process.env, run = spawnSync, options = {}) {
  const stale = ['CP_TEST_LANE', 'CP_TEST_LANE_GENERATION', REFUSED_ENV];
  const leftovers = laneLeftoversToClear(env);   // read before any deletion below
  let overrides;
  try {
    overrides = testLaneOverrides(repoRoot, env, run);
  } catch (e) {
    if (!env.VITEST || options.throwOnRefusal) throw e;
    for (const k of stale) delete env[k];
    for (const k of leftovers) delete env[k];
    env[REFUSED_ENV] = e instanceof Error ? e.message : String(e);
    return {};
  }
  if (!overrides.CP_TEST_LANE) {
    for (const k of stale) delete env[k];
    for (const k of leftovers) delete env[k];
  } else delete env[REFUSED_ENV];
  // A unit run (VITEST, not the integration config) gets only the lane's NAME, which the psql helper needs
  // to refuse the main lane. Never its keys or origin: unit tests stay hermetic and never hold a service key.
  const applied = env.VITEST && !options.throwOnRefusal
    ? Object.fromEntries(Object.entries(overrides).filter(([k]) => k === 'CP_TEST_LANE' || k === 'CP_TEST_LANE_GENERATION'))
    : overrides;
  for (const [k, v] of Object.entries(applied)) env[k] = String(v);
  return applied;
}
