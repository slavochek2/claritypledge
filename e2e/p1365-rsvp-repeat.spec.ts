import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

// P1365 — desktop repeats the RSVP after a description taller than the viewport,
// and the two buttons are never in view together. jsdom has no layout, so the
// geometry half of the spec lives here.

const LONG = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ${'Words to fill a line. '.repeat(8)}`).join('\n\n');

test.describe('P1365 — desktop RSVP repeat', () => {
  let hostId: string;
  let longEvent: TestEvent;
  let shortEvent: TestEvent;

  test.beforeAll(async () => {
    const { user } = await createTestUser({ prefix: 'test-p1365-host' });
    hostId = user.id;
    const inAWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    longEvent = await createTestEvent(hostId, inAWeek, { description: LONG });
    shortEvent = await createTestEvent(hostId, inAWeek, { description: 'One short line.' });
  });

  test.afterAll(async () => {
    await deleteTestEvent(longEvent.id);
    await deleteTestEvent(shortEvent.id);
    await deleteTestUser(hostId);
  });

  test('desktop, long description: repeat exists and never shares the viewport with the top button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/events/${longEvent.slug}`);
    const top = page.getByTestId('rsvp-button').filter({ visible: true });
    const repeat = page.getByTestId('rsvp-button-repeat');

    await expect(top).toBeInViewport({ timeout: 10000 });
    await expect(repeat).toHaveCount(1);
    await expect(repeat).toHaveText('Reserve your seat');
    await expect(repeat).not.toBeInViewport();

    await repeat.scrollIntoViewIfNeeded();
    await expect(repeat).toBeInViewport();
    await expect(top).not.toBeInViewport();
  });

  test('desktop, short description: no repeat', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/events/${shortEvent.slug}`);
    await expect(page.getByTestId('rsvp-button').filter({ visible: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('rsvp-button-repeat')).toHaveCount(0);
  });

  test('mobile, long description: no repeat visible, sticky bar unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/events/${longEvent.slug}`);
    await expect(page.getByTestId('rsvp-sticky-bar')).toBeVisible({ timeout: 10000 });
    // Rendered (the description is taller than a phone screen too) but hidden by lg-only CSS —
    // count 1 proves this is the CSS gate, not a measurement that never ran.
    await expect(page.getByTestId('rsvp-button-repeat')).toHaveCount(1);
    await expect(page.getByTestId('rsvp-button-repeat')).not.toBeVisible();
  });

  test('logged out: clicking the repeat goes to the same signup URL as the top button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/events/${longEvent.slug}`);
    const repeat = page.getByTestId('rsvp-button-repeat');
    await repeat.scrollIntoViewIfNeeded();
    await repeat.click();
    await expect(page).toHaveURL(new RegExp(`/signup\\?redirect=/events/${longEvent.slug}&action=rsvp`));
  });

  test('logged in: clicking the repeat RSVPs and lands on the confirm page', async ({ page }) => {
    const { user, email } = await createTestUser({ prefix: 'test-p1365-guest' });
    try {
      await setTestSession(page, email);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/events/${longEvent.slug}`);
      const repeat = page.getByTestId('rsvp-button-repeat');
      await repeat.scrollIntoViewIfNeeded();
      await repeat.click();
      await expect(page).toHaveURL(new RegExp(`/events/${longEvent.slug}/confirm`), { timeout: 15000 });
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
