/**
 * P1441: an RSVP is never inserted as anyone but the person the app shows as signed in.
 *
 * Prod (Sentry JAVASCRIPT-REACT-3Q): after a new signup confirmed by email, the supabase client
 * lost its session while the app still showed the person signed in, so every RSVP insert went
 * out anonymous and failed RLS (401 / 42501) — reported to the person as "event may be full".
 *
 * Expected:
 * - client session matches the user → insert runs as before;
 * - client session missing, app still holds that user's session → one re-sync, then insert;
 * - re-sync impossible → NO insert, a SessionMismatchError the caller turns into "sign in again";
 * - both rsvpToEvent implementations (events-service-real and api.ts, used by the post-signup
 *   auto-RSVP) behave the same, and api.ts reports a real insert failure to Sentry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER = 'user-id-1441';
const OTHER = 'other-user-id';

const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
const mockInsert = vi.fn();
/** Read of the RSVP row (isUserRsvpd / the cancel's after-check). Default: an error, as before. */
const mockRsvpRead = vi.fn();
/** Resolves the cancel's DELETE … RETURNING; a call means a delete was actually sent. */
const mockDeleteResult = vi.fn();

/** A chainable query builder: every filter returns itself, terminals resolve `result`. */
function chain(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'neq', 'order', 'limit', 'not', 'gte', 'lte']) b[m] = () => b;
  b.single = () => Promise.resolve(result);
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      setSession: (s: unknown) => mockSetSession(s),
      getUser: vi.fn(),
    },
    from: (table: string) => {
      if (table === 'event_rsvps') {
        return {
          ...chain(undefined),
          select: () => {
            const b = chain(undefined);
            const res = () => mockRsvpRead() ?? { data: null, error: { code: 'PGRST116' }, count: 0 };
            b.single = () => Promise.resolve(res());
            b.maybeSingle = () => Promise.resolve(res());
            b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, bad);
            for (const m of ['eq', 'in', 'order', 'limit']) b[m] = () => b;
            return b;
          },
          insert: (row: unknown) => mockInsert(row),
          delete: () => {
            const d: Record<string, unknown> = {};
            d.eq = () => d;
            d.select = () => Promise.resolve(mockDeleteResult());
            d.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve(mockDeleteResult()).then(res, rej);
            return d;
          },
        };
      }
      return chain({ data: { id: 'evt-1', max_attendees: null, status: 'upcoming' }, error: null, count: 0 });
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

const logDbError = vi.fn();
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: (context: string, error: unknown) => logDbError(context, error),
  throwDbError: vi.fn(),
}));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: vi.fn() }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null),
  fetchUnsplashBanner: vi.fn().mockResolvedValue(null),
}));

const sessionOf = (id: string, expiresInS = 3600) => ({
  user: { id },
  access_token: `access-${id}`,
  refresh_token: `refresh-${id}`,
  expires_at: Math.floor(Date.now() / 1000) + expiresInS,
});

async function load() {
  const guard = await import('@/lib/session-guard');
  const { realEventsService } = await import('@/app/data/events-service-real');
  const api = await import('@/app/data/api');
  return { guard, realEventsService, api };
}

