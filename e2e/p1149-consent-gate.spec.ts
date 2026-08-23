/**
 * @file p1149-consent-gate.spec.ts
 * @description P1149 DW-2: consent blocks mic access until accepted; declining leaves
 * the room. The join button stays disabled until the recording-consent toggle is set
 * (founder decision: "Consent — KISS, matching /live").
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P1149: /transcribe Consent Gate', () => {
  let testUser: TestUser;

  test.beforeEach(async ({ page }) => {
    testUser = await createTestUser({ name: 'P1149 Consent Test User' });

    // Track getUserMedia calls WITHOUT granting mic — proves the mic is never touched
    // before consent is given (DW-2's first half).
    await page.addInitScript(() => {
      (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls = 0;
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls++;
        return orig(constraints);
      };
    });

    await setTestSession(page, testUser.email);
    await page.goto('/transcribe');
    await expect(page.getByTestId('transcribe-consent-screen')).toBeVisible();
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('the mic is never requested before consent is given', async ({ page }) => {
    const calls = await page.evaluate(() => (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls);
    expect(calls).toBe(0);
  });

  test('the join button is disabled until the recording-consent toggle is set', async ({ page }) => {
    const joinButton = page.getByTestId('transcribe-join-button');
    await expect(joinButton).toBeDisabled();

    await page.getByTestId('transcribe-recording-toggle').click();
    await expect(joinButton).toBeEnabled();
  });

  test('declining leaves the room — navigates away without joining', async ({ page }) => {
    await page.getByRole('button', { name: /leave/i }).click();
    // A signed-in user landing on "/" is redirected onward by the app (e.g. to /feed) —
    // the invariant this test proves is "no longer on /transcribe", not a literal "/".
    await expect(page).not.toHaveURL(/\/transcribe/);

    const calls = await page.evaluate(() => (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls);
    expect(calls).toBe(0);
  });
});
