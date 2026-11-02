/**
 * P1494 — "fresh room": a guest who takes over an inactive guest seat must start with nothing
 * from the previous guest's conversation.
 *
 * Group R reproduces the current behaviour and is EXPECTED TO FAIL until a mechanism is chosen
 * (see the spec — the choice is a founder decision). Group C are legitimate flows that must keep
 * passing under any fix (epistemic gate 7c).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const noAuth = { autoRefreshToken: false, persistSession: false } as const;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeRoomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');
const PRIOR = 'SENTINEL p1494 prior conversation';

function client(opts: { token?: string; code?: string; secret?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.code) headers['x-clarity-room-code'] = opts.code;
  if (opts.secret) headers['x-clarity-seat-secret'] = opts.secret;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers }, auth: noAuth });
}

type Row = Record<string, unknown>;
const one = (data: unknown): Row | undefined => (Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | undefined));

test.describe('P1494: fresh room on seat takeover', () => {
  test.describe.configure({ mode: 'default' });

  let host: TestUser;
  const createdSessionIds: string[] = [];

  async function hostToken() {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: host.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed: ${error?.message}`).toBeNull();
    await supabaseAdmin.auth.signOut();
    return data!.session!.access_token;
  }

  async function openRoom(isPrivate = true) {
    const code = makeRoomCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'p1494 host',
        creator_profile_id: host.user.id,
        is_private: isPrivate,
        status: 'active',
        demo_status: 'in_progress',
        partnership_status: 'pending',
        mode: 'live',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        last_activity_at: new Date().toISOString(),
        live_state: { sessionHistory: [] },
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1494 fixture: ${error.message}`);
    createdSessionIds.push(data.id);
    return { id: data.id as string, code };
  }

  const claim = (code: string, name: string, secret?: string) =>
    client().rpc('claim_joiner_seat', { p_code: code, p_joiner_name: name, ...(secret ? { p_seat_secret: secret } : {}) });

  /** A first guest holds a conversation, then goes quiet past the inactivity window. */
  async function roomWithAbandonedConversation(isPrivate = true) {
    const room = await openRoom(isPrivate);
    const first = await claim(room.code, 'first guest');
    expect(first.error).toBeNull();
    const firstSecret = one(first.data)!.joiner_seat_secret as string;

    await supabaseAdmin.from('clarity_sessions').update({
      live_state: { sessionHistory: [{ title: PRIOR, type: 'point', partnerName: 'first guest' }] },
    }).eq('id', room.id);
    const turn = await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: room.id, speaker_name: 'p1494 host', listener_name: 'first guest',
      actor_name: 'first guest', role: 'listener', transcript: PRIOR, self_rating: 6,
    });
    expect(turn.error, turn.error?.message).toBeNull();

    const stale = new Date(Date.now() - 16 * 60_000).toISOString();
    await supabaseAdmin.from('clarity_sessions')
      .update({ joiner_seat_claimed_at: stale, joiner_last_seen_at: stale })
      .eq('id', room.id);
    return { ...room, firstSecret };
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1494 Host' });
  });

  // Rotation rows are created by the function under test, so the fixtures never saw their ids.
  const extraUsers: TestUser[] = [];
  const createdEventIds: string[] = [];

  test.afterAll(async () => {
    if (host) {
      const { data: rotated } = await supabaseAdmin.from('clarity_sessions').select('id').eq('creator_profile_id', host.user.id);
      for (const r of rotated ?? []) if (!createdSessionIds.includes(r.id as string)) createdSessionIds.push(r.id as string);
    }
    if (createdSessionIds.length) {
      await supabaseAdmin.from('event_practice_rooms').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_live_turns').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    if (createdEventIds.length) await supabaseAdmin.from('events').delete().in('id', createdEventIds);
    for (const u of extraUsers) await deleteTestUser(u.user.id);
    if (host) await deleteTestUser(host.user.id);
  });

  // ---------------------------------------------------------------- GROUP R (red until fixed)

  test('R1: the newcomer who takes over an inactive seat reads none of the prior conversation', async () => {
    const room = await roomWithAbandonedConversation();
    const taken = await claim(room.code, 'newcomer');
    expect(taken.error, taken.error?.message).toBeNull();
    const secret = one(taken.data)!.joiner_seat_secret as string;

    expect(JSON.stringify(one(taken.data)?.live_state ?? null), 'claim result carries prior state').not.toContain(PRIOR);

    const g = client({ code: room.code, secret });
    const byCode = await g.rpc('get_session_by_code', { p_code: room.code });
    expect(JSON.stringify(one(byCode.data)?.live_state ?? null), 'lookup carries prior state').not.toContain(PRIOR);

    const turns = await g.from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(turns.error).toBeNull();
    expect(JSON.stringify(turns.data ?? []), 'newcomer reads prior turns').not.toContain(PRIOR);
  });

  // ---------------------------------------------------------------- GROUP C (must stay green)

  test('C1: the creator still reads the full history after a takeover', async () => {
    const room = await roomWithAbandonedConversation();
    expect((await claim(room.code, 'newcomer')).error).toBeNull();
    const h = client({ token: await hostToken() });
    const row = await h.from('clarity_sessions').select('live_state').eq('id', room.id).single();
    expect(JSON.stringify(row.data?.live_state)).toContain(PRIOR);
    const turns = await h.from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(JSON.stringify(turns.data)).toContain(PRIOR);
  });

  test('C2: the original guest with its credential still reads its own conversation (no takeover)', async () => {
    const room = await openRoom();
    const first = await claim(room.code, 'guest');
    const secret = one(first.data)!.joiner_seat_secret as string;
    await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: room.id, speaker_name: 'p1494 host', listener_name: 'guest',
      actor_name: 'guest', role: 'listener', transcript: PRIOR, self_rating: 6,
    });
    const again = await claim(room.code, 'guest', secret);
    expect(again.error).toBeNull();
    const turns = await client({ code: room.code, secret }).from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(JSON.stringify(turns.data)).toContain(PRIOR);
  });

  test('C3: a fresh join into an empty seat works', async () => {
    const room = await openRoom();
    const r = await claim(room.code, 'fresh guest');
    expect(r.error).toBeNull();
    expect(typeof one(r.data)?.joiner_seat_secret).toBe('string');
  });

  test('C4: the takeover itself still succeeds (recovery path / creator can seat a new partner)', async () => {
    const room = await roomWithAbandonedConversation();
    const taken = await claim(room.code, 'first guest on a new device');
    expect(taken.error).toBeNull();
    expect(one(taken.data)?.joiner_seat_secret).not.toBe(room.firstSecret);
  });

  // ---------------------------------------------------------------- GROUP T (the rollover itself, P1494)

  /** Everything admin can see about the rows that carry (or carried) a room. */
  const rowById = async (id: string) =>
    (await supabaseAdmin.from('clarity_sessions')
      .select('id, code, ended_at, status, live_state, joiner_name, joiner_seat_secret, joiner_profile_id, creator_name, creator_profile_id, is_private, expires_at')
      .eq('id', id).single()).data as Row;
  const rowsByCode = async (code: string) =>
    (await supabaseAdmin.from('clarity_sessions').select('id').eq('code', code)).data ?? [];

  test('T1: the newcomer\'s own turns are visible to the creator and the newcomer on the new row', async () => {
    const room = await roomWithAbandonedConversation();
    const taken = await claim(room.code, 'newcomer');
    const next = one(taken.data)!;
    const newId = next.id as string;
    const secret = next.joiner_seat_secret as string;
    expect(newId).not.toBe(room.id);

    const NEW = 'SENTINEL p1494 new conversation';
    const ins = await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: newId, speaker_name: 'p1494 host', listener_name: 'newcomer',
      actor_name: 'newcomer', role: 'listener', transcript: NEW, self_rating: 7,
    });
    expect(ins.error, ins.error?.message).toBeNull();

    const g = await client({ code: room.code, secret }).from('clarity_live_turns').select('transcript').eq('session_id', newId);
    expect(JSON.stringify(g.data)).toContain(NEW);
    const h = await client({ token: await hostToken() }).from('clarity_live_turns').select('transcript').eq('session_id', newId);
    expect(JSON.stringify(h.data)).toContain(NEW);
    expect(JSON.stringify(h.data)).not.toContain(PRIOR);
  });

  test('T2: the old row is ended, loses its credential and its code; the newcomer and the old secret cannot read it', async () => {
    const room = await roomWithAbandonedConversation();
    const taken = await claim(room.code, 'newcomer');
    const secret = one(taken.data)!.joiner_seat_secret as string;

    const old = await rowById(room.id);
    expect(old.ended_at).not.toBeNull();
    expect(old.status).toBe('completed');
    expect(old.joiner_seat_secret).toBeNull();
    expect(old.code).not.toBe(room.code);
    expect(JSON.stringify(old.live_state)).toContain(PRIOR);

    for (const s of [secret, room.firstSecret]) {
      const c = client({ code: room.code, secret: s });
      const oldRow = await c.from('clarity_sessions').select('id, live_state').eq('id', room.id);
      expect(JSON.stringify(oldRow.data ?? []), 'old row readable').not.toContain(PRIOR);
      expect(oldRow.data ?? []).toHaveLength(0);
      const turns = await c.from('clarity_live_turns').select('transcript').eq('session_id', room.id);
      expect(JSON.stringify(turns.data ?? [])).not.toContain(PRIOR);
    }

    // The previous holder's credential authorizes nothing on the room: the code now names a row
    // it does not belong to, so the lookup is the pre-join view of the NEW row.
    const lookup = await client({ code: room.code, secret: room.firstSecret }).rpc('get_session_by_code', { p_code: room.code });
    const row = one(lookup.data);
    expect(row?.id).not.toBe(room.id);
    expect(row?.live_state ?? null).toBeNull();
  });

  test('T3: the room code resolves to exactly one row, the new one', async () => {
    const room = await roomWithAbandonedConversation();
    const next = one((await claim(room.code, 'newcomer')).data)!;
    const rows = await rowsByCode(room.code);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(next.id);
    expect(next.id).not.toBe(room.id);
    const fresh = await rowById(next.id as string);
    expect(fresh.ended_at).toBeNull();
    expect(JSON.stringify(fresh.live_state)).not.toContain(PRIOR);
    // creator fields and settings travel; the old guest's name does not
    expect(fresh.creator_name).toBe('p1494 host');
    expect(fresh.creator_profile_id).toBe(host.user.id);
    expect(fresh.is_private).toBe(true);
    expect(fresh.joiner_name).toBe('newcomer');
  });

  test('T4: the original guest returning without its credential gets a fresh room', async () => {
    const room = await roomWithAbandonedConversation();
    const again = await claim(room.code, 'first guest');
    expect(again.error, again.error?.message).toBeNull();
    const next = one(again.data)!;
    expect(next.id).not.toBe(room.id);
    expect(JSON.stringify(next.live_state ?? null)).not.toContain(PRIOR);
    expect(next.joiner_seat_secret).not.toBe(room.firstSecret);
  });

  test('T5: a signed-in newcomer takes over into a fresh room bound to their account', async () => {
    const room = await roomWithAbandonedConversation();
    const u = await createTestUser({ email: generateTestEmail(), name: 'P1494 Newcomer' });
    extraUsers.push(u);
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    await supabaseAdmin.auth.signOut();
    const token = data!.session!.access_token;

    const taken = await client({ token }).rpc('claim_joiner_seat', { p_code: room.code, p_joiner_name: 'signed-in newcomer' });
    expect(taken.error, taken.error?.message).toBeNull();
    const next = one(taken.data)!;
    expect(next.id).not.toBe(room.id);
    expect(next.joiner_profile_id).toBe(u.user.id);
    expect(next.joiner_seat_secret).toBeNull();

    const c = client({ token });
    const mine = await c.from('clarity_sessions').select('id').eq('id', next.id as string);
    expect(mine.data ?? []).toHaveLength(1);
    const old = await c.from('clarity_sessions').select('id').eq('id', room.id);
    expect(old.data ?? []).toHaveLength(0);
    const turns = await c.from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(JSON.stringify(turns.data ?? [])).not.toContain(PRIOR);
  });

  test('T6: a second concurrent claim is refused and exactly one new row exists', async () => {
    const room = await roomWithAbandonedConversation();
    const [a, b] = await Promise.all([claim(room.code, 'racer a'), claim(room.code, 'racer b')]);
    const wins = [a, b].filter((r) => !r.error);
    const losses = [a, b].filter((r) => r.error);
    expect(wins, 'exactly one claim wins').toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0].error?.code).toBe('42501');
    const rows = await rowsByCode(room.code);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(one(wins[0].data)!.id);
    // and a later stranger is refused by the ordinary occupancy rule
    expect((await claim(room.code, 'late')).error?.code).toBe('42501');
  });

  test('T7: a practice-room pointer follows the code to the new row; history stays on the old one', async () => {
    const room = await roomWithAbandonedConversation();
    const { data: event, error: eventError } = await supabaseAdmin.from('events').insert({
      slug: `p1494-${Date.now()}`, title: 'P1494 pointer', description: 'fixture',
      datetime: new Date(Date.now() + 86_400_000).toISOString(), location: 'Test Location', host_id: host.user.id,
    }).select('id').single();
    expect(eventError, eventError?.message).toBeNull();
    createdEventIds.push(event!.id);
    const pr = await supabaseAdmin.from('event_practice_rooms').insert({
      event_id: event!.id, creator_id: host.user.id, session_id: room.id, status: 'active',
    }).select('id').single();
    expect(pr.error, pr.error?.message).toBeNull();

    const next = one((await claim(room.code, 'newcomer')).data)!;
    const after = await supabaseAdmin.from('event_practice_rooms').select('session_id').eq('id', pr.data!.id).single();
    expect(after.data?.session_id).toBe(next.id);

    const turns = await supabaseAdmin.from('clarity_live_turns').select('session_id').eq('session_id', room.id);
    expect((turns.data ?? []).length).toBeGreaterThan(0);
  });

  test('T8: a seat that is not abandoned, or whose holder presents the credential, does not rotate', async () => {
    // (a) live seat, credential presented: same row, same credential
    const live = await openRoom();
    const first = one((await claim(live.code, 'guest')).data)!;
    const again = one((await claim(live.code, 'guest', first.joiner_seat_secret as string)).data)!;
    expect(again.id).toBe(live.id);
    expect(again.joiner_seat_secret).toBe(first.joiner_seat_secret);
    // (b) live seat, no credential: refused, no new row
    expect((await claim(live.code, 'stranger')).error?.code).toBe('42501');
    // (c) abandoned seat but the holder presents the credential: it is a reclaim, not a takeover
    const stale = await roomWithAbandonedConversation();
    const back = one((await claim(stale.code, 'first guest', stale.firstSecret)).data)!;
    expect(back.id).toBe(stale.id);
    expect(JSON.stringify(back.live_state)).toContain(PRIOR);
    for (const r of [live, stale]) {
      const rows = await rowsByCode(r.code);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(r.id);
    }
  });

  /** A room whose creator did NOT ask for privacy, with the same abandoned conversation. */
  async function publicRoomWithAbandonedConversation() {
    return roomWithAbandonedConversation(false);
  }

  async function signedIn(name: string) {
    const u = await createTestUser({ email: generateTestEmail(), name });
    extraUsers.push(u);
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    await supabaseAdmin.auth.signOut();
    return { user: u, token: data!.session!.access_token };
  }

  test('T9: the new session of a non-private room is private, and no transcription can be created for it', async () => {
    const room = await publicRoomWithAbandonedConversation();
    const newcomer = await signedIn('P1494 T9 Newcomer');
    const taken = await client({ token: newcomer.token }).rpc('claim_joiner_seat', { p_code: room.code, p_joiner_name: 'newcomer' });
    expect(taken.error, taken.error?.message).toBeNull();
    const next = one(taken.data)!;
    expect(next.is_private, 'the claim result carries the privacy of the new session').toBe(true);

    expect((await rowById(room.id)).is_private, 'the finished session keeps its own setting').toBe(false);
    expect((await rowById(next.id as string)).is_private).toBe(true);

    for (const [who, token] of [['creator', await hostToken()], ['newcomer', newcomer.token]] as const) {
      const c = client({ token });
      const job = await c.rpc('create_transcription_job', { p_session_id: next.id as string });
      expect(job.error?.message, `${who} created a job for the new session`).toMatch(/private session/i);
      const retry = await c.rpc('retry_transcription', { p_session_id: next.id as string });
      expect(retry.error?.message, `${who} retried a transcription for the new session`).toMatch(/private session/i);
    }
    const jobs = await supabaseAdmin.from('transcription_jobs').select('id').eq('session_id', next.id as string);
    expect(jobs.data ?? []).toHaveLength(0);
  });

  test('T10: an expired room does not roll over; non-takeover claims on it are unchanged', async () => {
    const room = await roomWithAbandonedConversation();
    await supabaseAdmin.from('clarity_sessions').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', room.id);
    const refused = await claim(room.code, 'newcomer');
    expect(refused.error?.code).toBe('42501');
    const rows = await rowsByCode(room.code);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(room.id);
    expect((await rowById(room.id)).ended_at).toBeNull();

    // control: the same expired room, seat never claimed, behaves as it did before the rollover existed
    const empty = await openRoom();
    await supabaseAdmin.from('clarity_sessions').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', empty.id);
    const joined = await claim(empty.code, 'first guest');
    expect(joined.error, joined.error?.message).toBeNull();
    expect(one(joined.data)!.id).toBe(empty.id);
  });

  test('T11: sub-room and open invite pointers move; a closed invite stays on the finished row', async () => {
    const room = await roomWithAbandonedConversation();
    const open = await createTestUser({ email: generateTestEmail(), name: 'P1494 T11 Open' });
    const closed = await createTestUser({ email: generateTestEmail(), name: 'P1494 T11 Closed' });
    extraUsers.push(open, closed);
    const { data: event, error: eventError } = await supabaseAdmin.from('events').insert({
      slug: `p1494-t11-${Date.now()}`, title: 'P1494 T11', description: 'fixture',
      datetime: new Date(Date.now() + 86_400_000).toISOString(), location: 'Test Location', host_id: host.user.id,
    }).select('id').single();
    expect(eventError, eventError?.message).toBeNull();
    createdEventIds.push(event!.id);

    const sub = await supabaseAdmin.from('event_sub_rooms').insert({
      event_id: event!.id, session_id: room.id, initiator_id: host.user.id, target_id: open.user.id,
      status: 'active', session_code: room.code,
    }).select('id').single();
    expect(sub.error, sub.error?.message).toBeNull();
    const inviteOpen = await supabaseAdmin.from('clarity_live_invites').insert({ session_id: room.id, target_user_id: open.user.id }).select('id').single();
    expect(inviteOpen.error, inviteOpen.error?.message).toBeNull();
    const inviteClosed = await supabaseAdmin.from('clarity_live_invites')
      .insert({ session_id: room.id, target_user_id: closed.user.id, closed_at: new Date().toISOString() }).select('id').single();
    expect(inviteClosed.error, inviteClosed.error?.message).toBeNull();

    const next = one((await claim(room.code, 'newcomer')).data)!;

    const subAfter = await supabaseAdmin.from('event_sub_rooms').select('session_id, session_code').eq('id', sub.data!.id).single();
    expect(subAfter.data?.session_id).toBe(next.id);
    expect(subAfter.data?.session_code, 'the code in the sub-room row is still the room code').toBe(room.code);
    const openAfter = await supabaseAdmin.from('clarity_live_invites').select('session_id').eq('id', inviteOpen.data!.id).single();
    expect(openAfter.data?.session_id).toBe(next.id);
    const closedAfter = await supabaseAdmin.from('clarity_live_invites').select('session_id').eq('id', inviteClosed.data!.id).single();
    expect(closedAfter.data?.session_id).toBe(room.id);
  });
});
