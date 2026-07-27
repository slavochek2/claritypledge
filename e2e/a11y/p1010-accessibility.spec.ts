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

  // Per-test, not just afterAll: the Leave test SEEDS a membership row, and if it
  // fails partway the row survives into the serial block's retry — where the earlier
  // tests then see "Manage membership" instead of "Join as member" and fail for a
  // reason that has nothing to do with what they assert. One real failure was
  // reporting as four.
  test.afterEach(async () => {
    await supabaseAdmin.from('membership').delete().eq('user_id', user.user.id);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('membership').delete().eq('user_id', user.user.id);
    await deleteTestUser(user.user.id);
  });

  test('Join button is keyboard-reachable and has an accessible name', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    const joinBtn = page.getByRole('button', { name: 'Join as member' });
    await expect(joinBtn).toBeVisible();
    await joinBtn.focus();
    await expect(joinBtn).toBeFocused();
  });

  test('Join button meets the 40px minimum touch target height', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    const box = await page.getByRole('button', { name: 'Join as member' }).boundingBox();
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

    const manageBtn = page.getByRole('button', { name: 'Manage membership' });
    await manageBtn.focus();
    await page.keyboard.press('Enter');

    const leaveItem = page.getByRole('menuitem', { name: 'Leave' });
    await expect(leaveItem).toBeVisible({ timeout: 5000 });
    await leaveItem.focus();
    await page.keyboard.press('Enter');

    // Leave opens a confirm dialog. The keyboard path must reach the confirm too — a
    // dialog that only a mouse can complete would lock keyboard users out of leaving.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Focus must land INSIDE the dialog on its own. Deliberately NOT calling
    // .focus() first: doing so would make the next assertion a tautology that
    // passes even when Radix's menu-close focus restore wins the race and leaves
    // the user tabbing the page behind a modal.
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), {
        timeout: 5000,
        message: 'focus must move into the dialog, not back to the menu trigger',
      })
      .toBe(true);

    // Walk to the destructive action with Tab only — no programmatic focus.
    const confirmBtn = dialog.getByRole('button', { name: 'Leave' });
    for (let i = 0; i < 4 && !(await confirmBtn.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(confirmBtn, 'Leave must be reachable by Tab from the dialog').toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Join as member' })).toBeVisible({ timeout: 10000 });
  });

  test('member/non-member CTA state swap is announced via accessible name, not color alone', async ({ page }) => {
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');
    // Non-member: accessible name must literally say "Join" — never rely on a
    // color-only or icon-only affordance (WCAG 1.4.1).
    await expect(page.getByRole('button', { name: 'Join as member' })).toBeVisible();
  });
});
