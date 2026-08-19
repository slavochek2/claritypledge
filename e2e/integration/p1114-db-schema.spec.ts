/**
 * @file p1114-db-schema.spec.ts
 * @description Schema, grant, and RLS coverage for the P1114 migration
 * (`event_room_members` + `event_room_answers`, per Architecture Decision 6 of
 * features/p1114_event_room_presence_and_cmp_opt_in.md). This file does NOT cover
 * the RPCs (`join_event_room`, `set_room_opt_in`, `set_room_readiness`,
 * `get_my_room_status`) — those, and everything that requires calling them, live
 * in p1114-room-rpcs.spec.ts. This file is the direct-table-access surface: what
 * an anon-key client can and cannot do WITHOUT going through an RPC, which is the
 * exact shape the Security Review's RLS/grant findings (⚠️ items 1-4) are about.
 *
 * Two-client pattern (admin bypasses RLS to prove schema/constraint shape; anon
 * proves what a real unauthenticated client can reach), same template as
 * p1083-db-schema.spec.ts and p1053-claim-joiner-seat.spec.ts.
 *
 * PRE-IMPLEMENTATION STATE: neither table exists yet (authored at
 * /generate-tests, before /dev) — every test fails with "relation ... does not
 * exist" until the migration lands. Expected, not a bug in this file.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember, readRoomMember, deleteRoomMembers } from '../helpers/test-event-room';

const anonClient = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

test.describe('P1114: event_room_members / event_room_answers — schema, grants, RLS', () => {
  let host: TestUser;
  let event: TestEvent;
  const memberIds: string[] = [];
  const extraEventIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 Schema Test Host' });
    event = await createTestEvent(host.user.id, new Date());
  });

  test.afterAll(async () => {
    await deleteRoomMembers(memberIds);
    for (const id of extraEventIds) await deleteTestEvent(id);
    await deleteTestEvent(event.id);
    await deleteTestUser(host.user.id);
  });

  // ─── Existence ──────────────────────────────────────────────────────

  test('event_room_members table and columns exist (admin, bypasses RLS)', async () => {
    const { error } = await supabaseAdmin
      .from('event_room_members')
      .select('id, event_id, profile_id, display_name, client_secret, opted_in, readiness_value, joined_at')
      .limit(1);
    expect(error, `Migration not applied: ${error?.message}`).toBeNull();
  });

  test('event_room_answers table and columns exist (admin, bypasses RLS)', async () => {
    const { error } = await supabaseAdmin
      .from('event_room_answers')
      .select('id, room_member_id, opted_in, cascade_count, answered_at')
      .limit(1);
    expect(error, `Migration not applied: ${error?.message}`).toBeNull();
  });

  // ─── Direct client mutation: Decision 1 — "never granted to anon/authenticated" ──

  test('anon cannot INSERT directly into event_room_members — join_event_room is the only path', async () => {
    const { error } = await anonClient
      .from('event_room_members')
      .insert({ event_id: event.id, display_name: 'Direct Insert Attempt' });
    expect(
      error?.code,
      'Architecture Decision 1: "Direct client UPDATE/INSERT on event_room_members is never ' +
        'granted to anon/authenticated — the RPCs are the only path." A successful direct ' +
        'INSERT means join_event_room is decorative.',
    ).toBe('42501'); // insufficient_privilege
  });

  test('anon cannot UPDATE event_room_members directly — set_room_opt_in / set_room_readiness are the only path', async () => {
    const seeded = await seedRoomMember(event.id, { optedIn: true });
    memberIds.push(seeded.id);

    await anonClient.from('event_room_members').update({ opted_in: false }).eq('id', seeded.id);
    await anonClient.from('event_room_members').update({ readiness_value: 9 }).eq('id', seeded.id);

    const after = await readRoomMember(seeded.id);
    expect(after?.opted_in, 'A direct UPDATE flipped opted_in without going through set_room_opt_in.').toBe(true);
    expect(after?.readiness_value, 'A direct UPDATE set readiness_value without going through set_room_readiness.').toBeNull();
  });

  test('anon cannot INSERT into event_room_answers, and cannot SELECT from it either — service-role-only by design (Decision 6)', async () => {
    const seeded = await seedRoomMember(event.id, { optedIn: true });
    memberIds.push(seeded.id);
    const { data: answerSeed, error: seedErr } = await supabaseAdmin
      .from('event_room_answers')
      .insert({ room_member_id: seeded.id, opted_in: true, cascade_count: 0 })
      .select('id')
      .single();
    expect(seedErr, `answer seed failed: ${seedErr?.message}`).toBeNull();

    const { error: insertError } = await anonClient
      .from('event_room_answers')
      .insert({ room_member_id: seeded.id, opted_in: true, cascade_count: 0 });
    expect(insertError, 'event_room_answers must have no client INSERT path — cascade_count would be forgeable.').not.toBeNull();

    const { data: selectData, error: selectError } = await anonClient
      .from('event_room_answers')
      .select('id')
      .eq('room_member_id', seeded.id);
    const leaked = selectData?.some((r) => r.id === answerSeed!.id) ?? false;
    expect(
      leaked,
      'event_room_answers must carry zero client-facing SELECT surface (Decision 6: "no ' +
        'client SELECT policy") — a client could otherwise read cascade counters and full ' +
        'opt-in history directly, bypassing every "opt-outs are never shown" guarantee at ' +
        'the source.',
    ).toBe(false);
    if (selectError) expect(selectError.code).toBe('42501');
  });

  // ─── client_secret confidentiality (Decision 1, Authorization ⚠️ items) ──────

  test('client_secret is never SELECT-able by anon, even on a row the roster policy allows through', async () => {
    const visible = await seedRoomMember(event.id, { optedIn: true, clientSecret: '11111111-1111-4111-8111-111111111111' });
    memberIds.push(visible.id);

    const named = await anonClient.from('event_room_members').select('client_secret').eq('id', visible.id);
    expect(
      named.error?.code,
      'Selecting client_secret by name must be rejected at the column-grant level — otherwise ' +
        'anyone reading the public roster can lift edit tokens and impersonate every attendee.',
    ).toBe('42501');

    const star = await anonClient.from('event_room_members').select('*').eq('id', visible.id);
    const keys = star.data?.[0] ? Object.keys(star.data[0]) : [];
    expect(
      keys,
      `SELECT * on a visible row exposed client_secret via a wildcard even though the named ` +
        `column select was rejected. Keys returned: ${keys.join(', ')}`,
    ).not.toContain('client_secret');
  });

  // ─── Roster SELECT policy: opted_in = true only (Decision 2) ─────────────────

  test('anon SELECT on the roster returns only opted_in = true rows — not false, not NULL (not-yet-answered)', async () => {
    const optedIn = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Roster Visible' });
    const optedOut = await seedRoomMember(event.id, { optedIn: false, displayName: 'P1114 Roster Opted Out' });
    const notAnswered = await seedRoomMember(event.id, { optedIn: null, displayName: 'P1114 Roster Not Answered' });
    memberIds.push(optedIn.id, optedOut.id, notAnswered.id);

    const { data, error } = await anonClient
      .from('event_room_members')
      .select('id, opted_in')
      .eq('event_id', event.id);
    expect(error, `roster SELECT errored: ${error?.message}`).toBeNull();

    const ids = data?.map((r) => r.id) ?? [];
    expect(ids, 'the opted-in row must be visible on the roster').toContain(optedIn.id);
    expect(ids, 'an opted-OUT row must never be visible on the roster').not.toContain(optedOut.id);
    expect(ids, 'a not-yet-answered (NULL) row must not be visible on the roster').not.toContain(notAnswered.id);
  });

  // ─── display_name CHECK constraint (Build Sequence step 1 / Security Review Input Validation) ──

  test('display_name CHECK rejects empty and whitespace-only names', async () => {
    const empty = await supabaseAdmin.from('event_room_members').insert({ event_id: event.id, display_name: '' });
    expect(empty.error?.code, 'empty display_name must violate the CHECK constraint').toBe('23514');

    const whitespace = await supabaseAdmin.from('event_room_members').insert({ event_id: event.id, display_name: '   ' });
    expect(whitespace.error?.code, 'whitespace-only display_name must violate the CHECK constraint').toBe('23514');
  });

  test('display_name CHECK bounds length at 1-100 chars after trim, matching MAX_NAME_LENGTH (api.ts:56)', async () => {
    const exactly100 = 'A'.repeat(100);
    const ok = await supabaseAdmin.from('event_room_members').insert({ event_id: event.id, display_name: exactly100 }).select('id').single();
    expect(ok.error, `a 100-char name (the shipped MAX_NAME_LENGTH boundary) must be accepted: ${ok.error?.message}`).toBeNull();
    if (ok.data?.id) memberIds.push(ok.data.id);

    const over100 = 'A'.repeat(101);
    const rejected = await supabaseAdmin.from('event_room_members').insert({ event_id: event.id, display_name: over100 });
    expect(
      rejected.error?.code,
      'a 101-char name must be rejected — the Security Review\'s illustrative "e.g. 1-60" would ' +
        'reject names the shipped /live guest form already accepts; Build Sequence step 1 ' +
        'explicitly widens the bound to 100 to match.',
    ).toBe('23514');
  });

  test('display_name CHECK rejects zero-width and bidi-override code points — a projected-wall impersonation vector', async () => {
    const zeroWidth = await supabaseAdmin
      .from('event_room_members')
      .insert({ event_id: event.id, display_name: 'Ann​ie' }); // U+200B zero-width space
    expect(zeroWidth.error?.code, 'a zero-width character must be rejected — it can make two visually-identical names hash as distinct rows').toBe('23514');

    const bidiOverride = await supabaseAdmin
      .from('event_room_members')
      .insert({ event_id: event.id, display_name: '‮attacker' }); // U+202E right-to-left override
    expect(bidiOverride.error?.code, 'a bidi-override character must be rejected — it can visually reverse a name on the projected wall').toBe('23514');
  });

  // ─── Walk-in vs registered distinguishability + partial unique index (Decision 6, Solution §1) ──

  test('a room row is distinguishable as walk-in (profile_id NULL) vs registered (profile_id set)', async () => {
    const walkIn = await seedRoomMember(event.id, { profileId: null, displayName: 'P1114 Walk-in' });
    const registered = await seedRoomMember(event.id, { profileId: host.user.id, displayName: 'P1114 Registered' });
    memberIds.push(walkIn.id, registered.id);

    expect(walkIn.profile_id).toBeNull();
    expect(registered.profile_id).toBe(host.user.id);
  });

  test('partial unique index (event_id, profile_id) WHERE profile_id IS NOT NULL — one registered row per person per event, unlimited walk-ins', async () => {
    // ISOLATED event: the preceding test already seeds (event, host) into the shared
    // fixture, so seeding it again here collides on THIS test's setup rather than on its
    // assertion — the index doing its job, reported as flake. The duplicate must be one
    // this test creates deliberately, not one inherited from a sibling.
    const indexEvent = await createTestEvent(host.user.id, new Date());
    extraEventIds.push(indexEvent.id);

    const first = await seedRoomMember(indexEvent.id, { profileId: host.user.id });
    memberIds.push(first.id);
    const dupe = await supabaseAdmin.from('event_room_members').insert({ event_id: indexEvent.id, display_name: 'Duplicate', profile_id: host.user.id });
    expect(dupe.error?.code, 'a second row for the same (event_id, profile_id) must violate the partial unique index').toBe('23505');

    // Two walk-ins for the same event must NOT collide — profile_id IS NULL is
    // excluded from the index by design.
    const walkIn1 = await seedRoomMember(indexEvent.id, { profileId: null });
    const walkIn2 = await seedRoomMember(indexEvent.id, { profileId: null });
    memberIds.push(walkIn1.id, walkIn2.id);
    expect(walkIn1.id).not.toBe(walkIn2.id);
  });
});
