/**
 * @file p878-picker-accessibility.spec.ts
 * @description Accessibility tests for P878 — ProfilePickerInput component.
 *
 * Tests:
 * - Keyboard navigation through dropdown (arrow keys / Tab)
 * - Enter selects focused option
 * - Escape closes dropdown and restores focus to input
 * - ARIA attributes: role="listbox" on dropdown, role="option" on rows,
 *   aria-expanded on input, aria-activedescendant tracking
 *
 * Note: axe-core is NOT installed in this project (per p847 precedent).
 * Tests use manual ARIA attribute assertions. Add an axe sweep if axe-core is
 * added to the project in future.
 *
 * Tests will fail until ProfilePickerInput implements the ARIA contract.
 * /dev must implement:
 *   - role="combobox" + aria-expanded on the input
 *   - role="listbox" on the dropdown container
 *   - role="option" on each result row
 *   - aria-activedescendant on input tracking focused option id
 *   - Escape → close + focus back to input
 *   - ArrowDown / ArrowUp → move aria-activedescendant
 *   - Enter → select focused option
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
} from '../helpers/test-user';
import {
  createTestAgreement,
  deleteTestAgreement,
} from '../helpers/test-agreement';
import type { TestUser } from '../helpers/test-user';

let userA: TestUser;
let userBId: string;
let agreementId: string;

test.beforeAll(async () => {
  userA = await createTestUser({ name: 'P878A11yUserA' });
  const userB = await createTestUser({ name: 'P878A11yContact' });
  userBId = userB.user.id;

  const ag = await createTestAgreement(userA.user.id, userB.email, {
    partnerProfileId: userBId,
    status: 'active',
    partnerSignedAt: new Date().toISOString(),
  });
  agreementId = ag.id;
});

test.afterAll(async () => {
  if (agreementId) await deleteTestAgreement(agreementId);
  await Promise.all([deleteTestUser(userA.user.id), deleteTestUser(userBId)]);
});

test.describe('P878: ProfilePickerInput accessibility', () => {

  // ── ARIA attributes ───────────────────────────────────────────────────────

  test('input has role="combobox" and aria-expanded reflects dropdown open/closed', async ({ page }) => {
    await setTestSession(page, userA.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('profile-picker-input');

    // Before opening: aria-expanded must be "false"
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toHaveAttribute('role', 'combobox');

    // Type to open dropdown
    await input.fill('P878A11y');
    const dropdown = page.getByTestId('profile-picker-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Now aria-expanded must be "true"
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    // Dropdown must have role="listbox"
    await expect(dropdown).toHaveAttribute('role', 'listbox');

    // Each option must have role="option"
    const firstOption = page.getByTestId('profile-picker-option').first();
    await expect(firstOption).toHaveAttribute('role', 'option');
  });

  // ── Keyboard: Escape closes, focus returns ────────────────────────────────

  test('Escape closes dropdown and returns focus to input', async ({ page }) => {
    await setTestSession(page, userA.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('profile-picker-input');
    await input.fill('P878A11y');
    const dropdown = page.getByTestId('profile-picker-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Escape');

    // Dropdown must close
    await expect(dropdown).not.toBeVisible();

    // aria-expanded must revert to "false"
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    // Focus must return to the input
    await expect(input).toBeFocused();
  });

  // ── Keyboard: ArrowDown + Enter selects ──────────────────────────────────

  test('ArrowDown moves focus to first option; Enter selects it and closes dropdown', async ({ page }) => {
    await setTestSession(page, userA.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('profile-picker-input');
    await input.fill('P878A11y');
    const dropdown = page.getByTestId('profile-picker-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // ArrowDown should move focus / aria-activedescendant to first option
    await page.keyboard.press('ArrowDown');

    // The first option should be focused (or aria-activedescendant points to it)
    const firstOption = page.getByTestId('profile-picker-option').first();
    const optionId = await firstOption.getAttribute('id');
    if (optionId) {
      // Check aria-activedescendant points to the focused option
      const activeDesc = await input.getAttribute('aria-activedescendant');
      expect(
        activeDesc,
        'aria-activedescendant must point to the focused option'
      ).toBe(optionId);
    }

    // Enter must select the focused option
    await page.keyboard.press('Enter');

    // Dropdown closes
    await expect(dropdown).not.toBeVisible();

    // Chip appears (selection was made)
    await expect(page.getByTestId('profile-picker-chip')).toBeVisible();
  });
});
