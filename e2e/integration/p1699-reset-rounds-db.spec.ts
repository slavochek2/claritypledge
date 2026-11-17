/**
 * @file p1699-reset-rounds-db.spec.ts
 * @description P1699 proof for host_reset_rounds (20261117170000_p1699_host_reset_rounds.sql), live against the test DB with
 * real user JWTs:
 *   - a signed-in non-host gets 42501 and the round survives; anon is refused
 *   - the host's reset returns the number of rounds deleted, the round and its seats are gone, registrations and room members
 *     keep their ids, and a second event's rounds are untouched
 *   - after a reset, host_start_round with round number 1 succeeds again
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Signs in on a throwaway anon client, never on the shared supabaseAdmin singleton (e2e-testing-guide.md: "Never call
// signInWithPassword on supabaseAdmin"; /finish review). No signOut: it would revoke the session the client just got.
async function clientFor(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await anon().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('P1699: host_reset_rounds', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let a: TestUser;
  let b: TestUser;
  let eventId: string;
  let otherEventId: string;
  const member: Record<string, string> = {};
  let otherMember: string;
  let round1: string;
  let otherRound: string;
  let rsvpIdsBefore: string[] = [];
  let memberIdsBefore: string[] = [];
  let roomId: string | undefined;
  // seeded rows (ids), see the seed test
  const seed: Record<string, string> = {};

  const pair = () => [
    { m: member.a, t: 1, r: 'first' },
    { m: member.b, t: 1, r: 'second' },
  ];
  const roundsOf = async (id: string) => {
    const { data, error } = await supabaseAdmin.from('event_rounds').select('id, round_no').eq('event_id', id);
    expect(error).toBeNull();
    return data!;
  };
  const rsvpIds = async () => {
    const { data } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', eventId).order('id');
    return (data ?? []).map(r => r.id as string);
  };
  const memberIds = async () => {
    const { data } = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', eventId).order('id');
    return (data ?? []).map(r => r.id as string);
  };

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1699 Host' });
    a = await createTestUser({ name: 'P1699 Ana' });
    b = await createTestUser({ name: 'P1699 Ben' });
    const base = {
      description: 'P1699 integration test event',
      datetime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      location: 'Test venue, Test street',
      host_id: host.user.id,
      status: 'upcoming',
    };
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: evs, error } = await supabaseAdmin
      .from('events')
      .insert([
        { ...base, slug: `p1699-it-${stamp}`, title: 'P1699 integration' },
        { ...base, slug: `p1699-it-o-${stamp}`, title: 'P1699 other event' },
      ])
      .select('id, title');
    expect(error).toBeNull();
    eventId = evs!.find(e => e.title === 'P1699 integration')!.id;
    otherEventId = evs!.find(e => e.title === 'P1699 other event')!.id;

    const { error: rErr } = await supabaseAdmin.from('event_rsvps').insert([
      { event_id: eventId, profile_id: a.user.id },
      { event_id: eventId, profile_id: b.user.id },
      { event_id: otherEventId, profile_id: a.user.id },
    ]);
    expect(rErr).toBeNull();

    for (const [key, u] of [['a', a], ['b', b]] as const) {
      const cl = await clientFor(u);
      const { data, error: jErr } = await cl.rpc('join_event_room', { p_event_id: eventId, p_display_name: key });
      expect(jErr).toBeNull();
      member[key] = (data as { id: string }[])[0].id;
    }
    const ca = await clientFor(a);
    const { data: other } = await ca.rpc('join_event_room', { p_event_id: otherEventId, p_display_name: 'a' });
    otherMember = (other as { id: string }[])[0].id;
  });

  test.afterAll(async () => {
    if (roomId) await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    for (const id of [eventId, otherEventId]) if (id) await supabaseAdmin.from('events').delete().eq('id', id);
    for (const u of [host, a, b]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('setup: the host starts a round on each event', async () => {
    const h = await clientFor(host);
    const res = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 1, p_group_size: 2, p_seats: pair() });
    expect(res.error).toBeNull();
    round1 = res.data as string;
    const o = await h.rpc('host_start_round', {
      p_event_id: otherEventId, p_round_no: 1, p_group_size: 2, p_seats: [{ m: otherMember, t: 1, r: 'first' }],
    });
    expect(o.error).toBeNull();
    otherRound = o.data as string;
    rsvpIdsBefore = await rsvpIds();
    memberIdsBefore = await memberIds();
    expect(rsvpIdsBefore).toHaveLength(2);
    expect(memberIdsBefore).toHaveLength(2);
  });

  test('seed: round chat, before thread, ordinary chat, evening end, canvas step, sit-out, room job', async () => {
    const ok = async (q: PromiseLike<{ error: { message: string } | null }>, what: string) => {
      const { error } = await q;
      expect(error, what).toBeNull();
    };
    // the event's chat conversation (created by the event, else inserted here)
    let conv: string;
    const { data: existing } = await supabaseAdmin
      .from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', eventId).maybeSingle();
    if (existing) conv = existing.id as string;
    else {
      const { data, error } = await supabaseAdmin
        .from('chat_conversations').insert({ kind: 'event', event_id: eventId }).select('id').single();
      expect(error).toBeNull();
      conv = data!.id as string;
    }
    seed.conv = conv;
    const msg = async (key: string, body: string, root?: string) => {
      const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .insert({ conversation_id: conv, author_id: host.user.id, body, thread_root_id: root ?? null })
        .select('id').single();
      expect(error, key).toBeNull();
      seed[key] = data!.id as string;
    };
    // round thread: root + reply + link to the started round
    await msg('roundRoot', 'p1699 round thread root');
    await msg('roundReply', 'p1699 round thread reply', seed.roundRoot);
    await ok(supabaseAdmin.from('chat_round_threads').insert({
      event_id: eventId, round_id: round1, table_no: 1, conversation_id: conv, root_message_id: seed.roundRoot,
    }), 'chat_round_threads');
    // outside-round threads: before and after (removed), conversation (kept)
    for (const place of ['before', 'after', 'conversation'] as const) {
      await msg(`${place}Root`, `p1699 ${place} root`);
      await msg(`${place}Reply`, `p1699 ${place} reply`, seed[`${place}Root`]);
      await ok(supabaseAdmin.from('chat_outside_round_threads').insert({
        conversation_id: conv, root_message_id: seed[`${place}Root`], place,
      }), `outside ${place}`);
    }
    // ordinary event-channel message and ordinary thread, linked to no round
    await msg('plain', 'p1699 ordinary message');
    await msg('plainRoot', 'p1699 ordinary thread root');
    await msg('plainReply', 'p1699 ordinary thread reply', seed.plainRoot);
    // evening end, canvas update step, sits-out marker
    await ok(supabaseAdmin.from('event_evening_ends').insert({ event_id: eventId }), 'event_evening_ends');
    await ok(supabaseAdmin.from('event_canvas_update_steps').insert({ event_id: eventId, after_round_id: round1 }), 'canvas step');
    await ok(supabaseAdmin.from('event_round_presence').insert({
      event_id: eventId, room_member_id: member.a, sits_out_round: 1,
    }), 'presence');
    // transcription room of the event and its room-level "before" clean job
    const { data: room, error: roomErr } = await supabaseAdmin
      .from('transcribe_rooms').insert({ code: `p1699-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, event_id: eventId })
      .select('id').single();
    expect(roomErr).toBeNull();
    roomId = room!.id as string;
    const now = Date.now();
    const { data: job, error: jobErr } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
      kind: 'room', place: 'before', event_id: eventId, room_id: roomId,
      window_start: new Date(now - 60_000).toISOString(), window_end: new Date(now).toISOString(),
      not_before: new Date(now + 3_600_000).toISOString(),
    }).select('id').single();
    expect(jobErr).toBeNull();
    seed.job = job!.id as string;
    // preconditions: all seeded rows are there, so the later absences mean something
    const { data: present } = await supabaseAdmin.from('chat_messages').select('id').eq('conversation_id', conv);
    expect(present!.length).toBeGreaterThanOrEqual(11);
  });

  test('a signed-in non-host gets 42501 and the round survives; anon is refused', async () => {
    const ca = await clientFor(a);
    expect((await ca.rpc('host_reset_rounds', { p_event_id: eventId })).error?.code).toBe('42501');
    const an = await anon().rpc('host_reset_rounds', { p_event_id: eventId });
    expect(an.error).not.toBeNull();
    expect((await roundsOf(eventId)).map(r => r.id)).toEqual([round1]);
  });

  test('the host reset returns 1, deletes the round and keeps people and the other event', async () => {
    const h = await clientFor(host);
    const res = await h.rpc('host_reset_rounds', { p_event_id: eventId });
    expect(res.error).toBeNull();
    expect(res.data).toBe(1);
    expect(await roundsOf(eventId)).toHaveLength(0);
    const { data: seats } = await supabaseAdmin.from('event_round_seats').select('room_member_id').eq('round_id', round1);
    expect(seats).toHaveLength(0);
    expect(await rsvpIds()).toEqual(rsvpIdsBefore);
    expect(await memberIds()).toEqual(memberIdsBefore);
    expect((await roundsOf(otherEventId)).map(r => r.id)).toEqual([otherRound]);
  });

  test('the reset removed round state and kept ordinary chat and the conversation thread', async () => {
    const msgs = async (keys: string[]) => {
      const { data, error } = await supabaseAdmin
        .from('chat_messages').select('id, thread_root_id, body').in('id', keys.map(k => seed[k]));
      expect(error).toBeNull();
      return data!;
    };
    // gone: round thread, before and after threads, roots and replies
    expect(await msgs(['roundRoot', 'roundReply', 'beforeRoot', 'beforeReply', 'afterRoot', 'afterReply'])).toHaveLength(0);
    const { data: links } = await supabaseAdmin.from('chat_round_threads').select('id').eq('event_id', eventId);
    expect(links).toHaveLength(0);
    const { data: outside } = await supabaseAdmin
      .from('chat_outside_round_threads').select('place, root_message_id').eq('conversation_id', seed.conv);
    expect(outside).toEqual([{ place: 'conversation', root_message_id: seed.conversationRoot }]);
    // kept, same ids, replies still point at their roots
    const kept = await msgs(['plain', 'plainRoot', 'plainReply', 'conversationRoot', 'conversationReply']);
    expect(kept.map(m => m.id).sort()).toEqual(
      ['plain', 'plainRoot', 'plainReply', 'conversationRoot', 'conversationReply'].map(k => seed[k]).sort());
    expect(kept.find(m => m.id === seed.plainReply)!.thread_root_id).toBe(seed.plainRoot);
    expect(kept.find(m => m.id === seed.conversationReply)!.thread_root_id).toBe(seed.conversationRoot);
    expect(kept.find(m => m.id === seed.plain)!.thread_root_id).toBeNull();
    // evening end and canvas step gone
    const { data: ends } = await supabaseAdmin.from('event_evening_ends').select('event_id').eq('event_id', eventId);
    expect(ends).toHaveLength(0);
    const { data: steps } = await supabaseAdmin.from('event_canvas_update_steps').select('event_id').eq('event_id', eventId);
    expect(steps).toHaveLength(0);
    // sits-out cleared, the presence row itself kept
    const { data: pres } = await supabaseAdmin
      .from('event_round_presence').select('sits_out_round').eq('event_id', eventId).eq('room_member_id', member.a);
    expect(pres).toEqual([{ sits_out_round: null }]);
    // room-level before job gone, the room itself kept
    const { data: jobs } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('id').eq('id', seed.job);
    expect(jobs).toHaveLength(0);
    const { data: rooms } = await supabaseAdmin.from('transcribe_rooms').select('id').eq('id', roomId!);
    expect(rooms).toHaveLength(1);
    // the reset boundary is stamped
    const { data: stamp } = await supabaseAdmin.from('event_round_resets').select('event_id').eq('event_id', eventId);
    expect(stamp).toHaveLength(1);
  });

  test('a second reset with no rounds returns 0', async () => {
    const h = await clientFor(host);
    const res = await h.rpc('host_reset_rounds', { p_event_id: eventId });
    expect(res.error).toBeNull();
    expect(res.data).toBe(0);
  });

  test('round 1 can be started again after the reset', async () => {
    const h = await clientFor(host);
    const res = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 1, p_group_size: 2, p_seats: pair() });
    expect(res.error).toBeNull();
    const rounds = await roundsOf(eventId);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].round_no).toBe(1);
  });
  // ---- transcript boundary (20261117172000, 20261117173000) ----
  const extraRooms: string[] = [];
  const extraSessions: string[] = [];
  const extraEvents: string[] = [];
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const code = () => `p1699-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function makeRoom(opts: { eventId: string | null; createdAt: string; endedAt?: string | null }): Promise<string> {
    const { data, error } = await supabaseAdmin.from('transcribe_rooms')
      .insert({ code: code(), event_id: opts.eventId, created_at: opts.createdAt, ended_at: opts.endedAt ?? null })
      .select('id').single();
    expect(error).toBeNull();
    extraRooms.push(data!.id as string);
    return data!.id as string;
  }
  async function makeMember(room: string, u: TestUser): Promise<string> {
    const { data: ses, error: sErr } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: code(), creator_name: 'P1699', creator_profile_id: u.user.id }).select('id').single();
    expect(sErr).toBeNull();
    extraSessions.push(ses!.id as string);
    const { data, error } = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room, profile_id: u.user.id, display_name: 'p1699', session_id: ses!.id,
      consent_given_at: ago(9 * 60_000),
    }).select('id').single();
    expect(error).toBeNull();
    return data!.id as string;
  }
  const cleanEnabled = async () => {
    const r = await supabaseAdmin.rpc('_transcribe_clean_enabled');
    return r.error ? null : (r.data as boolean);
  };
  let boundaryRoom: string;
  let boundaryMember: string;
  let boundaryEnabled: boolean | null;

  test.afterAll(async () => {
    if (extraRooms.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', extraRooms);
    if (extraSessions.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', extraSessions);
    if (extraEvents.length) await supabaseAdmin.from('events').delete().in('id', extraEvents);
  });

  test('transcribe_messages: the reset deletes round-linked lines and keeps the rest', async () => {
    const [cur] = await roundsOf(eventId);
    boundaryRoom = await makeRoom({ eventId, createdAt: ago(10 * 60_000) });
    boundaryMember = await makeMember(boundaryRoom, a);
    const { data: msgs, error } = await supabaseAdmin.from('transcribe_messages').insert([
      { room_id: boundaryRoom, member_id: boundaryMember, text: 'p1699 round line', dest_round_id: cur.id },
      { room_id: boundaryRoom, member_id: boundaryMember, text: 'p1699 other line', dest_round_id: null },
    ]).select('id, text');
    expect(error).toBeNull();
    const roundLine = msgs!.find(m => m.text === 'p1699 round line')!.id;
    const otherLine = msgs!.find(m => m.text === 'p1699 other line')!.id;
    const h = await clientFor(host);
    const res = await h.rpc('host_reset_rounds', { p_event_id: eventId });
    expect(res.error).toBeNull();
    expect(res.data).toBe(1);
    const { data: left } = await supabaseAdmin.from('transcribe_messages').select('id').eq('room_id', boundaryRoom);
    expect((left ?? []).map(r => r.id)).toEqual([otherLine]);
    expect((left ?? []).map(r => r.id)).not.toContain(roundLine);
  });

  test('round 1 after a reset: the "before" window starts at the reset, not at the room creation', async () => {
    boundaryEnabled = await cleanEnabled();
    test.skip(boundaryEnabled !== true, `_transcribe_clean_enabled() is ${boundaryEnabled} on TEST: nothing asserted`);
    const { data: stamp } = await supabaseAdmin.from('event_round_resets').select('reset_at').eq('event_id', eventId).single();
    const resetAt = new Date(stamp!.reset_at as string).getTime();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').select('created_at').eq('id', boundaryRoom).single();
    expect(new Date(room!.created_at as string).getTime()).toBeLessThan(resetAt - 5 * 60_000);
    const h = await clientFor(host);
    const res = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 1, p_group_size: 2, p_seats: pair() });
    expect(res.error).toBeNull();
    const { data: jobs } = await supabaseAdmin.from('transcribe_round_clean_jobs')
      .select('window_start, window_end, segments').eq('kind', 'room').eq('place', 'before').eq('room_id', boundaryRoom);
    expect(jobs).toHaveLength(1);
    expect(new Date(jobs![0].window_start as string).getTime()).toBeGreaterThanOrEqual(resetAt);
    expect(new Date(jobs![0].window_start as string).getTime()).toBeGreaterThan(new Date(room!.created_at as string).getTime());
    const segs = jobs![0].segments as { start: string }[];
    expect(new Date(segs[0].start).getTime()).toBeGreaterThanOrEqual(resetAt);
  });

  test('room-end segments: empty when the reset is after the room ended, clipped when it falls inside', async () => {
    // a third event with no rounds, so the segments are the room's stretch and nothing else
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: ev, error } = await supabaseAdmin.from('events').insert({
      description: 'P1699 segments event', datetime: new Date(Date.now() + 10 * 60_000).toISOString(),
      location: 'Test venue, Test street', host_id: host.user.id, status: 'upcoming',
      slug: `p1699-it-s-${stamp}`, title: 'P1699 segments',
    }).select('id').single();
    expect(error).toBeNull();
    const evId = ev!.id as string;
    extraEvents.push(evId);
    const created = ago(10 * 60_000);
    const endedBefore = ago(5 * 60_000);
    const endedAfter = new Date(Date.now() + 5 * 60_000).toISOString();
    const roomBefore = await makeRoom({ eventId: evId, createdAt: created, endedAt: endedBefore });
    const roomMid = await makeRoom({ eventId: evId, createdAt: created, endedAt: endedAfter });
    await makeMember(roomBefore, a);
    await makeMember(roomMid, b);
    const segsOf = async (room: string) => {
      const r = await supabaseAdmin.rpc('_transcribe_room_end_segments', { p_room: room });
      expect(r.error, 'service role must be able to call _transcribe_room_end_segments').toBeNull();
      return r.data as { start: string; end: string }[];
    };
    // before any reset: one whole-room segment each (control for the clip)
    const pre = await segsOf(roomMid);
    expect(pre).toHaveLength(1);
    expect(new Date(pre[0].start).getTime()).toBe(new Date(created).getTime());
    const h = await clientFor(host);
    expect((await h.rpc('host_reset_rounds', { p_event_id: evId })).error).toBeNull();
    const { data: st } = await supabaseAdmin.from('event_round_resets').select('reset_at').eq('event_id', evId).single();
    const resetAt = new Date(st!.reset_at as string).getTime();
    expect(await segsOf(roomBefore)).toEqual([]);
    const mid = await segsOf(roomMid);
    expect(mid).toHaveLength(1);
    expect(new Date(mid[0].start).getTime()).toBe(resetAt);
    expect(new Date(mid[0].end).getTime()).toBe(new Date(endedAfter).getTime());
  });

  test('CONTROL: a room with no event keeps one whole-room segment, with or without any reset', async () => {
    const created = ago(10 * 60_000);
    const ended = ago(60_000);
    const room = await makeRoom({ eventId: null, createdAt: created });
    await makeMember(room, a);
    // resets of events elsewhere exist by now (event_round_resets rows); they must not touch this room
    const { data: resets } = await supabaseAdmin.from('event_round_resets').select('event_id');
    expect((resets ?? []).length).toBeGreaterThan(0);
    const { error: endErr } = await supabaseAdmin.from('transcribe_rooms').update({ ended_at: ended }).eq('id', room);
    expect(endErr).toBeNull();
    const r = await supabaseAdmin.rpc('_transcribe_room_end_segments', { p_room: room });
    expect(r.error).toBeNull();
    const segs = r.data as { start: string; end: string; member_ids: string[] }[];
    expect(segs).toHaveLength(1);
    expect(new Date(segs[0].start).getTime()).toBe(new Date(created).getTime());
    expect(new Date(segs[0].end).getTime()).toBe(new Date(ended).getTime());
    expect(segs[0].member_ids).toHaveLength(1);
    if (boundaryEnabled === true) {
      const { data: jobs } = await supabaseAdmin.from('transcribe_round_clean_jobs')
        .select('place, segments').eq('kind', 'room').eq('room_id', room);
      expect(jobs).toHaveLength(1);
      expect(jobs![0].place).toBe('session');
      expect(jobs![0].segments as unknown[]).toHaveLength(1);
    }
  });
});
