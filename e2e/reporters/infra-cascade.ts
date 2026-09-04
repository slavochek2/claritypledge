/**
 * P1234 — make a dead dev server distinguishable from an application defect.
 *
 * Two paths can remove the dev server from under a running suite on the shared main
 * checkout, where every concurrent session maps to port 5001:
 *
 *   1. `predev` reaps the port's occupant. FIXED — scripts/check-worktree-env.sh now
 *      refuses to kill a server that answers HTTP.
 *   2. Playwright teardown reaps a *reused* server. NOT fixed, and not fixable here:
 *      `reuseExistingServer: !CI` makes run B adopt run A's server, and when A finishes
 *      Playwright kills the server **it** started. B, still mid-flight, loses it. Nothing
 *      in this config owns that kill.
 *
 * Path 2's damage is not the failures themselves — it is that they are *unattributable*.
 * A 2026-08-31 triage read 10 connection-refused cascade failures as /live application
 * defects; only 6 of 16 failures that run were real. This reporter removes that ambiguity:
 * it separates failures whose error is "the server was not there" from failures that
 * actually exercised the app, and probes the base URL at run end to say which world we
 * were in. It does not prevent the cascade. It makes the run output tell the truth.
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Errors that mean the browser never reached a server — not that the app misbehaved.
 * Deliberately narrow: these are transport-layer markers Chromium/Node emit when the
 * TCP peer is gone. An assertion failure, a locator timeout, or an HTTP error status
 * are all application signals and must NOT match.
 */
const TRANSPORT_DEAD_MARKERS = [
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_EMPTY_RESPONSE',
  'net::ERR_CONNECTION_CLOSED',
  'ECONNREFUSED',
  'ECONNRESET',
];

/**
 * A Playwright API call at the HEAD of an error line — `page.goto:`, `request.get:`.
 * Anchored at line start (after an optional `Error:`) on purpose: a transport marker
 * that appears anywhere ELSE in an error is not a dead server, it is text.
 *
 * This is the whole defence against the reporter hiding real bugs. 52 e2e specs collect
 * `consoleErrors`, and several embed the raw array into the assertion message
 * (`public-pages-smoke.spec.ts:32`, `content-detail-smoke.spec.ts:46,60`). A genuine
 * product regression that makes the browser log `net::ERR_CONNECTION_REFUSED` for some
 * broken resource would then carry that marker in its failure text — and a
 * substring-anywhere match would label a real bug "do NOT triage as a product bug".
 * That the marker is real recurring noise is not hypothetical: three specs already
 * strip it for exactly this reason (`p703:67`, `p952:169,185`, `p852:206`).
 *
 * Not anchored, this also misfires on a URL inside a console message — `page.tsx:` in
 * `http://localhost:5100/src/page.tsx:12` matches a naive `page.\w+:` pattern.
 */
const PLAYWRIGHT_CALL_AT_LINE_HEAD =
  /^\s*(?:Error:\s*)?(?:page|frame|browser|browserContext|context|request|apiRequestContext)\.[A-Za-z]\w*\s*:/;

/** Origin of a URL, or null if it is absent or unparseable. */
function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * True when this error means the browser never reached the server under test.
 *
 * Two conditions, both required: the marker sits on a line that STARTS with a
 * Playwright navigation/request call, and — when that line names a URL — the URL's
 * origin is the base URL we were testing. The origin check keeps a real connectivity
 * failure against some OTHER host (the prod-verification spec targets a deployed URL;
 * the `integration` project talks to Supabase) from being narrated as "your dev
 * server died", which would be simply false.
 */
export function isDevServerCascadeFailure(
  errorText: string | undefined | null,
  baseURL?: string,
): boolean {
  if (!errorText) return false;
  const expectedOrigin = originOf(baseURL);

  for (const line of errorText.split('\n')) {
    if (!TRANSPORT_DEAD_MARKERS.some((marker) => line.includes(marker))) continue;
    if (!PLAYWRIGHT_CALL_AT_LINE_HEAD.test(line)) continue;
    const failedUrl = line.match(/\bat\s+(https?:\/\/\S+)/)?.[1];
    const failedOrigin = originOf(failedUrl);
    // A URL naming a different host is someone else's outage, not our dev server.
    if (failedOrigin && expectedOrigin && failedOrigin !== expectedOrigin) continue;
    return true;
  }
  return false;
}

/** Is anything answering at `url`? Any completed HTTP response counts — 4xx/5xx included. */
export async function baseUrlIsReachable(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

export default class InfraCascadeReporter implements Reporter {
  private baseURL = '';
  /**
   * Keyed by test id, NOT appended per result: `onTestEnd` fires once per RETRY
   * ATTEMPT, so pushing to a list double-counts every test under the default
   * `retries: 1`. Measured — a 3-test run printed "6 of 6" beside Playwright's own
   * "3 failed", which is precisely the count confusion this reporter exists to remove.
   * Last attempt wins; a test that ultimately passes is dropped, so these counts line
   * up with Playwright's "N failed".
   */
  private verdicts = new Map<string, { label: string; infra: boolean }>();

  onBegin(config: FullConfig): void {
    this.baseURL =
      (config.projects[0]?.use as { baseURL?: string } | undefined)?.baseURL ?? '';
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') {
      this.verdicts.delete(test.id);
      return;
    }
    const text = [result.error?.message, result.error?.stack, ...result.errors.map((e) => e.message)]
      .filter(Boolean)
      .join('\n');
    this.verdicts.set(test.id, {
      label: `${test.location.file.split('/').pop()} › ${test.title}`,
      infra: isDevServerCascadeFailure(text, this.baseURL),
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    const all = [...this.verdicts.values()];
    const cascade = all.filter((v) => v.infra).map((v) => v.label);
    const application = all.filter((v) => !v.infra).map((v) => v.label);
    if (cascade.length === 0) return;

    const reachable = this.baseURL ? await baseUrlIsReachable(this.baseURL) : false;
    const total = cascade.length + application.length;

    const lines = [
      '',
      '='.repeat(78),
      '⚠  INFRASTRUCTURE FAILURE — NOT N APPLICATION DEFECTS (P1234)',
      '='.repeat(78),
      `${cascade.length} of ${total} failure(s) never reached the app: the dev server at`,
      `${this.baseURL || '(unknown base URL)'} was not answering when they ran.`,
      `Base URL reachable at end of run: ${reachable ? 'YES' : 'NO'}`,
      '',
      'Do NOT triage these as product bugs:',
      ...cascade.map((t) => `  ✗ [infra] ${t}`),
    ];

    if (application.length > 0) {
      lines.push(
        '',
        `The remaining ${application.length} failure(s) DID exercise the app — triage only these:`,
        ...application.map((t) => `  ✗ [app]   ${t}`),
      );
    }

    lines.push(
      '',
      'Most likely cause: a concurrent run on the shared main checkout. Playwright sets',
      "reuseExistingServer, so run B adopts run A's server and loses it when A tears down.",
      'Run concurrent E2E batches from separate worktrees — each gets its own port.',
      '='.repeat(78),
      '',
    );

    console.log(lines.join('\n'));
  }
}
