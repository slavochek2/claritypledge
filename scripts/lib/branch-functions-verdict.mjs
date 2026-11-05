/**
 * branch-functions-verdict.mjs — P1312: did TEST serve this branch's edge functions for the whole
 * of an E2E run? Pure: no spawning, no file access, so the table can be tested without Playwright
 * (same pattern as reused-server-check.mjs). The script is scripts/selfhosted/branch-functions-check.sh;
 * e2e/global-setup.ts and e2e/global-teardown.ts do the spawning and call this.
 *
 * States, from the script's exit code AND the prefix of its first line (both must agree):
 *   none     0, "no changed functions"
 *   match    0, "match:" AND a second line "STARTED: <digits>" (the functions container's start time)
 *   differs  1, "differs:"
 *   unknown  2, "unknown:", and anything malformed (never a pass)
 */

const PREFIX = [
  [0, 'no changed functions', 'none'],
  [0, 'match:', 'match'],
  [1, 'differs:', 'differs'],
  [2, 'unknown:', 'unknown'],
];

const STARTED_RE = /^STARTED: (\d+)$/;

/**
 * { status, stdout } from the check script to { state, line, started, detail }.
 * line: the first line. started: the container start from line 2 ('' when absent). detail: every
 * line after the first except the STARTED line (the fix commands, the reason an unknown clears by).
 */
export function parseCheckResult({ status, stdout }) {
  const text = typeof stdout === 'string' ? stdout : '';
  const lines = text.split('\n');
  const line = lines[0].trim();
  const m = STARTED_RE.exec((lines[1] ?? '').trim());
  const started = m ? m[1] : '';
  const detail = lines.slice(1).filter(l => !STARTED_RE.test(l.trim())).join('\n').replace(/\s+$/, '');
  for (const [code, prefix, state] of PREFIX) {
    if (status === code && line.startsWith(prefix)) {
      // A match that does not say which container it read cannot be compared at the end of the run.
      if (state === 'match' && !started) {
        return { state: 'unknown', line: `unknown: the function check gave no container start time (first line: ${line.slice(0, 80)})`, started: '', detail };
      }
      return { state, line, started, detail };
    }
  }
  return {
    state: 'unknown',
    line: `unknown: unexpected answer from the function check (exit ${status ?? 'none'}, first line: ${line.slice(0, 80) || 'empty'})`,
    started: '',
    detail,
  };
}

const GOOD = new Set(['match', 'none']);

/** E2E_REQUIRE_FUNCTIONS: 1 and true (any case) are on; anything else is off. */
export function requireFlagOn(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * The verdict for a run. `end` is null when it was not checked (setup refused the run).
 * startStarted/endStarted: the functions container's start time at each end (any deploy recreates
 * it, so a change means a deploy happened in the window even if the files were put back).
 * startHead/endHead: the checked-out commit at each end; compared only when both are given.
 * action: 'pass' | 'warn' (loud message, run continues) | 'fail' (only with requireFlag).
 */
export function functionsVerdict({ start, end, requireFlag, startStarted, endStarted, startHead, endHead }) {
  const flagged = (verdict, message) => ({ verdict, action: requireFlag ? 'fail' : 'warn', message });
  if (!GOOD.has(start)) {
    return flagged('started-on-other-code',
      'the run started on other code than this branch\'s edge functions: results untrusted.');
  }
  if (!GOOD.has(end)) {
    return flagged('changed-during-run',
      'the edge functions on TEST changed or could not be confirmed during the run: results untrusted.');
  }
  if (start !== end) {
    return flagged('changed-during-run',
      `the edge function check went from ${start} to ${end} during the run, so it did not cover the same tree throughout: results untrusted.`);
  }
  if (startHead !== undefined && endHead !== undefined && startHead !== endHead) {
    return flagged('changed-during-run',
      'the checked-out commit changed during the run, so the tests did not all run on one tree: results untrusted.');
  }
  if (start === 'none') {
    return { verdict: 'not-applicable', action: 'pass', message: 'this branch changed no deployed edge function, so there was nothing to check (client-only branches are not covered by this check).' };
  }
  if (!startStarted || !endStarted) {
    return flagged('changed-during-run',
      'the functions container start time was not confirmed at both ends of the run: results untrusted.');
  }
  if (startStarted !== endStarted) {
    return flagged('changed-during-run',
      'the functions container restarted during the run (a deploy happened, even if the files were put back): results untrusted.');
  }
  return { verdict: 'trusted', action: 'pass', message: 'TEST served this branch\'s edge functions at the start and the end of the run, on one container.' };
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
