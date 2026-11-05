/**
 * branch-functions-verdict.mjs — P1312: did TEST serve this branch's edge functions for the whole
 * of an E2E run? Pure: no spawning, no file access, so the table can be tested without Playwright
 * (same pattern as reused-server-check.mjs). The script is scripts/selfhosted/branch-functions-check.sh;
 * e2e/global-setup.ts and e2e/global-teardown.ts do the spawning and call this.
 *
 * States, from the script's exit code AND the prefix of its first line (both must agree):
 *   none     0, "no changed functions"
 *   match    0, "match:"
 *   differs  1, "differs:"
 *   unknown  2, "unknown:", and anything malformed (never a pass)
 */

const PREFIX = [
  [0, 'no changed functions', 'none'],
  [0, 'match:', 'match'],
  [1, 'differs:', 'differs'],
  [2, 'unknown:', 'unknown'],
];

/** { status, stdout } from the check script to { state, line }. */
export function parseCheckResult({ status, stdout }) {
  const text = typeof stdout === 'string' ? stdout : '';
  const line = text.split('\n')[0].trim();
  for (const [code, prefix, state] of PREFIX) {
    if (status === code && line.startsWith(prefix)) return { state, line };
  }
  return {
    state: 'unknown',
    line: `unknown: unexpected answer from the function check (exit ${status ?? 'none'}, first line: ${line.slice(0, 80) || 'empty'})`,
  };
}

const GOOD = new Set(['match', 'none']);

/**
 * The verdict for a run. `end` is null when it was not checked (setup refused the run).
 * action: 'pass' | 'warn' (loud message, run continues) | 'fail' (only with requireFlag).
 */
export function functionsVerdict({ start, end, requireFlag }) {
  const flagged = (verdict, message) => ({ verdict, action: requireFlag ? 'fail' : 'warn', message });
  if (!GOOD.has(start)) {
    return flagged('started-on-other-code',
      'the run started on other code than this branch\'s edge functions: results untrusted.');
  }
  if (!GOOD.has(end)) {
    return flagged('changed-during-run',
      'the edge functions on TEST changed or could not be confirmed during the run: results untrusted.');
  }
  return { verdict: 'trusted', action: 'pass', message: 'TEST served this branch\'s edge functions at the start and the end of the run.' };
}

const NEVER = ['--list', '--ui', '--help', '-h', '--ui-host', '--ui-port'];

/** Why the check does not apply to this invocation, or null when it must run. */
export function functionsSkipReason({ hasWebServer, env, argv }) {
  if (!hasWebServer) return 'no local webServer (a remote smoke mode)';
  if (env.CI) return 'CI';
  if (env.VERIFY_PROD) return 'VERIFY_PROD';
  if (env.E2E_LOADTEST) return 'E2E_LOADTEST';
  const args = (argv ?? []).slice(2);
  for (const flag of NEVER) {
    if (args.some(a => a === flag || a.startsWith(`${flag}=`))) return `${flag} runs no tests`;
  }
  return null;
}

/** The one line teardown ends with (tests.md has agents grep counts, which hides warnings). */
export function functionsLine({ verdict, start, end }) {
  return `FUNCTIONS: ${verdict} (start ${start}, ${end ? `end ${end}` : 'end not checked'})`;
}
