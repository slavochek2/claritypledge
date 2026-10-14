/**
 * P1493 — client half: a guest presents its seat credential on reads of its own session.
 *
 * The database (20261014180000_p1493_session_reads_need_a_participant.sql) returns the full row
 * only to a participant; an account-less guest is one only while presenting the credential its
 * seat claim returned. The mock below plays that database: it answers the full row when the
 * request carries this seat's credential and the pre-join fields otherwise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  getClaritySession,
  getActiveSessionByCode,
  joinClaritySession,
  updateDemoFlowState,
  updateClaritySessionState,
  clearSessionJoiner,
  _resetSessionIdByCodeForTesting,
} from '@/app/data/api';

const HEADER = 'x-clarity-seat-secret';
const SESSION_ID = 'sess-p1493';
const SECRET = '11111111-2222-4333-8444-555555555555';

const FULL = {
  id: SESSION_ID, creator_name: 'Host', creator_note: 'note', joiner_name: 'Guest',
  creator_profile_id: 'prof-host', joiner_profile_id: null, state: { currentLevel: 2 },
  demo_status: 'in_progress', partnership_status: 'pending', created_at: '2026-01-01T00:00:00Z',
  expires_at: null, ended_at: null, mode: 'live', live_state: { ratingPhase: 'waiting' },
  is_private: false,
};
const VISITOR = {
  ...Object.fromEntries(Object.keys(FULL).map((k) => [k, null])),
  id: SESSION_ID, creator_name: 'Host', is_private: false,
};

type Builder = {
  headers: Record<string, string>;
  setHeader: ReturnType<typeof vi.fn>;
  then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
};
const issued: Builder[] = [];

/** A thenable PostgREST builder whose answer depends on the headers set on it — like the DB. */
function lookupBuilder(): Builder {
  const b: Builder = {
    headers: {},
    setHeader: vi.fn((k: string, v: string) => { b.headers[k] = v; return b; }),
    then: (res, rej) =>
      Promise.resolve({ data: [b.headers[HEADER] === SECRET ? FULL : VISITOR], error: null }).then(res, rej),
  };
  issued.push(b);
  return b;
}

beforeEach(() => {
  vi.clearAllMocks();
  issued.length = 0;
  window.localStorage.clear();
  _resetSessionIdByCodeForTesting();
  vi.mocked(supabase.rpc).mockImplementation(((fn: string) =>
    fn === 'get_session_by_code' || fn === 'get_active_session_by_code' ? lookupBuilder() : Promise.reject(new Error(`unexpected rpc ${fn}`))
  ) as never);
});

