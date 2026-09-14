/**
 * @file p1307-sweep-tick.spec.ts
 * @description P270 canary for `transcribe_room_sweep_tick()` (Architecture Decision 2).
 * Called directly via the service-role client rather than waiting for the pg_cron schedule
 * (`/architect`'s own instruction: "call it directly via service role — do not wait for
 * cron"). Timestamps are backdated with the service-role client to simulate elapsed time,
 * per epistemic.md gate 2b (snapshot/simulate rather than sleeping the test for real
 * minutes).
 *
 * Every write in the tick is documented as idempotent (conditional UPDATE / INSERT ... ON
 * CONFLICT DO NOTHING) — the "second tick writes nothing new" test is what actually proves
 * that, not the migration's comment.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

function roomCode() {
  return `P1307S${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

test.describe('P1307: transcribe_room_sweep_tick', () => {
  let alice: TestUser;
  let bob: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  async function seedRoomAndMember(opts: {
    roomOverrides?: Record<string, unknown>;
    memberOverrides?: Record<string, unknown>;
    user: TestUser;
    tag: string;
  }) {
    const code = roomCode();
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code, ...opts.roomOverrides })
      .select('id')
      .single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-${opts.tag}`, creator_name: opts.tag, creator_profile_id: opts.user.user.id })
      .select('id')
      .single();
    expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
    createdSessionIds.push(session!.id);

    const { data: member, error: memberError } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({
        room_id: room!.id, profile_id: opts.user.user.id, display_name: opts.tag, session_id: session!.id,
        consent_given_at: new Date().toISOString(), ...opts.memberOverrides,
      })
      .select('id')
      .single();
    expect(memberError, `seed member failed: ${memberError?.message}`).toBeNull();

    return { roomId: room!.id as string, memberId: member!.id as string };
  }

  async function memberState(memberId: string) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_room_members').select('capture_ended_at').eq('id', memberId).single();
    expect(error).toBeNull();
    return data!.capture_ended_at as string | null;
  }

  async function roomEndedAt(roomId: string) {
    const { data, error } = await supabaseAdmin.from('transcribe_rooms').select('ended_at').eq('id', roomId).single();
    expect(error).toBeNull();
    return data!.ended_at as string | null;
  }

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1307 Sweep Alice' });
    bob = await createTestUser({ name: 'P1307 Sweep Bob' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    for (const u of [alice, bob]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('a member past joined_at + 3h is ended by the tick', async () => {
    const overJoinedAt = new Date(Date.now() - (3 * 60 + 1) * 60_000).toISOString();
    const { memberId } = await seedRoomAndMember({
      user: alice, tag: 'cap',
      memberOverrides: { joined_at: overJoinedAt, last_seen_at: new Date().toISOString() },
    });

    const { error } = await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    expect(error, `sweep tick must succeed: ${error?.message}`).toBeNull();

    expect(await memberState(memberId), 'a member over the 3h cap must be ended by the tick').not.toBeNull();
  });

  test('a member whose last_seen_at is 11 minutes stale is ended (N = 10 min)', async () => {
    const staleSeenAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const { memberId } = await seedRoomAndMember({
      user: alice, tag: 'stale',
      memberOverrides: { joined_at: new Date().toISOString(), last_seen_at: staleSeenAt },
    });

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    expect(await memberState(memberId), 'a member with no signal for >10 minutes must be ended').not.toBeNull();
  });

  test('a paused member whose heartbeat is recent is NOT ended, even mid-3h-session', async () => {
    // D3/D13's automatic pause/resume: a paused member sends no slices but the provider
    // touches last_seen_at every 2 minutes. This is the test the "last_seen_at, not
    // last_slice_at" correction exists for.
    const { memberId } = await seedRoomAndMember({
      user: alice, tag: 'paused',
      memberOverrides: { joined_at: new Date(Date.now() - 30 * 60_000).toISOString(), last_seen_at: new Date().toISOString() },
    });

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    expect(await memberState(memberId), 'a paused member with a recent heartbeat must NOT be ended').toBeNull();
  });

  test('a room ends once every member has capture_ended_at, and not before', async () => {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);

    const staleSeenAt = new Date(Date.now() - 11 * 60_000).toISOString();
    for (const [u, tag] of [[alice, 'a'], [bob, 'b']] as const) {
      const { data: session } = await supabaseAdmin
        .from('clarity_sessions').insert({ code: `${code}-${tag}`, creator_name: tag, creator_profile_id: u.user.id }).select('id').single();
      createdSessionIds.push(session!.id);
      await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: room!.id, profile_id: u.user.id, display_name: tag, session_id: session!.id,
        consent_given_at: new Date().toISOString(), last_seen_at: staleSeenAt,
      });
    }

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    expect(await roomEndedAt(room!.id), 'a room whose every member is now ended must itself be ended').not.toBeNull();
  });

  test('a room with one still-active member does NOT end', async () => {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);

    const staleSeenAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const { data: sA } = await supabaseAdmin
      .from('clarity_sessions').insert({ code: `${code}-a`, creator_name: 'a', creator_profile_id: alice.user.id }).select('id').single();
    createdSessionIds.push(sA!.id);
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room!.id, profile_id: alice.user.id, display_name: 'a', session_id: sA!.id,
      consent_given_at: new Date().toISOString(), last_seen_at: staleSeenAt, // stale → will be ended
    });
    const { data: sB } = await supabaseAdmin
      .from('clarity_sessions').insert({ code: `${code}-b`, creator_name: 'b', creator_profile_id: bob.user.id }).select('id').single();
    createdSessionIds.push(sB!.id);
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room!.id, profile_id: bob.user.id, display_name: 'b', session_id: sB!.id,
      consent_given_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), // fresh
    });

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    expect(await roomEndedAt(room!.id), 'a room with even one still-active member must stay open').toBeNull();
  });

  test('ending a room creates exactly one transcription-job row per member', async () => {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);

    const staleSeenAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const memberIds: string[] = [];
    for (const [u, tag] of [[alice, 'a'], [bob, 'b']] as const) {
      const { data: session } = await supabaseAdmin
        .from('clarity_sessions').insert({ code: `${code}-${tag}`, creator_name: tag, creator_profile_id: u.user.id }).select('id').single();
      createdSessionIds.push(session!.id);
      const { data: member } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: room!.id, profile_id: u.user.id, display_name: tag, session_id: session!.id,
        consent_given_at: new Date().toISOString(), last_seen_at: staleSeenAt,
      }).select('id').single();
      memberIds.push(member!.id);
    }

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');

    const { data: jobs, error } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs')
      .select('id, room_id, member_id')
      .eq('room_id', room!.id);
    expect(error, `job readback failed: ${error?.message}`).toBeNull();
    expect(jobs?.length, 'exactly one job per member must be created when the room ends').toBe(2);
    expect(new Set((jobs ?? []).map((j) => j.member_id))).toEqual(new Set(memberIds));
  });

  test('a second tick against an already-ended situation writes nothing new (idempotent)', async () => {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);
    const staleSeenAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions').insert({ code: `${code}-a`, creator_name: 'a', creator_profile_id: alice.user.id }).select('id').single();
    createdSessionIds.push(session!.id);
    const { data: member } = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room!.id, profile_id: alice.user.id, display_name: 'a', session_id: session!.id,
      consent_given_at: new Date().toISOString(), last_seen_at: staleSeenAt,
    }).select('id').single();

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    const capturedEndedAtFirst = await memberState(member!.id);
    const roomEndedFirst = await roomEndedAt(room!.id);
    const { count: jobsAfterFirst } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs').select('id', { count: 'exact', head: true }).eq('room_id', room!.id);

    await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    const capturedEndedAtSecond = await memberState(member!.id);
    const roomEndedSecond = await roomEndedAt(room!.id);
    const { count: jobsAfterSecond } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs').select('id', { count: 'exact', head: true }).eq('room_id', room!.id);

    expect(capturedEndedAtSecond, 'a second tick must not restamp capture_ended_at').toBe(capturedEndedAtFirst);
    expect(roomEndedSecond, 'a second tick must not restamp room ended_at').toBe(roomEndedFirst);
    expect(jobsAfterSecond, 'a second tick must not create a duplicate job row').toBe(jobsAfterFirst);
  });
});
