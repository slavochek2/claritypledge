/**
 * @file p878-people-picker.spec.ts
 * @description E2E tests for P878 — people picker UI on create-agreement-page.
 *
 * Tests run against the live dev server. They will fail until:
 *   1. The P878 migration is applied (search_profiles RPC exists)
 *   2. ProfilePickerInput + useProfileSearch are implemented
 *   3. create-agreement-page.tsx is wired with the picker
 *
 * data-testid contract (must be implemented by /dev):
 *   - data-testid="profile-picker-input"       — the text input
 *   - data-testid="profile-picker-dropdown"    — the dropdown container
 *   - data-testid="profile-picker-option"      — each result row (repeating)
 *   - data-testid="profile-picker-empty-state" — no-match message
 *   - data-testid="profile-picker-chip"        — selected-person chip
 *
 * Smoke test is the first test per tests.md rule (no standalone smoke file).
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
} from './helpers/test-user';
import {
  createTestAgreement,
  deleteTestAgreement,
} from './helpers/test-agreement';

// ─── Happy-path suite ────────────────────────────────────────────────────────

test.describe('P878: people picker — create-agreement-page', () => {
  let userAId: string;
  let userAEmail: string;
  let userBId: string;
  let userBName: string;
  let agreementId: string;

  test.beforeAll(async () => {
    const userA = await createTestUser({ name: 'P878UIUser' });
    userAId = userA.user.id;
    userAEmail = userA.email;

    const userB = await createTestUser({ name: 'P878UIContact' });
    userBId = userB.user.id;
    userBName = 'P878UIContact';

    const ag = await createTestAgreement(userAId, userB.email, {
      partnerProfileId: userBId,
      status: 'active',
      partnerSignedAt: new Date().toISOString(),
    });
    agreementId = ag.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    await Promise.all([deleteTestUser(userAId), deleteTestUser(userBId)]);
  });

  // ── Smoke ────────────────────────────────────────────────────────────────

  test('smoke: create-agreement-page loads, no console errors (ResizeObserver filtered)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // ResizeObserver loop warnings are benign browser noise — filter them out
        if (!text.includes('ResizeObserver loop')) {
          consoleErrors.push(text);
        }
      }
    });

    await setTestSession(page, userAEmail);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('; ')}`).toHaveLength(0);

    // ProfilePickerInput must be present
    await expect(page.getByTestId('profile-picker-input')).toBeVisible();
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  test('happy path: type ≥3 chars → dropdown ≤8 results with avatar+name+badge → click → chip', async ({ page }) => {
    await setTestSession(page, userAEmail);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('profile-picker-input');
    await input.click();
    await input.fill('P878UI'); // 6 chars — triggers search

    // Dropdown must appear
    const dropdown = page.getByTestId('profile-picker-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // ≤8 results
    const options = page.getByTestId('profile-picker-option');
    const count = await options.count();
    expect(count, 'Dropdown must show ≤8 results').toBeLessThanOrEqual(8);
    expect(count, 'At least one result must appear for a known contact').toBeGreaterThan(0);

    // Each result row has avatar, name, badge
    const firstOption = options.first();
    await expect(firstOption.locator('img, [data-testid="avatar"]').first()).toBeVisible();
    await expect(firstOption).toContainText(userBName);
    // Badge: verified or pledged indicator — at least one of these must be present
    const badgeLocator = firstOption.locator('[data-testid="verified-badge"], [data-testid="pledged-badge"], [aria-label*="verified"], [aria-label*="pledged"]');
    await expect(badgeLocator.first()).toBeVisible();

    // Click first option → chip appears, input disappears or is replaced
    await firstOption.click();
    await expect(page.getByTestId('profile-picker-chip')).toBeVisible();
    // Chip must show the contact's name
    await expect(page.getByTestId('profile-picker-chip')).toContainText(userBName);

    // Dropdown must close
    await expect(dropdown).not.toBeVisible();
  });

  // ── Empty state ──────────────────────────────────────────────────────────

  test('empty state shows verbatim UI Contract copy when no match in scope', async ({ page }) => {
    await setTestSession(page, userAEmail);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('profile-picker-input');
    await input.click();
    // Type something that cannot possibly match any test user name
    await input.fill('ZZZNoMatchXXX');

    const emptyState = page.getByTestId('profile-picker-empty-state');
    await expect(emptyState).toBeVisible({ timeout: 3000 });
    // Verbatim UI Contract string
    await expect(emptyState).toContainText(
      'No one you\'ve connected with matches. Enter their email to invite them.'
    );
  });

  // ── Email fallback ────────────────────────────────────────────────────────

  test('email fallback: typing a full email of a stranger still works (first-contact path)', async ({ page }) => {
    await setTestSession(page, userAEmail);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Type a full email that is NOT in the user's relationship scope
    const strangerEmail = 'p878-firstcontact-stranger@example.invalid';
    const input = page.getByTestId('profile-picker-input');
    await input.fill(strangerEmail);

    // The input value should still be the typed email (no crash, no empty)
    await expect(input).toHaveValue(strangerEmail);

    // Let debounce settle. If a dropdown appeared, it should show no results
    // (stranger has no relationship). What must NOT happen: a JS error, blank
    // page, or UI freeze — this is a lightweight smoke check on the fallback path.
    await page.waitForTimeout(600);
    const dropdown = page.getByTestId('profile-picker-dropdown');
    const isDropdownVisible = await dropdown.isVisible().catch(() => false);
    if (isDropdownVisible) {
      const options = page.getByTestId('profile-picker-option');
      expect(await options.count()).toBe(0);
    }
  });
});

// ─── Fresh user with no relationships ────────────────────────────────────────

test.describe('P878: fresh user with no relationships — empty state on any input', () => {
  let freshUserId: string;
  let freshUserEmail: string;

  test.beforeAll(async () => {
    const fresh = await createTestUser({ name: 'P878FreshUser' });
    freshUserId = fresh.user.id;
    freshUserEmail = fresh.email;
  });

  test.afterAll(async () => {
    await deleteTestUser(freshUserId);
  });

  test('fresh user with no relationships sees empty state on any 3-char name search', async ({ page }) => {
    await setTestSession(page, freshUserEmail);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('profile-picker-input');
    await input.fill('Ali'); // Common name — should return zero results for a fresh user

    const emptyState = page.getByTestId('profile-picker-empty-state');
    await expect(emptyState).toBeVisible({ timeout: 3000 });
    await expect(emptyState).toContainText(
      'No one you\'ve connected with matches. Enter their email to invite them.'
    );
  });
});
