/**
 * P1314 — the event room's registration wall must be enforced by the database, not only
 * by EventRoomGate.
 *
 * The defect this pins: `get_practice_room_codes` applied NO authorization. It is
 * SECURITY DEFINER and granted to `anon`, and the anon key ships in the public bundle, so
 * a caller with no account could read any event's live practice room codes. Measured
 * 2026-09-14 before the fix: an anonymous REST call returned a live code, HTTP 200.
 *
 * Both halves are asserted deliberately. A suite that only proves the refusal cannot tell
 * a working predicate from a function that returns nothing to everybody — so the
 * registered-attendee and host arms are as load-bearing as the anon arm
 * (`.claude/rules/epistemic.md` gate 7c).
 *
 * The "room is live" assertion is the third control. Without it an empty anon result is
 * indistinguishable from "no rooms exist", which is the all-empty-probe trap in CLAUDE.md.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const ANON_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

test.describe('P1314 — practice room codes require an attendee', () => {
  let eventId: string;
  let roomId: string;
  let sessionId: string;
  let hostId: string;
  // TestUser carries the auth user under `.user`, not at the top level, and the password is
  // the shared TEST_PASSWORD constant — there is no `.password` field. Getting this wrong is
  // invisible to `npm run build`: tsconfig does not cover e2e/, so only a real run catches it.
  let attendee: TestUser;
  let outsider: TestUser;

  test.beforeAll(async () => {
    attendee = await createTestUser(generateTestEmail());
    outsider = await createTestUser(generateTestEmail());
    hostId = attendee.user.id; // reused below as a distinct host via its own event

    const { data: ev, error: evErr } = await supabaseAdmin
      .from('events')
      // events has four NOT NULL columns with no default — slug, title, description, datetime,
      // location. Omitting any of them fails the insert with 23502 in beforeAll, which surfaces
      // as every test in the file reporting 0ms rather than as a fixture error.
      .insert({
        title: 'P1314 fixture',
        slug: `p1314-${Date.now()}`,
        description: 'Fixture event for the P1314 practice-room access assertions.',
        datetime: new Date(Date.now() + 86_400_000).toISOString(),
        location: 'Test Location',
        host_id: hostId,
      })
      .select('id')
      .single();
    expect(evErr, 'event fixture must insert').toBeNull();
    eventId = ev!.id;

    const { data: sess, error: sessErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `Z${Date.now().toString().slice(-5)}`, creator_name: 'P1314 fixture' })
      .select('id')
      .single();
    expect(sessErr, 'session fixture must insert').toBeNull();
    sessionId = sess!.id;

    const { data: room, error: roomErr } = await supabaseAdmin
      .from('event_practice_rooms')
      .insert({
        creator_id: hostId,
        event_id: eventId,
        session_id: sessionId,
        status: 'waiting',
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    expect(roomErr, 'practice room fixture must insert').toBeNull();
    roomId = room!.id;
  });

  test.afterAll(async () => {
    // Guarded: when beforeAll fails, these are undefined and an unguarded delete reports a
    // TypeError in teardown that buries the real cause.
    if (roomId) await supabaseAdmin.from('event_practice_rooms').delete().eq('id', roomId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    if (eventId) {
      await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId);
      await supabaseAdmin.from('events').delete().eq('id', eventId);
    }
  });

  test('CONTROL: the room exists and is live — so an empty result is a refusal, not an absence', async () => {
    const { data } = await supabaseAdmin
      .from('event_practice_rooms')
      .select('id')
      .eq('event_id', eventId)
      .in('status', ['waiting', 'active'])
      .gt('expires_at', new Date().toISOString());
    expect(data, 'fixture room must be live for the refusal assertions to mean anything').toHaveLength(1);
  });

  test('an anonymous caller receives NO code — the defect this spec closes', async () => {
    const anon = createClient(ANON_URL, ANON_KEY);
    const { data, error } = await anon.rpc('get_practice_room_codes', { p_event_id: eventId });
    expect(error, 'must be an empty result, never a distinguishable error (P1057)').toBeNull();
    expect(data, 'a caller with no account must receive no room code').toHaveLength(0);
  });

  test('a signed-in NON-registered caller receives no code', async () => {
    const c = createClient(ANON_URL, ANON_KEY);
    await c.auth.signInWithPassword({ email: outsider.email, password: TEST_PASSWORD });
    const { data } = await c.rpc('get_practice_room_codes', { p_event_id: eventId });
    expect(data, 'signing in is not registering').toHaveLength(0);
  });

  test('a REGISTERED attendee still receives the code (gate 7c — the false-positive half)', async () => {
    await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: outsider.user.id });
    const c = createClient(ANON_URL, ANON_KEY);
    await c.auth.signInWithPassword({ email: outsider.email, password: TEST_PASSWORD });
    const { data } = await c.rpc('get_practice_room_codes', { p_event_id: eventId });
    expect(data, 'the wall must not lock out the people it exists to admit').toHaveLength(1);
    expect(data![0].room_id).toBe(roomId);
  });

  test('the event HOST receives the code without an RSVP', async () => {
    const c = createClient(ANON_URL, ANON_KEY);
    await c.auth.signInWithPassword({ email: attendee.email, password: TEST_PASSWORD });
    const { data } = await c.rpc('get_practice_room_codes', { p_event_id: eventId });
    expect(data, 'a host must reach their own event room').toHaveLength(1);
  });

  test('the anon GRANT is retained — refusal is an empty list, not a 401 oracle', async () => {
    const anon = createClient(ANON_URL, ANON_KEY);
    const { error } = await anon.rpc('get_practice_room_codes', { p_event_id: eventId });
    expect(error, 'revoking the grant would turn the refusal into a distinguishable error').toBeNull();
  });
});
