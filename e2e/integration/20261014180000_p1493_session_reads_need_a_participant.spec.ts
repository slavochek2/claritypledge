/**
 * P1493 — a session's state is read by its participants; any other holder of the room code sees
 * only what the pre-join screen needs, and nothing once the session has ended.
 *
 * Participant = the creator, the seated signed-in joiner, the named listener, or the seated guest
 * presenting the seat credential its claim returned (P1269), sent as `x-clarity-seat-secret`.
 *
 * Group D are the defect tests: they FAIL before
 * 20261014180000_p1493_session_reads_need_a_participant.sql and PASS after it.
 * Group C are the legitimate flows that must pass both before and after (epistemic gate 7c).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const ROOM_CODE_HEADER = 'x-clarity-room-code';
const SEAT_SECRET_HEADER = 'x-clarity-seat-secret';
const noAuth = { autoRefreshToken: false, persistSession: false } as const;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeRoomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');

/** No account. Optionally presenting a room code and/or a seat credential, as the browser does. */
function client(opts: { code?: string; secret?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.code) headers[ROOM_CODE_HEADER] = opts.code;
  if (opts.secret) headers[SEAT_SECRET_HEADER] = opts.secret;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers }, auth: noAuth });
}

const EXPECTED_SESSION_COLUMNS = [
  'created_at', 'creator_name', 'creator_note', 'creator_profile_id', 'demo_status',
  'ended_at', 'expires_at', 'id', 'is_private', 'joiner_name', 'joiner_profile_id',
  'joiner_seat_claimed_at', 'last_activity_at', 'live_state', 'mode', 'partnership_status',
  'source_letter_id', 'source_story_id', 'state', 'status', 'target_listener_id',
].sort();

/** Everything a visitor must NOT receive. Pre-join keeps only id, creator_name, is_private. */
const WITHHELD = EXPECTED_SESSION_COLUMNS.filter((c) => !['id', 'creator_name', 'is_private'].includes(c));

type Row = Record<string, unknown>;
const one = (data: unknown): Row | undefined => (Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | undefined));

