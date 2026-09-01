/**
 * @file p1223-redirect-allowlist.test.ts
 * @description P1223 — the post-auth redirect allowlist must reject every path form the
 * router would resolve to an external origin, and must admit every path a producer in src/
 * actually emits.
 *
 * Vectors are copied verbatim from the react-router fix for GHSA-wrjc-x8rr-h8h6
 * (remix-run/react-router#15176, `resolvePath-test.tsx` / `useNavigate-test.tsx`) — the
 * backslash forms the router now normalises to `/`, so `/\evil` becomes `//evil`, a
 * protocol-relative URL — and from GHSA-2j2x-hqr9-3h42 (the plain `//` form).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('rejects a backslash anywhere, including after an allowlisted root', () => {
    expect(isSafeRedirectPath('/events\\evil.com')).toBe(false);
    expect(isSafeRedirectPath('/events/\\\\evil.com')).toBe(false);
    expect(isSafeRedirectPath('/events/\\evil.com')).toBe(false);
  });

  it('rejects absolute URLs, empty, null and non-rooted paths', () => {
    expect(isSafeRedirectPath('https://evil.com/events')).toBe(false);
    expect(isSafeRedirectPath('events')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });

  it('rejects a rooted path outside the allowlist, and root prefixes that are not a segment', () => {
    expect(isSafeRedirectPath('/admin')).toBe(false);
    expect(isSafeRedirectPath('/eventsx')).toBe(false);
    expect(isSafeRedirectPath('/px')).toBe(false); // `/p` is a root, `/px` is not under it
    expect(isSafeRedirectPath('/pointer')).toBe(false);
    expect(isSafeRedirectPath('/login?redirect=/events')).toBe(false); // entry pages are never targets
    expect(isSafeRedirectPath('/signup')).toBe(false);
    expect(isSafeRedirectPath('/auth/callback')).toBe(false);
  });
});

describe('P1223 — isSafeRedirectPath admits the documented happy paths', () => {
  it.each(ALLOWED_REDIRECT_PREFIXES)('accepts the bare root %j', (root) => {
    expect(isSafeRedirectPath(root)).toBe(true);
  });

  it('accepts descendants of every root, including the ones that used to carry a trailing slash', () => {
    expect(isSafeRedirectPath('/point/abc-123')).toBe(true);
    expect(isSafeRedirectPath('/p/alice')).toBe(true);
    expect(isSafeRedirectPath('/events/some-slug')).toBe(true);
    expect(isSafeRedirectPath('/events?rsvp=1')).toBe(true);
    expect(isSafeRedirectPath('/live/ABC123')).toBe(true);
    expect(isSafeRedirectPath('/chat?from=position&pointId=x')).toBe(true);
    expect(isSafeRedirectPath('/events#rooms')).toBe(true);
  });

  // Every `?redirect=` producer in src/ (grep -rn "redirect=" src --include=*.tsx) must land
  // on an allowlisted root, otherwise the user is silently sent to /feed after sign-in.
  it.each([
    '/events/chiang-mai/room',            // EventRoomGate
    '/events/chiang-mai',                 // EventDetail rsvp
    '/docs',                              // docs-list-page
    '/me/calibration',                    // calibration-breakdown-page
    '/letters',                           // letters-page
    '/sessions',                          // my-sessions-page
    '/live',                              // clarity-live-page
    '/live/ABC123',                       // sessionRedirectUrl
    '/letter/00000000-0000-4000-8000-000000000000/confirm', // letter confirm pages
    '/letter/00000000-0000-4000-8000-000000000000?tab=x',   // letter overview/results/reading (pathname + search)
    '/agreements/00000000-0000-4000-8000-000000000000/accept?token=abc', // accept-agreement-page
    '/groups/cm/join?from=x',             // org-join-page / org-page joinPath
    '/org/cm/join',                       // legacy path still shared in old links
    '/create',                            // create-story-page returnUrl
    '/transcribe',                        // transcribe-room-page
    '/transcribe/ROOM77',
  ])('admits producer target %j', (target) => {
    expect(isSafeRedirectPath(target)).toBe(true);
  });

  it('every root is a bare first segment (no trailing slash — that shape matches nothing)', () => {
    for (const root of ALLOWED_REDIRECT_PREFIXES) {
      expect(root, root).toMatch(/^\/[a-z-]+$/);
    }
  });

  it('every root is a route App.tsx actually declares', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    const declared = new Set(
      [...app.matchAll(/path="(\/[^"/]*)/g)].map((m) => m[1]),
    );
    for (const root of ALLOWED_REDIRECT_PREFIXES) {
      expect(declared.has(root), `${root} is allowlisted but App.tsx declares no route under it`).toBe(true);
    }
  });
});
