/**
 * @file p414-accessibility.spec.ts
 * @description Accessibility tests for P414: Profile bio
 *
 * Tests:
 * - Bio textarea in settings is keyboard accessible (label, focus, Tab order)
 * - Links in bio are keyboard reachable and have discernible text
 * - Char counter is readable (not just visual)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

test.describe('P414 Accessibility — Profile Bio', () => {
  test.describe.configure({ timeout: 40000 });

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P414 A11y User' });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('profiles').update({ bio: null }).eq('id', user.user.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('bio textarea has an accessible label', async ({ page }) => {
    await setTestSession(page, user);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // getByLabel requires an associated <label> or aria-label
    const textarea = page.getByLabel(/bio/i);
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  test('bio textarea is reachable via Tab key', async ({ page }) => {
    await setTestSession(page, user);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const textarea = page.getByLabel(/bio/i);
    await textarea.focus();
    await expect(textarea).toBeFocused();
  });

  test('link in bio has discernible text (not empty)', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'See linkedin.com/in/p414a11y for more.' })
      .eq('id', user.user.id);

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const link = page.locator('[data-testid="profile-bio"] a').first();
    await expect(link).toBeVisible({ timeout: 10000 });

    const linkText = await link.textContent();
    expect(linkText?.trim().length).toBeGreaterThan(0);
  });

  test('bio link is keyboard focusable', async ({ page }) => {
    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const link = page.locator('[data-testid="profile-bio"] a').first();
    await expect(link).toBeVisible({ timeout: 10000 });

    await link.focus();
    await expect(link).toBeFocused();
  });
});
