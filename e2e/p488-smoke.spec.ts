/**
 * @file p488-smoke.spec.ts
 * @description Smoke tests for P488: Invite Auto-Auth via Token.
 *
 * Lightweight checks that the accept page loads without errors
 * across all entry paths. No user interactions beyond navigation.
 */

import { test } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import {
  createTestAgreement,
  deleteTestAgreement,
  type TestAgreement,
} from './helpers/test-agreement';

test.describe('P488 — Smoke Tests', () => {
  test.setTimeout(30000);

  let creator: TestUser;
  let agreement: TestAgreement;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P488 Smoke Creator' });
    agreement = await createTestAgreement(
      creator.user.id,
      `p488-smoke-partner-${Date.now()}@gmail.com`,
    );
  });

  test.afterAll(async () => {
    if (agreement?.id) await deleteTestAgreement(agreement.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test('accept page loads without console errors (unauthenticated)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // Steps:
    //   1. Collect console errors during navigation
    //   2. Navigate to /agreements/:id/accept?token=<token>
    //   3. Wait for page to settle
    //   4. Assert: no console.error messages (filter out known noise)
    //   5. Assert: page is not blank — some content rendered
    test.skip();
  });

  test('accept page loads without console errors (with error hash)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // Steps:
    //   1. Navigate to accept URL with #error=access_denied hash
    //   2. Assert: no unhandled JS errors
    //   3. Assert: page renders content (not a crash/blank screen)
    test.skip();
  });

  test('accept page returns 200 for valid token', async ({ request: _request }) => {
    // TODO: Implement in /dev
    // Steps:
    //   1. HTTP GET /agreements/:id/accept?token=<valid_token>
    //   2. Assert: response status is 200 (SPA serves index.html)
    test.skip();
  });
});
