/**
 * @file p1337-event-rounds-db.spec.ts
 * @description P270 canary + RLS proof for P1337 (20261002183700_p1337_event_rounds.sql), live
 * against the test DB with real user JWTs:
 *   - only the host starts rounds and changes seats; round numbers are strictly sequential;
 *     every seat must be a member of THIS event's room; two people cannot share a speaking role
 *   - room members and the host read the seating; a registrant outside the room and anon do not;
 *     position_moved is not selectable by anyone but service_role
 *   - an attendee confirms only their own seat; a swap keeps the confirm tap of someone whose
 *     table did not change and clears it for someone moved
 *   - set_round_topic: anyone at that table, last tap wins; someone at another table is refused
 *   - presence is host-only both ways; no client role writes any of the four tables directly
 *   - get_event_transcribing_now (20261004120000): the host sees live transcription only
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function clientFor(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await supabaseAdmin.auth.signOut();
  return client;
}

test.describe('P1337: rounds, seats, topics, presence', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let outsider: TestUser; // registered, never opens the room
  let eventId: string;
  let otherEventId: string;
  const member: Record<string, string> = {};
  let otherEventMember: string;
  let round1: string;
  let pointId: string;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1337 Host' });
    a = await createTestUser({ name: 'P1337 Ana' });
    b = await createTestUser({ name: 'P1337 Ben' });
    c = await createTestUser({ name: 'P1337 Cy' });
    outsider = await createTestUser({ name: 'P1337 Out' });
    const base = {
      description: 'P1337 integration test event',
      datetime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      location: 'Test venue, Test street',
      host_id: host.user.id,
      status: 'upcoming',
    };
    const { data: evs, error } = await supabaseAdmin
      .from('events')
      .insert([
        { ...base, slug: `p1337-it-${Date.now()}`, title: 'P1337 integration' },
        { ...base, slug: `p1337-it-o-${Date.now()}`, title: 'P1337 other event' },
      ])
      .select('id, title');
    expect(error).toBeNull();
    eventId = evs!.find(e => e.title === 'P1337 integration')!.id;
    otherEventId = evs!.find(e => e.title === 'P1337 other event')!.id;

    const { error: rErr } = await supabaseAdmin.from('event_rsvps').insert([
      { event_id: eventId, profile_id: a.user.id },
      { event_id: eventId, profile_id: b.user.id },
      { event_id: eventId, profile_id: c.user.id },
      { event_id: eventId, profile_id: outsider.user.id },
      { event_id: otherEventId, profile_id: a.user.id },
    ]);
    expect(rErr).toBeNull();

    for (const [key, u] of [['a', a], ['b', b], ['c', c]] as const) {
      const cl = await clientFor(u);
      const { data, error: jErr } = await cl.rpc('join_event_room', { p_event_id: eventId, p_display_name: key });
      expect(jErr).toBeNull();
      member[key] = (data as { id: string }[])[0].id;
    }
    const ca = await clientFor(a);
    const { data: other } = await ca.rpc('join_event_room', { p_event_id: otherEventId, p_display_name: 'a' });
    otherEventMember = (other as { id: string }[])[0].id;

    const { data: pt, error: pErr } = await supabaseAdmin
      .from('points')
      .insert({ statement: 'P1337 integration statement', first_validator_id: host.user.id, visibility: 'public' })
      .select('id')
      .single();
    expect(pErr).toBeNull();
    pointId = pt!.id;
  });

  test.afterAll(async () => {
    for (const id of [eventId, otherEventId]) if (id) await supabaseAdmin.from('events').delete().eq('id', id);
    if (pointId) await supabaseAdmin.from('points').delete().eq('id', pointId);
    for (const u of [host, a, b, c, outsider]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  const trio = () => [
    { m: member.a, t: 1, r: 'first' },
    { m: member.b, t: 1, r: 'second' },
    { m: member.c, t: 1, r: 'observer' },
  ];

  test('only the host starts a round; anon and an attendee are refused', async () => {
    const ca = await clientFor(a);
    expect((await ca.rpc('host_start_round', { p_event_id: eventId, p_round_no: 1, p_group_size: 3, p_seats: trio() })).error?.code).toBe('42501');
    expect((await anon().rpc('host_start_round', { p_event_id: eventId, p_round_no: 1, p_group_size: 3, p_seats: trio() })).error).not.toBeNull();

    const h = await clientFor(host);
    const res = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 1, p_group_size: 3, p_seats: trio() });
    expect(res.error).toBeNull();
    round1 = res.data as string;
  });

  test('round numbers are sequential; seats must belong to this room; one first per table', async () => {
    const h = await clientFor(host);
    expect((await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 3, p_group_size: 3, p_seats: trio() })).error?.code).toBe('22023');
    const foreign = [{ m: otherEventMember, t: 1, r: 'first' }, { m: member.b, t: 1, r: 'second' }];
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: foreign })).error?.code).toBe('22023');
    const twoFirsts = [{ m: member.a, t: 1, r: 'first' }, { m: member.b, t: 1, r: 'first' }];
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: twoFirsts })).error?.code).toBe('22023');
  });

  test('room members and host read seats; a registrant outside the room and anon read none', async () => {
    for (const u of [a, host]) {
      const cl = await clientFor(u);
      const { data, error } = await cl.from('event_round_seats').select('room_member_id, table_no, role').eq('round_id', round1);
      expect(error).toBeNull();
      expect(data).toHaveLength(3);
    }
    const o = await clientFor(outsider);
    expect((await o.from('event_round_seats').select('room_member_id').eq('round_id', round1)).data).toEqual([]);
    expect((await o.from('event_rounds').select('id').eq('event_id', eventId)).data).toEqual([]);
    expect((await anon().from('event_round_seats').select('room_member_id').eq('round_id', round1)).data ?? []).toEqual([]);
  });

  test('position_moved is not readable by clients', async () => {
    const h = await clientFor(host);
    const { error } = await h.from('event_round_seats').select('position_moved').eq('round_id', round1);
    expect(error).not.toBeNull();
  });

  test('confirm touches only the caller; a swap keeps unmoved taps and clears moved ones', async () => {
    const ca = await clientFor(a);
    const cc = await clientFor(c);
    expect((await ca.rpc('confirm_round_seat', { p_round_id: round1 })).error).toBeNull();
    expect((await cc.rpc('confirm_round_seat', { p_round_id: round1 })).error).toBeNull();
    const before = await supabaseAdmin.from('event_round_seats').select('room_member_id, confirmed_at').eq('round_id', round1);
    const confirmed = new Map(before.data!.map(r => [r.room_member_id, r.confirmed_at]));
    expect(confirmed.get(member.a)).not.toBeNull();
    expect(confirmed.get(member.b)).toBeNull();

    // c moves to table 2 (alone); a stays at table 1 with a different role.
    const h = await clientFor(host);
    const next = [
      { m: member.b, t: 1, r: 'first' },
      { m: member.a, t: 1, r: 'second' },
      { m: member.c, t: 2, r: 'first' },
    ];
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: next })).error).toBeNull();
    const after = await supabaseAdmin.from('event_round_seats').select('room_member_id, table_no, role, confirmed_at').eq('round_id', round1);
    const byId = new Map(after.data!.map(r => [r.room_member_id, r]));
    expect(byId.get(member.a)!.confirmed_at).not.toBeNull();
    expect(byId.get(member.a)!.role).toBe('second');
    expect(byId.get(member.c)!.confirmed_at).toBeNull();
    expect(byId.get(member.c)!.table_no).toBe(2);
    // Back to the trio for the topic tests.
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: trio() })).error).toBeNull();
  });

  test('topic: anyone at the table, last tap wins; another table and outsiders refused', async () => {
    const ca = await clientFor(a);
    const cc = await clientFor(c);
    expect((await ca.rpc('set_round_topic', { p_round_id: round1, p_table_no: 1, p_point_id: pointId })).error).toBeNull();
    expect((await cc.rpc('set_round_topic', { p_round_id: round1, p_table_no: 1, p_point_id: null })).error).toBeNull();
    const { data } = await ca.from('event_round_tables').select('topic_point_id').eq('round_id', round1).eq('table_no', 1).single();
    expect(data!.topic_point_id).toBeNull();
    expect((await ca.rpc('set_round_topic', { p_round_id: round1, p_table_no: 2, p_point_id: pointId })).error?.code).toBe('42501');
    const o = await clientFor(outsider);
    expect((await o.rpc('set_round_topic', { p_round_id: round1, p_table_no: 1, p_point_id: pointId })).error?.code).toBe('42501');
  });

  test('a table keeps its mark when only roles change, and loses it when its people change', async () => {
    const ca = await clientFor(a);
    const h = await clientFor(host);
    const topicOf = async () =>
      (await supabaseAdmin.from('event_round_tables').select('topic_point_id').eq('round_id', round1).eq('table_no', 1).maybeSingle()).data?.topic_point_id ?? null;
    expect((await ca.rpc('set_round_topic', { p_round_id: round1, p_table_no: 1, p_point_id: pointId })).error).toBeNull();
    // Same three people, roles rotated.
    const rotated = [
      { m: member.b, t: 1, r: 'first' },
      { m: member.c, t: 1, r: 'second' },
      { m: member.a, t: 1, r: 'observer' },
    ];
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: rotated })).error).toBeNull();
    expect(await topicOf()).toBe(pointId);
    // c moves away: table 1's people changed.
    const split = [
      { m: member.a, t: 1, r: 'first' },
      { m: member.b, t: 1, r: 'second' },
      { m: member.c, t: 2, r: 'first' },
    ];
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: split })).error).toBeNull();
    expect(await topicOf()).toBeNull();
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: trio() })).error).toBeNull();
  });

  test('position moved: stored for the caller only', async () => {
    const cb = await clientFor(b);
    expect((await cb.rpc('set_round_position_moved', { p_round_id: round1, p_moved: true })).error).toBeNull();
    const { data } = await supabaseAdmin.from('event_round_seats').select('room_member_id, position_moved').eq('round_id', round1);
    const byId = new Map(data!.map(r => [r.room_member_id, r.position_moved]));
    expect(byId.get(member.b)).toBe(true);
    expect(byId.get(member.a)).toBeNull();
  });

  test('presence is host-only to write and to read', async () => {
    const ca = await clientFor(a);
    expect((await ca.rpc('host_set_round_presence', { p_event_id: eventId, p_room_member_id: member.c, p_left: true, p_sits_out_round: null })).error?.code).toBe('42501');
    const h = await clientFor(host);
    expect((await h.rpc('host_set_round_presence', { p_event_id: eventId, p_room_member_id: member.c, p_left: true, p_sits_out_round: null })).error).toBeNull();
    const hostView = await h.from('event_round_presence').select('room_member_id, left_at').eq('event_id', eventId);
    expect(hostView.data).toHaveLength(1);
    expect(hostView.data![0].left_at).not.toBeNull();
    expect((await ca.from('event_round_presence').select('room_member_id').eq('event_id', eventId)).data).toEqual([]);
  });

  test('host sees who is transcribing right now; an attendee and anon see nobody', async () => {
    // 20261004120000_p1337_host_transcribing_now.sql — live = consent, not ended, seen < 10 min.
    const code = `P1337T${Date.now() % 1_000_000}`;
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code, event_id: eventId }).select('id').single();
    const sessions: string[] = [];
    const seat = async (u: TestUser, name: string, extra: Record<string, unknown>) => {
      const { data: session } = await supabaseAdmin.from('clarity_sessions')
        .insert({ code: `${code}-${name}`, creator_name: name, creator_profile_id: u.user.id }).select('id').single();
      sessions.push(session!.id);
      const { error } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: room!.id, profile_id: u.user.id, display_name: name, session_id: session!.id, ...extra,
      });
      expect(error).toBeNull();
    };
    const now = new Date().toISOString();
    try {
      await seat(a, 'Ana', { consent_given_at: now, last_seen_at: now }); // live
      await seat(b, 'Ben', { consent_given_at: now, last_seen_at: new Date(Date.now() - 11 * 60_000).toISOString() }); // stale
      await seat(c, 'Cy', { consent_given_at: now, last_seen_at: now, capture_ended_at: now }); // ended

      const h = await clientFor(host);
      const live = await h.rpc('get_event_transcribing_now', { p_event_id: eventId });
      expect(live.error).toBeNull();
      expect((live.data as { profile_id: string }[]).map(r => r.profile_id)).toEqual([a.user.id]);

      const ca = await clientFor(a);
      expect((await ca.rpc('get_event_transcribing_now', { p_event_id: eventId })).data).toEqual([]);
      expect((await anon().rpc('get_event_transcribing_now', { p_event_id: eventId })).error).not.toBeNull();
    } finally {
      await supabaseAdmin.from('transcribe_rooms').delete().eq('id', room!.id);
      if (sessions.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessions);
    }
  });

  test('minutes per round: "+1 min" is host-only and adds a minute to one part', async () => {
    const read = async () =>
      (await supabaseAdmin.from('event_rounds').select('seating_s, first_s, second_s, observer_s').eq('id', round1).single()).data!;
    // A round started with the 4-argument call reads as the defaults.
    expect(await read()).toEqual({ seating_s: 60, first_s: 360, second_s: 360, observer_s: 180 });
    const ca = await clientFor(a);
    expect((await ca.rpc('host_extend_round', { p_round_id: round1, p_phase: 'second' })).error?.code).toBe('42501');
    expect((await anon().rpc('host_extend_round', { p_round_id: round1, p_phase: 'second' })).error).not.toBeNull();
    const h = await clientFor(host);
    // Put the round 30s into the second speaker. A stale tap naming the first speaker still extends
    // the part running NOW, decided on the server — the first speaker's end never moves back.
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - (60 + 360 + 30) * 1000).toISOString() }).eq('id', round1);
    expect((await h.rpc('host_extend_round', { p_round_id: round1, p_phase: 'first' })).error).toBeNull();
    expect((await h.rpc('host_extend_round', { p_round_id: round1, p_phase: 'nonsense' })).error?.code).toBe('22023');
    expect(await read()).toEqual({ seating_s: 60, first_s: 360, second_s: 420, observer_s: 180 });
    // P1529 (migration 20261110153500, +1 min after time is up): past the end of a round that is still OPEN the observer's part is extended so
    // one minute remains from now (here 20 s over: 180 + 20 + 60 = 260). It used to be refused (22023).
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - (60 + 360 + 420 + 180 + 20) * 1000).toISOString() }).eq('id', round1);
    expect((await h.rpc('host_extend_round', { p_round_id: round1, p_phase: 'observer' })).error).toBeNull();
    const over = await read();
    expect(over.observer_s).toBeGreaterThanOrEqual(260);
    expect(over.observer_s).toBeLessThanOrEqual(262);
    // Far past the end (two hours: 261 s part + ~6100 s over > 3600) a minute cannot make the clock run again within the part's 3600 s maximum: a distinct refusal (54000), nothing changes.
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - 120 * 60_000).toISOString() }).eq('id', round1);
    expect((await h.rpc('host_extend_round', { p_round_id: round1, p_phase: 'observer' })).error?.code).toBe('54000');
    expect((await read()).observer_s).toBe(over.observer_s);
    // A running part already at its maximum is refused the same way, never a silent success.
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - 30 * 1000).toISOString(), seating_s: 1800 }).eq('id', round1);
    expect((await h.rpc('host_extend_round', { p_round_id: round1, p_phase: 'seating' })).error?.code).toBe('54000');
    await supabaseAdmin.from('event_rounds').update({ seating_s: 60 }).eq('id', round1);
    // A stranger is still refused.
    expect((await ca.rpc('host_extend_round', { p_round_id: round1, p_phase: 'observer' })).error?.code).toBe('42501');
  });

  test('no direct client writes to any round table', async () => {
    const h = await clientFor(host);
    expect((await h.from('event_rounds').insert({ event_id: eventId, round_no: 9, group_size: 3 })).error).not.toBeNull();
    expect((await h.from('event_round_seats').insert({ round_id: round1, room_member_id: member.a, table_no: 5, role: 'first' })).error).not.toBeNull();
    expect((await h.from('event_round_tables').insert({ round_id: round1, table_no: 5 })).error).not.toBeNull();
    expect((await h.from('event_round_presence').insert({ event_id: eventId, room_member_id: member.a })).error).not.toBeNull();
  });

  test('next round stores its minutes and closes the previous one; end closes the last', async () => {
    const h = await clientFor(host);
    // Out-of-range minutes are refused by the column checks; the host's minutes are stored with the round.
    const pair = [{ m: member.a, t: 1, r: 'first' }, { m: member.b, t: 1, r: 'second' }];
    expect((await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 2, p_group_size: 2, p_seats: pair, p_seating_s: 60, p_speaker_s: 0, p_observer_s: 0 })).error).not.toBeNull();
    const started = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 2, p_group_size: 2, p_seats: pair, p_seating_s: 120, p_speaker_s: 300, p_observer_s: 0 });
    expect(started.error).toBeNull();
    const { data: r2 } = await h.from('event_rounds').select('seating_s, first_s, second_s, observer_s').eq('id', started.data as string).single();
    expect(r2).toEqual({ seating_s: 120, first_s: 300, second_s: 300, observer_s: 0 });
    // Round 1 is no longer the current round: its seats are frozen.
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: trio() })).error?.code).toBe('22023');
    expect((await h.rpc('host_end_rounds', { p_event_id: eventId })).error).toBeNull();
    const { data } = await h.from('event_rounds').select('round_no, ended_at').eq('event_id', eventId).order('round_no');
    expect(data!.every(r => r.ended_at)).toBe(true);
    // "Swap at half time" off: stored with the round, and a minute added during the shared talking
    // part goes on its end (second_s), whatever part the client names.
    const unsplit = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 3, p_group_size: 2, p_seats: pair, p_seating_s: 0, p_speaker_s: 300, p_observer_s: 0, p_split_speakers: false });
    expect(unsplit.error).toBeNull();
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - 400_000).toISOString() }).eq('id', unsplit.data as string);
    expect((await h.rpc('host_extend_round', { p_round_id: unsplit.data as string, p_phase: 'first' })).error).toBeNull();
    const { data: r3 } = await h.from('event_rounds').select('first_s, second_s, split_speakers').eq('id', unsplit.data as string).single();
    expect(r3).toEqual({ first_s: 300, second_s: 360, split_speakers: false });
    // A finished round takes no more minutes.
    expect((await h.rpc('host_extend_round', { p_round_id: started.data as string, p_phase: 'first' })).error?.code).toBe('22023');
  });

  test('walkthrough 6: "−1 min" never moves time passed; a round stores its match tag and showcase', async () => {
    const h = await clientFor(host);
    const pair = [{ m: member.a, t: 1, r: 'first' }, { m: member.b, t: 1, r: 'second' }];
    const base = { p_event_id: eventId, p_group_size: 2, p_seats: pair, p_seating_s: 60, p_speaker_s: 300, p_observer_s: 0, p_split_speakers: true };
    // Showcase + match tag: stored with the round; a malformed tag is refused by the column check.
    expect((await h.rpc('host_start_round', { ...base, p_round_no: 4, p_match_tag: 'Not A Tag', p_showcase: true })).error).not.toBeNull();
    const r4 = await h.rpc('host_start_round', { ...base, p_round_no: 4, p_match_tag: 'ikigai1', p_showcase: true });
    expect(r4.error).toBeNull();
    const id = r4.data as string;
    const read = async () =>
      (await supabaseAdmin.from('event_rounds').select('seating_s, first_s, second_s, match_tag, showcase').eq('id', id).single()).data!;
    expect(await read()).toMatchObject({ match_tag: 'ikigai1', showcase: true });

    // Host only.
    const ca = await clientFor(a);
    expect((await ca.rpc('host_shorten_round', { p_round_id: id })).error?.code).toBe('42501');
    expect((await anon().rpc('host_shorten_round', { p_round_id: id })).error).not.toBeNull();

    // 100 s into the first speaker's 300: a minute off leaves 240.
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - (60 + 100) * 1000).toISOString() }).eq('id', id);
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error).toBeNull();
    expect(await read()).toMatchObject({ seating_s: 60, first_s: 240, second_s: 300 });
    // 200 s into a 240 s part: a minute off would end it in the past — it ends now (~200), no earlier.
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - (60 + 200) * 1000).toISOString() }).eq('id', id);
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error).toBeNull();
    const after = await read();
    expect(after.first_s).toBeGreaterThanOrEqual(200);
    expect(after.first_s).toBeLessThan(240);
    // The speakers' floor: a part never goes under 60 s.
    await supabaseAdmin.from('event_rounds').update({ first_s: 90, started_at: new Date(Date.now() - (60 + 5) * 1000).toISOString() }).eq('id', id);
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error).toBeNull();
    expect((await read()).first_s).toBe(60);
    // While it runs, someone at the table marks a topic; once it is over, nobody can (Codex review).
    expect((await ca.rpc('set_round_topic', { p_round_id: id, p_table_no: 1, p_point_id: pointId })).error).toBeNull();
    // A finished round takes no minute off.
    expect((await h.rpc('host_end_rounds', { p_event_id: eventId })).error).toBeNull();
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error?.code).toBe('22023');
    expect((await ca.rpc('set_round_topic', { p_round_id: id, p_table_no: 1, p_point_id: null })).error?.code).toBe('22023');
  });
  test('reading part (20261111170000): stored with the round, counted in every part\'s arithmetic, extended and shortened while it runs', async () => {
    const h = await clientFor(host);
    const pair = [{ m: member.a, t: 1, r: 'first' }, { m: member.b, t: 1, r: 'second' }];
    const base = { p_event_id: eventId, p_group_size: 2, p_seats: pair, p_seating_s: 60, p_speaker_s: 300, p_observer_s: 60, p_split_speakers: false, p_match_tag: null, p_showcase: false };
    // (The out-of-range refusal needs a mastermind event: see p1529-db-schema.spec.ts.)
    const started = await h.rpc('host_start_round', { ...base, p_round_no: 5, p_reading_s: 120 });
    expect(started.error).toBeNull();
    const id = started.data as string;
    // A reading part belongs to the sales mastermind only: any other flow stores 0 (L2). The arithmetic below is exercised with the column set directly.
    expect((await supabaseAdmin.from('event_rounds').select('reading_s').eq('id', id).single()).data).toEqual({ reading_s: 0 });
    await supabaseAdmin.from('event_rounds').update({ reading_s: 120 }).eq('id', id);
    const read = async () => (await supabaseAdmin.from('event_rounds').select('reading_s, first_s, second_s, observer_s').eq('id', id).single()).data!;
    expect(await read()).toEqual({ reading_s: 120, first_s: 300, second_s: 300, observer_s: 60 });
    const setStart = (secondsAgo: number) => supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - secondsAgo * 1000).toISOString() }).eq('id', id);
    // 30 s into the reading part (60 s of seating first): a stale tap naming the talk still extends the READING part.
    await setStart(60 + 30);
    expect((await h.rpc('host_extend_round', { p_round_id: id, p_phase: 'first' })).error).toBeNull();
    expect(await read()).toEqual({ reading_s: 180, first_s: 300, second_s: 300, observer_s: 60 });
    expect((await h.rpc('host_extend_round', { p_round_id: id, p_phase: 'reading' })).error).toBeNull();
    expect((await read()).reading_s).toBe(240);
    // A minute off the reading part never moves time passed: 30 s in, 240 - 60 = 180.
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error).toBeNull();
    expect((await read()).reading_s).toBe(180);
    // Once the talk runs (10 s into it) the minute goes on the talk, the reading part keeps its length.
    await setStart(60 + 180 + 10);
    expect((await h.rpc('host_extend_round', { p_round_id: id, p_phase: 'reading' })).error).toBeNull();
    expect(await read()).toEqual({ reading_s: 180, first_s: 300, second_s: 360, observer_s: 60 });
    // Past the end (no observer seated): the arithmetic counts the reading part. Ends at 60+180+300+360 = 900 s; 920 s in is 20 s over,
    // so the talk's end becomes 360 + 20 + 60 = 440 (and not what it would be had the reading time been left out).
    await setStart(920);
    expect((await h.rpc('host_extend_round', { p_round_id: id, p_phase: 'second' })).error).toBeNull();
    const over = (await read()).second_s;
    expect(over).toBeGreaterThanOrEqual(440);
    expect(over).toBeLessThanOrEqual(442);
    // A reading part at its maximum is refused like any other part (54000).
    await supabaseAdmin.from('event_rounds').update({ reading_s: 3600, started_at: new Date(Date.now() - 100 * 1000).toISOString() }).eq('id', id);
    expect((await h.rpc('host_extend_round', { p_round_id: id, p_phase: 'reading' })).error?.code).toBe('54000');
    // Split off during the talk (the mastermind's shape): "-1 min" takes a minute off the shared part, never below what has passed (finding 2).
    await supabaseAdmin.from('event_rounds').update({ reading_s: 0, split_speakers: false, first_s: 300, second_s: 300, seating_s: 60, observer_s: 0, started_at: new Date(Date.now() - (60 + 100) * 1000).toISOString() }).eq('id', id);
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error).toBeNull();
    expect(await read()).toMatchObject({ first_s: 300, second_s: 240 });
    await setStart(60 + 530);
    expect((await h.rpc('host_shorten_round', { p_round_id: id })).error).toBeNull();
    const shared = await read();
    expect(shared.second_s).toBeGreaterThanOrEqual(230);
    expect(shared.second_s).toBeLessThan(240);
    // A round started the old way (no reading argument) has none, and its clock is the old one.
    expect((await h.rpc('host_end_rounds', { p_event_id: eventId })).error).toBeNull();
    const old = await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 6, p_group_size: 2, p_seats: pair, p_seating_s: 60, p_speaker_s: 300, p_observer_s: 0 });
    expect(old.error).toBeNull();
    expect((await supabaseAdmin.from('event_rounds').select('reading_s').eq('id', old.data as string).single()).data).toEqual({ reading_s: 0 });
    expect((await h.rpc('host_end_rounds', { p_event_id: eventId })).error).toBeNull();
  });
});
