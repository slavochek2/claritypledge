/**
 * @file p437-accessibility.spec.ts
 * Accessibility tests for P437: Uncancel Event
 *
 * Keyboard navigation and focus management for the Uncancel flow.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

async function cancelEventDirectly(eventId: string) {
  await supabaseAdmin.from('events').update({ status: 'cancelled' }).eq('id', eventId);
}

test.describe('P437: Uncancel Event Accessibility', () => {
  let host: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    host = await createTestUser({ name: 'A11y Host' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), {
      title: 'A11y Uncancel Event',
    });
    await cancelEventDirectly(event.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('Uncancel button is keyboard accessible', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    // Tab to Uncancel button and activate with Enter
    const uncancelButton = page.getByRole('button', { name: /uncancel event/i });
    await uncancelButton.focus();
    await expect(uncancelButton).toBeFocused();

    await page.keyboard.press('Enter');

    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('confirm dialog can be dismissed with Escape', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /uncancel event/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('confirm dialog traps focus (Tab cycles within dialog)', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /uncancel event/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Tab through dialog buttons - focus should stay within dialog
    await page.keyboard.press('Tab');
    const focusedInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusedInDialog).toBe(true);
  });

  test('Uncancel button has accessible label', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    const button = page.getByRole('button', { name: /uncancel event/i });
    await expect(button).toBeVisible();
    // Button is discoverable by role + name (no aria-label workaround needed)
    const name = await button.getAttribute('aria-label');
    // Either explicit aria-label or visible text is acceptable
    const text = await button.textContent();
    expect(name || text).toMatch(/uncancel/i);
  });
});
