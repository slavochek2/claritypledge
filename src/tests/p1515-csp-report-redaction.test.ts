/**
 * @file p1515-csp-report-redaction.test.ts
 * @description P1515: the same-origin CSP report proxy (api/csp-report.ts) forwards a violation report to Sentry. A
 * report names the page's URL (document-uri, referrer, blocked-uri), and a violation at document start can fire while
 * the address still holds a canvas link token. The proxy redacts capability tokens before forwarding.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token
const SINK = 'https://example.ingest.sentry.io/api/1/security/?sentry_key=testkey';

async function post(body: unknown, headers: Record<string, string> = {}) {
  vi.resetModules();
  process.env.SENTRY_CSP_REPORT_URL = SINK;
  const forwarded: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => { forwarded.push(String(init?.body)); return new Response(null, { status: 200 }); }));
  const { default: handler } = await import('../../api/csp-report');
  const res = { statusCode: 0, status(code: number) { this.statusCode = code; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: { 'content-type': 'application/csp-report', ...headers }, body } as never, res as never);
  return { forwarded, status: res.statusCode };
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.SENTRY_CSP_REPORT_URL; });

describe('api/csp-report redacts capability tokens before forwarding', () => {
  it.each([
    ['fragment', `https://claritypledge.com/p/ana/canvas/sales#k=${TOKEN}`],
    ['query', `https://claritypledge.com/p/ana/canvas/sales?point=abc&k=${TOKEN}`],
    ['encoded inside a login redirect', `https://claritypledge.com/login?redirect=%2Fp%2Fana%2Fcanvas%2Fsales%23k%3D${TOKEN}`],
    ['HTML-escaped query', `https://claritypledge.com/p/ana/canvas/sales?a=1&amp;k=${TOKEN}`],
    ['percent-encoded parameter name', `https://claritypledge.com/p/ana/canvas/sales?%6B=${TOKEN}`],
  ])('document-uri, referrer and blocked-uri: %s', async (_label, url) => {
    const { forwarded, status } = await post({ 'csp-report': { 'document-uri': url, referrer: url, 'blocked-uri': url, 'violated-directive': 'script-src' } });
    expect(status).toBe(204);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).not.toContain(TOKEN);
    expect(forwarded[0]).toContain('[redacted]');
    expect(forwarded[0]).toContain('script-src'); // CONTROL: the rest of the report is intact
  });

  it('also redacts a sign-in token and a room code, and passes an ordinary report through untouched', async () => {
    const leaky = await post({ 'csp-report': { 'document-uri': 'https://claritypledge.com/auth/verify?token_hash=pkce_FAKE', referrer: 'https://claritypledge.com/live/QX7K2M' } });
    expect(leaky.forwarded[0]).not.toContain('pkce_FAKE');
    expect(leaky.forwarded[0]).not.toContain('QX7K2M');
    const clean = { 'csp-report': { 'document-uri': 'https://claritypledge.com/p/ana/canvas/sales?point=abc', 'blocked-uri': 'https://cdn.example.com/x.js', 'violated-directive': 'script-src' } };
    const out = await post(clean);
    expect(JSON.parse(out.forwarded[0]!)).toEqual(clean);
  });

  it('a string body (application/reports+json as text) is redacted too', async () => {
    const { forwarded } = await post(JSON.stringify([{ type: 'csp-violation', body: { documentURL: `https://claritypledge.com/p/ana/canvas/sales#k=${TOKEN}` } }]), { 'content-type': 'application/reports+json' });
    expect(forwarded[0]).not.toContain(TOKEN);
  });
});
