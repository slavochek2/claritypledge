/**
 * P865 Canary — CSP must allow LogRocket's full rotating CDN host family.
 *
 * LogRocket deliberately rotates the CDN host it loads its bundle from
 * (cdn.lgrckt-in.com, cdn.lrkt-in.com, cdn.lr-ingest.io, …) to evade
 * ad-blockers. The enforcing CSP only ever allowlisted ONE of these
 * (cdn.lr-in-prod.com), so when the SDK picked cdn.lgrckt-in.com the
 * script load was blocked in production:
 *
 *   "Loading the script 'https://cdn.lgrckt-in.com/logger-1.min.js'
 *    violates the following Content Security Policy directive:
 *    script-src 'self' 'unsafe-inline' https://cdn.mxpnl.com
 *    https://cdn.lr-in-prod.com https://js.sentry-cdn.com.
 *    The action has been blocked."
 *
 * Session replay silently stopped recording for every browser user.
 * This is the third instance of the same audit gap (P805 connect-src,
 * P863 worker-src + recorder fetch). The root fix is to allowlist the
 * WHOLE LogRocket host pool, not the one host that happens to fail today —
 * otherwise the next rotation re-breaks it.
 *
 * Host list source: LogRocket CSP troubleshooting docs
 * (https://docs.logrocket.com/docs/troubleshooting-sessions).
 *
 * This test parses vercel.json, finds the enforcing CSP on "/(.*)", and
 * asserts every LogRocket CDN host is present in script-src and every
 * LogRocket wildcard origin is present in connect-src. Dropping any one
 * must make it fail. Sibling of the P805 and P863 canaries.
 */
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
  const match = csp.match(new RegExp(`(?:^|;\\s*)${directiveName}\\s+([^;]+)`));
  return match ? match[1].trim() : null;
}

// LogRocket's full CDN host pool — script bundle is served from any of these.
const LOGROCKET_SCRIPT_HOSTS = [
  'https://cdn.logrocket.io',
  'https://cdn.lr-ingest.io',
  'https://cdn.lr-in.com',
  'https://cdn.lr-in-prod.com',
  'https://cdn.lr-ingest.com',
  'https://cdn.ingest-lr.com',
  'https://cdn.lr-intake.com',
  'https://cdn.intake-lr.com',
  'https://cdn.logr-ingest.com',
  'https://cdn.lrkt-in.com',
  'https://cdn.lgrckt-in.com',
  'https://cdn.logr-in.com',
];

// LogRocket's full ingest host pool — telemetry/session data POSTs to any of these.
const LOGROCKET_CONNECT_HOSTS = [
  'https://*.logrocket.io',
  'https://*.lr-ingest.io',
  'https://*.logrocket.com',
  'https://*.lr-in.com',
  'https://*.lr-in-prod.com',
  'https://*.lr-ingest.com',
  'https://*.ingest-lr.com',
  'https://*.lr-intake.com',
  'https://*.intake-lr.com',
  'https://*.logr-ingest.com',
  'https://*.lrkt-in.com',
  'https://*.lgrckt-in.com',
  'https://*.logr-in.com',
];

describe('P865: CSP allows the full LogRocket rotating host family', () => {
  const config = loadVercelConfig();
  const csp = getEnforcingCspForRoute(config, '/(.*)');

  it('vercel.json has an enforcing CSP on the default "/(.*)" route', () => {
    expect(csp, 'enforcing Content-Security-Policy header must exist on /(.*)').toBeTruthy();
  });

  it.each(LOGROCKET_SCRIPT_HOSTS)('script-src includes %s (CDN host rotation)', (host) => {
    const scriptSrc = extractDirective(csp!, 'script-src');
    expect(scriptSrc).toBeTruthy();
    expect(
      scriptSrc,
      `script-src must include ${host}. LogRocket rotates across its full CDN pool to evade ad-blockers — allowlisting one host (the P805/P863/P865 mistake) breaks on the next rotation. Current value: ${scriptSrc}`,
    ).toContain(host);
  });

  it.each(LOGROCKET_CONNECT_HOSTS)('connect-src includes %s (ingest host rotation)', (host) => {
    const connectSrc = extractDirective(csp!, 'connect-src');
    expect(connectSrc).toBeTruthy();
    expect(
      connectSrc,
      `connect-src must include ${host} (LogRocket session/telemetry POSTs after the script loads). Current value: ${connectSrc}`,
    ).toContain(host);
  });

  it.each(LOGROCKET_SCRIPT_HOSTS)('worker-src includes %s (parity with script-src)', (host) => {
    // Once worker-src is explicitly set it STOPS inheriting script-src (the P863 root cause).
    // So every LogRocket CDN host in script-src must also be in worker-src — otherwise a
    // non-blob worker loaded from a rotated host would be blocked. This is the P865 lesson
    // applied to worker-src: allowlist the full pool in EVERY directive, not just script/connect.
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(workerSrc).toBeTruthy();
    expect(
      workerSrc,
      `worker-src must include ${host} (parity with script-src). worker-src no longer inherits script-src once declared, so a rotated non-blob worker host would be blocked — P863's mistake, one directive over. Current value: ${workerSrc}`,
    ).toContain(host);
  });

  it('declares a CSP reporting directive (report-uri or report-to) so future blocks self-surface', () => {
    expect(csp).toBeTruthy();
    const hasReporting = /(?:^|;\s*)report-uri\s+/.test(csp!) || /(?:^|;\s*)report-to\s+/.test(csp!);
    expect(
      hasReporting,
      `CSP must declare report-uri and/or report-to so a blocked host is reported automatically (passive backstop for host rotations between deploys). Current value: ${csp}`,
    ).toBe(true);
  });

  it("script-src and worker-src allow WebAssembly via 'wasm-unsafe-eval' (HEIC uploads + recorder)", () => {
    // heic2any (HEIC->JPEG, iPhone photo uploads) and the LogRocket recorder compile WASM.
    // Without 'wasm-unsafe-eval', script-src blocks ALL WebAssembly site-wide — found by the
    // csp-smoke gate ("script-src blocked wasm-eval"). The keyword is scoped to WASM compilation
    // only (NOT JS eval — far safer than 'unsafe-eval'). Locked in both directives so a future
    // edit can't silently re-break HEIC uploads.
    const scriptSrc = extractDirective(csp!, 'script-src');
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(scriptSrc, `script-src must allow 'wasm-unsafe-eval'. Current: ${scriptSrc}`).toContain("'wasm-unsafe-eval'");
    expect(workerSrc, `worker-src must allow 'wasm-unsafe-eval'. Current: ${workerSrc}`).toContain("'wasm-unsafe-eval'");
  });

  it('preserves the non-LogRocket allowlist entries (no regression on prior fixes)', () => {
    const scriptSrc = extractDirective(csp!, 'script-src');
    const connectSrc = extractDirective(csp!, 'connect-src');
    for (const entry of ["'self'", "'unsafe-inline'", 'https://cdn.mxpnl.com', 'https://js.sentry-cdn.com']) {
      expect(scriptSrc, `script-src must still include ${entry}`).toContain(entry);
    }
    for (const entry of [
      'https://*.supabase.co',
      'https://storage.googleapis.com',
      'https://api-eu.mixpanel.com',
      'https://*.sentry.io',
    ]) {
      expect(connectSrc, `connect-src must still include ${entry}`).toContain(entry);
    }
  });
});
