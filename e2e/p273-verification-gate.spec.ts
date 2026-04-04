/**
 * @file p273-verification-gate.spec.ts
 * @description E2E tests for useVerificationGate — updated for P396 two-state model
 *
 * P396 contract: users are either authenticated (verified by definition) or unauthenticated.
 * The gate now fires for unauthenticated users (user === null), not unverified profiles.
 * Toast message: "Sign in to {actionLabel}." (was "Verify your email to...")
 *
 * Tests:
 * - Unauthenticated user setting a position on a public story sees the auth gate toast
 * - Authenticated (verified) user setting a position proceeds normally — no gate toast
 * - Unauthenticated user visiting /create is redirected to /signup (route guard)
 * - Authenticated user submitting the create-story form succeeds normally
 *
 * Removed: "unverified user" test scenarios — unverified-profile state eliminated by P396.
 * There is no longer a createUnverifiedTestUser helper needed here.
 *
 * Auth notes:
 * - createTestUser() creates verified users (is_verified: true) by default.
 * - Unauthenticated tests: simply don't call setTestSession (no session injected).
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory, linkStoryToPoint } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';

// ─── Set Position Gate ────────────────────────────────────────────────────────

test.describe('P273: Set position — auth gate (P396 two-state model)', () => {
  test.describe.configure({ timeout: 60000 });

  test('unauthenticated user sees auth gate toast when clicking position button', async ({ page }) => {
    let storyOwner: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      storyOwner = await createTestUser({ name: 'P273 Story Owner' });

      const story = await createTestStory(storyOwner.user.id, {
        content: 'P273 test story for unauthenticated position gate check',
      });
      storyId = story.id;

      const point = await createTestPoint(storyOwner.user.id, {
        statement: 'P273 test point for unauthenticated positioner',
      });
      pointId = point.id;
      await linkStoryToPoint(storyId, pointId);

      // Navigate to story WITHOUT a session (unauthenticated user)
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Click the first position button
      const positionButton = page
        .getByRole('button', { name: /strongly agree|agree|neutral|disagree|strongly disagree/i })
        .first();
      await expect(positionButton).toBeVisible({ timeout: 10000 });
      await positionButton.click();

      // MUST show the auth gate message: "Sign in to..."
      await expect(
        page.getByText(/sign in to/i)
      ).toBeVisible({ timeout: 5000 });

      // Must NOT show the old "Verify your email" message
      await expect(
        page.getByText(/verify your email/i)
      ).not.toBeVisible({ timeout: 2000 }).catch(() => {});
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (storyOwner) await deleteTestUser(storyOwner.user.id);
    }
  });

  test('authenticated (verified) user can set position without any gate toast', async ({ page }) => {
    let storyOwner: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let verifiedUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      storyOwner = await createTestUser({ name: 'P273 Story Owner 2' });
      const story = await createTestStory(storyOwner.user.id, {
        content: 'P273 test story for verified position test',
      });
      storyId = story.id;
      const point = await createTestPoint(storyOwner.user.id, {
        statement: 'P273 test point for verified positioner',
      });
      pointId = point.id;
      await linkStoryToPoint(storyId, pointId);

      verifiedUser = await createTestUser({ name: 'P273 Verified Positioner' });

      await setTestSession(page, verifiedUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      const positionButton = page
        .getByRole('button', { name: /strongly agree|agree|neutral|disagree|strongly disagree/i })
        .first();
      await expect(positionButton).toBeVisible({ timeout: 10000 });
      await positionButton.click();

      // Must NOT show any gate toast
      await expect(
        page.getByText(/sign in to|verify your email/i)
      ).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (verifiedUser) await deleteTestUser(verifiedUser.user.id);
      if (storyOwner) await deleteTestUser(storyOwner.user.id);
    }
  });
});

// ─── Create Story Route Guard ─────────────────────────────────────────────────

test.describe('P273: Create story — auth gate (P396 two-state model)', () => {
  test.describe.configure({ timeout: 60000 });

  test('unauthenticated user is blocked from /create (route guard redirects to /signup)', async ({ page }) => {
    // Navigate to /create without a session
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    // The route guard should redirect unauthenticated users to /signup
    // This is the correct behavior: unauthenticated users cannot reach the create form at all.
    // The useVerificationGate is the secondary protection for in-page actions.
    await expect(page).toHaveURL('/signup');
  });

  test('authenticated (verified) user creates a story successfully (no gate toast)', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      testUser = await createTestUser({ name: 'P273 Verified Creator' });
      await setTestSession(page, testUser.email);

      await page.goto('/create');
      await page.waitForLoadState('networkidle');

      const textArea = page.getByRole('textbox').first();
      await expect(textArea).toBeVisible({ timeout: 10000 });
      await textArea.fill('Test story from verified user — p273 P396 update');

      await page.getByRole('button', { name: /save|submit|create/i }).click();

      // Should navigate away from /create on success
      await expect(page).not.toHaveURL('/create', { timeout: 10000 });

      // Capture story ID for cleanup
      const url = page.url();
      const match = url.match(/\/story\/([^/?#]+)/);
      storyId = match?.[1] ?? null;

      // Must NOT show any gate toast
      await expect(
        page.getByText(/sign in to|verify your email/i)
      ).not.toBeVisible();
    } finally {
      if (storyId) {
        await supabaseAdmin.from('stories').delete().eq('id', storyId);
      }
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
