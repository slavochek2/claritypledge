/**
 * @file p1307-accessibility.spec.ts
 * @description P1307 accessibility sweep — the ready-screen switch and the persistent
 * capture bar. Written test-first: expected to fail until /dev builds Parts 1/5/6.
 *
 * Standalone a11y file per tests.md's allowed exception #2 ("accessibility sweeps that
 * span multiple routes") — this one spans /events/:slug/ready and /events/:slug/meet.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe('P1307 a11y: the transcription switch', () => {
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

  test('the switch has role="switch", an accessible name, and aria-checked reflecting state', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);

    const toggle = page.getByRole('switch');
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveAccessibleName(/transcribe for ai insights/i);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('the switch is keyboard-toggleable with Space and Enter', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);

    const toggle = page.getByRole('switch');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('toggling announces the change via a polite live region', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);

    // /dev: every page also carries the app-wide toast region (Sonner, aria-live="polite"), so
    // the bare selector resolved to two elements and failed strict mode before asserting
    // anything. The claim is unchanged: a polite live region announces the transcription state.
    const liveRegions = page.locator('[aria-live="polite"]');
    await expect(liveRegions.first()).toBeAttached({ timeout: 10_000 });

    await page.getByRole('switch').click();
    await expect(liveRegions.filter({ hasText: /transcri/i })).toHaveCount(1, { timeout: 5000 });
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
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 15_000 });

    const openBtn = page.getByRole('button', { name: /^open$/i });
    const endBtn = page.getByRole('button', { name: /end session/i });
    await expect(openBtn).toBeVisible();
    await expect(endBtn).toBeVisible();

    // Both must be real, focusable, named buttons — not divs with a click handler.
    await openBtn.focus();
    await expect(openBtn).toBeFocused();
    await endBtn.focus();
    await expect(endBtn).toBeFocused();
  });
});
