/**
 * P907 Canary — X-Frame-Options must agree with CSP frame-ancestors.
 *
 * vercel.json sent `X-Frame-Options: DENY` on the default "/(.*)" route while
 * the same route's CSP said `frame-ancestors 'self'`. Supported browsers let
 * frame-ancestors win, so the same-origin /live overlay iframe worked — but the
 * two headers contradicted each other, and a legacy user agent that honors XFO
 * over CSP would block the overlay.
 *
 * This test checks every header block in vercel.json that sets BOTH headers and
 * asserts they express the same policy:
 *
 *   frame-ancestors 'none'  <->  X-Frame-Options: DENY
 *   frame-ancestors 'self'  <->  X-Frame-Options: SAMEORIGIN
 *
 * Any other frame-ancestors value (hosts, `*`) cannot be expressed in XFO, so a
 * block that pairs one with an XFO header fails too.
 *
 * Reverting "/(.*)" to DENY must make this test fail.
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

// Header names are case-insensitive — a lowercase key must not escape the check.
function getHeader(route: VercelRoute, key: string): string | null {
  const header = route.headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
  return header ? header.value : null;
}

function extractDirective(csp: string, directiveName: string): string | null {
  const match = csp.match(new RegExp(`(?:^|;)\\s*${directiveName}([^;]+)`));
  return match ? match[1].trim() : null;
}

/** The XFO value that expresses a frame-ancestors source list, or null if XFO can't. */
function xfoFor(frameAncestors: string): string | null {
  if (frameAncestors === "'none'") return 'DENY';
  if (frameAncestors === "'self'") return 'SAMEORIGIN';
  return null;
}

interface FramingPair {
  source: string;
  xfo: string;
  frameAncestors: string;
}

function routesWithBothHeaders(config: VercelConfig): FramingPair[] {
  const pairs: FramingPair[] = [];
  for (const route of config.headers ?? []) {
    const xfo = getHeader(route, 'X-Frame-Options');
    const csp = getHeader(route, 'Content-Security-Policy');
    const frameAncestors = csp ? extractDirective(csp, 'frame-ancestors') : null;
    if (xfo && frameAncestors) {
      pairs.push({ source: route.source, xfo: xfo.trim(), frameAncestors });
    }
  }
  return pairs;
}

describe('P907: X-Frame-Options agrees with CSP frame-ancestors', () => {
  const config = loadVercelConfig();
  const pairs = routesWithBothHeaders(config);

  it('the default "/(.*)" route is among the blocks that set both headers (non-vacuous check)', () => {
    // Without this, a parser that found nothing would pass the agreement loop below.
    expect(pairs.map((p) => p.source)).toContain('/(.*)');
  });

  it('every block that sets both headers expresses the same framing policy', () => {
    for (const { source, xfo, frameAncestors } of pairs) {
      const expected = xfoFor(frameAncestors);
      expect(
        expected,
        `${source}: frame-ancestors ${frameAncestors} cannot be expressed in X-Frame-Options — drop the XFO header or change the CSP`,
      ).not.toBeNull();
      expect(
        xfo.toUpperCase(),
        `${source}: X-Frame-Options ${xfo} contradicts CSP frame-ancestors ${frameAncestors} (expected ${expected})`,
      ).toBe(expected);
    }
  });

  it('"/(.*)" sends SAMEORIGIN and keeps frame-ancestors \'self\'', () => {
    const route = pairs.find((p) => p.source === '/(.*)');
    expect(route).toBeDefined();
    expect(route!.frameAncestors, "frame-ancestors must remain 'self' on /(.*)").toBe("'self'");
    expect(route!.xfo, 'X-Frame-Options on /(.*) must be SAMEORIGIN').toBe('SAMEORIGIN');
  });
});