test.describe('P1493: session reads need a participant', () => {
  test.describe.configure({ mode: 'default' });

  let host: TestUser;
  let joiner: TestUser;
  let stranger: TestUser;
  let listener: TestUser;
  const tokens = new Map<string, string>();
  const createdSessionIds: string[] = [];

  /** Open room, guest seated with its credential. */
  let guest: { id: string; code: string; secret: string };
  /** Same, ended by the creator (complete_clarity_session's shape). */
  let ended: { id: string; code: string; secret: string };
  /** Open room, signed-in joiner seated. */
  let signedIn: { id: string; code: string };
  /** Open room, seat free — what a visitor arriving by link finds. */
  let waiting: { id: string; code: string };
  /** Directed room addressed to `listener`. */
  let directed: { id: string; code: string };
  /** Ended by ONE signal each, so every arm of the ended rule is exercised on its own. */
  let joinerLeft: { id: string; code: string };
  let cancelled: { id: string; code: string };
  /** A credential that is not (or no longer) a guest seat's: the seat is a signed-in joiner's. */
  const staleSecret = crypto.randomUUID();

  async function tokenFor(user: TestUser) {
    const cached = tokens.get(user.user.id);
    if (cached) return cached;
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed: ${error?.message}`).toBeNull();
    await supabaseAdmin.auth.signOut();
    tokens.set(user.user.id, data!.session!.access_token);
    return data!.session!.access_token;
  }

  async function seed(row: Row) {
    const code = makeRoomCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'p1493 host',
        creator_note: 'SENTINEL p1493 note',
        creator_profile_id: host.user.id,
        is_private: true,
        status: 'active',
        demo_status: 'in_progress',
        partnership_status: 'pending',
        mode: 'live',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        state: { p1493: 'SENTINEL state' },
        last_activity_at: new Date().toISOString(),
        live_state: { p1493: 'SENTINEL live', sessionHistory: [{ rating: 9 }] },
        ...row,
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1493 fixture: ${error.message}`);
    createdSessionIds.push(data.id);
    return { id: data.id as string, code };
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1493 Host' });
    joiner = await createTestUser({ email: generateTestEmail(), name: 'P1493 Joiner' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1493 Stranger' });
    listener = await createTestUser({ email: generateTestEmail(), name: 'P1493 Listener' });

    const now = new Date().toISOString();
    const gSecret = crypto.randomUUID();
    guest = { ...(await seed({ joiner_name: 'p1493 guest', joiner_seat_claimed_at: now, joiner_seat_secret: gSecret })), secret: gSecret };
    const eSecret = crypto.randomUUID();
    ended = {
      ...(await seed({
        joiner_name: 'p1493 guest', joiner_seat_claimed_at: now, joiner_seat_secret: eSecret,
        ended_at: now, status: 'completed',
        live_state: { p1493: 'SENTINEL live', sessionEnded: true, sessionEndedAt: now },
      })),
      secret: eSecret,
    };
    signedIn = await seed({
      joiner_name: 'p1493 joiner', joiner_profile_id: joiner.user.id, joiner_seat_claimed_at: now,
      joiner_seat_secret: staleSecret,
    });
    waiting = await seed({});
    directed = await seed({ target_listener_id: listener.user.id });
    joinerLeft = await seed({ live_state: { p1493: 'SENTINEL live', joinerEnded: true } });
    cancelled = await seed({ status: 'cancelled' });

    const turn = await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: guest.id, speaker_name: 'p1493 host', listener_name: 'p1493 guest',
      actor_name: 'p1493 host', role: 'speaker', transcript: 'SENTINEL p1493 transcript', self_rating: 7,
    });
    if (turn.error) throw new Error(`p1493 fixture: live turn: ${turn.error.message}`);
  });

  test.afterAll(async () => {
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_live_turns').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    for (const u of [host, joiner, stranger, listener]) if (u) await deleteTestUser(u.user.id);
  });

  // ==========================================================================================
  // GROUP D — defect tests. FAIL before the migration, PASS after.
  // ==========================================================================================

  test('D1: a visitor holding only the code gets the pre-join fields of an open room, nothing else', async () => {
    const { data, error } = await client().rpc('get_session_by_code', { p_code: guest.code });
    expect(error, error?.message).toBeNull();
    const row = one(data);
    expect(row?.id).toBe(guest.id);
    for (const col of WITHHELD) expect(row?.[col], `visitor received ${col}`).toBeNull();
  });

  test('D2: the same through the grace-window lookup', async () => {
    const { data, error } = await client().rpc('get_active_session_by_code', { p_code: guest.code });
    expect(error, error?.message).toBeNull();
    const row = one(data);
    expect(row?.id).toBe(guest.id);
    for (const col of WITHHELD) expect(row?.[col], `visitor received ${col}`).toBeNull();
  });

  test('D3: a signed-in caller who is not a party is a visitor too', async () => {
    const { data } = await client({ token: await tokenFor(stranger) }).rpc('get_session_by_code', { p_code: guest.code });
    const row = one(data);
    expect(row?.id).toBe(guest.id);
    for (const col of WITHHELD) expect(row?.[col], `signed-in stranger received ${col}`).toBeNull();
  });

  test('D4: a credential that is not this seat\'s does not make a participant', async () => {
    const { data } = await client({ secret: crypto.randomUUID() }).rpc('get_session_by_code', { p_code: guest.code });
    const row = one(data);
    expect(row?.live_state, 'a wrong credential read the live state').toBeNull();
  });

  test('D5: an ended room returns the same empty result as an unknown code — anon and signed-in stranger', async () => {
    const unknown = await client().rpc('get_session_by_code', { p_code: 'ZZZZZ9' });
    expect(unknown.data).toEqual([]);
    const anonEnded = await client().rpc('get_session_by_code', { p_code: ended.code });
    expect(anonEnded.error, anonEnded.error?.message).toBeNull();
    expect(anonEnded.data, 'a visitor read an ended room').toEqual([]);
    const strangerEnded = await client({ token: await tokenFor(stranger) }).rpc('get_session_by_code', { p_code: ended.code });
    expect(strangerEnded.data, 'a signed-in stranger read an ended room').toEqual([]);
  });

  test('D5b: each ended signal on its own hides the room from a visitor — guest left, cancelled', async () => {
    for (const room of [joinerLeft, cancelled]) {
      const { data, error } = await client().rpc('get_session_by_code', { p_code: room.code });
      expect(error, error?.message).toBeNull();
      expect(data, `a visitor read ${room === joinerLeft ? 'a room its guest left' : 'a cancelled room'}`).toEqual([]);
    }
  });

  test('D1b: a visitor gets no withheld column of a seated signed-in room or a directed room', async () => {
    for (const room of [signedIn, directed]) {
      // Not vacuous: the fixture really holds values in the columns checked below.
      const { data: truth } = await supabaseAdmin.from('clarity_sessions')
        .select('joiner_profile_id, creator_profile_id, target_listener_id, expires_at, status, mode').eq('id', room.id).single();
      expect(truth?.creator_profile_id && truth?.expires_at && truth?.status && truth?.mode).toBeTruthy();
      const row = one((await client().rpc('get_session_by_code', { p_code: room.code })).data);
      expect(row?.id).toBe(room.id);
      for (const col of WITHHELD) expect(row?.[col], `visitor received ${col} of ${room.code}`).toBeNull();
    }
  });

  test('D4b: a credential presented against a signed-in joiner\'s seat makes no participant', async () => {
    const row = one((await client({ secret: staleSecret }).rpc('get_session_by_code', { p_code: signedIn.code })).data);
    expect(row?.live_state, 'a credential read a signed-in seat\'s room').toBeNull();
    const direct = await client({ code: signedIn.code, secret: staleSecret }).from('clarity_sessions').select('id').eq('id', signedIn.id);
    expect(direct.data ?? []).toEqual([]);
  });

  test('D6: a code alone reads no session row directly', async () => {
    const { data, error } = await client({ code: guest.code }).from('clarity_sessions').select('id, live_state').eq('id', guest.id);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], 'a code holder read the row directly').toEqual([]);
  });

  test('D7: a code alone reads none of the session\'s child rows', async () => {
    const { data, error } = await client({ code: guest.code }).from('clarity_live_turns').select('transcript').eq('session_id', guest.id);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], 'a code holder read the transcript').toEqual([]);
  });

  // ==========================================================================================
  // GROUP C — legitimate flows. PASS before and after.
  // ==========================================================================================

  test('C1: the creator reads the full row of an open and of an ended room', async () => {
    const c = client({ token: await tokenFor(host) });
    for (const room of [guest, ended]) {
      const row = one((await c.rpc('get_session_by_code', { p_code: room.code })).data);
      expect((row?.live_state as Row | undefined)?.p1493, `creator lost live_state on ${room.code}`).toBe('SENTINEL live');
      expect(row?.joiner_name).toBe('p1493 guest');
    }
  });

  test('C2: the seated signed-in joiner reads the full row', async () => {
    const row = one((await client({ token: await tokenFor(joiner) }).rpc('get_session_by_code', { p_code: signedIn.code })).data);
    expect((row?.live_state as Row | undefined)?.p1493).toBe('SENTINEL live');
    expect(row?.creator_note).toBe('SENTINEL p1493 note');
  });

  test('C3: the seated guest presenting its credential reads the full row — open, ended, and grace-window', async () => {
    const g = client({ code: guest.code, secret: guest.secret });
    const open = one((await g.rpc('get_session_by_code', { p_code: guest.code })).data);
    expect((open?.live_state as Row | undefined)?.p1493).toBe('SENTINEL live');
    expect(open?.state).toEqual({ p1493: 'SENTINEL state' });
    const active = one((await g.rpc('get_active_session_by_code', { p_code: guest.code })).data);
    expect((active?.live_state as Row | undefined)?.p1493).toBe('SENTINEL live');
    // The ended screen (P769/P921) reads sessionEnded from the guest's own poll.
    const e = one((await client({ secret: ended.secret }).rpc('get_session_by_code', { p_code: ended.code })).data);
    expect((e?.live_state as Row | undefined)?.sessionEnded, 'the seated guest must still see that the session ended').toBe(true);
  });

  test('C4: the seated guest reads its row and its child rows directly', async () => {
    const g = client({ code: guest.code, secret: guest.secret });
    const rowRes = await g.from('clarity_sessions').select('id, live_state').eq('id', guest.id);
    expect(rowRes.error, rowRes.error?.message).toBeNull();
    expect(rowRes.data ?? []).toHaveLength(1);
    const turns = await g.from('clarity_live_turns').select('transcript').eq('session_id', guest.id);
    expect(turns.data ?? []).toHaveLength(1);
  });

  test('C5: the pre-join screen still gets the host name and privacy flag from a visitor lookup', async () => {
    const row = one((await client().rpc('get_session_by_code', { p_code: waiting.code })).data);
    expect(row?.id).toBe(waiting.id);
    expect(row?.creator_name).toBe('p1493 host');
    expect(row?.is_private).toBe(true);
  });

  test('C6: return shape is unchanged — 21 columns, never `code` — for a visitor and for a participant', async () => {
    for (const c of [client(), client({ token: await tokenFor(host) })]) {
      for (const fn of ['get_session_by_code', 'get_active_session_by_code']) {
        const row = one((await c.rpc(fn, { p_code: guest.code })).data);
        expect(Object.keys(row ?? {}).sort(), fn).toEqual(EXPECTED_SESSION_COLUMNS);
      }
    }
  });

  test('C7: join by code still works end to end — claim, then read the full row with the returned credential', async () => {
    const { data: claimed, error } = await client().rpc('claim_joiner_seat', { p_code: waiting.code, p_joiner_name: 'p1493 newcomer' });
    expect(error, error?.message).toBeNull();
    const c = one(claimed);
    const secret = c?.joiner_seat_secret as string;
    expect(secret, 'the claim must hand the guest its credential').toBeTruthy();
    const row = one((await client({ secret }).rpc('get_session_by_code', { p_code: waiting.code })).data);
    expect(row?.joiner_name).toBe('p1493 newcomer');
    expect((row?.live_state as Row | undefined)?.p1493).toBe('SENTINEL live');
  });

  test('C9: the named listener reads the full row of the directed room', async () => {
    const row = one((await client({ token: await tokenFor(listener) }).rpc('get_session_by_code', { p_code: directed.code })).data);
    expect((row?.live_state as Row | undefined)?.p1493).toBe('SENTINEL live');
    expect(row?.target_listener_id).toBe(listener.user.id);
  });

  test('C8: both lookups stay anon-executable; the credential parser is not client-executable', async () => {
    for (const fn of ['get_session_by_code', 'get_active_session_by_code']) {
      const { error } = await client().rpc(fn, { p_code: 'ZZZZZ9' });
      expect(error, `${fn} must stay reachable by anon`).toBeNull();
    }
    const parser = await client().rpc('clarity_request_seat_secrets');
    expect(parser.error, 'anon must not execute the credential parser').not.toBeNull();
  });
});
