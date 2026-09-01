/**
 * P866 — prod-health redaction + allowlist contract (Security Review HIGH).
 *
 * The prod-health gate captures failing response URLs and console error text and
 * (CI path) posts them into a PUBLIC GitHub issue / the inline /ship report. Tokens
 * live in query strings (`?token=...`) and apikey/Authorization values can leak into
 * console text. `redactUrl()` is the single chokepoint that strips them. This suite
 * locks that contract: no raw token may survive redaction. Never weaken without a
 * security review.
 */
import { describe, it, expect } from 'vitest';
import {
  redactUrl,
  isAllowlisted,
  PROD_HEALTH_ALLOWLIST,
} from '../../e2e/helpers/prod-health';

describe('P866 redactUrl — strips secrets before any public surface', () => {
  it('strips the entire query string from a tokenized Supabase URL', () => {
    const raw =
      'https://besjtuodziykmjidubzw.supabase.co/rest/v1/rpc/get_letter?token=sekret-abc123&apikey=eyJ0'; // gitleaks:allow — synthetic redaction fixture
    const out = redactUrl(raw);
    expect(out).not.toContain('sekret-abc123');
    expect(out).not.toContain('eyJ0');
    expect(out).toContain('?[REDACTED]');
    // The non-secret path is preserved for triage value.
    expect(out).toContain('/rest/v1/rpc/get_letter');
  });

  it('preserves a URL that has no query string', () => {
    const raw = 'https://claritypledge.com/feed';
    expect(redactUrl(raw)).toBe('https://claritypledge.com/feed');
  });

  it('strips a token from a URL embedded in console error text, preserving the prose', () => {
    const raw =
      'Failed to load resource: the server responded with a status of 406 () ' +
      'https://besjtuodziykmjidubzw.supabase.co/rest/v1/rpc/foo?token=leak-me';
    const out = redactUrl(raw);
    expect(out).not.toContain('leak-me');
    expect(out).toContain('Failed to load resource');
    expect(out).toContain('?[REDACTED]');
  });

  it('does NOT over-redact prose containing a bare "?" with no URL', () => {
    const raw = 'Is the recorder ready? yes';
    expect(redactUrl(raw)).toBe('Is the recorder ready? yes');
  });

  it('strips inline Authorization / apikey header values that leak into text', () => {
    expect(redactUrl('apikey: eyJhbGciOiJ')).toBe('apikey: [REDACTED]');
    expect(redactUrl('Authorization: Bearer eyJhbGciOiJ')).toBe('Authorization: [REDACTED]');
  });

  it('strips a bare key=value secret in prose (not inside a URL query string)', () => {
    const out = redactUrl('Auth failed token=sekret-abc123 in handler'); // gitleaks:allow — synthetic redaction fixture
    expect(out).not.toContain('sekret-abc123');
    expect(out).toContain('token=[REDACTED]');
    // surrounding prose is preserved
    expect(out).toContain('Auth failed');
    expect(out).toContain('in handler');
  });

  it('caps output length so a pathological entry cannot bloat the issue body', () => {
    const longPath = 'https://claritypledge.com/' + 'a'.repeat(500);
    const out = redactUrl(longPath);
    expect(out.length).toBeLessThanOrEqual(201); // 200 + the ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('P866 isAllowlisted — narrow substring match', () => {
  // P1216: these assertions use an explicit synthetic allowlist rather than the
  // production one. They previously matched against PROD_HEALTH_ALLOWLIST.consolePatterns
  // using its LogRocket entry as the fixture, which coupled a test of the MECHANISM to
  // the CONTENTS of a curated list -- so removing a vendor (a legitimate content change)
  // broke a test that was never about that vendor. The production list's own invariant
  // is asserted separately below, and holds however many entries it has.
  const SYNTHETIC = ['known-benign-marker'];

  it('returns true when the text contains a listed pattern', () => {
    expect(isAllowlisted('prefix known-benign-marker suffix', SYNTHETIC)).toBe(true);
    expect(
      isAllowlisted('https://x.supabase.co/rest/v1/rpc/foo', PROD_HEALTH_ALLOWLIST.urlPatterns),
    ).toBe(true);
  });

  it('returns false for a novel error not in the allowlist (fails by default)', () => {
    expect(isAllowlisted('Uncaught TypeError: cannot read foo', SYNTHETIC)).toBe(false);
    expect(
      isAllowlisted('https://claritypledge.com/api/unknown-500', PROD_HEALTH_ALLOWLIST.urlPatterns),
    ).toBe(false);
  });

  it('an empty allowlist allows nothing (P866 fail-by-default holds at the boundary)', () => {
    // consolePatterns is empty after P1216. An empty curated list must mean "nothing is
    // known-benign", never "everything passes" -- the inversion P866 was built to avoid.
    expect(isAllowlisted('anything at all', [])).toBe(false);
    expect(
      isAllowlisted('Uncaught TypeError: cannot read foo', PROD_HEALTH_ALLOWLIST.consolePatterns),
    ).toBe(false);
  });
});
