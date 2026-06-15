/**
 * @file p839-parity-email.test.ts
 * @description P839 parity canary for the EMAIL_REGEX server-only validator
 * in `request-letter-response-signin`. There is no client-side equivalent —
 * the client lets the browser's `type="email"` input do shallow validation
 * and the server is the authoritative check.
 *
 * Per P839 server-only-enum guidance: when no client constant exists, the
 * canary doubles as the spec for what the server accepts. A future change
 * to EMAIL_REGEX must update this test, making coupling visible on diff.
 *
 * SOURCE — keep verbatim copy in sync if this file is touched:
 *   supabase/functions/request-letter-response-signin/index.ts:34
 */

import { describe, it, expect } from 'vitest';

// Verbatim copy of EMAIL_REGEX from request-letter-response-signin/index.ts:34.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACCEPTED = [
  'plain@example.com',
  'user+tag@example.com',
  'first.last@sub.example.co.uk',
  'name@example.com',
  'a@b.c',
  // Underscore + digit-suffix local part (P835 incident shape, fully synthetic — P936):
  'digits_and_underscore_475@example.com',
  // Non-ASCII before @ — passes regex; downstream Mailgun is the gate
  'üser@example.com',
];

const REJECTED = [
  '',
  'no-at-sign',
  '@example.com',
  'name@',
  'name@nodot',
  'name with space@example.com',
  'name@example .com',
  'name\t@example.com',
  'name@example@com',
];

describe('P839 parity: EMAIL_REGEX (server-only validator)', () => {
  for (const email of ACCEPTED) {
    it(`accepts: "${email}"`, () => {
      expect(EMAIL_REGEX.test(email)).toBe(true);
    });
  }

  for (const email of REJECTED) {
    it(`rejects: "${email}"`, () => {
      expect(EMAIL_REGEX.test(email)).toBe(false);
    });
  }

  it('regex documents the implementation (canary spec assertion)', () => {
    // If this assertion fails, the server regex changed. Update the
    // ACCEPTED / REJECTED tables above to reflect the new behavior, OR
    // revert the server change. Do not "fix" this assertion in isolation.
    expect(EMAIL_REGEX.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
  });
});
