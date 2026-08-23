/**
 * @file p1149-chat-render.spec.ts
 * @description P1149 DW-3: each message shows the speaker's name and a timestamp.
 *
 * Seeds a room with one existing member + one finalized message via the admin client
 * (bypassing RLS, same convention as other integration specs), then has the signed-in
 * test user join that room through the real UI and asserts the seeded message renders
 * attributed to its speaker with a visible time.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P1149: /transcribe chat message rendering', () => {
  let joiningUser: TestUser;
  let seedUser: TestUser;
  let roomId: string;
  let roomCode: string;
  const SEED_TEXT = `P1149 seeded utterance ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    joiningUser = await createTestUser({ name: 'P1149 Joiner' });
    seedUser = await createTestUser({ name: 'P1149 Speaker' });

    roomCode = `P1149-${Date.now().toString(36).toUpperCase()}`;
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code: roomCode })
      .select('id, code')
      .single();
    expect(roomError, `Failed to seed room: ${roomError?.message}`).toBeNull();
    roomId = room!.id;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${roomCode}-S1`, creator_name: 'P1149 Speaker', creator_profile_id: seedUser.user.id })
      .select('id')
      .single();
    expect(sessionError, `Failed to seed clarity_sessions: ${sessionError?.message}`).toBeNull();

    const { data: member, error: memberError } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: roomId, profile_id: seedUser.user.id, display_name: 'P1149 Speaker', session_id: session!.id })
      .select('id')
      .single();
    expect(memberError, `Failed to seed room member: ${memberError?.message}`).toBeNull();

    const { error: messageError } = await supabaseAdmin
      .from('transcribe_messages')
      .insert({ room_id: roomId, member_id: member!.id, text: SEED_TEXT, is_final: true });
    expect(messageError, `Failed to seed message: ${messageError?.message}`).toBeNull();

    await page.addInitScript(() => {
      const mockTrack = { kind: 'audio' as const, enabled: true, stop: () => {} };
      const mockStream = { getTracks: () => [mockTrack], getAudioTracks: () => [mockTrack] };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    });

    await setTestSession(page, joiningUser.email);
  });

  test.afterEach(async () => {
    await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (joiningUser?.user?.id) await deleteTestUser(joiningUser.user.id);
    if (seedUser?.user?.id) await deleteTestUser(seedUser.user.id);
  });

  test('a seeded message renders with the speaker name and a timestamp', async ({ page }) => {
    await page.goto(`/transcribe/${roomCode}`);
    await page.getByTestId('transcribe-recording-toggle').click();
    await page.getByTestId('transcribe-join-button').click();

    await expect(page.getByTestId('transcribe-room-screen')).toBeVisible({ timeout: 15000 });

    const messages = page.getByTestId('transcribe-message');
    await expect(messages.filter({ hasText: SEED_TEXT })).toBeVisible();

    const seededMessage = messages.filter({ hasText: SEED_TEXT });
    await expect(seededMessage.getByText('P1149 Speaker')).toBeVisible();
    // A timestamp in h:mm AM/PM form (toLocaleTimeString hour/minute) is rendered next to the name.
    await expect(seededMessage.locator('text=/\\d{1,2}:\\d{2}\\s*(AM|PM)/i')).toBeVisible();
  });
});
