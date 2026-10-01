/**
 * @file p1382-pending-invitations-anon-no-sentry.test.ts
 * @description Canary for P1382 (INBOX-P44, JAVASCRIPT-REACT-3K): the P913
 * expired-session-as-anon artifact on get_my_pending_invitations must not hit Sentry.
 *
 * get_my_pending_invitations is revoked from anon on purpose (P1222). When the
 * Supabase client loses its session on tab resume but React still holds a `user`,
 * the Partners badge refetch runs as anon and gets 42501. The caller already
 * degrades to an empty list, so this is noise; a 42501 on any other function or
 * a table must still report.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/react';

function err(message: string) {
  return { message, code: '42501', details: '', hint: '' };
}

describe('P1382: logDbError — anon 42501 on get_my_pending_invitations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('skips Sentry for the badge refetch running as anon', async () => {
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('getIncomingInvitations', err('permission denied for function get_my_pending_invitations'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    'permission denied for table clarity_agreements',
    'permission denied for function some_other_fn',
  ])('STILL reports 42501 "%s"', async (message) => {
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('getIncomingInvitations', err(message));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
