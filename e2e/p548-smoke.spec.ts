/**
 * @file p548-smoke.spec.ts
 * @description Smoke tests for P548: Embed collapse control
 *
 * Fast regression detection — verifies embed pages load without errors
 * and ShareDialog opens without crashing.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import type { TestUser } from './helpers/test-user';
import type { TestPoint } from './helpers/test-point';

let user: TestUser;
let point: TestPoint;

test.beforeAll(async () => {
  user = await createTestUser({ name: 'P548 Smoke' });
  point = await createTestPoint(user.profileId, {
    statement: 'P548 smoke test point',
  });
});

test.afterAll(async () => {
  if (point?.id) await deleteTestPoint(point.id);
  if (user?.user?.id) await supabaseAdmin.auth.admin.deleteUser(user.user.id);
});

test('point embed loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`/point/${point.id}?embed=true`);
  await page.waitForLoadState('networkidle');

  // Page should render (not blank)
  await expect(page.locator('body')).not.toBeEmpty();

  // No JS errors
  const criticalErrors = errors.filter(e =>
    !e.includes('favicon') && !e.includes('404')
  );
  expect(criticalErrors).toHaveLength(0);
});

test('point embed with expanded=true loads without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`/point/${point.id}?embed=true&expanded=true`);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('body')).not.toBeEmpty();

  const criticalErrors = errors.filter(e =>
    !e.includes('favicon') && !e.includes('404')
  );
  expect(criticalErrors).toHaveLength(0);
});

test('ShareDialog opens on point detail page', async ({ page }) => {
  await setTestSession(page, user.email);
  await page.goto(`/point/${point.id}`);
  await page.waitForLoadState('networkidle');

  const shareButton = page.getByRole('button', { name: /share point/i });
  await shareButton.click();

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
});
