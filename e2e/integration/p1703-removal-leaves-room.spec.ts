/**
 * @file p1703-removal-leaves-room.spec.ts
 * @description P1703 integration proof on the TEST backend with real host JWTs:
 *   - removing a person who is in the event room sets left_at on their presence row, visible to the host's own read
 *   - removing someone seated in an open round logs the move off their table (to_table NULL)
 *   - removing someone who never entered the room writes no presence data
 *   - an existing presence row (sitting out a round) is marked out and keeps sits_out_round; a past event's room is not touched
 *   - the backfill marks out earlier-removed members of open rooms only, spares closed rooms and host-restored
 *     members, marks out an existing older row keeping sits_out_round, and writes nothing on a second run. It runs
 *     the migration's own SQL scoped to this file's two events, so a run never touches another test's rows.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { testDbSql } from '../helpers/test-db-sql';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKFILL_SQL = fs.readFileSync(
  path.resolve(HERE, '../../supabase/migrations/20261117193800_p1703_backfill_removed_out_of_room.sql'),
  'utf8',
);

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function clientFor(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await anon().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const slug = () => `p1703-it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function makeEvent(hostId: string, datetime: Date): Promise<string> {
  const { data, error } = await supabaseAdmin.from('events').insert({
    slug: slug(),
    title: 'P1703 integration',
    description: 'P1703 integration test event',
    datetime: datetime.toISOString(),
    location: 'Test venue, Test street',
    host_id: hostId,
    status: 'upcoming',
  }).select('id').single();
  expect(error).toBeNull();
  return data!.id;
}

async function makeMember(eventId: string, profileId: string, name: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from('event_room_members')
    .insert({ event_id: eventId, profile_id: profileId, display_name: name }).select('id').single();
  expect(error).toBeNull();
  return data!.id;
}

async function presence(eventId: string, memberId?: string) {
  let q = supabaseAdmin.from('event_round_presence').select('room_member_id, left_at, sits_out_round, updated_at').eq('event_id', eventId);
  if (memberId) q = q.eq('room_member_id', memberId);
  const { data, error } = await q;
  expect(error).toBeNull();
  return data ?? [];
}

test.describe('P1703: removal also leaves the room', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  let host: TestUser;
  let inRoom: TestUser;
  let seated: TestUser;
  let never: TestUser;
  let bfA: TestUser;
  let bfB: TestUser;
  let bfC: TestUser;
  let bfD: TestUser;
  let withRow: TestUser;
  let pastUser: TestUser;
  let pastEvent: string;
  let eventId: string;
  let openEvent: string;
  let closedEvent: string;
  const eventIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1703 Host' });
    inRoom = await createTestUser({ name: 'P1703 InRoom' });
    seated = await createTestUser({ name: 'P1703 Seated' });
    never = await createTestUser({ name: 'P1703 Never' });
    bfA = await createTestUser({ name: 'P1703 BackfillA' });
    bfB = await createTestUser({ name: 'P1703 BackfillB' });
    bfC = await createTestUser({ name: 'P1703 BackfillC' });
    bfD = await createTestUser({ name: 'P1703 BackfillD' });
    withRow = await createTestUser({ name: 'P1703 WithRow' });
    pastUser = await createTestUser({ name: 'P1703 Past' });
    eventId = await makeEvent(host.user.id, new Date(Date.now() + 3 * 24 * 3600 * 1000));
    openEvent = await makeEvent(host.user.id, new Date(Date.now() + 3 * 24 * 3600 * 1000));
    closedEvent = await makeEvent(host.user.id, new Date(Date.now() - 2 * 24 * 3600 * 1000));
    pastEvent = await makeEvent(host.user.id, new Date(Date.now() - 2 * 24 * 3600 * 1000));
    eventIds.push(eventId, openEvent, closedEvent, pastEvent);
  });

  test.afterAll(async () => {
    const userIds = [host, inRoom, seated, never, bfA, bfB, bfC, bfD, withRow, pastUser].map(u => u?.user?.id).filter(Boolean) as string[];
    for (const id of eventIds) {
      // transcribe_* rows hang off our rounds (cascade) but are not reachable through REST; delete explicitly.
      await testDbSql(
        `DELETE FROM public.transcribe_round_seat_moves WHERE round_id IN (SELECT id FROM public.event_rounds WHERE event_id = '${id}'); SELECT 1 AS ok;`,
      ).catch(() => undefined);
      await supabaseAdmin.from('event_round_seats').delete().in(
        'round_id',
        ((await supabaseAdmin.from('event_rounds').select('id').eq('event_id', id)).data ?? []).map(r => r.id),
      );
      await supabaseAdmin.from('event_round_presence').delete().eq('event_id', id);
      await supabaseAdmin.from('event_rounds').delete().eq('event_id', id);
      await supabaseAdmin.from('event_removals').delete().eq('event_id', id);
      await supabaseAdmin.from('event_rsvps').delete().eq('event_id', id);
      await supabaseAdmin.from('event_room_members').delete().eq('event_id', id);
      await supabaseAdmin.from('events').delete().eq('id', id);
    }
    for (const id of userIds) await deleteTestUser(id);
  });

  test('a registered person in the room is marked out; the host reads it; repeat removal changes nothing', async () => {
    const memberId = await makeMember(eventId, inRoom.user.id, 'P1703 InRoom');
    const { error: rErr } = await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: inRoom.user.id });
    expect(rErr).toBeNull();

    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: inRoom.user.id });
    expect(error).toBeNull();

    const rows = await presence(eventId, memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].left_at).not.toBeNull();

    // The exact read the host page does (getRoundPresence), through the host's own JWT.
    const { data: hostRead, error: hErr } = await h
      .from('event_round_presence').select('room_member_id, left_at, sits_out_round').eq('event_id', eventId);
    expect(hErr).toBeNull();
    const mine = (hostRead ?? []).find(r => r.room_member_id === memberId);
    expect(mine?.left_at).toBe(rows[0].left_at);

    const { count } = await supabaseAdmin.from('event_room_members')
      .select('id', { count: 'exact', head: true }).eq('id', memberId);
    expect(count).toBe(1);

    const first = rows[0].left_at;
    const firstUpdated = rows[0].updated_at;
    const { error: again } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: inRoom.user.id });
    expect(again).toBeNull();
    const after = await presence(eventId, memberId);
    expect(after).toHaveLength(1);
    expect(after[0].left_at).toBe(first);
    expect(after[0].updated_at).toBe(firstUpdated);
  });

  test('a person seated in an open round (60s+ in) has their move off the table recorded', async () => {
    const memberId = await makeMember(eventId, seated.user.id, 'P1703 Seated');
    const { data: round, error: roErr } = await supabaseAdmin.from('event_rounds').insert({
      event_id: eventId, round_no: 1, group_size: 3,
      started_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), ended_at: null,
    }).select('id').single();
    expect(roErr).toBeNull();
    const { error: seatErr } = await supabaseAdmin.from('event_round_seats')
      .insert({ round_id: round!.id, room_member_id: memberId, table_no: 1, role: 'first' });
    expect(seatErr).toBeNull();
    await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: seated.user.id });

    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: seated.user.id });
    expect(error).toBeNull();

    const moves = await testDbSql<{ from_table: number; to_table: number | null }>(
      `SELECT from_table, to_table FROM public.transcribe_round_seat_moves
        WHERE round_id = '${round!.id}' AND room_member_id = '${memberId}' AND to_table IS NULL`,
      { readOnly: true },
    );
    expect(moves).toHaveLength(1);
    expect(Number(moves[0].from_table)).toBe(1);
    expect(moves[0].to_table).toBeNull();
  });

  test('a person who never entered the room: no presence data changes', async () => {
    const before = await presence(eventId);
    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: never.user.id });
    expect(error).toBeNull();
    const after = await presence(eventId);
    expect(after).toHaveLength(before.length);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    const { data: members } = await supabaseAdmin.from('event_room_members')
      .select('id').eq('event_id', eventId).eq('profile_id', never.user.id);
    expect(members ?? []).toHaveLength(0);
  });

  test('an existing presence row (sitting out round 2) is marked out and keeps sits_out_round', async () => {
    const memberId = await makeMember(eventId, withRow.user.id, 'P1703 WithRow');
    const { error: pErr } = await supabaseAdmin.from('event_round_presence').insert({
      event_id: eventId, room_member_id: memberId, left_at: null, sits_out_round: 2,
      updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(pErr).toBeNull();
    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: withRow.user.id });
    expect(error).toBeNull();
    const rows = await presence(eventId, memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].left_at).not.toBeNull();
    expect(rows[0].sits_out_round).toBe(2);
  });

  test('a past event: the removal is recorded but its closed room is not touched', async () => {
    const memberId = await makeMember(pastEvent, pastUser.user.id, 'P1703 Past');
    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: pastEvent, p_user: pastUser.user.id });
    expect(error).toBeNull();
    const { count } = await supabaseAdmin.from('event_removals')
      .select('user_id', { count: 'exact', head: true }).eq('event_id', pastEvent).eq('user_id', pastUser.user.id);
    expect(count).toBe(1);
    expect(await presence(pastEvent, memberId)).toHaveLength(0);
  });

  test('backfill: marks out an open room member, spares closed room and host-restored, idempotent', async () => {
    const removedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const mA = await makeMember(openEvent, bfA.user.id, 'P1703 BackfillA');
    const mC = await makeMember(openEvent, bfC.user.id, 'P1703 BackfillC');
    const mB = await makeMember(closedEvent, bfB.user.id, 'P1703 BackfillB');
    const mD = await makeMember(openEvent, bfD.user.id, 'P1703 BackfillD');
    const removals = [
      { event_id: openEvent, user_id: bfA.user.id },
      { event_id: openEvent, user_id: bfC.user.id },
      { event_id: openEvent, user_id: bfD.user.id },
      { event_id: closedEvent, user_id: bfB.user.id },
    ].map(r => ({ ...r, removed_by: host.user.id, removed_at: removedAt }));
    const { error: remErr } = await supabaseAdmin.from('event_removals').insert(removals);
    expect(remErr).toBeNull();
    // (c): the host brought them back after the removal: presence row, left_at null, updated_at after removed_at.
    const { error: pErr } = await supabaseAdmin.from('event_round_presence')
      .insert({ event_id: openEvent, room_member_id: mC, left_at: null });
    expect(pErr).toBeNull();
    // (d): an older presence row (sitting out round 2, written before the removal): the update path, not the insert.
    const { error: dErr } = await supabaseAdmin.from('event_round_presence').insert({
      event_id: openEvent, room_member_id: mD, left_at: null, sits_out_round: 2,
      updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(dErr).toBeNull();

    // The migration's own SQL, scoped to this file's events so a run never touches another test's rows.
    const anchor = 'WHERE now() < e.datetime';
    expect(BACKFILL_SQL).toContain(anchor);
    const scoped = BACKFILL_SQL.replace(anchor, `WHERE x.event_id IN ('${openEvent}', '${closedEvent}') AND now() < e.datetime`);
    await testDbSql(scoped + '\nSELECT 1 AS ok;');

    const a1 = await presence(openEvent, mA);
    expect(a1).toHaveLength(1);
    expect(a1[0].left_at).not.toBeNull();
    expect(await presence(closedEvent, mB)).toHaveLength(0);
    const c1 = await presence(openEvent, mC);
    expect(c1).toHaveLength(1);
    expect(c1[0].left_at).toBeNull();
    const d1 = await presence(openEvent, mD);
    expect(d1).toHaveLength(1);
    expect(d1[0].left_at).not.toBeNull();
    expect(d1[0].sits_out_round).toBe(2);

    await testDbSql(scoped + '\nSELECT 1 AS ok;');

    const a2 = await presence(openEvent, mA);
    expect(a2[0].left_at).toBe(a1[0].left_at);
    expect(a2[0].updated_at).toBe(a1[0].updated_at);
    expect(await presence(closedEvent, mB)).toHaveLength(0);
    const c2 = await presence(openEvent, mC);
    expect(c2[0].left_at).toBeNull();
    expect(c2[0].updated_at).toBe(c1[0].updated_at);
    const d2 = await presence(openEvent, mD);
    expect(d2[0].left_at).toBe(d1[0].left_at);
    expect(d2[0].updated_at).toBe(d1[0].updated_at);
  });
});
