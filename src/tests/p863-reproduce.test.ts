/**
 * P863 Canary — CSP must allow session-replay workers + the Mixpanel recorder fetch.
 *
 * Since vercel.json promoted CSP from Report-Only to enforce (commit
 * c64dfd81, 2026-04-04), the enforcing policy on the default "/(.*)"
 * route has had two gaps that silently break session-replay analytics
 * for every browser user:
 *
 *   1. No `worker-src` directive. Per the CSP spec, worker contexts fall
 *      back to `script-src`, which contains no `blob:`. LogRocket and the
 *      Mixpanel session recorder create web workers from blob: URLs, so
 *      the browser blocks them:
 *      "Creating a worker from 'blob:...' violates ... script-src ...
 *       Note that 'worker-src' was not explicitly set, so 'script-src'
 *       is used as a fallback. The action has been blocked."
 *
 *   2. `cdn.mxpnl.com` is present in `script-src` but absent from
 *      `connect-src`. The Mixpanel recorder bundle is pulled via fetch()
 *      (governed by connect-src), so the request is blocked:
 *      "Connecting to 'https://cdn.mxpnl.com/.../mixpanel-recorder-*.min.js'
 *       violates ... connect-src ... The request has been blocked."
 *
 * This test parses vercel.json, finds the enforcing CSP on "/(.*)", and
 * asserts both gaps are closed. Reverting the fix must make it fail.
 *
 * Sibling of the P805 canary (src/tests/p805-csp-connect-src-gcs.test.ts),
 * which guards the storage.googleapis.com connect-src entry from the same
 * Report-Only → enforce audit gap.
 */
// P1216 (2026-09): LogRocket was removed entirely (Mixpanel Session Replay + Sentry
// replay-on-error cover the ground). Its host was dropped from the three
// "preserved entries" lists below; every other origin is unchanged, and the
// blob:-worker invariant this file exists for is still live -- the Mixpanel
// recorder creates blob: workers.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelRoute {
  source: string;
  headers: VercelHeader[];
}

interface VercelConfig {
  headers?: VercelRoute[];
}

function loadVercelConfig(): VercelConfig {
  const path = resolve(process.cwd(), 'vercel.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as VercelConfig;
}

function getEnforcingCspForRoute(config: VercelConfig, source: string): string | null {
  const route = config.headers?.find((r) => r.source === source);
  if (!route) return null;
  const csp = route.headers.find((h) => h.key === 'Content-Security-Policy');
  return csp ? csp.value : null;
}

function extractDirective(csp: string, directiveName: string): string | null {
  // Anchor to a directive boundary (start-of-string or after a semicolon) and require
  // whitespace after the name, so a directive name that is a substring of another
  // (e.g. a hypothetical prefetch-src vs script-src) cannot return the wrong value.
  const match = csp.match(new RegExp(`(?:^|;\\s*)${directiveName}\\s+([^;]+)`));
  return match ? match[1].trim() : null;
}

describe('P863: CSP allows session-replay workers + Mixpanel recorder fetch', () => {
  const config = loadVercelConfig();

  it('vercel.json has an enforcing CSP on the default "/(.*)" route', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp, 'enforcing Content-Security-Policy header must exist on /(.*)').toBeTruthy();
  });

  it('declares a worker-src directive (so worker loads do not fall back to script-src)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp).toBeTruthy();

    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(
      workerSrc,
      `worker-src directive must be explicitly set. Without it, blob: worker loads fall back to script-src and are blocked. Current CSP: ${csp}`,
    ).toBeTruthy();
  });

  it('worker-src allows blob: (the Mixpanel session recorder creates blob: workers)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(workerSrc).toBeTruthy();

    expect(
      workerSrc,
      `worker-src must include blob: for session-replay workers. Current value: ${workerSrc}`,
    ).toContain('blob:');
  });

  it("worker-src includes 'self' (does not break same-origin workers, e.g. the service worker)", () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(workerSrc).toBeTruthy();

    expect(
      workerSrc,
      `worker-src must include 'self' so same-origin workers still load. Current value: ${workerSrc}`,
    ).toContain("'self'");
  });

  it('worker-src preserves the script-src CDN origins (prior fallback capability — no worker-load regression)', () => {
    // Before P863 there was no worker-src, so worker loads fell back to script-src and could
    // come from these CDN origins. Declaring worker-src must ADD blob: without silently DROPPING
    // that prior capability — otherwise a CDN-hosted (non-blob:) worker would newly be blocked.
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(workerSrc).toBeTruthy();

    for (const origin of [
      'https://cdn.mxpnl.com',
      'https://js.sentry-cdn.com',
    ]) {
      expect(
        workerSrc,
        `worker-src must preserve ${origin} (reachable via the previous script-src fallback). Current value: ${workerSrc}`,
      ).toContain(origin);
    }
  });

  it('connect-src includes https://cdn.mxpnl.com (Mixpanel recorder bundle fetch)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const connectSrc = extractDirective(csp!, 'connect-src');
    expect(connectSrc, 'connect-src directive must exist').toBeTruthy();

    expect(
      connectSrc,
      `connect-src must include https://cdn.mxpnl.com (the Mixpanel session recorder is fetched, governed by connect-src). cdn.mxpnl.com is already trusted in script-src. Current value: ${connectSrc}`,
    ).toContain('https://cdn.mxpnl.com');
  });

  it('existing connect-src entries are preserved (no regression on P805 or earlier)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const connectSrc = extractDirective(csp!, 'connect-src');
    expect(connectSrc).toBeTruthy();

    // These entries predate P863 (P805 added storage.googleapis.com). The fix must not drop any.
    const required = [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://storage.googleapis.com',
      'https://api-eu.mixpanel.com',
      'https://*.sentry.io',
      'https://api.web3forms.com',
      'https://api.unsplash.com',
    ];
    for (const entry of required) {
      expect(connectSrc, `connect-src must still include ${entry}`).toContain(entry);
    }
  });

  it('existing script-src entries are preserved (worker-src addition must not touch script-src)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const scriptSrc = extractDirective(csp!, 'script-src');
    expect(scriptSrc).toBeTruthy();

    const required = [
      "'self'",
      "'unsafe-inline'",
      'https://cdn.mxpnl.com',
      'https://js.sentry-cdn.com',
    ];
    for (const entry of required) {
      expect(scriptSrc, `script-src must still include ${entry}`).toContain(entry);
    }
  });
});
