/**
 * @file p416-smoke.spec.ts
 * @description Smoke tests for P416: Event auto-banner via Unsplash
 *
 * Fast regression: event pages load without console errors,
 * both with and without a banner image set.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P416 Smoke — Event Auto-Banner', () => {
  test.setTimeout(30000);

  let host: TestUser;
  let eventWithBanner: TestEvent;
  let eventNoBanner: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P416 Smoke Host' });

    eventWithBanner = await createTestEvent(host.user.id, undefined, {
      title: 'P416 Smoke Banner Event',
    });
    await supabaseAdmin
      .from('events')
      .update({ banner_url: 'https://images.unsplash.com/photo-smoke-test?w=1200&q=80' })
      .eq('id', eventWithBanner.id);

    eventNoBanner = await createTestEvent(host.user.id, undefined, {
      title: 'P416 Smoke NoBanner Event',
    });
  });

  test.afterAll(async () => {
    if (eventWithBanner?.id) await deleteTestEvent(eventWithBanner.id);
    if (eventNoBanner?.id) await deleteTestEvent(eventNoBanner.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('events list loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('event detail with banner loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'P416 Smoke Banner Event' })).toBeVisible({ timeout: 10000 });
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('event detail without banner loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/events/${eventNoBanner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'P416 Smoke NoBanner Event' })).toBeVisible({ timeout: 10000 });
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
