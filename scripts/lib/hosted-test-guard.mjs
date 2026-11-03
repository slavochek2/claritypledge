/**
 * hosted-test-guard.mjs — P1606: refuse a run aimed at hosted TEST while self-hosted is active.
 *
 * Hosted TEST is switched off (paused) by default, and switching it on is the founder's decision.
 * The pause is the wall: nothing reaches a paused project, whichever key an agent holds. This guard
 * only turns the resulting timeouts into a clear message, so CP_HOSTED_TEST_REASON is not an
 * authorization and setting it opens nothing.
 *
 * Silent in CI, vitest and test workers. An unresolved active server prints one note and continues:
 * this guard is not the wall, and it must not stop a default run.
 * Test seam: CP_ACTIVE_TEST_FILE=<path> reads that flip file instead (same as active-test.sh).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHostedTestUrl } from './test-target.mjs';

export const REASON_ENV = 'CP_HOSTED_TEST_REASON';
// Playwright subcommands that open no test database. Anything else, flags before `test` included, is guarded.
export const NOT_A_RUN = new Set(['show-report', 'show-trace', 'merge-reports', 'install', 'install-deps', 'uninstall', 'codegen', 'open', 'cr', 'ff', 'wk', 'screenshot', 'pdf', 'clear-cache']);
const RESOLVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../selfhosted/flip-test-env.py');

export const REFUSAL = [
  '[P1606] REFUSED: this run targets hosted TEST, which is switched off. Use the self-hosted TEST server (the default).',
  'Hosted TEST is switched on only by the founder. Do not restore it yourself, by API or through a browser.',
  'If you believe it is needed, ask the founder in two lines: (1) what only real Supabase can show, (2) the failed self-hosted run that proves it.',
  `A missing key or feature on self-hosted, speed, or a note saying so is not a reason: fix self-hosted. See docs/technical/hosted-test-parity.md.`,
  `Once the founder has switched it on for this use, set ${REASON_ENV}="<the founder's decision>" and re-run.`,
].join('\n');

function resolveActive(env) {
  const args = [RESOLVER, 'active'];
  if (env.CP_ACTIVE_TEST_FILE) args.push('--file', env.CP_ACTIVE_TEST_FILE);
  const r = spawnSync('python3', args, { encoding: 'utf8', timeout: 5000 });
  const out = (r.stdout ?? '').trim();
  return r.status === 0 && (out === 'selfhosted' || out === 'hosted') ? out : 'unresolved';
}

/**
 * Throws with REFUSAL when this run must not go ahead.
 * surface: 'dev-server' | 'playwright'. argv is Playwright's: `show-report` and friends stay untouched,
 * and every other form is guarded, including global flags before `test`.
 */
export function refuseHostedTestRun({ url, surface, argv = process.argv, env = process.env, stream = process.stderr }) {
  if (env.CI || env.VITEST || env.TEST_WORKER_INDEX !== undefined || env.TEST_PARALLEL_INDEX !== undefined) return;
  if (surface === 'playwright') {
    const args = argv.slice(2);
    if (args.some((a) => a === '--version' || a === '-V' || a === '--help' || a === '-h')) return;
    if (NOT_A_RUN.has(args.find((a) => !a.startsWith('-')))) return; // the subcommand, never a later spec filter
  }
  if (!isHostedTestUrl(url, env) || String(env[REASON_ENV] ?? '').trim()) return;
  const active = resolveActive(env);
  if (active === 'hosted') return;
  if (active === 'unresolved') {
    stream.write('[P1606] could not tell which TEST server is active; this run targets hosted TEST, which is normally switched off.\n');
    return;
  }
  throw new Error(REFUSAL);
}