describe('P1493: guest reads present the seat credential', () => {
  it('a reloaded guest (code + stored credential, room id not yet known) ends up with the full row', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);

    const session = await getClaritySession('abc123');

    expect(issued).toHaveLength(2);
    expect(issued[0]!.setHeader).not.toHaveBeenCalled();
    expect(issued[1]!.headers[HEADER]).toBe(SECRET);
    expect(session?.joinerName).toBe('Guest');
    expect(session?.liveState).toEqual({ ratingPhase: 'waiting' });
  });

  it('once the room id is known, the poll presents the credential on its first request', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);
    await getClaritySession('ABC123');
    issued.length = 0;

    const session = await getClaritySession('ABC123');

    expect(issued).toHaveLength(1);
    expect(issued[0]!.headers[HEADER]).toBe(SECRET);
    expect(session?.liveState).toEqual({ ratingPhase: 'waiting' });
  });

  it('a tab holding no credential sends none and gets the pre-join fields only', async () => {
    const session = await getClaritySession('ABC123');

    expect(issued).toHaveLength(1);
    expect(issued[0]!.setHeader).not.toHaveBeenCalled();
    expect(session?.id).toBe(SESSION_ID);
    expect(session?.creatorName).toBe('Host');
    expect(session?.liveState).toBeNull();
  });

  it('the grace-window lookup (rejoin prompt, session bar) behaves the same', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);

    const session = await getActiveSessionByCode('ABC123');

    expect(vi.mocked(supabase.rpc).mock.calls.every(([fn]) => fn === 'get_active_session_by_code')).toBe(true);
    expect(issued.at(-1)!.headers[HEADER]).toBe(SECRET);
    expect(session?.joinerName).toBe('Guest');
  });

  it('an empty answer (unknown or ended room, non-participant) stays null with no retry', async () => {
    vi.mocked(supabase.rpc).mockImplementation((() => {
      const b = lookupBuilder();
      b.then = (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej);
      return b;
    }) as never);

    expect(await getClaritySession('ABC123')).toBeNull();
    expect(issued).toHaveLength(1);
  });

  it('the join pre-flight resolves the room id through the same lookup', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);
    const claim = vi.fn().mockResolvedValue({ data: [{ ...FULL, joiner_seat_secret: SECRET }], error: null });
    vi.mocked(supabase.rpc).mockImplementation(((fn: string, args: unknown) =>
      fn === 'claim_joiner_seat' ? claim(fn, args) : lookupBuilder()
    ) as never);

    const joined = await joinClaritySession('ABC123', 'Guest');

    expect(claim).toHaveBeenCalledWith('claim_joiner_seat', { p_code: 'ABC123', p_joiner_name: 'Guest', p_seat_secret: SECRET });
    expect(joined?.id).toBe(SESSION_ID);
  });

  it('the demo state read presents the credential for its session', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);
    const readBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    readBuilder.select = vi.fn(() => readBuilder);
    readBuilder.eq = vi.fn(() => readBuilder);
    readBuilder.setHeader = vi.fn(() => readBuilder);
    readBuilder.single = vi.fn().mockResolvedValue({ data: { state: {} }, error: null });
    const writeBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    writeBuilder.update = vi.fn(() => writeBuilder);
    writeBuilder.eq = vi.fn(() => writeBuilder);
    writeBuilder.setHeader = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase.from).mockReturnValueOnce(readBuilder as never).mockReturnValueOnce(writeBuilder as never);

    await updateDemoFlowState(SESSION_ID, { currentLevel: 3 } as never);

    expect(readBuilder.setHeader).toHaveBeenCalledWith(HEADER, SECRET);
    expect(writeBuilder.setHeader).toHaveBeenCalledWith(HEADER, SECRET);
  });

  it('a guest\'s direct write presents the credential (the row read policy applies to UPDATE … WHERE)', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);
    const writeBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    writeBuilder.update = vi.fn(() => writeBuilder);
    writeBuilder.eq = vi.fn(() => writeBuilder);
    writeBuilder.setHeader = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase.from).mockReturnValueOnce(writeBuilder as never);

    await updateClaritySessionState(SESSION_ID, { step: 1 });

    expect(writeBuilder.setHeader).toHaveBeenCalledWith(HEADER, SECRET);
  });

  it('a new tab after the session ended still reaches it as the seated guest (room id remembered at join)', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);
    const claim = vi.fn().mockResolvedValue({ data: [{ ...FULL, joiner_seat_secret: SECRET }], error: null });
    vi.mocked(supabase.rpc).mockImplementation(((fn: string, args: unknown) =>
      fn === 'claim_joiner_seat' ? claim(fn, args) : lookupBuilder()
    ) as never);
    await joinClaritySession('ABC123', 'Guest');

    // New tab: in-memory state gone, storage kept. The room has ended — a caller who does not
    // present the credential gets nothing back, so there is no reply to learn the id from.
    _resetSessionIdByCodeForTesting();
    issued.length = 0;
    vi.mocked(supabase.rpc).mockImplementation((() => {
      const b = lookupBuilder();
      b.then = (res, rej) =>
        Promise.resolve({ data: b.headers[HEADER] === SECRET ? [{ ...FULL, live_state: { sessionEnded: true } }] : [], error: null }).then(res, rej);
      return b;
    }) as never);

    const session = await getClaritySession('ABC123');

    expect(issued).toHaveLength(1);
    expect(issued[0]!.headers[HEADER]).toBe(SECRET);
    expect(session?.liveState).toEqual({ sessionEnded: true });
  });

  it('the remembered room id is stored under a digest, never the raw code, and forgotten when the guest leaves', async () => {
    window.localStorage.setItem(`cp.seatSecret.${SESSION_ID}`, SECRET);
    const claim = vi.fn().mockResolvedValue({ data: [{ ...FULL, joiner_seat_secret: SECRET }], error: null });
    const release = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.rpc).mockImplementation(((fn: string, args: unknown) =>
      fn === 'claim_joiner_seat' ? claim(fn, args) : fn === 'release_joiner_seat' ? release(fn, args) : lookupBuilder()
    ) as never);
    await joinClaritySession('ABC123', 'Guest');

    const keys = () => Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)!);
    const roomKeys = keys().filter((k) => k.startsWith('cp.seatRoom.'));
    expect(roomKeys, 'the room id must be remembered for a reload').toHaveLength(1);
    expect(keys().join(' ')).not.toContain('ABC123');

    await clearSessionJoiner(SESSION_ID, 'ABC123');

    expect(keys().filter((k) => k.startsWith('cp.seatRoom.')), 'leaving must forget the room').toEqual([]);
  });
});
