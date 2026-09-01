/**
 * P805 Canary — CSP connect-src must include https://storage.googleapis.com.
 *
 * Since vercel.json line 104 promoted CSP from Report-Only to enforce
 * (commit c64dfd81, 2026-04-04), the browser has been silently blocking
 * every fetch() PUT to storage.googleapis.com — audio chunks, events
 * snapshots, and browser-path story image uploads all fail with
 * "Refused to connect because it violates the document's Content
 * Security Policy" before leaving the browser.
 *
 * img-src already lists storage.googleapis.com (image display works).
 * connect-src is missing it (fetch PUT is blocked).
 *
 * This test parses vercel.json, finds the enforcing CSP on the default
 * route ("/(.*)"), extracts the connect-src directive, and asserts it
 * contains https://storage.googleapis.com.
 *
 * Reverting the fix in vercel.json must make this test fail.
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
  const match = csp.match(new RegExp(`${directiveName}([^;]+)`));
  return match ? match[1].trim() : null;
}

describe('P805: CSP connect-src directive allows storage.googleapis.com', () => {
  const config = loadVercelConfig();

  it('vercel.json has an enforcing CSP on the default "/(.*)" route', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp, 'enforcing Content-Security-Policy header must exist on /(.*)').toBeTruthy();
  });

  it('connect-src directive includes https://storage.googleapis.com', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp).toBeTruthy();

    const connectSrc = extractDirective(csp!, 'connect-src');
    expect(connectSrc, 'connect-src directive must exist').toBeTruthy();

    expect(
      connectSrc,
      `connect-src must include https://storage.googleapis.com (browser fetch PUTs for GCS uploads). Current value: ${connectSrc}`,
    ).toContain('https://storage.googleapis.com');
  });

  it('existing connect-src entries are preserved (no regression)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const connectSrc = extractDirective(csp!, 'connect-src');
    expect(connectSrc).toBeTruthy();

    // These entries were already in connect-src before P805. The fix must not drop any of them.
    const required = [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api-eu.mixpanel.com',
      'https://*.sentry.io',
      'https://api.web3forms.com',
      'https://api.unsplash.com',
    ];
    for (const entry of required) {
      expect(connectSrc, `connect-src must still include ${entry}`).toContain(entry);
    }
  });

  it('img-src continues to include storage.googleapis.com (pre-existing, unchanged)', () => {
    // This was already correct before P805. Guard against accidentally removing it
    // while editing the same line.
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const imgSrc = extractDirective(csp!, 'img-src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc).toContain('https://storage.googleapis.com');
  });

  it('/story/(.*) and /point/(.*) CSP is frame-ancestors only by design (no GCS uploads on those routes)', () => {
    // These routes allow social platform embedding (og-image previews). They set
    // only frame-ancestors — no connect-src restriction — because they are view-only
    // routes and initiate no fetch() PUTs to GCS. The P805 fix on /(.*) is sufficient.
    const storyCsp = getEnforcingCspForRoute(config, '/story/(.*)');
    const pointCsp = getEnforcingCspForRoute(config, '/point/(.*)');
    expect(storyCsp, '/story/(.*) must have a CSP header').toBeTruthy();
    expect(pointCsp, '/point/(.*) must have a CSP header').toBeTruthy();
    expect(storyCsp).toBe('frame-ancestors *');
    expect(pointCsp).toBe('frame-ancestors *');
  });
});
