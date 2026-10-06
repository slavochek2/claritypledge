/**
 * @file p1429-pinned-head.spec.ts
 * @description P1429 A4: offline and transcribing, the event room's pinned step bar stays fully
 * visible — below the offline strip and the running capture bar — while the page scrolls at 375px.
 * Chromium's fake microphone runs the real "Transcribe" flow. Live against the test DB.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { startTranscribingInRoom } from './helpers/test-event-room';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

test.describe('P1429 A4: the room head under the offline strip and the capture bar', () => {
  let host: TestUser;
  let guest: TestUser;
  let ev: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1429 A4 Host' });
    guest = await createTestUser({ email: generateTestEmail(), name: 'P1429 A4 Guest' });
    ev = await createTestEvent(host.user.id, new Date(), { title: 'P1429 pinned head' });
    await rsvpToEvent(ev.id, guest.user.id);
  });

  test.afterAll(async () => {
    if (ev) await deleteTestEvent(ev.id);
    for (const u of [host, guest]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('offline and transcribing at 375px, the step bar sits below the strip and the bar while scrolling', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, guest.email);
    await startTranscribingInRoom(page, ev.slug);
    await context.setOffline(true);
    await expect(page.getByTestId('offline-strip')).toBeVisible({ timeout: 15_000 });

    const box = async (id: string) => (await page.getByTestId(id).first().boundingBox())!;
    for (const y of [0, 400, 1200]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(200);
      // The head only pins once the page has scrolled under it: a page too short to scroll proves nothing.
      if (y > 0) expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      const strip = await box('offline-strip');
      const bar = await box('room-capture-slot');
      const head = await box('room-sticky-head');
      expect(bar.y, `capture bar below the strip at scroll ${y}`).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
      expect(head.y, `step bar below the capture bar at scroll ${y}`).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    }
    await page.screenshot({ path: 'test-results/p1429/a4-offline-transcribing-375.png' });
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
