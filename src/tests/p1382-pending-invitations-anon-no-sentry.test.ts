/**
 * @file p1382-pending-invitations-anon-no-sentry.test.ts
 * @description Canary for P1382 (INBOX-P44, JAVASCRIPT-REACT-3K).
 *
 * get_my_pending_invitations is revoked from anon on purpose (P1222). When the
 * Supabase client has lost its session but React still holds a `user`, the
 * Partners badge refetch runs as anon and gets 42501. That must not be logged.
 * A 42501 while a session IS present means signed-in users lost EXECUTE — a real
 * regression that must still reach logDbError (and Sentry).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();
const logDbError = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), auth: { getSession: () => getSession() } },
}));
vi.mock('@/lib/agreement-emails', () => ({ invokeAgreementEmails: vi.fn() }));
vi.mock('../app/data/db-error-logger', () => ({
  logDbError: (...a: unknown[]) => logDbError(...a),
  throwDbError: vi.fn(),
}));

const denied = { code: '42501', message: 'permission denied for function get_my_pending_invitations', details: null, hint: null };

async function call() {
  const { realAgreementsService } = await import('../app/data/agreements-service-real');
  return realAgreementsService.getIncomingInvitations('owner@example.com', null);
}

describe('P1382: getIncomingInvitations — anon 42501 after session loss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not log the 42501 when the client has no session', async () => {
    rpc.mockResolvedValue({ data: null, error: denied });
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await call()).toEqual([]);
    expect(logDbError).not.toHaveBeenCalled();
  });

  it('STILL logs the 42501 when a session is present (grant regression)', async () => {
    rpc.mockResolvedValue({ data: null, error: denied });
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    expect(await call()).toEqual([]);
    expect(logDbError).toHaveBeenCalledWith('getIncomingInvitations', denied);
  });

  it('STILL logs a non-42501 error without a session', async () => {
    const other = { ...denied, code: 'XX000', message: 'internal error' };
    rpc.mockResolvedValue({ data: null, error: other });
    getSession.mockResolvedValue({ data: { session: null } });
    await call();
    expect(logDbError).toHaveBeenCalledWith('getIncomingInvitations', other);
  });
});
