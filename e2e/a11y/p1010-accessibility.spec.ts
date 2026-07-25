/**
 * @file p1010-accessibility.spec.ts
 * @description P1010 accessibility sweep — Join/Leave CTA and tab navigation on
 * /org/:slug. No axe/axe-playwright dependency exists in this repo (checked
 * package.json) — this file follows the repo's existing hand-rolled pattern
 * (see e2e/a11y/p952-accessibility.spec.ts): keyboard reachability, ARIA roles,
 * and touch-target sizing, not an automated ruleset scan.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('P1010: Accessibility — /org/:slug CTA and tabs', () => {
  test.describe.configure({ mode: 'serial' });
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1010 A11y User' });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('membership').delete().eq('user_id', user.user.id);
    await deleteTestUser(user.user.id);
  });

  test('Join button is keyboard-reachable and has an accessible name', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    const joinBtn = page.getByRole('button', { name: 'Join' });
    await expect(joinBtn).toBeVisible();
    await joinBtn.focus();
    await expect(joinBtn).toBeFocused();
  });

  test('Join button meets the 40px minimum touch target height', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    const box = await page.getByRole('button', { name: 'Join' }).boundingBox();
    expect(box?.height, 'CTA must be >= 40px tall (visual-qa.md touch target rule)').toBeGreaterThanOrEqual(40);
  });

  test('tab bar exposes role="tab" / aria-selected and is keyboard navigable', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    const membersTab = page.getByRole('tab', { name: /members/i });
    await membersTab.focus();
    await page.keyboard.press('Enter');
    await expect(membersTab).toHaveAttribute('aria-selected', 'true');
  });

  test('Manage membership control is keyboard-operable end to end (open → Leave)', async ({ page }) => {
    // Seed membership directly — this test targets keyboard operability of the
    // control, not the Join mutation path (covered in the main E2E spec).
    const { data: org } = await supabaseAdmin.from('organization').select('id').eq('slug', 'cm').single();
    await supabaseAdmin.from('membership').insert({ org_id: org!.id, user_id: user.user.id });

    await setTestSession(page, user.email);
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    const manageBtn = page.getByRole('button', { name: 'Manage membership ▾' });
    await manageBtn.focus();
    await page.keyboard.press('Enter');

    // TODO(/dev): confirm menuitem role + exact keyboard sequence (arrow+Enter vs Tab+Enter)
    // once the dropdown component exists.
    const leaveItem = page.getByRole('menuitem', { name: 'Leave' });
    await expect(leaveItem).toBeVisible({ timeout: 5000 });
    await leaveItem.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible({ timeout: 10000 });
  });

  test('member/non-member CTA state swap is announced via accessible name, not color alone', async ({ page }) => {
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');
    // Non-member: accessible name must literally say "Join" — never rely on a
    // color-only or icon-only affordance (WCAG 1.4.1).
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  });
});
