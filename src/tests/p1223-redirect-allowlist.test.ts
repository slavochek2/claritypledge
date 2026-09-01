/**
 * @file p1223-redirect-allowlist.test.ts
 * @description P1223 — the post-auth redirect allowlist must reject every path form the
 * router would resolve to an external origin.
 *
 * Vectors are copied verbatim from the react-router fix for GHSA-wrjc-x8rr-h8h6
 * (remix-run/react-router#15176, `resolvePath-test.tsx` / `useNavigate-test.tsx`) — the
 * backslash forms the router now normalises to `/`, so `/\evil` becomes `//evil`, a
 * protocol-relative URL — and from GHSA-2j2x-hqr9-3h42 (the plain `//` form).
 */
import { describe, it, expect } from 'vitest';
import { isSafeRedirectPath, ALLOWED_REDIRECT_PREFIXES } from '@/auth/redirect-allowlist';

// remix-run/react-router#15176 — resolvePath / useNavigate cases, verbatim.
const ADVISORY_VECTORS = [
  '//foo',
  '\\\\foo',
  '/\\foo',
  '\\/foo',
  '\\\\localhost/parent',
  '/\\localhost/parent',
  '\\/localhost/parent',
];

describe('P1223 — isSafeRedirectPath rejects the open-redirect path forms', () => {
  it.each(ADVISORY_VECTORS)('rejects advisory vector %j', (vector) => {
    expect(isSafeRedirectPath(vector)).toBe(false);
  });

  it.each(ADVISORY_VECTORS.map((v) => `${v}/events`))(
    'rejects advisory vector even when the tail is an allowlisted route: %j',
    (vector) => {
      expect(isSafeRedirectPath(vector)).toBe(false);
    },
  );

  it('rejects a backslash hidden AFTER an allowlisted prefix', () => {
    // `/events\\@evil.com` → router rewrites to `/events/@evil.com` (still same-origin), but
    // `/events/..\\..\\evil` style rewrites are exactly the class the advisory closes; any
    // backslash anywhere is rejected rather than reasoning about which ones are harmless.
    expect(isSafeRedirectPath('/events\\evil.com')).toBe(false);
    expect(isSafeRedirectPath('/events/\\\\evil.com')).toBe(false);
  });

  it('rejects absolute URLs, empty, null and non-rooted paths', () => {
    expect(isSafeRedirectPath('https://evil.com/events')).toBe(false);
    expect(isSafeRedirectPath('events')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });

  it('rejects a rooted path outside the allowlist', () => {
    expect(isSafeRedirectPath('/admin')).toBe(false);
    expect(isSafeRedirectPath('/eventsx')).toBe(false); // prefix must end at a segment
  });
});

describe('P1223 — isSafeRedirectPath still accepts the documented happy paths', () => {
  it.each(ALLOWED_REDIRECT_PREFIXES)('accepts the bare prefix %j', (prefix) => {
    expect(isSafeRedirectPath(prefix)).toBe(true);
  });

  it('accepts a sub-path and a query string under an allowlisted prefix', () => {
    expect(isSafeRedirectPath('/events/some-slug')).toBe(true);
    expect(isSafeRedirectPath('/events?rsvp=1')).toBe(true);
    expect(isSafeRedirectPath('/live/ABC123')).toBe(true);
    expect(isSafeRedirectPath('/chat?from=position&pointId=x')).toBe(true);
    // Pre-existing (not P1223): the two prefixes that END in a slash (`/p/`, `/point/`)
    // only ever match themselves literally — `/point/<id>` falls through to the fallback.
    // Behaviour is unchanged by this hardening; recorded here so nobody reads the
    // allowlist as admitting those sub-paths.
    expect(isSafeRedirectPath('/point/abc-123')).toBe(false);
  });
});
