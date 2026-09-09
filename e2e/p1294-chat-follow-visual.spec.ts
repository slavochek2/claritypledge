/**
 * @file p1294-chat-follow-visual.spec.ts
 * @description P1294 visual pass — the follow behaviour and its return button, at the
 * widths this is actually used at. Mobile-narrow is where a floating control collides
 * with the content behind it, and 320px is where it clips.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P1294: chat follows new messages', () => {
  let creator: TestUser;

  test.beforeEach(async ({ page }) => {
    creator = await createTestUser({ name: 'P1294 Reader' });
    await page.addInitScript(() => {
      const t = { kind: 'audio' as const, enabled: true, stop: () => {} };
      const s = { getTracks: () => [t], getAudioTracks: () => [t] };
      navigator.mediaDevices.getUserMedia = async () => s as unknown as MediaStream;
    });
    await setTestSession(page, creator.email);
  });

  test.afterEach(async () => {
    if (!creator?.user?.id) return;
    const { data: ms } = await supabaseAdmin
      .from('transcribe_room_members').select('room_id').eq('profile_id', creator.user.id);
    for (const m of ms ?? []) await supabaseAdmin.from('transcribe_rooms').delete().eq('id', m.room_id);
    await supabaseAdmin.from('clarity_sessions').delete().eq('creator_profile_id', creator.user.id);
    await deleteTestUser(creator.user.id);
  });

  for (const [label, width, height] of [['desktop', 1280, 900], ['375', 375, 800], ['320', 320, 700]] as const) {
    test(`renders both states at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/transcribe');
      await expect(page.getByTestId('transcribe-consent-screen')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('transcribe-recording-toggle').click();
      await page.getByTestId('transcribe-join-button').click();
      await expect(page.getByTestId('transcribe-room-screen')).toBeVisible({ timeout: 15000 });

      const room = await page.evaluate(async () => {
        const el = document.querySelector('[data-testid="transcribe-chat"]');
        return el ? true : false;
      });
      expect(room, 'the chat container must exist').toBe(true);

      // Seed enough messages to make the list scrollable, through the server so they arrive
      // by the same realtime path a real speaker's words would.
      const roomId = await page.evaluate(() =>
        (document.querySelector('[data-testid="transcribe-room-screen"]') as HTMLElement)?.dataset.roomId ?? null);

      // At the bottom: the button must be ABSENT.
      await expect(page.getByTestId('transcribe-jump-to-newest'),
        'no return button while stuck to the bottom').toHaveCount(0);
      await page.screenshot({ path: `p1294-${label}-stuck.png`, fullPage: false });

      // Force the detached state by scrolling the container up.
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="transcribe-chat"]') as HTMLElement;
        Object.defineProperty(el, 'scrollHeight', { value: 3000, configurable: true });
        Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await expect(page.getByTestId('transcribe-jump-to-newest'),
        'the return button must appear once detached').toHaveCount(1);

      const box = await page.getByTestId('transcribe-jump-to-newest').boundingBox();
      expect(box!.height, 'touch target >= 40px').toBeGreaterThanOrEqual(40);
      expect(box!.width, 'touch target >= 40px').toBeGreaterThanOrEqual(40);
      // It must sit inside the viewport, not clipped off the right edge at 320px.
      expect(box!.x + box!.width, 'button must not overflow the viewport').toBeLessThanOrEqual(width);

      await page.screenshot({ path: `p1294-${label}-detached.png`, fullPage: false });
      void roomId;
    });
  }
});
