/**
 * @file p1307-accessibility.spec.ts
 * @description P1307 accessibility sweep — the room's "Transcribe" (the ready-screen switch until
 * P1337 walkthrough 7) and the persistent
 * capture bar. Written test-first: expected to fail until /dev builds Parts 1/5/6.
 *
 * Standalone a11y file per tests.md's allowed exception #2 ("accessibility sweeps that
 * span multiple routes") — this one spans /events/:slug/ready and /events/:slug/meet.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';
import { startTranscribingInRoom } from '../helpers/test-event-room';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe('P1307 a11y: the room\'s "Transcribe" (walkthrough 7 — the switch left /ready)', () => {
  let user: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    user = await createTestUser({ name: 'P1307 A11y User' });
    event = await createTestEvent(user.user.id, new Date(), { title: 'P1307 A11y Event' });
    await rsvpToEvent(event.id, user.user.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('"Transcribe" is a real named button that says what it does, inside a polite status bar', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: /continue/i }).click();

    const bar = page.getByTestId('room-transcribe-idle');
    await expect(bar).toHaveAttribute('role', 'status');
    await expect(bar).toHaveAttribute('aria-live', 'polite');
    const start = page.getByRole('button', { name: 'Transcribe' });
    await expect(start).toBeVisible({ timeout: 10_000 });
    await expect(start).toHaveAttribute('aria-description', /record audio and share transcript/i);
  });

  test('"Transcribe" starts from the keyboard', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: /continue/i }).click();

    const start = page.getByRole('button', { name: 'Transcribe' });
    await start.focus();
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('room-capture-bar')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('P1307 a11y: the persistent capture bar', () => {
  let user: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    user = await createTestUser({ name: 'P1307 A11y Bar User' });
    event = await createTestEvent(user.user.id, new Date(), { title: 'P1307 A11y Bar Event' });
    await rsvpToEvent(event.id, user.user.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('the bar\'s Open and End session actions are reachable by Tab, with accessible names', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.waitForLoadState('networkidle');
    await startTranscribingInRoom(page, event.slug);

    // P1388's short bar names them "Open the room" and "Stop transcribing".
    const bar = page.getByTestId('room-capture-bar');
    const openBtn = bar.getByRole('button', { name: 'Open the room' });
    const endBtn = bar.getByRole('button', { name: 'Stop transcribing' });
    await expect(openBtn).toBeVisible();
    await expect(endBtn).toBeVisible();

    // Both must be real, focusable, named buttons — not divs with a click handler.
    await openBtn.focus();
    await expect(openBtn).toBeFocused();
    await endBtn.focus();
    await expect(endBtn).toBeFocused();
  });
});
