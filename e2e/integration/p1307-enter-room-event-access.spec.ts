/**
 * @file p1307-enter-room-event-access.spec.ts
 * @description P270 canary for the `enter_transcribe_room` / `create_transcribe_room`
 * changes bundled in Decision 3 + Decision 1's correction + Security Review Parent
 * verification 2 — all landing in the same migration per the spec's own Build Sequence
 * step 1 ("all together").
 *
 * Baseline read directly from 20260911151200_p1236_g_fix_enter_room_ambiguity.sql this
 * session (epistemic.md gate 3): the current room-selection query is
 *   `r.ended_at IS NULL AND r.created_at > now() - c_max_age (180 min) AND
 *    r.event_id IS NOT DISTINCT FROM p_event_id`
 * and the ON CONFLICT arm does `consent_given_at = COALESCE(m.consent_given_at, now())`,
 * never touching `capture_ended_at` (a column this migration adds) or `joined_at`.
 *
 * Three behaviors change, all asserted here:
 *   1. `p_event_id` now requires an `event_rsvps` row for that event, OR the caller is the
 *      event's host — and refuses once `event_grace_interval()` has passed.
 *   2. The `r.created_at > now() - c_max_age` filter is DROPPED — a room older than 180
 *      minutes but not ended is still the one a new arrival joins (D11's latecomer AC).
 *   3. Re-joining an ended-for-this-member-but-not-for-the-room seat clears
 *      `capture_ended_at` and does NOT reset `joined_at` (Decision 1 correction + Decision 3).
 *
 * `create_transcribe_room` gets the same RSVP-or-host + grace check (Parent verification 2
 * says "applied to create_transcribe_room too").
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

test.describe('P1307: enter_transcribe_room — event registration gate', () => {
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
      .insert({ code: `P1307EV-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, creator_name: tag, creator_profile_id: u.user.id })
      .select('id')
      .single();
    expect(error, `fixture: clarity_sessions insert failed: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return data!.id as string;
  }

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1307 Host' });
    attendee = await createTestUser({ name: 'P1307 Attendee' });
    stranger = await createTestUser({ name: 'P1307 Stranger' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 60 * 60 * 1000), { title: 'P1307 Event' });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (event?.id) await deleteTestEvent(event.id);
    for (const u of [host, attendee, stranger]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('a caller with no RSVP who is not the host is refused', async () => {
    const client = await clientFor(stranger);
    const sessionId = await sessionFor(stranger, 'stranger');
    const { data, error } = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Stranger', p_session_id: sessionId, p_consent: true,
      p_new_code: roomCode(), p_event_id: event.id,
    });
    expect(error, 'a non-RSVP non-host must be refused').not.toBeNull();
    if (!error) createdRoomIds.push((data as Array<{ room_id: string }>)[0]!.room_id);
  });

  test('an RSVP\'d attendee is allowed', async () => {
    const client = await clientFor(attendee);
    const sessionId = await sessionFor(attendee, 'attendee');
    const { data, error } = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Attendee', p_session_id: sessionId, p_consent: true,
      p_new_code: roomCode(), p_event_id: event.id,
    });
    expect(error, `an RSVP'd attendee must be allowed: ${error?.message}`).toBeNull();
    const row = ((data ?? []) as Array<{ room_id: string; room_event_id: string }>)[0];
    expect(row?.room_event_id).toBe(event.id);
    if (row) createdRoomIds.push(row.room_id);
  });

  test('the host is allowed even without an RSVP row', async () => {
    const client = await clientFor(host);
    const sessionId = await sessionFor(host, 'host');
    const { data, error } = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Host', p_session_id: sessionId, p_consent: true,
      p_new_code: roomCode(), p_event_id: event.id,
    });
    expect(error, `the host must be allowed: ${error?.message}`).toBeNull();
    const row = ((data ?? []) as Array<{ room_id: string }>)[0];
    if (row) createdRoomIds.push(row.room_id);
  });

  test('refused once the event\'s grace window has passed, even for an RSVP\'d attendee', async () => {
    const pastEvent = await createTestEvent(host.user.id, new Date(Date.now() - 24 * 60 * 60 * 1000), { title: 'P1307 Past Event' });
    try {
      await rsvpToEvent(pastEvent.id, attendee.user.id);
      const client = await clientFor(attendee);
      const sessionId = await sessionFor(attendee, 'attendee-late');
      const { data, error } = await client.rpc('enter_transcribe_room', {
        p_display_name: 'P1307 Attendee', p_session_id: sessionId, p_consent: true,
        p_new_code: roomCode(), p_event_id: pastEvent.id,
      });
      expect(error, 'past the grace window, even an RSVP\'d attendee must be refused').not.toBeNull();
      if (!error) createdRoomIds.push((data as Array<{ room_id: string }>)[0]!.room_id);
    } finally {
      await deleteTestEvent(pastEvent.id);
    }
  });

  test('create_transcribe_room applies the same RSVP-or-host + grace check (Parent verification 2)', async () => {
    const strangerClient = await clientFor(stranger);
    const sessionId = await sessionFor(stranger, 'create-stranger');
    const { data, error } = await strangerClient.rpc('create_transcribe_room', {
      p_code: roomCode(), p_display_name: 'P1307 Stranger', p_session_id: sessionId, p_event_id: event.id,
    });
    expect(error, 'create_transcribe_room must refuse a non-RSVP non-host for p_event_id too').not.toBeNull();
    if (!error) createdRoomIds.push((data as Array<{ room_id: string }>)[0]!.room_id);
  });

  test('p_event_id null (ad-hoc room) needs no RSVP check at all — unaffected control', async () => {
    const client = await clientFor(stranger);
    const sessionId = await sessionFor(stranger, 'adhoc');
    const { data, error } = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Stranger', p_session_id: sessionId, p_consent: true,
      p_new_code: roomCode(), p_event_id: null,
    });
    expect(error, 'an ad-hoc room (no event) must not require RSVP').toBeNull();
    const row = ((data ?? []) as Array<{ room_id: string }>)[0];
    if (row) createdRoomIds.push(row.room_id);
  });
});

test.describe('P1307: enter_transcribe_room — room-age filter removed (D11 latecomer)', () => {
  let host: TestUser;
  let attendee: TestUser;
  let event: TestEvent;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1307 Age Host' });
    attendee = await createTestUser({ name: 'P1307 Age Attendee' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1307 Long Event' });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (event?.id) await deleteTestEvent(event.id);
    for (const u of [host, attendee]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('a latecomer 181 minutes after room creation joins the SAME still-open room, not a new one', async () => {
    // Seed an old, unended room already attached to this event, backdated past the OLD
    // 180-minute room-selection window (which this migration must remove).
    const oldCreatedAt = new Date(Date.now() - 181 * 60_000).toISOString();
    const { data: oldRoom, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code: roomCode(), event_id: event.id, created_at: oldCreatedAt })
      .select('id')
      .single();
    expect(roomError, `seed old room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(oldRoom!.id);

    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email: attendee.email, password: TEST_PASSWORD });
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `P1307AGE-${Date.now()}`, creator_name: 'P1307 Age Attendee', creator_profile_id: attendee.user.id })
      .select('id')
      .single();
    createdSessionIds.push(session!.id);

    const { data, error } = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Age Attendee', p_session_id: session!.id, p_consent: true,
      p_new_code: roomCode(), p_event_id: event.id,
    });
    expect(error, `entering an old-but-open event room must succeed: ${error?.message}`).toBeNull();

    const row = ((data ?? []) as Array<{ room_id: string }>)[0];
    expect(
      row?.room_id,
      'a latecomer to a >180-minute-old but unended event room must join the SAME room — ' +
        'a new room_id here means the event\'s transcript is split in two, exactly what D11 forbids',
    ).toBe(oldRoom!.id);
  });
});

test.describe('P1307: enter_transcribe_room — re-join clears capture_ended_at, keeps joined_at', () => {
  let alice: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1307 Rejoin Alice' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (alice?.user?.id) await deleteTestUser(alice.user.id);
  });

  test('re-entering a room after ending capture clears capture_ended_at and preserves the original joined_at', async () => {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);

    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email: alice.email, password: TEST_PASSWORD });
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data: session1 } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `P1307RJ-1-${Date.now()}`, creator_name: 'P1307 Rejoin Alice', creator_profile_id: alice.user.id })
      .select('id')
      .single();
    createdSessionIds.push(session1!.id);

    const first = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Rejoin Alice', p_session_id: session1!.id, p_consent: true,
      p_new_code: code, p_event_id: null,
    });
    expect(first.error, `first entry must succeed: ${first.error?.message}`).toBeNull();
    const firstRow = (first.data as Array<{ member_id: string; member_joined_at: string }>)[0]!;

    // End capture (Decision 1's RPC), then re-join.
    await client.rpc('end_transcribe_room_capture', { p_room_id: room!.id });
    const midway = await supabaseAdmin
      .from('transcribe_room_members').select('capture_ended_at').eq('id', firstRow.member_id).single();
    expect(midway.data?.capture_ended_at, 'control: capture must actually be ended before re-join').not.toBeNull();

    const { data: session2 } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `P1307RJ-2-${Date.now()}`, creator_name: 'P1307 Rejoin Alice', creator_profile_id: alice.user.id })
      .select('id')
      .single();
    createdSessionIds.push(session2!.id);

    const second = await client.rpc('enter_transcribe_room', {
      p_display_name: 'P1307 Rejoin Alice', p_session_id: session2!.id, p_consent: true,
      p_new_code: roomCode(), p_event_id: null,
    });
    expect(second.error, `re-join must succeed: ${second.error?.message}`).toBeNull();
    const secondRow = (second.data as Array<{ member_id: string; member_joined_at: string }>)[0]!;

    expect(secondRow.member_id, 're-join must upsert the SAME member row, not a new one').toBe(firstRow.member_id);
    expect(secondRow.member_joined_at, 'joined_at must NOT reset — the 3-hour cap is measured from the first Continue').toBe(firstRow.member_joined_at);

    const after = await supabaseAdmin
      .from('transcribe_room_members').select('capture_ended_at').eq('id', firstRow.member_id).single();
    expect(after.data?.capture_ended_at, 're-joining a still-open room must clear capture_ended_at').toBeNull();
  });
});