describe('P1441: session guard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps mockReturnValue; reset the per-test data mocks so nothing leaks.
    mockRsvpRead.mockReset();
    mockDeleteResult.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockSetSession.mockResolvedValue({ data: {}, error: null });
    const { guard } = await load();
    guard.noteAppSession(null);
  });

  it('passes straight through when the client already holds the user', async () => {
    const { guard } = await load();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('ok');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('re-syncs once from the app session when the client lost it', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: sessionOf(USER) } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('ok');
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: `access-${USER}`, refresh_token: `refresh-${USER}` });
  });

  it('reports mismatch when there is nothing to re-sync from', async () => {
    const { guard } = await load();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('reports mismatch when the client holds a DIFFERENT user and the app session is someone else', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(OTHER) as never);
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(OTHER) } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
  });

  it('never replays an expired app copy (its refresh token may already be rotated)', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER, 30) as never);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('never re-syncs over a client holding a different user', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(OTHER) } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('does not re-sync over a sign-in that lands between its two reads (Codex review)', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: sessionOf(OTHER) } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('never restores an account signed out while the re-sync was waiting (Codex review)', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockImplementationOnce(async () => {
        guard.noteAppSession(null); // the person signs out mid-check
        return { data: { session: null } };
      })
      .mockResolvedValue({ data: { session: null } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('a refresh that could not reach the server is "unreachable", not a lost session (/finish review)', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('unreachable');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('reports mismatch when the re-sync is rejected', async () => {
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSetSession.mockResolvedValue({ data: {}, error: { message: 'invalid refresh token' } });
    await expect(guard.ensureClientSessionFor(USER)).resolves.toBe('mismatch');
  });
});

describe.each([
  ['events-service-real', async () => (await load()).realEventsService.rsvpToEvent.bind((await load()).realEventsService)],
  ['api.ts (post-signup auto-RSVP)', async () => (await load()).api.rsvpToEvent],
])('P1441: rsvpToEvent via %s', (_name, getRsvp) => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps mockReturnValue; reset the per-test data mocks so nothing leaks.
    mockRsvpRead.mockReset();
    mockDeleteResult.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockSetSession.mockResolvedValue({ data: {}, error: null });
    (await load()).guard.noteAppSession(null);
  });

  it('never sends an anonymous insert — throws SessionMismatchError instead', async () => {
    const rsvp = await getRsvp();
    const { guard } = await load();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(rsvp('evt-1', USER)).rejects.toBeInstanceOf(guard.SessionMismatchError);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('the session vanishing AFTER the check is still caught: the server 401 becomes SessionMismatchError (Codex review)', async () => {
    const rsvp = await getRsvp();
    const { guard } = await load();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockInsert.mockResolvedValue({ data: null, status: 401, error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(rsvp('evt-1', USER)).rejects.toBeInstanceOf(guard.SessionMismatchError);
    expect(logDbError).not.toHaveBeenCalled();
  });

  it('an unreachable auth server is a network failure (false), never "sign in again", and sends nothing (/finish review)', async () => {
    const rsvp = await getRsvp();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
    await expect(rsvp('evt-1', USER)).resolves.toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts after a successful re-sync', async () => {
    const rsvp = await getRsvp();
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never);
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: sessionOf(USER) } });
    await expect(rsvp('evt-1', USER)).resolves.toBe(true);
    expect(mockInsert).toHaveBeenCalledWith({ event_id: 'evt-1', profile_id: USER });
  });

  it('inserts unchanged when the client session matches', async () => {
    const rsvp = await getRsvp();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    await expect(rsvp('evt-1', USER)).resolves.toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('reports a real insert failure to Sentry (logDbError), not only the console', async () => {
    const rsvp = await getRsvp();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockInsert.mockResolvedValue({ data: null, status: 403, error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(rsvp('evt-1', USER)).resolves.toBe(false);
    expect(logDbError).toHaveBeenCalledWith('rsvpToEvent', expect.objectContaining({ code: '42501' }));
  });
});

/**
 * P1441 (founder decision): cancelling must never report "cancelled" unless the row is gone.
 * An anonymous DELETE is not an error — RLS filters it to zero rows — so the old code returned
 * true and the page showed the seat released while it stayed booked.
 */
describe.each([
  ['events-service-real', async () => (await load()).realEventsService.cancelRsvp.bind((await load()).realEventsService)],
  ['api.ts', async () => (await load()).api.cancelRsvp],
])('P1441: cancelRsvp via %s', (_name, getCancel) => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps mockReturnValue; reset the per-test data mocks so nothing leaks.
    mockRsvpRead.mockReset();
    mockDeleteResult.mockReset();
    mockSetSession.mockResolvedValue({ data: {}, error: null });
    (await load()).guard.noteAppSession(null);
  });

  it('an unreachable auth server fails the cancel (false) without a delete or "sign in again" (/finish review)', async () => {
    const cancel = await getCancel();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
    await expect(cancel('evt-1', USER)).resolves.toBe(false);
    expect(mockDeleteResult).not.toHaveBeenCalled();
  });

  it('a zero-row cancel whose re-check cannot reach the auth server is a plain failure, not "sign in again"', async () => {
    const cancel = await getCancel();
    mockGetSession
      .mockResolvedValueOnce({ data: { session: sessionOf(USER) } })
      .mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
    mockDeleteResult.mockReturnValue({ data: [], error: null, status: 200 });
    await expect(cancel('evt-1', USER)).resolves.toBe(false);
  });

  it('a lost session sends no delete and throws SessionMismatchError', async () => {
    const cancel = await getCancel();
    const { guard } = await load();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(cancel('evt-1', USER)).rejects.toBeInstanceOf(guard.SessionMismatchError);
    expect(mockDeleteResult).not.toHaveBeenCalled();
  });

  it('a delete that removed no row while the booking STILL exists is NOT a successful cancel', async () => {
    const cancel = await getCancel();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockDeleteResult.mockReturnValue({ data: [], error: null, status: 200 });
    mockRsvpRead.mockReturnValue({ data: { id: 'rsvp-1' }, error: null });
    await expect(cancel('evt-1', USER)).resolves.toBe(false);
  });

  it('a zero-row cancel whose row could not be re-read is NOT reported as cancelled', async () => {
    const cancel = await getCancel();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockDeleteResult.mockReturnValue({ data: [], error: null, status: 200 });
    mockRsvpRead.mockReturnValue({ data: null, error: { code: '500', message: 'read failed' } });
    await expect(cancel('evt-1', USER)).resolves.toBe(false);
  });

  it('a zero-row cancel whose row is already gone (double tap, other tab) IS cancelled (Opus review)', async () => {
    const cancel = await getCancel();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockDeleteResult.mockReturnValue({ data: [], error: null, status: 200 });
    mockRsvpRead.mockReturnValue({ data: null, error: null });
    await expect(cancel('evt-1', USER)).resolves.toBe(true);
  });

  it('a zero-row cancel with the session gone asks for sign-in — it never re-syncs and silently gives up (Codex review)', async () => {
    const cancel = await getCancel();
    const { guard } = await load();
    guard.noteAppSession(sessionOf(USER) as never); // a valid app copy a re-sync COULD use
    mockGetSession
      .mockResolvedValueOnce({ data: { session: sessionOf(USER) } }) // pre-check passes
      .mockResolvedValue({ data: { session: null } }); // gone by the time the delete returned
    mockDeleteResult.mockReturnValue({ data: [], error: null, status: 200 });
    await expect(cancel('evt-1', USER)).rejects.toBeInstanceOf(guard.SessionMismatchError);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('a 401 + 42501 on the delete (anonymous) asks for sign-in and is not logged as a DB error (Gemini review)', async () => {
    const cancel = await getCancel();
    const { guard } = await load();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockDeleteResult.mockReturnValue({ data: null, status: 401, error: { code: '42501', message: 'permission denied' } });
    await expect(cancel('evt-1', USER)).rejects.toBeInstanceOf(guard.SessionMismatchError);
    expect(logDbError).not.toHaveBeenCalled();
  });

  it('a delete that removed the row is a successful cancel', async () => {
    const cancel = await getCancel();
    mockGetSession.mockResolvedValue({ data: { session: sessionOf(USER) } });
    mockDeleteResult.mockReturnValue({ data: [{ id: 'rsvp-1' }], error: null, status: 200 });
    await expect(cancel('evt-1', USER)).resolves.toBe(true);
  });

  it('zero rows because the session vanished mid-request asks for sign-in, not a generic failure', async () => {
    const cancel = await getCancel();
    const { guard } = await load();
    mockGetSession
      .mockResolvedValueOnce({ data: { session: sessionOf(USER) } })
      .mockResolvedValue({ data: { session: null } });
    mockDeleteResult.mockReturnValue({ data: [], error: null, status: 200 });
    await expect(cancel('evt-1', USER)).rejects.toBeInstanceOf(guard.SessionMismatchError);
  });
});

describe('P1441: sign-in-again destination', () => {
  it('an RSVP keeps its intent so the callback completes it', async () => {
    const { guard } = await load();
    expect(guard.signInAgainPath('hike-1')).toBe('/login?redirect=%2Fevents%2Fhike-1&action=rsvp');
  });

  it('a cancel carries NO action — replaying it through the callback would re-book the seat', async () => {
    const { guard } = await load();
    expect(guard.signInAgainPath('hike-1', 'cancel')).toBe('/login?redirect=%2Fevents%2Fhike-1');
    expect(guard.signInAgainMessage('cancel')).toBe('Please sign in again to cancel your seat.');
  });
});
