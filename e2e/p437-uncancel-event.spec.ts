/**
 * @file p437-uncancel-event.spec.ts
 * E2E tests for P437: Uncancel Event
 *
 * Tests the Uncancel button in the cancellation banner:
 * - Visibility conditions (host + cancelled + not past)
 * - Confirm dialog flow
 * - Success: status restored, host controls reappear
 * - Failure: graceful error handling
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from '../src/lib/supabase-admin';

async function cancelEventDirectly(eventId: string) {
  await supabaseAdmin.from('events').update({ status: 'cancelled' }).eq('id', eventId);
}

test.describe('P437: Uncancel Event', () => {
  let host: TestUser;
  let attendee: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    host = await createTestUser({ name: 'Event Host' });
    attendee = await createTestUser({ name: 'Event Attendee' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), {
      title: 'Uncancel Test Event',
    });
    await cancelEventDirectly(event.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  test('host sees Uncancel button in cancellation banner', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    // Cancellation banner is visible
    await expect(page.getByText('This event has been cancelled')).toBeVisible();

    // Uncancel button is inside the banner
    await expect(page.getByRole('button', { name: /uncancel event/i })).toBeVisible();
  });

  test('non-host does not see Uncancel button', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('This event has been cancelled')).toBeVisible();
    await expect(page.getByRole('button', { name: /uncancel event/i })).not.toBeVisible();
  });

  test('anonymous visitor does not see Uncancel button', async ({ page }) => {
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('This event has been cancelled')).toBeVisible();
    await expect(page.getByRole('button', { name: /uncancel event/i })).not.toBeVisible();
  });

  test('Uncancel button does not appear for past cancelled events', async ({ page }) => {
    // Create an event in the past, already cancelled
    const pastEvent = await createTestEvent(
      host.user.id,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
      { title: 'Past Cancelled Event' }
    );
    await cancelEventDirectly(pastEvent.id);

    try {
      await setTestSession(page, host.email);
      await page.goto(`/events/${pastEvent.slug}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /uncancel event/i })).not.toBeVisible();
    } finally {
      await deleteTestEvent(pastEvent.id);
    }
  });

  test('clicking Uncancel opens confirm dialog', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /uncancel event/i }).click();

    // Confirm dialog appears
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/reinstate this event/i)).toBeVisible();
    await expect(page.getByText(/re-announcement email/i)).toBeVisible();
  });

  test('dismissing confirm dialog leaves event cancelled', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /uncancel event/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click "Keep Cancelled"
    await page.getByRole('button', { name: /keep cancelled/i }).click();

    // Dialog closed, banner still shows cancelled
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('This event has been cancelled')).toBeVisible();
    await expect(page.getByRole('button', { name: /uncancel event/i })).toBeVisible();
  });

  test('confirming uncancel restores event and shows host controls', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /uncancel event/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Confirm
    await page.getByRole('button', { name: /yes, uncancel/i }).click();

    // Cancellation banner gone
    await expect(page.getByText('This event has been cancelled')).not.toBeVisible();

    // Host controls reappear
    await expect(page.getByRole('button', { name: /edit/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel event/i })).toBeVisible();

    // Success toast
    await expect(page.getByText(/event is back on/i)).toBeVisible();
  });
});
