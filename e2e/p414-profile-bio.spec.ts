/**
 * @file p414-profile-bio.spec.ts
 * @description E2E tests for P414: Profile bio
 *
 * Tests:
 * - Bio displays below role on the profile card (when set)
 * - Bio is hidden when empty (no blank space)
 * - URLs in bio render as clickable links
 * - Bio is editable in settings (textarea + char counter + hint)
 * - Saving bio persists and reflects on profile
 * - 160-char limit enforced in the textarea
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P414 — Profile Bio', () => {
  test.setTimeout(45000);

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P414 Bio User', role: 'Executive Coach' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test.afterEach(async () => {
    // Reset bio to null after each test
    await supabaseAdmin.from('profiles').update({ bio: null }).eq('id', user.user.id);
  });

  // ── Display: bio shown when set ──────────────────────────────────────────
  test('bio displays below role on profile card when set', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'Helping leaders communicate with clarity.' })
      .eq('id', user.user.id);

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Helping leaders communicate with clarity.')
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Display: bio hidden when empty ───────────────────────────────────────
  test('bio section is absent when bio is null', async ({ page }) => {
    // bio is already null (reset in afterEach / initial state)
    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile card renders without a bio section
    await expect(page.getByTestId('profile-bio')).not.toBeAttached();
  });

  // ── Display: URLs in bio render as links ─────────────────────────────────
  test('URL in bio renders as a clickable link', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'linkedin.com/in/p414testuser' })
      .eq('id', user.user.id);

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const link = page.locator('a[href="https://linkedin.com/in/p414testuser"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // ── Settings: bio textarea present ───────────────────────────────────────
  test('settings page shows bio textarea with hint and counter', async ({ page }) => {
    await setTestSession(page, user.email);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const textarea = page.getByLabel(/bio/i);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Hint text
    await expect(page.getByText(/links auto-detected/i)).toBeVisible({ timeout: 5000 });

    // Counter shows 0 / 160 initially
    await expect(page.getByText(/0\s*\/\s*160/)).toBeVisible({ timeout: 5000 });
  });

  // ── Settings: char counter updates live ──────────────────────────────────
  test('char counter updates as user types', async ({ page }) => {
    await setTestSession(page, user.email);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const textarea = page.getByLabel(/bio/i);
    await textarea.fill('Hello world');

    await expect(page.getByText(/11\s*\/\s*160/)).toBeVisible({ timeout: 5000 });
  });

  // ── Settings: 160-char limit enforced ────────────────────────────────────
  test('textarea does not accept more than 160 characters', async ({ page }) => {
    await setTestSession(page, user.email);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const textarea = page.getByLabel(/bio/i);
    const over160 = 'A'.repeat(170);
    await textarea.fill(over160);

    const value = await textarea.inputValue();
    expect(value.length).toBeLessThanOrEqual(160);
  });

  // ── Settings: save persists bio ──────────────────────────────────────────
  test('saving bio in settings persists and shows on profile', async ({ page }) => {
    await setTestSession(page, user.email);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const textarea = page.getByLabel(/bio/i);
    await textarea.fill('Coaching with clarity since 2015.');

    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 5000 });

    // Navigate to profile and verify bio is shown
    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Coaching with clarity since 2015.')
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Settings: bio pre-populated if already set ───────────────────────────
  test('settings textarea pre-populates with existing bio', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'Pre-existing bio text.' })
      .eq('id', user.user.id);

    await setTestSession(page, user.email);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const textarea = page.getByLabel(/bio/i);
    await expect(textarea).toHaveValue('Pre-existing bio text.', { timeout: 10000 });
  });
});
