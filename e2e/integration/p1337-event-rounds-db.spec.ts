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

  test('no direct client writes to any round table', async () => {
    const h = await clientFor(host);
    expect((await h.from('event_rounds').insert({ event_id: eventId, round_no: 9, group_size: 3 })).error).not.toBeNull();
    expect((await h.from('event_round_seats').insert({ round_id: round1, room_member_id: member.a, table_no: 5, role: 'first' })).error).not.toBeNull();
    expect((await h.from('event_round_tables').insert({ round_id: round1, table_no: 5 })).error).not.toBeNull();
    expect((await h.from('event_round_presence').insert({ event_id: eventId, room_member_id: member.a })).error).not.toBeNull();
  });

  test('next round closes the previous one; end closes the last', async () => {
    const h = await clientFor(host);
    expect((await h.rpc('host_start_round', { p_event_id: eventId, p_round_no: 2, p_group_size: 2, p_seats: [{ m: member.a, t: 1, r: 'first' }, { m: member.b, t: 1, r: 'second' }] })).error).toBeNull();
    // Round 1 is no longer the current round: its seats are frozen.
    expect((await h.rpc('host_set_round_seats', { p_round_id: round1, p_seats: trio() })).error?.code).toBe('22023');
    expect((await h.rpc('host_end_rounds', { p_event_id: eventId })).error).toBeNull();
    const { data } = await h.from('event_rounds').select('round_no, ended_at').eq('event_id', eventId).order('round_no');
    expect(data!.every(r => r.ended_at)).toBe(true);
  });
});
