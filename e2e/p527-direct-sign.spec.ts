/**
 * @file p527-direct-sign.spec.ts
 * @description E2E tests for P527: Direct Sign for New Users.
 *
 * Tests the core flow: new user signs agreement without email round-trip.
 * The edge function `create-and-sign` handles server-side user creation,
 * profile creation, agreement acceptance, and session token generation.
 *
 * NOTE: These tests call the real edge function on the test project.
 * No mocking — the full server-side flow executes.
 */

import { test, expect as _expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteTestUserByEmail as _deleteTestUserByEmail,
  setTestSession as _setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestAgreement as _createTestAgreement,
  deleteTestAgreement as _deleteTestAgreement,
  type TestAgreement as _TestAgreement,
} from './helpers/test-agreement';

test.describe('P527 — Direct Sign for New Users', () => {
  test.setTimeout(60000);

  let creator: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P527 Creator' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  // ── 1. Happy path: new user signs directly ──────────────────────────────

  test('TC-01: new user signs agreement without email round-trip', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // This is the primary AC-1 test.
    //
    // Setup:
    //   1. Create agreement with a fresh email (no existing account)
    //   2. Navigate to /agreements/:id/accept?token=<invitation_token>
    //
    // Steps:
    //   3. Assert: page shows editable name field + sign button
    //   4. Fill in partner name
    //   5. Click the sign button
    //   6. Wait for edge function response + session establishment
    //   7. Assert: page navigates to /agreements/:id (signed agreement view)
    //   8. Assert: agreement shows both signatures (creator + partner)
    //   9. Assert: agreement status is 'active'
    //   10. Assert: NO redirect to /agreements/confirm-email occurred
    //
    // Cleanup: delete the new user by email
    test.skip();
  });

  test('TC-02: new user has valid session after signing (AC-2)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // After direct-sign succeeds:
    //   1. Complete the direct-sign flow (TC-01 steps)
    //   2. Navigate to a different authenticated page (e.g., /connections)
    //   3. Assert: page loads (not redirected to login)
    //   4. Refresh the page
    //   5. Assert: session persists (still authenticated)
    test.skip();
  });

  test('TC-03: new user profile is complete after signing (AC-3)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // After direct-sign succeeds:
    //   1. Complete the direct-sign flow
    //   2. Query profiles table via supabaseAdmin for the partner email
    //   3. Assert: profile.name matches the name entered in the form
    //   4. Assert: profile.email matches the invitation partner_email
    //   5. Assert: profile.slug is non-null and follows the slug format
    //   6. Assert: profile.avatar_color is one of the palette colors
    //   7. Assert: profile.is_verified === true
    test.skip();
  });

  test('TC-04: agreement is active with partner data set (AC-4)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // After direct-sign succeeds:
    //   1. Complete the direct-sign flow
    //   2. Query clarity_agreements via supabaseAdmin
    //   3. Assert: status === 'active'
    //   4. Assert: partner_profile_id is non-null
    //   5. Assert: partner_signed_at is non-null
    //   6. Assert: partner_display_name matches entered name
    test.skip();
  });

  // ── 2. Existing user: unchanged (regression) ───────────────────────────

  test('TC-05: existing user flow is unchanged — P488 path still works (AC-6)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // Regression test: P488 magic link flow for existing users is NOT affected.
    //
    // Setup:
    //   1. Create existing partner user + agreement targeting their email
    //   2. Set session for existing partner
    //   3. Navigate to accept page
    //
    // Assert:
    //   4. Page shows "I Accept & Co-Sign" (authenticated partner flow)
    //   5. NOT the direct-sign flow (name input + sign button for new users)
    test.skip();
  });

  // ── 3. Fallback: edge function failure → OTP flow (AC-8) ───────────────

  test('TC-06: falls back to OTP flow when edge function fails (AC-8)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // Simulate edge function failure:
    //   1. Create agreement for new user email
    //   2. Navigate to accept page
    //   3. Mock/intercept the create-and-sign edge function to return 500
    //   4. Fill name, click sign
    //   5. Assert: page falls back to OTP flow (email confirmation interstitial)
    //   6. Assert: navigates to /agreements/confirm-email
    test.skip();
  });

  // ── 4. Decline flow unchanged (AC-10) ──────────────────────────────────

  test('TC-07: decline flow for new users is unchanged (AC-10)', async ({ page: _page }) => {
    // TODO: Implement in /dev
    //   1. Create agreement for new user email
    //   2. Navigate to accept page
    //   3. Click decline button
    //   4. Confirm decline dialog
    //   5. Assert: agreement status is 'declined'
    //   6. Assert: no account was created for the partner email
    test.skip();
  });

  // ── 5. Edge cases ──────────────────────────────────────────────────────

  test('TC-08: replaying a consumed token does not create a second account', async ({ page: _page }) => {
    // TODO: Implement in /dev
    // AC-9: token is consumed after signing.
    //   1. Complete direct-sign flow (token consumed, agreement active)
    //   2. Navigate to same accept URL with same token
    //   3. Assert: page shows invalid/expired state (not a sign button)
    //   4. Assert: no duplicate account created
    test.skip();
  });

  test('TC-09: expired invitation token shows invalid state', async ({ page: _page }) => {
    // TODO: Implement in /dev
    //   1. Create agreement with invitation_expires_at in the past
    //   2. Navigate to accept page with that token
    //   3. Assert: invalid/expired state shown
    //   4. Assert: no sign button visible
    test.skip();
  });

  test('TC-10: empty partner name is rejected', async ({ page: _page }) => {
    // TODO: Implement in /dev
    //   1. Navigate to accept page as new user
    //   2. Leave name field empty
    //   3. Assert: sign button is disabled or shows validation error
    //   4. Assert: edge function is not called
    test.skip();
  });
});
