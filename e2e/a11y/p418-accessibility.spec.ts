/**
 * @file p418-accessibility.spec.ts
 * @description Accessibility tests for P418: Banner Search Fallback
 *
 * Tests:
 * - Search input has an accessible label
 * - Search input is keyboard focusable after failure
 * - Search can be submitted via Enter key (not just clicking the Search button)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';

const EMPTY_UNSPLASH_RESPONSE = { results: [], total: 0 };

test.describe('P418 Accessibility — Banner Search Fallback', () => {
  test.describe.configure({ timeout: 40000 });

  let host: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P418 A11y Host' });
    event = await createTestEvent(host.user.id, undefined, { title: 'P418 A11y Event' });
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  // ── Accessible label ───────────────────────────────────────────────────────
  test('search input has an accessible label', async ({ page }) => {
    await setTestSession(page, host.email);

    await page.route('**/api.unsplash.com/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_UNSPLASH_RESPONSE) })
    );

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new banner/i }).click();

    // getByRole with name option enforces accessible name via aria-label, aria-labelledby, or <label>
    const input = page.getByRole('textbox', { name: /search/i });
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  // ── Keyboard focus ─────────────────────────────────────────────────────────
  test('search input is keyboard focusable after failure', async ({ page }) => {
    await setTestSession(page, host.email);

    await page.route('**/api.unsplash.com/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_UNSPLASH_RESPONSE) })
    );

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new banner/i }).click();

    const input = page.getByRole('textbox', { name: /search/i });
    await expect(input).toBeVisible({ timeout: 5000 });

    await input.focus();
    await expect(input).toBeFocused();
  });

  // ── Enter to submit ────────────────────────────────────────────────────────
  test('pressing Enter in search input submits the search', async ({ page }) => {
    await setTestSession(page, host.email);

    // First call: empty (triggers fallback); second call: still empty (verifies submit happened)
    let callCount = 0;
    await page.route('**/api.unsplash.com/**', route => {
      callCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_UNSPLASH_RESPONSE) });
    });

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new banner/i }).click();

    const input = page.getByRole('textbox', { name: /search/i });
    await expect(input).toBeVisible({ timeout: 5000 });

    await input.fill('forest trail');
    await input.press('Enter');

    // A second Unsplash call was made (search was submitted)
    await expect(async () => {
      expect(callCount).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5000 });
  });
});
