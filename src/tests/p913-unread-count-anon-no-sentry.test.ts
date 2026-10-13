/**
 * @file p913-unread-count-anon-no-sentry.test.ts
 * @description Canary tests for P913: logDbError must NOT report the expected
 * expired-token-as-anon transient to Sentry.
 *
 * Bug: getUnreadLetterCount runs as the `anon` Postgres role when a logged-in
 * user's token has silently expired (stale SPA `user`). The RLS policies on
 * clarity_letters / letter_deliveries invoke the SECURITY DEFINER helpers
 * _is_letter_receiver / _is_letter_sender, which p651 revoked from `anon`
 * (granted to `authenticated` only). anon hitting them returns
 * 42501 "permission denied for function ...". logDbError ships this to Sentry
 * (JAVASCRIPT-REACT-1Y / 1Z / 1V) even though the function already returns 0 and
 * no user is impacted.
 *
 * P913 first dropped 42501 on the _is_letter_* helpers inside logDbError by
 * function name. P1475 removed that predicate: it could not tell the anon
 * artifact from a signed-in user who lost EXECUTE (decisions.md 2026-10-01,
 * P1382). The anon case is now suppressed at the caller, only when the client
 * has no session — see p1475-unread-count-anon-no-sentry.test.ts. logDbError
 * itself reports every 42501.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/react';

describe('P913 → P1475: logDbError does not suppress letter-helper 42501 by name', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    'permission denied for function _is_letter_receiver',
    'permission denied for function _is_letter_sender',
  ])('reports 42501 "%s" — the anon case is gated at the caller (P1475)', async (message) => {
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('getUnreadLetterCount.received', {
      message,
      code: '42501',
      details: '',
      hint: '',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('STILL reports a generic 42501 (permission denied for a TABLE — real RLS bug)', async () => {
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('someQuery', {
      message: 'permission denied for table letter_deliveries',
      code: '42501',
      details: '',
      hint: '',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('STILL reports a real schema error (42P01) — filter does not over-match', async () => {
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('fetchProfile', {
      message: 'relation "x" does not exist',
      code: '42P01',
      details: '',
      hint: '',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
