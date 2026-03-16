/**
 * @file p527-smoke.spec.ts
 * @description Smoke tests for P527: Direct Sign for New Users.
 *
 * Fast regression detection — verifies accept page loads correctly
 * and the create-and-sign edge function endpoint is reachable.
 */

import { test, expect as _expect } from '@playwright/test';
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

test.describe('P527 — Smoke Tests', () => {
  test.setTimeout(30000);

  let creator: TestUser;
  let agreement: TestAgreement;
  const partnerEmail = `p527-smoke-${Date.now()}@gmail.com`;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P527 Smoke Creator' });
    agreement = await createTestAgreement(creator.user.id, partnerEmail);
  });

  test.afterAll(async () => {
    if (agreement?.id) await deleteTestAgreement(agreement.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test('accept page loads for new user without console errors', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // 1. Navigate to /agreements/:id/accept?token=<token>
    // 2. Collect console errors
    // 3. Assert: page renders (main heading visible)
    // 4. Assert: no console errors
    // 5. Assert: sign button visible (new user flow)
    test.skip();
  });

  test('accept page renders name input and sign button', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // 1. Navigate to accept page
    // 2. Assert: name input field visible
    // 3. Assert: sign button visible
    // 4. Assert: no "check your email" content visible
    test.skip();
  });

  test('create-and-sign edge function endpoint is reachable', async ({ request: _request }) => {
    // TODO: Implement in /dev
    // 1. POST to the edge function with invalid body
    // 2. Assert: returns 4xx (not 404 or 502)
    // 3. This confirms the function is deployed and reachable
    test.skip();
  });
});
