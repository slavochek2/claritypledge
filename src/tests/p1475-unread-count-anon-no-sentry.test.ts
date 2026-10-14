/**
 * @file p1475-unread-count-anon-no-sentry.test.ts
 * @description Canary for P1475 (follow-up to P913 / P1382).
 *
 * The letter RLS policies call _is_letter_receiver / _is_letter_sender, which are
 * revoked from anon (p651). When the Supabase client has lost its session but
 * React still holds a `user`, the unread-badge poll runs as anon and gets 42501.
 * P913 dropped that inside logDbError by function name, which also hid a
 * signed-in user losing EXECUTE. Per decisions.md 2026-10-01 (P1382) the anon
 * case is suppressed at the caller, only when there is no session, and leaves a
 * `db-error-suppressed` breadcrumb. With a session, the 42501 reaches Sentry.
 *
 * Uses the REAL db-error-logger in production mode with Sentry mocked, so the
 * assertions are on what Sentry actually receives.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const from = vi.fn();
const getSession = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => from(...a),
    auth: { getSession: () => getSession() },
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/react';

const USER_ID = 'user-id-1234';
const denied = {
  code: '42501',
  message: 'permission denied for function _is_letter_receiver',
  details: null,
  hint: null,
};

// The five reads getUnreadLetterCount makes, in call order, with the success
// value each returns. A sealed letter and one delivery make every branch run.
const SITES = [
  { context: 'getUnreadLetterCount.ownLetters', ok: { data: [{ id: 'letter-id-1', status: 'sealed' }] } },
  { context: 'getUnreadLetterCount.received', ok: { count: 1 } },
  { context: 'getUnreadLetterCount.responses', ok: { count: 1 } },
  { context: 'getUnreadLetterCount.explainBackDeliveries', ok: { data: [{ id: 'delivery-id-1' }] } },
  { context: 'getUnreadLetterCount.explainBacks', ok: { count: 1 } },
] as const;

function builder(result: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'not']) b[m] = vi.fn(() => b);
  b.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return b;
}

/** Fail the reads whose index is in `failing` with `error`; the rest succeed. */
function stubReads(failing: number[], error: Record<string, unknown> = denied) {
  let call = 0;
  from.mockImplementation(() => {
    const i = call++;
    return builder(failing.includes(i) ? { data: null, count: null, error } : { ...SITES[i]?.ok, error: null });
  });
}

const noSession = () => getSession.mockResolvedValue({ data: { session: null } });
const withSession = () => getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });

async function call() {
  const { getUnreadLetterCount } = await import('../app/data/letters-service');
  return getUnreadLetterCount(USER_ID);
}

describe('P1475: getUnreadLetterCount — 42501 on the letter helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('control: success path counts every branch and never reads the session', async () => {
    stubReads([]);
    expect(await call()).toBe(3);
    expect(getSession).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('no session, every read denied (the real anon shape): returns 0, no Sentry, one no-session breadcrumb', async () => {
    stubReads([0, 1, 2, 3, 4]);
    noSession();
    expect(await call()).toBe(0);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'db-error-suppressed',
        data: { context: 'getUnreadLetterCount.ownLetters', reason: 'no-session' },
      })
    );
  });

  it.each(SITES.map((s, i) => [s.context, i] as const))(
    'no session, 42501 at %s: returns 0, no Sentry, breadcrumb names that site',
    async (context, i) => {
      stubReads([i]);
      noSession();
      expect(await call()).toBe(0);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'db-error-suppressed',
          data: { context, reason: 'no-session' },
        })
      );
    }
  );

  it.each(SITES.map((s, i) => [s.context, i] as const))(
    'session present, 42501 at %s: reaches Sentry (grant regression)',
    async (context, i) => {
      stubReads([i]);
      withSession();
      await call();
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(vi.mocked(Sentry.captureException).mock.calls[0]?.[0]).toEqual(
        new Error(`DB error in ${context}: ${denied.message}`)
      );
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    }
  );

  it('session present, several 42501s: reads the session once and reports each', async () => {
    stubReads([1, 2, 3]);
    withSession();
    await call();
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(3);
  });

  // auth-js returns { session: null, error } on a refresh failure while keeping the
  // stored session, so null-with-error is "unknown", not "anon": report the 42501.
  it('session lookup returns an auth error: reports the original 42501 and still returns the count', async () => {
    stubReads([1]);
    getSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh failed' } });
    expect(await call()).toBe(2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Sentry.captureException).mock.calls[0]?.[0]).toEqual(
      new Error(`DB error in getUnreadLetterCount.received: ${denied.message}`)
    );
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('session lookup rejects: reports the original 42501 and resolves with the count', async () => {
    stubReads([1, 2]);
    getSession.mockRejectedValue(new Error('auth storage unavailable'));
    await expect(call()).resolves.toBe(1);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('a non-42501 error without a session still reports and never reads the session', async () => {
    stubReads([1], { ...denied, code: 'XX000', message: 'internal error' });
    noSession();
    await call();
    expect(getSession).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
