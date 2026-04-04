/**
 * @file p406-practice-rooms-migration.spec.ts
 * @description Integration tests for P406: event_practice_rooms table migration
 *
 * Verifies the DB migration for P406:
 * 1. Table exists with all required columns (schema check via service role)
 * 2. Status CHECK constraint: only 'waiting', 'active', 'closed' are valid
 * 3. expires_at defaults to NOW() + 30 minutes
 * 4. RLS SELECT: anyone (including anon) can read all rooms for an event
 * 5. RLS INSERT: authenticated user can insert with their own creator_id
 * 6. RLS INSERT: authenticated user CANNOT insert with another user's creator_id
 * 7. RLS INSERT: anonymous caller is blocked entirely
 * 8. Partial unique index: cannot open two waiting rooms for same creator+event pair
 * 9. Partial unique index: CAN insert second room if first is closed (not waiting)
 * 10. ON DELETE CASCADE: deleting the parent event removes practice rooms
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks + test data creation (bypasses RLS)
 * - user-scoped client (JWT): RLS assertions (proves actual user access)
 * - anon client (no JWT): verifies unauthenticated access rules
 *
 * If test 1 fails with "relation does not exist": migration not applied.
 * Run: supabase db push
 *
 * If test 8 fails "second waiting room was inserted": unique partial index missing.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent } from '../helpers/test-event';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deletePracticeRoom(id: string | undefined) {
  if (id) {
    await supabaseAdmin.from('event_practice_rooms').delete().eq('id', id);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P406: event_practice_rooms migration — schema checks', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 1. Table and all columns exist ───────────────────────────────────────
  test('event_practice_rooms table exists with all required columns', async () => {
    // Select each column individually — if any are missing, Supabase returns an error
    const { error } = await supabaseAdmin
      .from('event_practice_rooms')
      .select('id, event_id, creator_id, session_id, status, created_at, expires_at')
      .limit(1);

    expect(
      error,
      `P406 migration not applied — event_practice_rooms table or column missing.\n` +
      `Run: supabase db push\nError: ${error?.message}`
    ).toBeNull();
  });

  // ── 2. Status CHECK constraint ────────────────────────────────────────────
  test('status CHECK constraint: invalid status is rejected', async () => {
    // We need an event and creator to insert a room (FK constraints)
    const creator = await createTestUser({ name: 'P406 StatusCheck Creator' });
    const event = await createTestEvent(creator.user.id, undefined, {
      title: 'P406 StatusCheck Event',
    });

    try {
      const { data, error } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'invalid_status', // must be rejected
        })
        .select('id')
        .single();

      if (data?.id) await deletePracticeRoom(data.id);

      expect(
        error,
        'status CHECK constraint not enforced — "invalid_status" should have been rejected.\n' +
        'Run: supabase db push'
      ).not.toBeNull();
    } finally {
      await deleteTestEvent(event.id);
      await deleteTestUser(creator.user.id);
    }
  });

  // ── 3. expires_at defaults to NOW() + 30 minutes ─────────────────────────
  test('new rows get expires_at = NOW() + 30 minutes by default', async () => {
    const creator = await createTestUser({ name: 'P406 Expiry Creator' });
    const event = await createTestEvent(creator.user.id, undefined, {
      title: 'P406 Expiry Event',
    });

    let roomId: string | undefined;
    try {
      const before = new Date();

      const { data, error } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'waiting',
        })
        .select('id, created_at, expires_at')
        .single();

      roomId = data?.id;

      expect(error, `Failed to create practice room: ${error?.message}`).toBeNull();
      expect(data?.expires_at).not.toBeNull();

      // expires_at should be approximately 30 minutes after created_at
      const createdAt = new Date(data!.created_at);
      const expiresAt = new Date(data!.expires_at);
      const diffMs = expiresAt.getTime() - createdAt.getTime();
      const diffMinutes = diffMs / 1000 / 60;

      // Allow 1 minute tolerance for DB timing
      expect(diffMinutes).toBeGreaterThanOrEqual(29);
      expect(diffMinutes).toBeLessThanOrEqual(31);

      // expires_at must be in the future relative to test start
      expect(expiresAt.getTime()).toBeGreaterThan(before.getTime());
    } finally {
      await deletePracticeRoom(roomId);
      await deleteTestEvent(event.id);
      await deleteTestUser(creator.user.id);
    }
  });
});

test.describe('P406: event_practice_rooms — RLS policies', () => {
  test.describe.configure({ timeout: 30000 });

  let creatorId: string;
  let creatorEmail: string;
  let otherUserId: string;
  let eventId: string;
  const createdRoomIds: string[] = [];

  test.beforeAll(async () => {
    creatorEmail = generateTestEmail();
    const creator = await createTestUser({ email: creatorEmail, name: 'P406 RLS Creator' });
    creatorId = creator.user.id;

    const otherEmail = generateTestEmail();
    const otherUser = await createTestUser({ email: otherEmail, name: 'P406 RLS Other' });
    otherUserId = otherUser.user.id;

    const event = await createTestEvent(creatorId, undefined, {
      title: 'P406 RLS Event',
    });
    eventId = event.id;
  });

  test.afterAll(async () => {
    if (createdRoomIds.length > 0) {
      await supabaseAdmin.from('event_practice_rooms').delete().in('id', createdRoomIds);
    }
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId);
    await deleteTestUser(creatorId);
    await deleteTestUser(otherUserId);
  });

  // ── 4. RLS SELECT: anonymous can read rooms ───────────────────────────────
  test('anonymous client can SELECT practice rooms (public read)', async () => {
    // First create a room via admin
    const { data: room, error: insertError } = await supabaseAdmin
      .from('event_practice_rooms')
      .insert({ event_id: eventId, creator_id: creatorId, status: 'waiting' })
      .select('id')
      .single();

    expect(insertError, `Admin insert failed: ${insertError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    // Now verify anon client can read it
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('event_practice_rooms')
      .select('id, status')
      .eq('id', room!.id);

    expect(error, `RLS blocked anonymous SELECT: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('waiting');
  });

  // ── 5. RLS INSERT: authenticated user can insert with own creator_id ──────
  test('authenticated user can INSERT a room with their own creator_id', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabaseAdmin.auth.signOut();

    let roomId: string | undefined;
    try {
      const { data, error } = await userClient
        .from('event_practice_rooms')
        .insert({
          event_id: eventId,
          creator_id: creatorId, // their own ID
          status: 'waiting',
        })
        .select('id, creator_id, status')
        .single();

      roomId = data?.id;
      if (roomId) createdRoomIds.push(roomId);

      expect(error, `RLS should allow user to insert with own creator_id: ${error?.message}`).toBeNull();
      expect(data?.creator_id).toBe(creatorId);
      expect(data?.status).toBe('waiting');
    } finally {
      await deletePracticeRoom(roomId);
      createdRoomIds.splice(createdRoomIds.indexOf(roomId!), 1);
    }
  });

  // ── 6. RLS INSERT: authenticated user CANNOT spoof another's creator_id ───
  test('authenticated user cannot INSERT a room with another user creator_id (RLS WITH CHECK)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabaseAdmin.auth.signOut();

    let roomId: string | undefined;
    try {
      const { data, error } = await userClient
        .from('event_practice_rooms')
        .insert({
          event_id: eventId,
          creator_id: otherUserId, // NOT the caller's own ID
          status: 'waiting',
        })
        .select('id')
        .single();

      roomId = data?.id;
      if (roomId) createdRoomIds.push(roomId);

      expect(
        error,
        'RLS WITH CHECK (auth.uid() = creator_id) should have blocked spoofed creator_id insert.'
      ).not.toBeNull();
    } finally {
      await deletePracticeRoom(roomId);
    }
  });

  // ── 7. RLS INSERT: anonymous caller is blocked ────────────────────────────
  test('anonymous caller cannot INSERT into event_practice_rooms', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    let roomId: string | undefined;
    try {
      const { data, error } = await anonClient
        .from('event_practice_rooms')
        .insert({
          event_id: eventId,
          creator_id: creatorId,
          status: 'waiting',
        })
        .select('id')
        .single();

      roomId = data?.id;
      if (roomId) createdRoomIds.push(roomId);

      expect(
        error,
        'P406 migration not applied: anonymous caller should be blocked from INSERT.\n' +
        'Run: supabase db push'
      ).not.toBeNull();
    } finally {
      await deletePracticeRoom(roomId);
    }
  });
});

test.describe('P406: event_practice_rooms — unique partial index (one waiting room per creator)', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 8. Partial unique index: second waiting room for same creator+event fails ──
  test('cannot open two waiting rooms for the same event+creator (unique partial index)', async () => {
    const creator = await createTestUser({ name: 'P406 Unique Creator' });
    const event = await createTestEvent(creator.user.id, undefined, {
      title: 'P406 Unique Index Event',
    });

    const roomIds: string[] = [];
    try {
      // Insert first waiting room
      const { data: room1, error: error1 } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'waiting',
        })
        .select('id')
        .single();

      expect(error1, `First room insert should succeed: ${error1?.message}`).toBeNull();
      roomIds.push(room1!.id);

      // Insert second waiting room for the same creator+event — must fail
      const { data: room2, error: error2 } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'waiting',
        })
        .select('id')
        .single();

      if (room2?.id) roomIds.push(room2.id);

      expect(
        error2,
        'Unique partial index idx_one_waiting_room_per_creator should have rejected the second waiting room.\n' +
        'Run: supabase db push'
      ).not.toBeNull();
    } finally {
      if (roomIds.length > 0) {
        await supabaseAdmin.from('event_practice_rooms').delete().in('id', roomIds);
      }
      await deleteTestEvent(event.id);
      await deleteTestUser(creator.user.id);
    }
  });

  // ── 9. Partial index allows new room after closing the first ──────────────
  test('can open a second room after closing the first (partial index is WHERE status=waiting)', async () => {
    const creator = await createTestUser({ name: 'P406 Reopen Creator' });
    const event = await createTestEvent(creator.user.id, undefined, {
      title: 'P406 Reopen Event',
    });

    const roomIds: string[] = [];
    try {
      // Insert first waiting room
      const { data: room1, error: error1 } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'waiting',
        })
        .select('id')
        .single();

      expect(error1, `First room insert should succeed: ${error1?.message}`).toBeNull();
      roomIds.push(room1!.id);

      // Close the first room
      await supabaseAdmin
        .from('event_practice_rooms')
        .update({ status: 'closed' })
        .eq('id', room1!.id);

      // Insert second waiting room — now allowed because no waiting room exists
      const { data: room2, error: error2 } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'waiting',
        })
        .select('id, status')
        .single();

      if (room2?.id) roomIds.push(room2.id);

      expect(
        error2,
        `After closing first room, second waiting room should be allowed: ${error2?.message}`
      ).toBeNull();
      expect(room2?.status).toBe('waiting');
    } finally {
      if (roomIds.length > 0) {
        await supabaseAdmin.from('event_practice_rooms').delete().in('id', roomIds);
      }
      await deleteTestEvent(event.id);
      await deleteTestUser(creator.user.id);
    }
  });
});

test.describe('P406: event_practice_rooms — cascade behavior', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 10. ON DELETE CASCADE: rooms deleted when parent event is deleted ─────
  test('practice rooms are deleted when their parent event is deleted (CASCADE)', async () => {
    const creator = await createTestUser({ name: 'P406 Cascade Creator' });
    const event = await createTestEvent(creator.user.id, undefined, {
      title: 'P406 Cascade Event',
    });

    let roomId: string | undefined;
    try {
      // Create a room under the event
      const { data: room, error: insertError } = await supabaseAdmin
        .from('event_practice_rooms')
        .insert({
          event_id: event.id,
          creator_id: creator.user.id,
          status: 'waiting',
        })
        .select('id')
        .single();

      expect(insertError, `Room insert failed: ${insertError?.message}`).toBeNull();
      roomId = room!.id;

      // Delete the event — should cascade to rooms
      await supabaseAdmin.from('events').delete().eq('id', event.id);

      // Room should no longer exist
      const { data: rooms, error: selectError } = await supabaseAdmin
        .from('event_practice_rooms')
        .select('id')
        .eq('id', roomId);

      expect(selectError, `Select after cascade delete failed: ${selectError?.message}`).toBeNull();
      expect(rooms).toHaveLength(0);

      roomId = undefined; // already deleted via cascade
    } finally {
      await deletePracticeRoom(roomId);
      await deleteTestUser(creator.user.id);
      // Event already deleted in test body
    }
  });
});
