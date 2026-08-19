/**
 * @file p1114-room-rpcs.spec.ts
 * @description Authorization and integrity canaries for the four P1114 RPCs
 * (`join_event_room`, `set_room_opt_in`, `set_room_readiness`, `get_my_room_status`
 * — Architecture Decision 1 of features/p1114_event_room_presence_and_cmp_opt_in.md).
 * p1114-db-schema.spec.ts covers the direct-table-access surface these RPCs exist
 * to replace; this file covers what the RPCs themselves must and must not allow.
 *
 * THE SINGLE MOST IMPORTANT TEST IN THIS FILE, per the spec's own Security Review:
 * "Cascade counter ... must be computed inside that same SECURITY DEFINER
 * function, at the moment of insert ... never accepted as a function/RPC
 * argument ... This is the single most important integrity requirement in the
 * spec." See "cascade_count is server-computed" below.
 *
 * Every ownership/access assertion re-reads state through the ADMIN client (or a
 * self-read RPC call), never asserts on `error` alone — same discipline as
 * p1053-claim-joiner-seat.spec.ts.
 *
 * PRE-IMPLEMENTATION STATE: none of the four RPCs exist yet (authored at
 * /generate-tests, before /dev). Every RPC call below fails with PGRST202
 * ("Could not find the function") until the migration lands. That is the
 * expected pre-implementation state, not a bug in this file — mirrors GROUP B in
 * p1053-claim-joiner-seat.spec.ts.
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
// Hardcoded here rather than imported — e2e/ has no `@/` path-alias resolution
// (grep confirms zero existing e2e imports use it) — same duplication-with-a-
// cross-reference-comment idiom Architecture Decision 4 accepts for the SQL side.
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
    upcomingEvent = await createTestEvent(host.user.id, new Date());
    frozenEvent = await createTestEvent(host.user.id, new Date(Date.now() - (EVENT_GRACE_HOURS + 2) * 60 * 60 * 1000));
    eventIds.push(upcomingEvent.id, frozenEvent.id);
  });

  test.afterAll(async () => {
    await deleteRoomMembers(memberIds);
    for (const id of eventIds) await deleteTestEvent(id);
    await deleteTestUser(host.user.id);
    await deleteTestUser(joiner.user.id);
  });

  // ─── Schema existence ──────────────────────────────────────────────

  test('all four RPCs exist and are callable (schema check)', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [
      ['join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'schema check' }],
      ['set_room_opt_in', { p_member_id: '00000000-0000-4000-8000-000000000000', p_secret: '00000000-0000-4000-8000-000000000000', p_opted_in: true }],
      ['set_room_readiness', { p_member_id: '00000000-0000-4000-8000-000000000000', p_secret: '00000000-0000-4000-8000-000000000000', p_value: 5 }],
      ['get_my_room_status', { p_member_id: '00000000-0000-4000-8000-000000000000', p_secret: '00000000-0000-4000-8000-000000000000' }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await supabaseAdmin.rpc(fn, args);
      expect(error?.code, `${fn} is missing, or its signature doesn't match the expected args. Run: supabase db push. Error: ${error?.message}`).not.toBe('PGRST202');
    }
  });

  // ─── join_event_room ───────────────────────────────────────────────

  test('anon guest can join with a name only — no account, no email, no profile row created', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'Guest Practitioner' });
    expect(error, `guest join must succeed: ${error?.message}`).toBeNull();
    const memberId = (data as { id?: string } | { id: string }[] | null)?.[0 as unknown as keyof typeof data] ?? (data as { id?: string })?.id;
    expect(memberId, 'join_event_room must return a member id (needed for localStorage persistence, Decision 8)').toBeTruthy();
    if (typeof memberId === 'string') memberIds.push(memberId);

    const after = memberId ? await readRoomMember(memberId as string) : null;
    expect(after?.display_name).toBe('Guest Practitioner');
    expect(after?.profile_id, 'a guest join must never create a profile linkage').toBeNull();
  });

  test('join_event_room returns a client_secret usable for later self-mutation', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'Secret Return Check' });
    expect(error, `join failed: ${error?.message}`).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.id, 'join_event_room must return the new member id').toBeTruthy();
    expect(row?.client_secret, 'join_event_room must RETURN the minted secret (RETURNING, per Decision 1) — otherwise the browser has no way to ever mutate its own row again').toBeTruthy();
    if (row?.id) memberIds.push(row.id);
  });

  test('a logged-in caller\'s room membership binds to their own auth.uid(), with no client-controllable profile_id parameter to spoof it', async () => {
    const client = await signInAs(joiner);
    const { data, error } = await client.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: joiner.name });
    expect(error, `logged-in join failed: ${error?.message}`).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id);
    const after = row?.id ? await readRoomMember(row.id) : null;
    expect(after?.profile_id, 'join_event_room must derive profile_id from auth.uid(), never trust a client argument').toBe(joiner.user.id);

    // No p_profile_id parameter should exist at all — proven by a call that
    // supplies one; PostgREST rejects unknown parameters with PGRST202/schema
    // mismatch rather than silently ignoring them.
    const spoofAttempt = await client.rpc('join_event_room', {
      p_event_id: upcomingEvent.id,
      p_display_name: 'Spoof Attempt',
      p_profile_id: host.user.id,
    } as never);
    expect(
      spoofAttempt.error,
      'join_event_room accepted an unknown p_profile_id parameter without erroring — if this ' +
        'silently succeeded, it means a client-supplied profile_id argument exists and could ' +
        'be used to impersonate another person\'s room membership.',
    ).not.toBeNull();
  });

  test('joining the room creates NO event_rsvps row — room presence and RSVP are separate tables (spec Solution §1, Non-Goals)', async () => {
    const anon = makeAnonClient();
    const before = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', upcomingEvent.id);
    const { data, error } = await anon.rpc('join_event_room', { p_event_id: upcomingEvent.id, p_display_name: 'RSVP Isolation Check' });
    expect(error, `join failed: ${error?.message}`).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id);

    const after = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', upcomingEvent.id);
    expect(
      (after.data?.length ?? 0),
      'join_event_room must never write event_rsvps — that table is untouched by this spec.',
    ).toBe(before.data?.length ?? 0);
  });

  test('room join is NOT blocked by max_attendees, even when the event\'s RSVP capacity is already reached (Non-Goal: no capacity check on the room)', async () => {
    const cappedEvent = await createTestEvent(host.user.id, new Date());
    eventIds.push(cappedEvent.id);
    await supabaseAdmin.from('events').update({ max_attendees: 1 }).eq('id', cappedEvent.id);
    await rsvpToEvent(cappedEvent.id, joiner.user.id); // fills the one RSVP slot

    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('join_event_room', { p_event_id: cappedEvent.id, p_display_name: 'Walked In Anyway' });
    expect(
      error,
      `room join was rejected on an event at max_attendees. Non-Goal: "Do NOT add a capacity ` +
        `check to the room" — max_attendees governs RSVP only. Error: ${error?.message}`,
    ).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id);
  });

  test('join_event_room is refused past the freeze boundary (EVENT_GRACE_HOURS past event start)', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('join_event_room', { p_event_id: frozenEvent.id, p_display_name: 'Late Arrival' });
    expect(error, 'a join attempt on a frozen event must be rejected server-side, not just hidden by the UI').not.toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) memberIds.push(row.id); // defensive — should never execute if the RPC correctly refused
    const check = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', frozenEvent.id).eq('display_name', 'Late Arrival');
    expect(check.data?.length ?? 0, 'no member row should have been created for the refused join').toBe(0);
  });

  // ─── set_room_opt_in: secret-based authorization ──────────────────

  test('set_room_opt_in succeeds with the correct secret and rejects a wrong one, leaving state untouched on rejection', async () => {
    const member = await seedRoomMember(upcomingEvent.id, { optedIn: null, clientSecret: '22222222-2222-4222-8222-222222222222' });
    memberIds.push(member.id);
    const anon = makeAnonClient();

    const wrong = await anon.rpc('set_room_opt_in', { p_member_id: member.id, p_secret: '99999999-9999-4999-8999-999999999999', p_opted_in: true });
    expect(wrong.error, 'set_room_opt_in must reject a wrong secret').not.toBeNull();
    const afterWrong = await readRoomMember(member.id);
    expect(afterWrong?.opted_in, 'state must be unchanged after a rejected wrong-secret attempt').toBeNull();

    const right = await anon.rpc('set_room_opt_in', { p_member_id: member.id, p_secret: member.client_secret, p_opted_in: true });
    expect(right.error, `set_room_opt_in must succeed with the correct secret: ${right.error?.message}`).toBeNull();
    const afterRight = await readRoomMember(member.id);
    expect(afterRight?.opted_in).toBe(true);
  });

  test('one member\'s secret cannot mutate a DIFFERENT member\'s row', async () => {
    const memberA = await seedRoomMember(upcomingEvent.id, { optedIn: null, clientSecret: '33333333-3333-4333-8333-333333333333' });
    const memberB = await seedRoomMember(upcomingEvent.id, { optedIn: null, clientSecret: '44444444-4444-4444-8444-444444444444' });
    memberIds.push(memberA.id, memberB.id);
    const anon = makeAnonClient();

    const cross = await anon.rpc('set_room_opt_in', { p_member_id: memberB.id, p_secret: memberA.client_secret, p_opted_in: true });
    expect(cross.error, "member A's secret must not authorize a mutation of member B's row").not.toBeNull();
    const after = await readRoomMember(memberB.id);
    expect(after?.opted_in, "member B's opt-in must be unchanged").toBeNull();
  });

  test('set_room_opt_in is refused past the freeze boundary on an already-existing member', async () => {
    const member = await seedRoomMember(frozenEvent.id, { optedIn: null, clientSecret: '55555555-5555-4555-8555-555555555555' });
    memberIds.push(member.id);
    const anon = makeAnonClient();
    const { error } = await anon.rpc('set_room_opt_in', { p_member_id: member.id, p_secret: member.client_secret, p_opted_in: true });
    expect(error, 'an answer change on a frozen event must be rejected server-side').not.toBeNull();
    const after = await readRoomMember(member.id);
    expect(after?.opted_in).toBeNull();
  });

  // ─── cascade_count: THE single most important integrity requirement ────

  test('cascade_count is server-computed as the count of already-opted-in members BEFORE this answer, and cannot be supplied by the client', async () => {
    // Seed 3 members already opted in — the pre-existing cascade this new
    // answer must be measured against.
    const already: TestRoomMember[] = [];
    for (let i = 0; i < 3; i++) {
      already.push(await seedRoomMember(upcomingEvent.id, { optedIn: true, displayName: `P1114 Cascade Baseline ${i}` }));
    }
    memberIds.push(...already.map((m) => m.id));

    const subject = await seedRoomMember(upcomingEvent.id, { optedIn: null, clientSecret: '66666666-6666-4666-8666-666666666666' });
    memberIds.push(subject.id);
    const anon = makeAnonClient();

    // Attempt to spoof the counter via an extra parameter the RPC signature
    // (per Solution/Decision 6: p_member_id, p_secret, p_opted_in only) does
    // not define. If this SUCCEEDS without erroring, a client-controllable
    // cascade argument exists.
    const spoof = await anon.rpc('set_room_opt_in', {
      p_member_id: subject.id,
      p_secret: subject.client_secret,
      p_opted_in: true,
      p_cascade_count: 999,
    } as never);
    // Either the extra param is rejected outright (preferred — proves no such
    // parameter exists), or it's silently accepted by PostgREST and the RPC
    // itself must have ignored it — checked below via the persisted value
    // regardless of which branch this took.
    if (spoof.error) {
      // Extra-parameter call rejected before ever running — the real call
      // below is what actually opts the subject in.
      const real = await anon.rpc('set_room_opt_in', { p_member_id: subject.id, p_secret: subject.client_secret, p_opted_in: true });
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
    const member = await seedRoomMember(upcomingEvent.id, { optedIn: null, clientSecret: '77777777-7777-4777-8777-777777777777' });
    memberIds.push(member.id);
    const anon = makeAnonClient();

    const optIn1 = await anon.rpc('set_room_opt_in', { p_member_id: member.id, p_secret: member.client_secret, p_opted_in: true });
    expect(optIn1.error, `first opt-in failed: ${optIn1.error?.message}`).toBeNull();
    const optOut = await anon.rpc('set_room_opt_in', { p_member_id: member.id, p_secret: member.client_secret, p_opted_in: false });
    expect(optOut.error, `opt-out failed: ${optOut.error?.message}`).toBeNull();
    const optIn2 = await anon.rpc('set_room_opt_in', { p_member_id: member.id, p_secret: member.client_secret, p_opted_in: true });
    expect(optIn2.error, `second opt-in failed: ${optIn2.error?.message}`).toBeNull();

    const current = await readRoomMember(member.id);
    expect(current?.opted_in, 'current state must reflect the LATEST answer').toBe(true);

    const history = await readRoomAnswers(member.id);
    expect(history.length, 'all three answers must be retained, not overwritten (spec: "full history is kept")').toBe(3);
    expect(history.map((a) => a.opted_in)).toEqual([true, false, true]);
  });

  // ─── set_room_readiness ────────────────────────────────────────────

  test('set_room_readiness accepts 0-10 (matching ready_submissions\' bound) and rejects out-of-range values, gated by the secret', async () => {
    const member = await seedRoomMember(upcomingEvent.id, { clientSecret: '88888888-8888-4888-8888-888888888888' });
    memberIds.push(member.id);
    const anon = makeAnonClient();

    const inRange = await anon.rpc('set_room_readiness', { p_member_id: member.id, p_secret: member.client_secret, p_value: 7 });
    expect(inRange.error, `in-range readiness must succeed: ${inRange.error?.message}`).toBeNull();
    expect((await readRoomMember(member.id))?.readiness_value).toBe(7);

    const tooHigh = await anon.rpc('set_room_readiness', { p_member_id: member.id, p_secret: member.client_secret, p_value: 11 });
    expect(tooHigh.error, 'a readiness value above 10 must be rejected').not.toBeNull();

    const wrongSecret = await anon.rpc('set_room_readiness', { p_member_id: member.id, p_secret: '00000000-0000-4000-8000-000000000001', p_value: 3 });
    expect(wrongSecret.error, 'a wrong secret must not be able to set readiness').not.toBeNull();
    expect((await readRoomMember(member.id))?.readiness_value, 'readiness must be unchanged after the wrong-secret and out-of-range attempts').toBe(7);
  });

  test('room readiness has no expiry — a value set long ago is still visible on the roster read, unlike ready_submissions\' 10-minute window', async () => {
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
    const member = await seedRoomMember(upcomingEvent.id, { clientSecret: '00000000-0000-4000-9000-000000000001' });
    memberIds.push(member.id);
    const before = await supabaseAdmin.from('ready_submissions').select('id', { count: 'exact', head: true });

    const anon = makeAnonClient();
    const { error } = await anon.rpc('set_room_readiness', { p_member_id: member.id, p_secret: member.client_secret, p_value: 6 });
    expect(error, `readiness set failed: ${error?.message}`).toBeNull();

    const after = await supabaseAdmin.from('ready_submissions').select('id', { count: 'exact', head: true });
    expect(after.count, 'set_room_readiness must not write a ready_submissions row').toBe(before.count);
  });

  // ─── get_my_room_status: the self-read that bypasses the roster policy ───

  test('get_my_room_status returns the caller\'s OWN true state — including opted_in = false — via the correct secret, and refuses a wrong one', async () => {
    const member = await seedRoomMember(upcomingEvent.id, { optedIn: false, clientSecret: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    memberIds.push(member.id);
    const anon = makeAnonClient();

    const right = await anon.rpc('get_my_room_status', { p_member_id: member.id, p_secret: member.client_secret });
    expect(right.error, `self-read must succeed: ${right.error?.message}`).toBeNull();
    const row = Array.isArray(right.data) ? right.data[0] : right.data;
    expect(
      row?.opted_in,
      'get_my_room_status must return the caller\'s TRUE current state (including an opt-out) ' +
        '— the roster\'s public SELECT policy would hide this same row, and the UX Notes ' +
        'require "the participant\'s own device shows their current state."',
    ).toBe(false);

    const wrong = await anon.rpc('get_my_room_status', { p_member_id: member.id, p_secret: '00000000-0000-4000-8000-000000000002' });
    expect(wrong.error, 'a wrong secret must not be able to read the member\'s status').not.toBeNull();
  });
});
