/**
 * @file p437-smoke.spec.ts
 * Smoke tests for P437: Uncancel Event
 *
 * Fast regression check: cancelled event page loads correctly,
 * host sees Uncancel button, no console errors.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P437: Uncancel Event Smoke', () => {
  let host: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    host = await createTestUser({ name: 'Smoke Host' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), {
      title: 'Smoke Uncancel Event',
    });
    await supabaseAdmin.from('events').update({ status: 'cancelled' }).eq('id', event.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('cancelled event page loads without errors, host sees Uncancel button', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toHaveLength(0);
    await expect(page.getByText('This event has been cancelled')).toBeVisible();
    await expect(page.getByRole('button', { name: /uncancel event/i })).toBeVisible();
  });
});
