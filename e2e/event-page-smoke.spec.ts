/**
 * @file event-page-smoke.spec.ts
 * Smoke tests for event pages — verifies pages load without crashes.
 *
 * Pattern: navigate → check no console errors → check key content visible.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestEvent, rsvpToEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

test.describe('Event Page Smoke Tests', () => {
  let host: TestUser;
  let attendee: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    host = await createTestUser({ name: 'Event Host' });
    attendee = await createTestUser({ name: 'Event Attendee' });
    event = await createTestEvent(host.user.id, undefined, {
      title: 'Smoke Test Event',
    });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  test('event listing page loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toHaveLength(0);
    await expect(page.locator('body')).toBeVisible();
  });

  test('event detail page loads without errors (anonymous)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toHaveLength(0);
    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
  });

  test('event detail page shows participants without Verify Together button', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toHaveLength(0);
    // Participants section renders
    await expect(page.getByText('Participants')).toBeVisible();
    // No Verify Together button
    await expect(page.getByText(/verify together/i)).not.toBeVisible();
    // No Sessions section
    await expect(page.getByText(/^Sessions$/i)).not.toBeVisible();
  });
});
