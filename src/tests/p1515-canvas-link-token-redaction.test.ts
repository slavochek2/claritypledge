/**
 * @file p1515-canvas-link-token-redaction.test.ts
 * @description P1515: the link token of a canvas ("anyone with the link", `?k=<32 hex>`) is a capability, so
 * it must reach neither Mixpanel nor Sentry (the P1304 room-code / P1325 sign-in-token pattern).
 *   - Mixpanel: the verbatim P1325 block of index.html redacts `k` in every event property, and session
 *     recording is off on a canvas load that carries it;
 *   - Sentry: the identical pattern redacts it in events and breadcrumbs, plain and URL-encoded, including
 *     inside a nested redirect;
 *   - the not-found page logs the path only.
 * Legitimate URLs that must pass through untouched sit beside the secret (epistemic gate 7c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ErrorEvent } from '@sentry/react';
import { AUTH_TOKEN_IN_URL, sentryBeforeBreadcrumb, sentryBeforeSend } from '@/lib/sentry-filters';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // a sample 32-hex link token; gitleaks:allow — synthetic fixture, matches no real token

function loadBlock(pathname: string, search = '') {
  const p1304 = html.match(/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//);
  const p1325 = html.match(/\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//);
  if (!p1304 || !p1325) throw new Error('redaction blocks missing from index.html');
  const run = new Function('window', `${p1304[0]}; ${p1325[0]}; return { redact: p1325Redact, noRecord: p1325NoRecord, pattern: p1325SignInParam };`);
  return run({ location: { pathname, search } }) as { redact: (v: unknown) => unknown; noRecord: boolean; pattern: RegExp };
}

const LEAKY = [
  `https://claritypledge.com/p/ana/canvas/sales?k=${TOKEN}`,
  `https://claritypledge.com/p/ana/canvas/sales?point=abc&k=${TOKEN}&with=def`,
  `https://claritypledge.com/p/ana/canvas/sales?with=def&k=${TOKEN}#top`,
  // encoded copy inside a login redirect, and nested one level deeper
  `https://claritypledge.com/login?redirect=%2Fp%2Fana%2Fcanvas%2Fsales%3Fk%3D${TOKEN}`,
  `https://claritypledge.com/login?next=https%3A%2F%2Fclaritypledge.com%2Flogin%3Fredirect%3D%252Fp%252Fana%252Fcanvas%252Fsales%253Fk%253D${TOKEN}`,
];

describe('P1515: Mixpanel carries no canvas link token', () => {
  it.each(LEAKY)('redacts the token from %s', url => {
    const { redact } = loadBlock('/');
    const out = JSON.stringify(redact({ event: '$mp_web_page_view', properties: { $current_url: url, $referrer: url, current_url_search: url } }));
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('[redacted]');
  });

  it('leaves the canvas address and its other parameters untouched', () => {
    const { redact } = loadBlock('/');
    for (const url of [
      'https://claritypledge.com/p/ana/canvas/sales',
      'https://claritypledge.com/p/ana/canvas/sales?point=0b1c2d3e&with=4f5a6b7c&box=canvas%3Aproblem',
      'https://claritypledge.com/events/x?kind=talk&key=abc&k2=1&ok=true', // names that merely contain a k
    ]) expect(redact({ properties: { $current_url: url } })).toEqual({ properties: { $current_url: url } });
  });

  it('does not record the session on a canvas load that carries the token; CONTROL: other loads and token-free canvas loads still record', () => {
    expect(loadBlock('/p/ana/canvas/sales', `?k=${TOKEN}`).noRecord).toBe(true);
    expect(loadBlock('/p/ana/canvas/sales', `?point=abc&k=${TOKEN}`).noRecord).toBe(true);
    expect(loadBlock('/p/ana/canvas/sales', '?point=abc').noRecord).toBe(false);
    expect(loadBlock('/p/ana/canvas/sales', '').noRecord).toBe(false);
    expect(loadBlock('/p/ana', `?k=${TOKEN}`).noRecord).toBe(false); // not a canvas address
    expect(loadBlock('/events/abc', '').noRecord).toBe(false);
    expect(html).toMatch(/record_sessions_percent:\s*p1325NoRecord\s*\?\s*0\s*:\s*100/);
  });

  it('keeps the earlier redactions (room codes, sign-in tokens) and the identical Sentry pattern', () => {
    const { redact, pattern } = loadBlock('/');
    const out = JSON.stringify(redact({ properties: { a: 'https://claritypledge.com/live/QX7K2M', b: 'https://claritypledge.com/auth/verify?token_hash=pkce_FAKE' } }));
    expect(out).not.toContain('QX7K2M');
    expect(out).not.toContain('pkce_FAKE');
    expect(pattern.source).toBe(AUTH_TOKEN_IN_URL.source);
    expect(pattern.flags).toBe(AUTH_TOKEN_IN_URL.flags);
  });
});

describe('P1515: Sentry carries no canvas link token', () => {
  it('redacts the token from an error event (request url, breadcrumbs, nested redirect) and from breadcrumbs', () => {
    const event = {
      type: undefined,
      message: `Failed at ${LEAKY[0]}`,
      request: { url: LEAKY[1] },
      breadcrumbs: [{ category: 'navigation', data: { from: LEAKY[3], to: LEAKY[4] } }],
      exception: { values: [{ type: 'Error', value: 'boom' }] },
    } as ErrorEvent;
    const out = JSON.stringify(sentryBeforeSend(event));
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('[redacted]');
    expect(JSON.stringify(sentryBeforeBreadcrumb({ category: 'fetch', data: { url: LEAKY[2] } }))).not.toContain(TOKEN);
  });

  it('CONTROL: the untouched canvas address survives', () => {
    const crumb = sentryBeforeBreadcrumb({ category: 'navigation', data: { to: 'https://claritypledge.com/p/ana/canvas/sales?point=abc' } });
    expect(JSON.stringify(crumb)).toContain('/p/ana/canvas/sales?point=abc');
  });
});

describe('P1515: the not-found page logs the path only', () => {
  it('attempted_path has no query', () => {
    const src = readFileSync(join(__dirname, '../app/pages/not-found-page.tsx'), 'utf8');
    expect(src).toMatch(/attempted_path:\s*location\.pathname,/);
    expect(src).not.toMatch(/attempted_path:[^,\n]*location\.search/);
  });
});
