/**
 * P906 Canary — CSP frame-src must exist and allow https://calendar.google.com.
 *
 * The /cm page embeds the public Chiang Mai Google Calendar in an iframe.
 * vercel.json's enforcing CSP sets default-src 'self' and never declares
 * frame-src, so the browser falls back to default-src and blocks framing
 * calendar.google.com entirely. Prod console error:
 *
 *   Framing 'https://calendar.google.com/' violates the following Content
 *   Security Policy directive: "default-src 'self'". The request has been
 *   blocked. Note that 'frame-src' was not explicitly set, so 'default-src'
 *   is used as a fallback.
 *
 * Local dev never sees this — Vite serves no CSP header — which is how the
 * bug shipped. This test parses vercel.json, finds the enforcing CSP on the
 * default route ("/(.*)"), and asserts an explicit frame-src directive that
 * allows 'self' and https://calendar.google.com.
 *
 * It also locks '/cm' into PROD_HEALTH_ROUTES so the deployed-prod smoke
 * gates (csp-smoke + prod-health-smoke) load /cm and fail loud on any future
 * CSP regression there — the gate gap that let this bug reach prod unnoticed.
 *
 * Reverting the fix in vercel.json must make this test fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROD_HEALTH_ROUTES } from '../../e2e/helpers/prod-health';

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
  const match = csp.match(new RegExp(`(?:^|;)\\s*${directiveName}([^;]+)`));
  return match ? match[1].trim() : null;
}

describe('P906: CSP frame-src directive allows calendar.google.com', () => {
  const config = loadVercelConfig();

  it('vercel.json has an enforcing CSP on the default "/(.*)" route', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp, 'enforcing Content-Security-Policy header must exist on /(.*)').toBeTruthy();
  });

  it('frame-src directive exists explicitly (no default-src fallback)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp).toBeTruthy();

    const frameSrc = extractDirective(csp!, 'frame-src');
    expect(
      frameSrc,
      "frame-src must be declared explicitly — without it the browser falls back to default-src 'self' and blocks all external iframes (the /cm calendar bug)",
    ).toBeTruthy();
  });

  it("frame-src includes 'self' and https://calendar.google.com", () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    const frameSrc = extractDirective(csp!, 'frame-src');
    expect(frameSrc).toBeTruthy();

    expect(
      frameSrc,
      `frame-src must include 'self' (same-origin iframes, e.g. /live overlay). Current value: ${frameSrc}`,
    ).toContain("'self'");
    expect(
      frameSrc,
      `frame-src must include https://calendar.google.com (the /cm calendar embed). Current value: ${frameSrc}`,
    ).toContain('https://calendar.google.com');
  });

  it('adjacent directives are preserved (no regression while editing the CSP line)', () => {
    const csp = getEnforcingCspForRoute(config, '/(.*)');
    expect(csp).toBeTruthy();

    const defaultSrc = extractDirective(csp!, 'default-src');
    expect(defaultSrc, "default-src must remain 'self'").toBe("'self'");

    const frameAncestors = extractDirective(csp!, 'frame-ancestors');
    expect(frameAncestors, "frame-ancestors must remain 'self' on /(.*)").toBe("'self'");

    const objectSrc = extractDirective(csp!, 'object-src');
    expect(objectSrc, "object-src must remain 'none'").toBe("'none'");
  });
});

describe('P906: prod smoke gates cover /cm', () => {
  it("PROD_HEALTH_ROUTES includes '/cm' so deployed-prod gates catch CSP regressions there", () => {
    // The original bug shipped because no gate loaded /cm on prod. csp-smoke and
    // prod-health-smoke both iterate PROD_HEALTH_ROUTES (single source of truth).
    expect(PROD_HEALTH_ROUTES).toContain('/cm');
  });
});
