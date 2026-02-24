/**
 * @file p418-smoke.spec.ts
 * @description Smoke tests for P418: Banner Search Fallback
 *
 * Fast regression: event detail loads without console errors,
 * banner buttons still render for host, search input absent by default.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

test.describe('P418 Smoke — Banner Search Fallback', () => {
  test.setTimeout(30000);

  let host: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P418 Smoke Host' });
    event = await createTestEvent(host.user.id, undefined, { title: 'P418 Smoke Event' });
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('event detail loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'P418 Smoke Event' })).toBeVisible({ timeout: 10000 });
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('"New banner" button present for host, search input absent on load', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /new banner/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('textbox', { name: /search/i })).not.toBeAttached();
  });
});
