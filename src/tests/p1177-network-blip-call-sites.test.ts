/**
 * @file p1177-network-blip-call-sites.test.ts
 * @description Canary for P1177 — five call sites reported every async
 * rejection to Sentry unconditionally, including transient network blips. Same
 * bug class P1176 fixed inline at `agent-accounts-context.tsx`.
 *
 * Two layers of assertion, because the five sites are not equally reachable:
 *
 *  1. Behaviour — `reportUnlessBlip` is exercised directly for both branches:
 *     a blip drops a breadcrumb and never captures; a real error captures with
 *     its tags intact.
 *  2. Wiring — each of the three files is asserted to route its captures
 *     through the gate, anchored on `Sentry.captureException` (the thing that
 *     must not appear bare) rather than on the helper name, which could itself
 *     be missing. `letter-reading-page.tsx` in particular has no unit-level
 *     render harness, so the source assertion is what covers its two sites.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import { reportUnlessBlip } from '@/lib/report-unless-blip';

const mockCapture = vi.mocked(Sentry.captureException);
const mockBreadcrumb = vi.mocked(Sentry.addBreadcrumb);

/** The three files P1177 names, with the number of capture sites in each. */
const CALL_SITE_FILES: Array<{ path: string; sites: number }> = [
  { path: '../app/hooks/useOpenLiveInvite.ts', sites: 2 },
  { path: '../app/pages/letter-reading-page.tsx', sites: 2 },
  { path: '../app/components/auth/terms-acceptance-gate.tsx', sites: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P1177: reportUnlessBlip gates the Sentry report, not the error handling', () => {
  it('suppresses a "Load failed" blip and drops a breadcrumb naming the call site', () => {
    const reported = reportUnlessBlip(new Error('Load failed'), {
      context: 'useOpenLiveInvite.initialFetch',
      tags: { source: 'useOpenLiveInvite.initialFetch' },
    });

    expect(reported).toBe(false);
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockBreadcrumb).toHaveBeenCalledWith({
      category: 'db-error-suppressed',
      level: 'info',
      data: { context: 'useOpenLiveInvite.initialFetch', reason: 'network-blip' },
    });
  });

  it('suppresses an empty-message throw (mobile Safari killed-fetch signature)', () => {
    expect(reportUnlessBlip(new Error(''), { context: 'letter-reading.claim' })).toBe(false);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('reports a real error and passes its tags through unchanged', () => {
    const err = new Error('recordTermsAcceptance exploded');
    const reported = reportUnlessBlip(err, {
      context: 'terms-acceptance-gate',
      tags: { area: 'terms-acceptance-gate' },
    });

    expect(reported).toBe(true);
    expect(mockBreadcrumb).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith(err, { tags: { area: 'terms-acceptance-gate' } });
  });

  it('reports an untagged error with no options object, matching the bare call it replaces', () => {
    const err = new Error('claimLetterDelivery threw');
    expect(reportUnlessBlip(err, { context: 'letter-reading.claim' })).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(err, undefined);
  });

  it('reports a Postgrest error whose message merely contains blip text', () => {
    // network-blip.ts gates on the code first: a real Postgres error always
    // carries one, so 22P02 with 'Load failed' in the message must still report.
    const err = { code: '22P02', message: 'invalid input syntax for type uuid: "Load failed"' };
    expect(reportUnlessBlip(err, { context: 'letter-reading.read' })).toBe(true);
    expect(mockCapture).toHaveBeenCalled();
  });
});

describe('P1177 (code review): the gate cannot itself throw, and captureMessage is gated too', () => {
  it('reports a primitive rejection instead of throwing on it', () => {
    // isNetworkBlip tests `'code' in error`, which throws on a primitive. A
    // rejection is `unknown`, so a string reject would have turned the catch
    // handler into a new TypeError and skipped the call site's own recovery —
    // for the initial invite fetch that means the LOADED(null) dispatch never
    // runs and the hook stays loading forever.
    expect(() => reportUnlessBlip('Load failed', { context: 'primitive' })).not.toThrow();
    expect(mockCapture).toHaveBeenCalledWith('Load failed', undefined);
  });

  it('reports a number and a null rejection without throwing', () => {
    expect(() => reportUnlessBlip(42, { context: 'primitive' })).not.toThrow();
    expect(() => reportUnlessBlip(null, { context: 'primitive' })).not.toThrow();
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });

  it('gates the enrichment captureMessage too, not just captureException', () => {
    // supabase query builders RESOLVE a network failure as { data: null, error }
    // rather than rejecting, so a dropped connection reaches useOpenLiveInvite's
    // captureMessage warning rather than its .catch. That path must be gated by
    // the same predicate; assert the wiring is present, since the surrounding
    // realtime subscription is not renderable here.
    const source = readFileSync(resolve(__dirname, '../app/hooks/useOpenLiveInvite.ts'), 'utf8');
    const guarded = source.slice(0, source.indexOf('Sentry.captureMessage'));
    expect(guarded).toContain('isNetworkBlip(error)');
    expect(source).toContain("from '@/lib/network-blip'");
  });
});

describe('P1177: every named call site routes through the gate', () => {
  it.each(CALL_SITE_FILES)('$path has no bare Sentry.captureException', ({ path, sites }) => {
    const source = readFileSync(resolve(__dirname, path), 'utf8');

    // Anchor on the thing that must be gone, not on the helper that must be
    // present — a grep for the helper passes vacuously if the file was skipped.
    const bare = source.match(/Sentry\.captureException/g) ?? [];
    expect(bare).toHaveLength(0);

    // ...and confirm the sites were replaced rather than deleted.
    const gated = source.match(/reportUnlessBlip\(/g) ?? [];
    expect(gated).toHaveLength(sites);
    expect(source).toContain("from '@/lib/report-unless-blip'");
  });
});
