/**
 * P1487 — the terms nonce in a sign-in link never reaches telemetry.
 *
 * The emailed sign-in link carries `terms_nonce`, which /auth/verify forwards to /auth/callback.
 * Both pages are captured by Mixpanel (pageview URL; index.html P1325 block) and can appear in
 * Sentry breadcrumbs, so the nonce is redacted by the same pattern as the sign-in tokens
 * (src/lib/sentry-filters.ts AUTH_TOKEN_IN_URL; src/tests/p1325-auth-token-redaction.test.ts keeps
 * the two copies identical). Ordinary parameters beside it pass through.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactAuthTokens } from '@/lib/sentry-filters';

const NONCE = 'a1b2c3d4e5f60718293a4b5c6d7e8f9001122334455667788';
const URLS = [
  `https://claritypledge.com/auth/verify?token_hash=x&type=magiclink&source=signup&redirect=%2Fletter%2Fd%3Ftoken%3Dt&terms_nonce=${NONCE}`,
  `https://claritypledge.com/auth/callback?source=signup&redirect=%2Fagreements%2Fa%2Faccept&terms_nonce=${NONCE}`,
  `https://claritypledge.com/login?redirect=%2Fauth%2Fcallback%3Fterms_nonce%3D${NONCE}`,
];

function mixpanelRedact() {
  const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
  const p1304 = html.match(/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//);
  const p1325 = html.match(/\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//);
  if (!p1304 || !p1325) throw new Error('redaction blocks missing from index.html');
  const run = new Function('window', `${p1304[0]}; ${p1325[0]}; return p1325Redact;`);
  return run({ location: { pathname: '/' } }) as (v: unknown) => unknown;
}

describe('P1487: terms nonce redaction', () => {
  it.each(URLS)('Sentry redaction removes the nonce from %s', (url) => {
    const out = redactAuthTokens(url);
    expect(out).not.toContain(NONCE);
    if (url.includes('source=signup')) expect(out).toContain('source=signup');
  });

  it.each(URLS)('Mixpanel redaction removes the nonce from %s', (url) => {
    const out = JSON.stringify(mixpanelRedact()({ properties: { $current_url: url, $referrer: url } }));
    expect(out).not.toContain(NONCE);
  });

  it('control: an ordinary URL is untouched', () => {
    const url = 'https://claritypledge.com/agreements/a/accept?token=t&source=signup';
    expect(redactAuthTokens(url)).toBe(url);
  });
});
