/**
 * @file p1114-room-rpcs.spec.ts
 * @description Authorization and integrity canaries for the four P1114 RPCs
 * (`join_event_room`, `set_room_opt_in`, `set_room_readiness`, `get_my_room_status`
 * — supabase/migrations/20260819170000_p1114_event_room_rpcs.sql). p1114-db-schema.spec.ts
 * covers the direct-table-access surface these RPCs exist to replace; this file covers
 * what the RPCs themselves must and must not allow.
 *
 * REVISED 2026-08-20 (spec Solution, "REVISED (2)" block — supersedes Architecture
 * Decision 1 in full): the founder retired the walk-in, so this file no longer tests
 * an anonymous join or a `client_secret`-gated mutation. Ownership is auth.uid() =
 * profile_id, the pattern used everywhere else in this codebase — every mutating call
 * below signs in as a real test user via `signInAs` rather than carrying a secret.
 *
 * THE SINGLE MOST IMPORTANT TEST IN THIS FILE, per the spec's own Security Review:
 * "Cascade counter ... must be computed inside that same SECURITY DEFINER
 * function, at the moment of insert ... never accepted as a function/RPC
 * argument ... This is the single most important integrity requirement in the
 * spec." See "cascade_count is server-computed" below.
 *
 * Every ownership/access assertion re-reads state through the ADMIN client, never
 * asserts on `error` alone — same discipline as p1053-claim-joiner-seat.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember, readRoomMember, readRoomAnswers, deleteRoomMembers, type TestRoomMember } from '../helpers/test-event-room';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

// P494's EVENT_GRACE_HOURS (src/app/data/events-service-real.ts:16) is 5.
// Hardcoded here rather than imported — e2e/ has no `@/` path-alias resolution.
// The unit canary in src/tests/p1114-grace-hours-sync.test.ts is what actually
// pins the TS constant's value; this file only needs a boundary PAST it.
const EVENT_GRACE_HOURS = 5;

function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('P1114: join_event_room / set_room_opt_in / set_room_readiness / get_my_room_status', () => {
  let host: TestUser;
  let joiner: TestUser;
  let outsider: TestUser; // signed in, but never touches the subject's row
  let upcomingEvent: TestEvent;
  let frozenEvent: TestEvent; // datetime far enough in the past to be past EVENT_GRACE_HOURS
  const memberIds: string[] = [];
  const eventIds: string[] = [];

  const signInCache = new Map<string, ReturnType<typeof makeUserClient>>();
  async function signInAs(user: TestUser) {
    const cached = signInCache.get(user.user.id);
    if (cached) return cached;
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed for ${user.email}: ${error?.message}`).toBeNull();
    const client = makeUserClient(data!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    signInCache.set(user.user.id, client);
    return client;
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 RPC Host' });
    joiner = await createTestUser({ email: generateTestEmail(), name: 'P1114 RPC Joiner' });
    outsider = await createTestUser({ email: generateTestEmail(), name: 'P1114 RPC Outsider' });
    upcomingEvent = await createTestEvent(host.user.id, new Date());
    frozenEvent = await createTestEvent(host.user.id, new Date(Date.now() - (EVENT_GRACE_HOURS + 2) * 60 * 60 * 1000));
    eventIds.push(upcomingEvent.id, frozenEvent.id);
  });

  test.afterAll(async () => {
    await deleteRoomMembers(memberIds);
    for (const id of eventIds) await deleteTestEvent(id);
    await deleteTestUser(host.user.id);
    await deleteTestUser(joiner.user.id);
    await deleteTestUser(outsider.user.id);
  });

  // ─── Schema existence + anon rejection ──────────────────────────────

  test('all four RPCs exist under their new (no-secret) signatures', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [
      ['join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'schema check' }],
      ['set_room_opt_in', { p_member_id: '00000000-0000-4000-8000-000000000000', p_opted_in: true }],
      ['set_room_readiness', { p_member_id: '00000000-0000-4000-8000-000000000000', p_value: 5 }],
      ['get_my_room_status', { p_event_id: upcomingEvent.id }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await supabaseAdmin.rpc(fn, args);
      expect(error?.code, `${fn} is missing, or its signature doesn't match the expected args. Run: supabase db push. Error: ${error?.message}`).not.toBe('PGRST202');
    }
  });

  test('an unauthenticated (anon) caller is refused on all four RPCs — the walk-in door is gone', async () => {
    const anon = makeAnonClient();
    const seeded = await seedRoomMember(upcomingEvent.id, { optedIn: null });
    memberIds.push(seeded.id);

    const join = await anon.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'Anon Attempt' });
    expect(join.error, 'join_event_room must refuse an anonymous caller — revision 2 retired the walk-in.').not.toBeNull();

    const optIn = await anon.rpc('set_room_opt_in', { p_member_id: seeded.id, p_opted_in: true });
    expect(optIn.error, 'set_room_opt_in must refuse an anonymous caller.').not.toBeNull();

    const readiness = await anon.rpc('set_room_readiness', { p_member_id: seeded.id, p_value: 5 });
    expect(readiness.error, 'set_room_readiness must refuse an anonymous caller.').not.toBeNull();

    const status = await anon.rpc('get_my_room_status', { p_event_id: upcomingEvent.id });
    expect(status.error, 'get_my_room_status must refuse an anonymous caller.').not.toBeNull();

    // No row must have been created by the refused join.
    const after = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', upcomingEvent.id).eq('display_name', 'Anon Attempt');
    expect(after.data?.length ?? 0, 'no member row should exist from the refused anonymous join').toBe(0);
  });

  // ─── join_event_room ───────────────────────────────────────────────

  test("a signed-in caller's room membership binds to their own auth.uid(), with no client-controllable profile_id parameter to spoof it", async () => {
    const client = await signInAs(joiner);
    const { data, error } = await client.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: joiner.name });
    expect(error, `signed-in join failed: ${error?.message}`).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id);
    const after = row?.id ? await readRoomMember(row.id) : null;
    expect(after?.profile_id, 'join_event_room must derive profile_id from auth.uid(), never trust a client argument').toBe(joiner.user.id);
    expect(after?.display_name).toBe(joiner.name);

    // No p_profile_id parameter should exist at all — proven by a call that
    // supplies one; PostgREST rejects unknown parameters rather than silently
    // ignoring them.
    const spoofAttempt = await client.rpc('join_event_room', {
      p_event_id: upcomingEvent.id,
      p_display_name: 'Spoof Attempt',
      p_profile_id: host.user.id,
    } as never);
    expect(
      spoofAttempt.error,
      'join_event_room accepted an unknown p_profile_id parameter without erroring — if this ' +
        'silently succeeded, a client-supplied profile_id argument exists and could be used to ' +
        'impersonate another person\'s room membership.',
    ).not.toBeNull();
  });

  test('rejoining (a second device) upserts onto the SAME row rather than creating a duplicate', async () => {
    const client = await signInAs(joiner);
    const first = await client.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: joiner.name });
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    if (firstRow?.id) memberIds.push(firstRow.id);

    const second = await client.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: `${joiner.name} (device 2)` });
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    expect(second.error, `rejoin failed: ${second.error?.message}`).toBeNull();
    expect(secondRow?.id, 'a rejoin must upsert onto the same row id, not create a new one').toBe(firstRow?.id);
    expect(secondRow?.display_name, 'a rejoin must update display_name to the latest value').toBe(`${joiner.name} (device 2)`);
  });

  test('joining the room creates NO event_rsvps row — room presence and RSVP are separate tables (spec Solution §1, Non-Goals)', async () => {
    const client = await signInAs(outsider);
    const before = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', upcomingEvent.id);
    const { data, error } = await client.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'RSVP Isolation Check' });
    expect(error, `join failed: ${error?.message}`).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id);

    const after = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', upcomingEvent.id);
    expect(
      (after.data?.length ?? 0),
      'join_event_room must never write event_rsvps — that table is untouched by this spec.',
    ).toBe(before.data?.length ?? 0);
  });

  test("room join is NOT blocked by max_attendees, even when the event's RSVP capacity is already reached (Non-Goal: no capacity check on the room)", async () => {
    const cappedEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(cappedEvent.id);
    await supabaseAdmin.from('events').update({ max_attendees: 1 }).eq('id', cappedEvent.id);
    await rsvpToEvent(cappedEvent.id, joiner.user.id); // fills the one RSVP slot

    const client = await signInAs(outsider);
    const { data, error } = await client.rpc('join_event_room', { p_event_id: cappedEvent.id, p_display_name: 'Joined Anyway' });
    expect(
      error,
      `room join was rejected on an event at max_attendees. Non-Goal: "Do NOT add a capacity ` +
        `check to the room" — max_attendees governs RSVP only. Error: ${error?.message}`,
    ).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id);
  });

  test('join_event_room is refused past the freeze boundary (EVENT_GRACE_HOURS past event start)', async () => {
    const client = await signInAs(outsider);
    const { data, error } = await client.rpc('join_event_room', { p_event_id: frozenEvent.id, p_display_name: 'Late Arrival' });
    expect(error, 'a join attempt on a frozen event must be rejected server-side, not just hidden by the UI').not.toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id); // defensive — should never execute if the RPC correctly refused
    const check = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', frozenEvent.id).eq('display_name', 'Late Arrival');
    expect(check.data?.length ?? 0, 'no member row should have been created for the refused join').toBe(0);
  });

  // ─── set_room_opt_in: auth.uid()-based authorization ────────────────

  test('set_room_opt_in succeeds for the row\'s own signed-in owner and rejects a different signed-in caller, leaving state untouched on rejection', async () => {
    const client = await signInAs(joiner);
    const joined = await client.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: joiner.name });
    const memberId = (Array.isArray(joined.data) ? joined.data[0] : joined.data)?.id;
    expect(memberId).toBeTruthy();
    memberIds.push(memberId);

    const outsiderClient = await signInAs(outsider);
    const wrong = await outsiderClient.rpc('set_room_opt_in', { p_member_id: memberId, p_opted_in: true });
    expect(wrong.error, 'set_room_opt_in must reject a caller who does not own this row').not.toBeNull();
    const afterWrong = await readRoomMember(memberId);
    expect(afterWrong?.opted_in, 'state must be unchanged after a rejected cross-owner attempt').toBeNull();

    const right = await client.rpc('set_room_opt_in', { p_member_id: memberId, p_opted_in: true });
    expect(right.error, `set_room_opt_in must succeed for the row's own owner: ${right.error?.message}`).toBeNull();
    const afterRight = await readRoomMember(memberId);
    expect(afterRight?.opted_in).toBe(true);
  });

  test("one member's session cannot mutate a DIFFERENT member's row", async () => {
    // ISOLATED event — `joiner` and `outsider` both already hold rows on the shared
    // `upcomingEvent` from other tests in this file, and the partial unique index
    // (event_id, profile_id) allows only one row per person per event.
    const crossEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(crossEvent.id);
    const memberA = await seedRoomMember(crossEvent.id, { optedIn: null, profileId: joiner.user.id });
    const memberB = await seedRoomMember(crossEvent.id, { optedIn: null, profileId: outsider.user.id });
    memberIds.push(memberA.id, memberB.id);

    const clientA = await signInAs(joiner);
    const cross = await clientA.rpc('set_room_opt_in', { p_member_id: memberB.id, p_opted_in: true });
    expect(cross.error, "member A's session must not authorize a mutation of member B's row").not.toBeNull();
    const after = await readRoomMember(memberB.id);
    expect(after?.opted_in, "member B's opt-in must be unchanged").toBeNull();
  });

  test('set_room_opt_in is refused past the freeze boundary on an already-existing member', async () => {
    const member = await seedRoomMember(frozenEvent.id, { optedIn: null, profileId: joiner.user.id });
    memberIds.push(member.id);
    const client = await signInAs(joiner);
    const { error } = await client.rpc('set_room_opt_in', { p_member_id: member.id, p_opted_in: true });
    expect(error, 'an answer change on a frozen event must be rejected server-side').not.toBeNull();
    const after = await readRoomMember(member.id);
    expect(after?.opted_in).toBeNull();
  });

  // ─── cascade_count: THE single most important integrity requirement ────

  test('cascade_count is server-computed as the count of already-opted-in members BEFORE this answer, and cannot be supplied by the client', async () => {
    // ISOLATED event, not the shared `upcomingEvent`. cascade_count is an absolute
    // count over the event, so any other test in this file that opts a member into the
    // shared fixture inflates it.
    const cascadeEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(cascadeEvent.id);

    const already: TestRoomMember[] = [];
    for (let i = 0; i < 3; i++) {
      already.push(await seedRoomMember(cascadeEvent.id, { optedIn: true, displayName: `P1114 Cascade Baseline ${i}` }));
    }
    memberIds.push(...already.map((m) => m.id));

    const subject = await seedRoomMember(cascadeEvent.id, { optedIn: null, profileId: joiner.user.id });
    memberIds.push(subject.id);
    const client = await signInAs(joiner);

    // Attempt to spoof the counter via an extra parameter the RPC signature
    // (per the migration: p_member_id, p_opted_in only) does not define.
    const spoof = await client.rpc('set_room_opt_in', {
      p_member_id: subject.id,
      p_opted_in: true,
      p_cascade_count: 999,
    } as never);
    if (spoof.error) {
      const real = await client.rpc('set_room_opt_in', { p_member_id: subject.id, p_opted_in: true });
      expect(real.error, `real (unspoofed) call must succeed: ${real.error?.message}`).toBeNull();
    }

    const answers = await readRoomAnswers(subject.id);
    expect(answers.length, 'exactly one answer row must exist for this member').toBe(1);
    expect(
      answers[0].cascade_count,
      `cascade_count must equal 3 (the number already opted in BEFORE this answer), computed ` +
        `server-side. If a client-supplied p_cascade_count of 999 leaked through, the ` +
        `cascade measurement — the spec's own "single most important integrity requirement" ` +
        `— is worthless.`,
    ).toBe(3);
  });

  test('the answer history is retained across multiple changes, and a PRIOR answer is still queryable after a later one supersedes it', async () => {
    // ISOLATED event — `joiner` already holds a row on `upcomingEvent` from other
    // tests, and the partial unique index allows only one row per person per event.
    const historyEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(historyEvent.id);
    const member = await seedRoomMember(historyEvent.id, { optedIn: null, profileId: joiner.user.id });
    memberIds.push(member.id);
    const client = await signInAs(joiner);

    const optIn1 = await client.rpc('set_room_opt_in', { p_member_id: member.id, p_opted_in: true });
    expect(optIn1.error, `first opt-in failed: ${optIn1.error?.message}`).toBeNull();
    const optOut = await client.rpc('set_room_opt_in', { p_member_id: member.id, p_opted_in: false });
    expect(optOut.error, `opt-out failed: ${optOut.error?.message}`).toBeNull();
    const optIn2 = await client.rpc('set_room_opt_in', { p_member_id: member.id, p_opted_in: true });
    expect(optIn2.error, `second opt-in failed: ${optIn2.error?.message}`).toBeNull();

    const current = await readRoomMember(member.id);
    expect(current?.opted_in, 'current state must reflect the LATEST answer').toBe(true);

    const history = await readRoomAnswers(member.id);
    expect(history.length, 'all three answers must be retained, not overwritten (spec: "full history is kept")').toBe(3);
    expect(history.map((a) => a.opted_in)).toEqual([true, false, true]);
  });

  // ─── set_room_readiness ────────────────────────────────────────────

  test("set_room_readiness accepts 0-10 (matching ready_submissions' bound) and rejects out-of-range values, gated by ownership", async () => {
    // ISOLATED event — see the answer-history test above for why.
    const readinessEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(readinessEvent.id);
    const member = await seedRoomMember(readinessEvent.id, { profileId: joiner.user.id });
    memberIds.push(member.id);
    const client = await signInAs(joiner);

    const inRange = await client.rpc('set_room_readiness', { p_member_id: member.id, p_value: 7 });
    expect(inRange.error, `in-range readiness must succeed: ${inRange.error?.message}`).toBeNull();
    expect((await readRoomMember(member.id))?.readiness_value).toBe(7);

    const tooHigh = await client.rpc('set_room_readiness', { p_member_id: member.id, p_value: 11 });
    expect(tooHigh.error, 'a readiness value above 10 must be rejected').not.toBeNull();

    const outsiderClient = await signInAs(outsider);
    const wrongOwner = await outsiderClient.rpc('set_room_readiness', { p_member_id: member.id, p_value: 3 });
    expect(wrongOwner.error, 'a non-owning caller must not be able to set readiness').not.toBeNull();
    expect((await readRoomMember(member.id))?.readiness_value, 'readiness must be unchanged after the wrong-owner and out-of-range attempts').toBe(7);
  });

  test("room readiness has no expiry — a value set long ago is still visible on the roster read, unlike ready_submissions' 10-minute window", async () => {
    // A room member joined 20 minutes ago with readiness already set — well past
    // ready_submissions' 10-minute RLS cutoff (20260816120000_p1083_ready_submissions.sql).
    const member = await seedRoomMember(upcomingEvent.id, {
      optedIn: true, // must be opted-in to pass the roster's own SELECT policy at all
      readinessValue: 4,
      joinedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    memberIds.push(member.id);

    const anon = makeAnonClient();
    const { data, error } = await anon.from('event_room_members').select('id, readiness_value').eq('id', member.id);
    expect(error, `roster read errored: ${error?.message}`).toBeNull();
    expect(
      data?.[0]?.readiness_value,
      'a room readiness value must remain visible past 10 minutes — the room has no expiry ' +
        '(spec §7: "no expiry ... a room is bounded and has an evening"), unlike the general ' +
        '/ready page.',
    ).toBe(4);
  });

  test('set_room_readiness never writes to ready_submissions — the two readiness stores are fully separate (Non-Goal)', async () => {
    // ISOLATED event — see the answer-history test above for why.
    const noCrossEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(noCrossEvent.id);
    const member = await seedRoomMember(noCrossEvent.id, { profileId: joiner.user.id });
    memberIds.push(member.id);
    const before = await supabaseAdmin.from('ready_submissions').select('id', { count: 'exact', head: true });

    const client = await signInAs(joiner);
    const { error } = await client.rpc('set_room_readiness', { p_member_id: member.id, p_value: 6 });
    expect(error, `readiness set failed: ${error?.message}`).toBeNull();

    const after = await supabaseAdmin.from('ready_submissions').select('id', { count: 'exact', head: true });
    expect(after.count, 'set_room_readiness must not write a ready_submissions row').toBe(before.count);
  });

  // ─── get_my_room_status: the self-read that bypasses the roster policy ───

  test("get_my_room_status returns the caller's OWN true state — including opted_in = false — keyed by event id and their session, and returns nothing for an event they never joined", async () => {
    // ISOLATED event — see the answer-history test above for why.
    const statusEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(statusEvent.id);
    const member = await seedRoomMember(statusEvent.id, { optedIn: false, profileId: joiner.user.id });
    memberIds.push(member.id);
    const client = await signInAs(joiner);

    const right = await client.rpc('get_my_room_status', { p_event_id: statusEvent.id });
    expect(right.error, `self-read must succeed: ${right.error?.message}`).toBeNull();
    const row = Array.isArray(right.data) ? right.data[0] : right.data;
    expect(
      row?.opted_in,
      'get_my_room_status must return the caller\'s TRUE current state (including an opt-out) ' +
        '— the roster\'s public SELECT policy would hide this same row, and the UX Notes ' +
        'require "the participant\'s own device shows their current state."',
    ).toBe(false);

    const otherEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(otherEvent.id);
    const neverJoined = await client.rpc('get_my_room_status', { p_event_id: otherEvent.id });
    expect(neverJoined.error, 'a read for an event the caller never joined must not error').toBeNull();
    expect(
      Array.isArray(neverJoined.data) ? neverJoined.data.length : 0,
      'get_my_room_status must return no row for an event the caller never joined',
    ).toBe(0);
  });
});
