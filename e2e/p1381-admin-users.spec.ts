/**
 * @file p1381-admin-users.spec.ts
 * @description P1381: /admin/users in a real browser against the TEST project.
 *
 * `unique_admin` allows one admin row, so the admin test borrows the slot from the
 * existing test-DB admin and afterAll hands it back. Serial: the slot is global state.
 * Screenshots land in test-results/p1381/ for visual QA.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe.configure({ mode: 'serial' });

const SHOTS = 'test-results/p1381';

test.describe('P1381 /admin/users', () => {
  let plain: TestUser;
  let admin: TestUser;
  let originalAdminId: string | null = null;

  test.beforeAll(async () => {
    plain = await createTestUser({ name: 'P1381 Plain Viewer' });
    admin = await createTestUser({ name: 'P1381 Admin Viewer' });
    const { data } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true).maybeSingle();
    originalAdminId = data?.id ?? null;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('profiles').update({ is_admin: false }).eq('id', admin.user.id);
    if (originalAdminId) {
      const { error } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', originalAdminId);
      if (error) throw new Error(`P1381 e2e FAILED TO RESTORE the test-DB admin ${originalAdminId}: ${error.message}`);
    }
    await deleteTestUser(admin.user.id);
    await deleteTestUser(plain.user.id);
  });

  test('smoke: signed out sees not-found', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByLabel('Search users')).toHaveCount(0);
    await expect(page.getByTestId('admin-user-row')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/signed-out.png` });
  });

  test('signed-in non-admin sees not-found, no rows', async ({ page }) => {
    await setTestSession(page, plain.email);
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel('Search users')).toHaveCount(0);
    await expect(page.getByTestId('admin-user-row')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/non-admin.png` });
  });

  test('admin sees the list, search works, layout holds at 4 widths', async ({ page }) => {
    if (originalAdminId) await supabaseAdmin.from('profiles').update({ is_admin: false }).eq('id', originalAdminId);
    const { error } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', admin.user.id);
    expect(error).toBeNull();

    await setTestSession(page, admin.email);
    await page.goto('/admin/users');
    const search = page.getByLabel('Search users');
    await expect(search).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('admin-user-row').first()).toBeVisible();

    // Ordering, scoped to this test's own users (the shared test DB has co-tenant sign-ins):
    // the admin signed in after the plain viewer, so the admin ranks above them.
    await search.fill('P1381 ');
    const own = page.getByTestId('admin-user-row');
    await expect(own.nth(0)).toContainText('P1381 Admin Viewer');
    await expect(own.nth(1)).toContainText('P1381 Plain Viewer');
    await search.fill('');

    for (const [w, h] of [[1280, 900], [768, 1000], [375, 800], [320, 700]] as const) {
      await page.setViewportSize({ width: w, height: h });
      expect(await page.evaluate(() => window.innerWidth)).toBe(w);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `horizontal overflow at ${w}px`).toBe(false);
      await page.screenshot({ path: `${SHOTS}/admin-${w}.png` });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await search.fill(plain.email);
    await expect(page.getByTestId('admin-user-row')).toHaveCount(1);
    await expect(page.getByTestId('admin-user-row')).toContainText('P1381 Plain Viewer');
    await page.screenshot({ path: `${SHOTS}/admin-search.png` });

    await search.fill('zz-no-such-person-zz');
    await expect(page.getByText('No one matches “zz-no-such-person-zz”.')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/admin-empty.png` });

    await page.getByLabel('Clear search').click();
    await expect(search).toHaveValue('');

    await page.getByRole('button', { name: /^Unverified/ }).click();
    await page.screenshot({ path: `${SHOTS}/admin-filter-unverified.png` });

    // Row click opens the profile.
    await page.getByRole('button', { name: /^All/ }).click();
    await search.fill(plain.email);
    await page.getByTestId('admin-user-row').getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`/p/${plain.slug}$`));
  });
});

