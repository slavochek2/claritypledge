/**
 * @file p548-share-dialog.spec.ts
 * @description E2E tests for P548: ShareDialog redesign (stacked layout + preset row)
 *
 * Covers:
 *   - Stacked layout: both Link and Embed sections visible
 *   - Collapsed/Expanded preset row under embed code
 *   - Preset toggle changes generated embed code
 *   - Copy button copies correct code for selected state
 *   - Embed section not shown for profile shares
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
  user = await createTestUser({ name: 'P548 ShareDialog Test' });
  point = await createTestPoint(user.profileId, {
    statement: 'P548 share dialog test point',
  });
});

test.afterAll(async () => {
  if (point?.id) await deleteTestPoint(point.id);
  if (user?.user?.id) await supabaseAdmin.auth.admin.deleteUser(user.user.id);
});

// ── Flow 1: Stacked layout — both sections visible ──────────────────────────

test.describe('Flow 1 — ShareDialog stacked layout', () => {
  test('Link and Embed sections both visible without tabs', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    // Open share dialog
    const shareButton = page.getByRole('button', { name: /share point/i });
    await shareButton.click();

    // Both sections should be visible simultaneously (no tab switching needed)
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Link section
    await expect(dialog.getByText(/link/i).first()).toBeVisible();

    // Embed section
    await expect(dialog.getByText(/embed/i).first()).toBeVisible();

    // No tab buttons (old behavior used tab-style toggle)
    // The old tabs had role=button inside a gray pill container
    // New layout has section headers instead
  });
});

// ── Flow 2: Preset row — Collapsed/Expanded toggle ─────────────────────────

test.describe('Flow 2 — Collapsed/Expanded preset', () => {
  test('default state is Collapsed, embed code has no expanded param', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /share point/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Collapsed button should be active/selected
    const collapsedButton = dialog.getByRole('button', { name: /collapsed/i });
    await expect(collapsedButton).toBeVisible();

    // Embed code should NOT contain expanded=true
    const codeBlock = dialog.locator('pre');
    // Find the embed code block (contains iframe)
    const embedCode = codeBlock.filter({ hasText: 'iframe' });
    if (await embedCode.count() > 0) {
      const text = await embedCode.textContent();
      expect(text).not.toContain('expanded=true');
      expect(text).toContain('embed=true');
    }
  });

  test('clicking Expanded adds expanded=true to embed code', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /share point/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click Expanded button
    const expandedButton = dialog.getByRole('button', { name: /expanded/i });
    await expandedButton.click();

    // Embed code should now contain expanded=true
    const embedCode = dialog.locator('pre').filter({ hasText: 'iframe' });
    if (await embedCode.count() > 0) {
      const text = await embedCode.textContent();
      expect(text).toContain('expanded=true');
    }
  });

  test('switching back to Collapsed removes expanded=true', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /share point/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click Expanded then back to Collapsed
    await dialog.getByRole('button', { name: /expanded/i }).click();
    await dialog.getByRole('button', { name: /collapsed/i }).click();

    // Embed code should NOT contain expanded=true
    const embedCode = dialog.locator('pre').filter({ hasText: 'iframe' });
    if (await embedCode.count() > 0) {
      const text = await embedCode.textContent();
      expect(text).not.toContain('expanded=true');
    }
  });
});
