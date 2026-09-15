/**
 * @file 20260915120100_p1315_join_room_event_access.spec.ts
 * @description P270 canary for 20260915120100_p1315_join_room_event_access.sql.
 *
 * P1307 made event-room membership "registered for the event, or its host, within the grace
 * window" and enforced it on enter_transcribe_room and create_transcribe_room. This pins the same
 * rule on the third entry point, join_transcribe_room, which /transcribe/:code uses.
 *
 * Red before the migration: the non-registrant's join succeeds.
 * Every refusal is confirmed by an admin readback — a function that raised after writing its row
 * would otherwise look identical to one that refused (epistemic.md gate 7).
 * Controls: a registrant and the host can join the event room; anyone can join a room with no event.
 *
 * Fixture pattern from e2e/integration/p1307-enter-room-event-access.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

test.describe('P1315: join_transcribe_room applies the event-access rule', () => {
  let host: TestUser;
  let attendee: TestUser; // RSVP'd
  let stranger: TestUser; // not RSVP'd, not host
  let event: TestEvent;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  async function clientFor(u: TestUser): Promise<SupabaseClient> {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    return client;
  }

  async function sessionFor(u: TestUser, tag: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `P1315EV-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, creator_name: tag, creator_profile_id: u.user.id })
      .select('id').single();
    expect(error, `fixture: clarity_sessions insert failed: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return data!.id as string;
  }

  async function seedRoom(eventId: string | null) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_rooms').insert({ code: roomCode(), event_id: eventId }).select('id').single();
    expect(error, `fixture: transcribe_rooms insert failed: ${error?.message}`).toBeNull();
    createdRoomIds.push(data!.id);
    return data!.id as string;
  }

  async function isMember(roomId: string, u: TestUser) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_room_members').select('id').eq('room_id', roomId).eq('profile_id', u.user.id);
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return (data ?? []).length > 0;
  }

  async function join(u: TestUser, roomId: string, tag: string) {
    const client = await clientFor(u);
    const sessionId = await sessionFor(u, tag);
    return client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: `P1315 ${tag}`, p_session_id: sessionId, p_consent: true,
    });
  }

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1315 Host' });
    attendee = await createTestUser({ name: 'P1315 Attendee' });
    stranger = await createTestUser({ name: 'P1315 Stranger' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 60 * 60 * 1000), { title: 'P1315 Event' });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (event?.id) await deleteTestEvent(event.id);
    for (const u of [host, attendee, stranger]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('a caller with no RSVP who is not the host cannot join an event room by id', async () => {
    const roomId = await seedRoom(event.id);
    const { error } = await join(stranger, roomId, 'stranger');
    expect(error, 'a non-RSVP non-host must be refused on the join path too').not.toBeNull();
    expect(await isMember(roomId, stranger)).toBe(false);
  });

  test("control: an RSVP'd attendee can join the event room", async () => {
    const roomId = await seedRoom(event.id);
    const { error } = await join(attendee, roomId, 'attendee');
    expect(error, `an RSVP'd attendee must be allowed: ${error?.message}`).toBeNull();
    expect(await isMember(roomId, attendee)).toBe(true);
  });

  test('control: the host can join the event room without an RSVP row', async () => {
    const roomId = await seedRoom(event.id);
    const { error } = await join(host, roomId, 'host');
    expect(error, `the host must be allowed: ${error?.message}`).toBeNull();
    expect(await isMember(roomId, host)).toBe(true);
  });

  test('control: anyone signed in can still join a room with no event', async () => {
    const roomId = await seedRoom(null);
    const { error } = await join(stranger, roomId, 'adhoc');
    expect(error, `an ad-hoc room must stay open to signed-in callers: ${error?.message}`).toBeNull();
    expect(await isMember(roomId, stranger)).toBe(true);
  });
});
