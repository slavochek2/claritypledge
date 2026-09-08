/**
 * @file p1275-transcribe-room-create.spec.ts
 * @description P1275 canary: starting a NEW /transcribe room must work.
 *
 * Since P1207 narrowed transcribe_rooms' SELECT policy to members-only, createRoom()'s
 * `.insert(...).select().single()` compiles to INSERT ... RETURNING, and RETURNING is
 * evaluated under that SELECT policy for the row it just wrote. At that instant the
 * creator is not yet a member, so the read-back is refused and the whole insert aborts.
 *
 * WHY THIS DRIVES THE UI rather than calling the data layer directly. Two reasons, and
 * the second is the one that matters:
 *   1. src/lib/supabase.ts reads `import.meta.env`, so transcribe-service.ts cannot be
 *      imported from a Playwright/Node spec without shimming Vite's env.
 *   2. A spec that hand-rolls createRoom's statements would be asserting against a COPY
 *      of the code under test. The fix changes which statements the client issues — from
 *      a direct insert to an RPC — so a copy would stop matching the app at exactly the
 *      moment it is supposed to prove the app got fixed. Driving the real button is the
 *      only formulation that is red before the fix and green after it without the test
 *      itself being edited. (Same lesson as P827: a unit canary passed while the bug
 *      shipped; the UI-driven E2E reproduced it in ten minutes — decisions.md 2026-05-15.)
 *
 * Red before the fix: the join button leaves the user on the consent screen with a raw
 * `new row violates row-level security policy for table "transcribe_rooms"` in
 * transcribe-join-error. Green after: the room screen renders and the creator is in the
 * roster.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P1275: starting a new /transcribe room', () => {
  let creator: TestUser;
  const CREATOR_NAME = 'P1275 Creator';

  test.beforeEach(async ({ page }) => {
    creator = await createTestUser({ name: CREATOR_NAME });

    // The room screen calls startCapture() as soon as it renders. The mic is not what is
    // under test here, and a real getUserMedia prompt would make the run environment-
    // dependent — same stub as p1149-chat-render.spec.ts.
    await page.addInitScript(() => {
      const mockTrack = { kind: 'audio' as const, enabled: true, stop: () => {} };
      const mockStream = { getTracks: () => [mockTrack], getAudioTracks: () => [mockTrack] };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    });

    await setTestSession(page, creator.email);
  });

  test.afterEach(async () => {
    if (!creator?.user?.id) return;
    // Rooms are created by the run, with a client-generated code this spec never sees.
    // Reach them through the creator's membership rows instead of guessing the code.
    // Deleting the user alone would cascade the member rows and orphan the rooms.
    const { data: memberships } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('room_id')
      .eq('profile_id', creator.user.id);
    for (const m of memberships ?? []) {
      await supabaseAdmin.from('transcribe_rooms').delete().eq('id', m.room_id);
    }
    await deleteTestUser(creator.user.id);
  });

  test('a signed-in user can start a room and lands in it as its first member', async ({ page }) => {
    await page.goto('/transcribe');

    // CONTROL: the session really took. Without this, a redirect to the auth gate would
    // fail the assertions below for a reason that has nothing to do with this bug.
    await expect(page.getByTestId('transcribe-consent-screen'),
      'control: the signed-in user must reach the consent screen').toBeVisible({ timeout: 15000 });

    await page.getByTestId('transcribe-recording-toggle').click();
    await page.getByTestId('transcribe-join-button').click();

    // Wait for the attempt to SETTLE either way before asserting anything about it.
    // Asserting the error's absence immediately after the click passes vacuously — the
    // join is async and has not failed yet at that instant, so the assertion races the
    // request and always wins. Waiting for one of the two outcomes first also puts the
    // server's own message into the failure output instead of a bare visibility timeout.
    const roomScreen = page.getByTestId('transcribe-room-screen');
    const joinError = page.getByTestId('transcribe-join-error');
    await expect(roomScreen.or(joinError),
      'the join attempt must settle into either a room or an error').toBeVisible({ timeout: 15000 });

    const errorText = await joinError.textContent().catch(() => null);
    expect(errorText, 'starting a room must not surface an error').toBeNull();

    await expect(roomScreen,
      'the creator must land in the room they just started').toBeVisible();
    await expect(page.getByTestId('transcribe-roster'),
      'and must appear in its roster').toContainText(CREATOR_NAME);
  });

  test('the room and the creator membership are both persisted', async ({ page }) => {
    await page.goto('/transcribe');
    await expect(page.getByTestId('transcribe-consent-screen')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('transcribe-recording-toggle').click();
    await page.getByTestId('transcribe-join-button').click();
    await expect(
      page.getByTestId('transcribe-room-screen').or(page.getByTestId('transcribe-join-error')),
    ).toBeVisible({ timeout: 15000 });
    const joinError = await page.getByTestId('transcribe-join-error').textContent().catch(() => null);
    expect(joinError, 'the room must be created without error').toBeNull();

    // Read the server's own state with the service role: the UI can only show what it
    // holds in React state, which would render a room that was never committed.
    const { data: members, error } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id, room_id, display_name, session_id')
      .eq('profile_id', creator.user.id);

    expect(error, `membership read failed: ${error?.message}`).toBeNull();
    expect(members ?? [], 'the creator must be a member of exactly one room').toHaveLength(1);
    expect(members![0]!.display_name).toBe(CREATOR_NAME);

    // A room with no members is unreachable by its own creator (member-scoped SELECT)
    // and cannot be ended (member-scoped UPDATE). Assert the room half exists too.
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .select('id, code, ended_at')
      .eq('id', members![0]!.room_id)
      .single();

    expect(roomError, `room read failed: ${roomError?.message}`).toBeNull();
    expect(room!.code, 'the room must carry a 6-character join code').toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room!.ended_at, 'a freshly created room must be live').toBeNull();
  });
});
