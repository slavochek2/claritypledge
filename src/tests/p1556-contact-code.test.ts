/**
 * P1556: the pure parts of contact codes — handle normalisation, the refusal mapping, and the token's treatment as a
 * URL secret (redaction and the redirect allowlist). Server rules are covered by e2e/integration/p1556-contact-code.spec.ts.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { normalizeHandleQuery, isContactToken, contactCodeUrl } from '@/app/data/contact-code-utils';
import { redeemFailureFrom } from '@/app/data/contact-code-service';
import { redactRoomCodes } from '@/lib/url-token-redaction';
import { isSafeRedirectPath } from '@/auth/redirect-allowlist';

const TOKEN = '0123456789abcdef0123456789abcdef'; // gitleaks:allow — a made-up test token, not a credential

describe('normalizeHandleQuery', () => {
  it.each([
    ['alex-novak', 'alex-novak'],
    ['  @Alex-Novak ', 'alex-novak'],
    ['@@alex', 'alex'],
    ['https://claritypledge.com/p/alex-novak', 'alex-novak'],
    ['claritypledge.com/p/alex-novak?tab=points', 'alex-novak'],
    ['/p/alex-novak/canvas/x', 'alex-novak'],
  ])('%j → %j', (input, out) => expect(normalizeHandleQuery(input)).toBe(out));

  it.each(['', '   ', '@', 'two words', 'a/b', 'x'.repeat(101)])('rejects %j', (input) => {
    expect(normalizeHandleQuery(input)).toBe('');
  });
});

describe('isContactToken / contactCodeUrl', () => {
  it('accepts only 32 lowercase hex characters', () => {
    expect(isContactToken(TOKEN)).toBe(true);
    expect(isContactToken(TOKEN.toUpperCase())).toBe(false);
    expect(isContactToken(TOKEN.slice(1))).toBe(false);
    expect(isContactToken('alex-novak')).toBe(false);
    expect(isContactToken(undefined)).toBe(false);
  });
  it('builds the link on the given origin', () => {
    expect(contactCodeUrl(TOKEN, 'https://claritypledge.com')).toBe(`https://claritypledge.com/connect/${TOKEN}`);
  });
});

describe('redeemFailureFrom', () => {
  it('names each server refusal, and folds everything else into one', () => {
    expect(redeemFailureFrom('contact code: own code')).toBe('own-code');
    expect(redeemFailureFrom('contact code: paused')).toBe('paused');
    expect(redeemFailureFrom('chat: too many new conversations today')).toBe('too-many');
    expect(redeemFailureFrom('contact code: not available')).toBe('unavailable');
    expect(redeemFailureFrom('anything else')).toBe('unavailable');
  });
});

describe('the token is a URL secret', () => {
  it('is redacted from page URLs and encoded login redirects', () => {
    expect(redactRoomCodes(`https://claritypledge.com/connect/${TOKEN}`)).toBe('https://claritypledge.com/connect/[code]');
    expect(redactRoomCodes(`/login?redirect=%2Fconnect%2F${TOKEN}`)).toBe('/login?redirect=%2Fconnect%2F[code]');
    expect(redactRoomCodes(`/connect/${TOKEN}`)).not.toContain(TOKEN);
  });
  it('is an allowed return path after sign-in', () => {
    expect(isSafeRedirectPath(`/connect/${TOKEN}`)).toBe(true);
    expect(isSafeRedirectPath('/connectx/abc')).toBe(false);
  });
});
