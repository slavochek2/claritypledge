/**
 * @file p1149-auth-gate.spec.ts
 * @description P1149 DW-1: `/transcribe` is reachable only when signed in; signed-out
 * visitors are redirected. Modeled on e2e/live-page-auth-gate.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P1149: /transcribe Auth Gate', () => {
  test.describe('Guest User (not logged in)', () => {
    test('redirects to /login when visiting /transcribe without being signed in', async ({ page }) => {
      await page.goto('/transcribe');
      await expect(page).toHaveURL(/\/login\?redirect=%2Ftranscribe/);
    });

    test('redirects to /login when visiting /transcribe/:code without being signed in', async ({ page }) => {
      await page.goto('/transcribe/TEST123');
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  });

  test.describe('Logged-in User', () => {
    let testUser: TestUser;

    test.beforeEach(async () => {
      testUser = await createTestUser({ name: 'P1149 Test User' });
    });

    test.afterEach(async () => {
      if (testUser?.user?.id) {
        await deleteTestUser(testUser.user.id);
      }
    });

    test('can access /transcribe and sees the consent screen, not a redirect', async ({ page }) => {
      await setTestSession(page, testUser.email);
      await page.goto('/transcribe');

      await expect(page).toHaveURL('/transcribe');
      await expect(page.getByTestId('transcribe-consent-screen')).toBeVisible();
    });
  });
});
