/**
 * P865 Canary — CSP directive invariants.
 *
 * ORIGIN (P865, 2026-04): LogRocket rotated the CDN host it served its bundle from
 * across ~12 families to evade ad-blockers. The enforcing CSP allowlisted only one
 * of them, so the next rotation blocked the script in production and session replay
 * silently stopped for every browser user. That was the third instance of one audit
 * gap (P805 connect-src, P863 worker-src + recorder fetch), and this canary was
 * written to lock the whole host pool in every governing directive.
 *
 * P1216 (2026-09): LogRocket was removed entirely — Mixpanel Session Replay
 * (record_sessions_percent: 100) and Sentry replay-on-error cover the ground, and
 * LogRocket was init-only with no identify(), so its replays were never joinable to
 * a user or a funnel step. The 37 LogRocket host tokens are gone from script-src,
 * worker-src and connect-src.
 *
 * WHAT SURVIVES, AND WHY THIS FILE WAS NOT DELETED WITH THE VENDOR:
 * only one of this file's assertions was ever about LogRocket. The rest guard
 * invariants that outlive any single vendor, and one of them protects a feature
 * with no connection to observability at all:
 *
 *   1. An enforcing CSP exists on "/(.*)"                       — the whole header
 *   2. A reporting directive is declared                        — blocks self-surface
 *   3. 'wasm-unsafe-eval' in script-src AND worker-src          — HEIC PHOTO UPLOADS
 *   4. Non-vendor allowlist entries preserved                   — no regression
 *   5. worker-src ⊇ script-src for remaining CDN hosts          — the P865 lesson,
 *                                                                 generalized past
 *                                                                 the vendor that
 *                                                                 taught it
 *   6. No LogRocket host has crept back in                      — P1216 removal lock
 *
 * Assertion 3 is the one to be careful with: without 'wasm-unsafe-eval', script-src
 * blocks ALL WebAssembly site-wide, which breaks heic2any and therefore every iPhone
 * photo upload. That was P869, and it is invisible until a user tries to upload.
 *
 * Sibling of the P805, P863 and P906 canaries.
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

// Third-party CDN hosts still governed by the CSP after P1216. Each must appear in
// worker-src as well as script-src: once worker-src is declared it STOPS inheriting
// script-src (the P863 root cause), so a non-blob worker from one of these hosts
// would be blocked if the two drifted apart.
const ACTIVE_CDN_SCRIPT_HOSTS = ['https://cdn.mxpnl.com', 'https://js.sentry-cdn.com'];

// P1216: LogRocket's rotating families. Matching ANY of these means the vendor has
// been re-added to the CSP without re-adding the SDK — or that a revert was partial.
// Kept as a denylist because the pool is what made the vendor expensive to carry.
const REMOVED_LOGROCKET_PATTERNS = [
  'logrocket',
  'lr-ingest',
  'lr-in',
  'lr-intake',
  'ingest-lr',
  'intake-lr',
  'logr-ingest',
  'logr-in',
  'lrkt-in',
  'lgrckt-in',
];

describe('P865/P1216: CSP directive invariants', () => {
  const config = loadVercelConfig();
  const csp = getEnforcingCspForRoute(config, '/(.*)');

  it('vercel.json has an enforcing CSP on the default "/(.*)" route', () => {
    expect(csp, 'enforcing Content-Security-Policy header must exist on /(.*)').toBeTruthy();
  });

  it('declares a CSP reporting directive (report-uri or report-to) so future blocks self-surface', () => {
    expect(csp).toBeTruthy();
    const hasReporting = /(?:^|;\s*)report-uri\s+/.test(csp!) || /(?:^|;\s*)report-to\s+/.test(csp!);
    expect(
      hasReporting,
      `CSP must declare report-uri and/or report-to so a blocked host is reported automatically (passive backstop between deploys). Current value: ${csp}`,
    ).toBe(true);
  });

  it("script-src and worker-src allow WebAssembly via 'wasm-unsafe-eval' (HEIC photo uploads)", () => {
    // heic2any (HEIC->JPEG, iPhone photo uploads) compiles WASM. Without
    // 'wasm-unsafe-eval', script-src blocks ALL WebAssembly site-wide — found by the
    // csp-smoke gate ("script-src blocked wasm-eval"), incident P869. The keyword is
    // scoped to WASM compilation only (NOT JS eval — far safer than 'unsafe-eval').
    // Locked in both directives so a future edit can't silently re-break uploads.
    // This assertion has NOTHING to do with any observability vendor: it survived
    // P1216 precisely because it was never about LogRocket.
    const scriptSrc = extractDirective(csp!, 'script-src');
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(scriptSrc, `script-src must allow 'wasm-unsafe-eval'. Current: ${scriptSrc}`).toContain("'wasm-unsafe-eval'");
    expect(workerSrc, `worker-src must allow 'wasm-unsafe-eval'. Current: ${workerSrc}`).toContain("'wasm-unsafe-eval'");
  });

  it.each(ACTIVE_CDN_SCRIPT_HOSTS)('worker-src includes %s (parity with script-src)', (host) => {
    // The P865 lesson, generalized past the vendor that taught it: apply a CDN-hosted
    // vendor's allowlist to EVERY directive that governs it. worker-src no longer
    // inherits script-src once declared, so parity must be asserted, not assumed.
    const scriptSrc = extractDirective(csp!, 'script-src');
    const workerSrc = extractDirective(csp!, 'worker-src');
    expect(scriptSrc, `script-src must include ${host}`).toContain(host);
    expect(
      workerSrc,
      `worker-src must include ${host} (parity with script-src). worker-src stops inheriting script-src once declared — P863's mistake, one directive over. Current value: ${workerSrc}`,
    ).toContain(host);
  });

  it('preserves the non-vendor allowlist entries (no regression on prior fixes)', () => {
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

  it.each(REMOVED_LOGROCKET_PATTERNS)('CSP contains no LogRocket host matching "%s" (P1216)', (pattern) => {
    // P1216 removed the vendor. If a host from its rotating pool reappears here, either
    // the SDK is being re-added (which needs a decision, not a CSP edit) or a revert was
    // partial — leaving ad-block-evading origins allowlisted for a vendor we do not load.
    expect(
      csp!.toLowerCase(),
      `CSP must not reference LogRocket host family "${pattern}" — the vendor was removed in P1216. Current value: ${csp}`,
    ).not.toContain(pattern);
  });
});
