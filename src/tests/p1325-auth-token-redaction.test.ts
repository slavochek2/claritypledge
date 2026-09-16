/**
 * P1325 — every signup now lands on /auth/verify?token_hash=…, and Mixpanel autocaptures the
 * pageview with the full URL and records sessions (index.html init). A sign-in token must never
 * reach Mixpanel or Sentry. Before this, only /live room codes were redacted (P1304), and Mixpanel
 * already held a full `#access_token=` URL from an operator-minted link.
 *
 * Runs the verbatim P1325 block from index.html, like the P1304 canary, and checks the Sentry
 * copy of the pattern stays identical. Legitimate URLs that must pass through untouched sit
 * beside the secrets (epistemic gate 7c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ErrorEvent } from '@sentry/react';
import { AUTH_TOKEN_IN_URL, sentryBeforeBreadcrumb, sentryBeforeSend } from '@/lib/sentry-filters';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const SECRET = 'pkce_FAKE-TOKEN-HASH-FOR-TESTS';
const JWT = 'FAKE.JWT.FOR-TESTS';

function loadBlock(pathname: string) {
  const p1304 = html.match(/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//);
  const p1325 = html.match(/\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//);
  if (!p1304) throw new Error('P1304 block missing from index.html');
  if (!p1325) throw new Error('P1325 block missing from index.html');
  const run = new Function(
    'window',
    `${p1304[0]}; ${p1325[0]}; return { redact: p1325Redact, noRecord: p1325NoRecord, pattern: p1325SignInParam };`,
  );
  return run({ location: { pathname } }) as {
    redact: (v: unknown) => unknown;
    noRecord: boolean;
    pattern: RegExp;
  };
}

const LEAKY_URLS = [
  `https://claritypledge.com/auth/verify?token_hash=${SECRET}&type=email&redirect_to=https%3A%2F%2Fclaritypledge.com%2Fauth%2Fcallback`,
  `https://claritypledge.com/auth/verify?type=email&token_hash=${SECRET}`,
  `https://claritypledge.com/auth/callback#access_token=${JWT}&expires_in=3600&refresh_token=${SECRET}&token_type=bearer`,
  `https://claritypledge.com/auth/callback?source=signup&code=${SECRET}`,
  `https://claritypledge.com/login?redirect=%2Fauth%2Fverify%3Ftoken_hash%3D${SECRET}`,
];

describe('P1325: Mixpanel carries no sign-in token', () => {
  it.each(LEAKY_URLS)('redacts the token from %s', (url) => {
    const { redact } = loadBlock('/');
    const item = { event: '$mp_web_page_view', properties: { $current_url: url, $referrer: url, current_url_search: url } };
    const out = JSON.stringify(redact(item));
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(JWT);
  });

  it('still redacts /live room codes (P1304 composed, not replaced)', () => {
    const { redact } = loadBlock('/');
    const out = JSON.stringify(redact({ properties: { $current_url: 'https://claritypledge.com/live/QX7K2M' } }));
    expect(out).not.toContain('QX7K2M');
  });

  it('leaves ordinary URLs and intent params untouched', () => {
    const { redact } = loadBlock('/');
    const url = 'https://claritypledge.com/events/clarity-night?action=rsvp&source=signup&redirect=%2Fevents%2Fx&type=email';
    expect(redact({ properties: { $current_url: url } })).toEqual({ properties: { $current_url: url } });
  });

  it('turns session recording off on the sign-in landing routes', () => {
    expect(loadBlock('/auth/verify').noRecord).toBe(true);
    expect(loadBlock('/auth/callback').noRecord).toBe(true);
    expect(loadBlock('/live/QX7K2M').noRecord).toBe(true);
    expect(loadBlock('/events/abc').noRecord).toBe(false);
    expect(html).toMatch(/record_sessions_percent:\s*p1325NoRecord\s*\?\s*0\s*:\s*100/);
    expect(html).toMatch(/hooks:\s*\{\s*before_send_events:\s*p1325Redact\s*\}/);
  });

  it('uses the same pattern as the Sentry redaction', () => {
    const { pattern } = loadBlock('/');
    expect(pattern.source).toBe(AUTH_TOKEN_IN_URL.source);
    expect(pattern.flags).toBe(AUTH_TOKEN_IN_URL.flags);
  });
});

describe('P1325: Sentry carries no sign-in token', () => {
  it('redacts tokens from error events and breadcrumbs', () => {
    const event = {
      type: undefined,
      message: 'boom',
      request: { url: LEAKY_URLS[0] },
      breadcrumbs: [{ category: 'navigation', data: { from: LEAKY_URLS[2], to: '/auth/callback' } }],
      exception: { values: [{ type: 'Error', value: 'boom' }] },
    } as ErrorEvent;
    const out = JSON.stringify(sentryBeforeSend(event));
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(JWT);
    const crumb = sentryBeforeBreadcrumb({ category: 'fetch', data: { url: LEAKY_URLS[3] } });
    expect(JSON.stringify(crumb)).not.toContain(SECRET);
  });
});
