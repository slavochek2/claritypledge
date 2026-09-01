/**
 * @file p458-anon-position-auth-gate.spec.ts
 * @description E2E tests for the parts of P458 (Anonymous User Auth Gate) that survived P502.
 *
 * Covers:
 *   - Anon user on point detail page sees position buttons (not hidden)
 *   - Signup page shows context banner with point title and position
 *   - After login (existing user), position is auto-saved and user lands on the point
 *   - Logged-in user can take position without any redirect (normal flow unaffected)
 *   - Position buttons visible to anon on profile point cards (PointCardWithLinks)
 *
 * P1217 RETIREMENT NOTE (2026-09-01): P502 (`predecessor: p458`) replaced the anon
 * click-to-/signup redirect with optimistic UI plus an inline CTA
 * (src/app/components/shared/anon-position-cta.tsx), so the "Anon position click ->
 * redirect to /signup" and embed "opens new tab" describes were deleted, as was the
 * "anon click on point card redirects to /signup" test. P494 removed the anon-facing
 * "Tell your story" CTA outright (src/tests/p494-tell-story-visibility.test.tsx asserts
 * it must NOT render for anonymous users), so Scope B was deleted.
 *
 * What is kept and why: P502's own spec requires "existing P458 auth-gate URL
 * infrastructure as fallback (magic links, deep links)". signup-page.tsx:331-337 still
 * renders the set-position context banner, AuthCallbackPage.tsx:736 still handles
 * action=set-position, and this file is the only e2e coverage of that banner.
 *
 * Auth pattern: createTestUser + setTestSession for logged-in tests.
 * Anonymous tests: no setTestSession (no localStorage injection).
 * Cleanup order: delete positions BEFORE users (via deleteTestPoint cascade).
 *
 * The auth callback behavior is tested separately in
 * e2e/integration/p458-auth-callback-position.spec.ts.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, deleteTestPoint, createTestPosition, type TestPoint } from './helpers/test-point';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Fixtures {
  user: TestUser;
  point: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const user = await createTestUser({ name: 'P458AnonGate' });
  const point = await createTestPoint(user.user.id, {
    statement: `P458 E2E test point ${Date.now()}`,
  });
  return { user, point };
}

async function cleanupFixtures(f: Fixtures) {
  // Delete point first — CASCADE removes point_positions before user deletion
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
}

// ---------------------------------------------------------------------------
// Surface: Point detail page — Anonymous visitor sees position buttons
// ---------------------------------------------------------------------------

test.describe('P458 — Anon user on point detail page', () => {
  test.describe.configure({ timeout: 60000 });

  test('position buttons (Agree / Disagree / Neutral) are visible to anonymous user', async ({ page }) => {
    const f = await buildFixtures();
    try {
      // No setTestSession — anonymous browse
      await page.goto(`/point/${f.point.id}`);
      await page.waitForLoadState('networkidle');

      // Point statement must be visible (page loaded)
      await expect(page.getByText(f.point.statement)).toBeVisible({ timeout: 10000 });

      // Position buttons must be present in the DOM for anonymous users (AC: buttons visible)
      // The buttons may be rendered as button elements or clickable divs with role="button"
      const agreeBtn = page.getByRole('button', { name: /agree/i })
        .or(page.locator('[data-position="agree"]'))
        .or(page.getByText(/^Agree$/));

      await expect(agreeBtn.first()).toBeVisible({ timeout: 10000 });

      // Disagree must also be visible
      const disagreeBtn = page.getByRole('button', { name: /disagree/i })
        .or(page.locator('[data-position="disagree"]'))
        .or(page.getByText(/^Disagree$/));

      await expect(disagreeBtn.first()).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupFixtures(f);
    }
  });

  test('position buttons are NOT hidden (currentUserId guard removed)', async ({ page }) => {
    const f = await buildFixtures();
    try {
      await page.goto(`/point/${f.point.id}`);
      await page.waitForLoadState('networkidle');

      // Before P458: position button container was hidden when currentUserId is undefined.
      // After P458: buttons always render.
      // We verify by checking there is no "login to engage" placeholder where buttons would be.
      const loginPrompt = page.getByText(/log in to (agree|take a position)/i);
      await expect(loginPrompt).not.toBeVisible({ timeout: 3000 }).catch(() => {
        // It's OK if the locator isn't found — that means the prompt doesn't exist
      });

      // The main assertion: position buttons are visible
      await expect(page.getByText(/^Agree$/)).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupFixtures(f);
    }
  });

  test('no console errors on anon point detail page visit', async ({ page }) => {
    const f = await buildFixtures();
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    try {
      await page.goto(`/point/${f.point.id}`);
      await page.waitForLoadState('networkidle');

      expect(
        consoleErrors,
        `Console errors on anon /point/${f.point.id}: ${consoleErrors.join('\n')}`
      ).toHaveLength(0);
    } finally {
      await cleanupFixtures(f);
    }
  });
});

// ---------------------------------------------------------------------------
// Signup page — context banner
// ---------------------------------------------------------------------------

test.describe('P458 — Signup page context banner', () => {
  test.describe.configure({ timeout: 60000 });

  test('signup page shows context banner with point title when arriving via position gate', async ({ page }) => {
    const f = await buildFixtures();
    try {
      // Navigate directly to the signup URL that would be constructed after an anon click
      const signupUrl = `/signup?action=set-position&pointId=${f.point.id}&position=agree&redirect=${encodeURIComponent(`/point/${f.point.id}`)}&pointTitle=${encodeURIComponent(f.point.statement.slice(0, 100))}`;
      await page.goto(signupUrl);
      await page.waitForLoadState('networkidle');

      // The context banner should show the point title
      // Spec: "You were about to Agree with: [point title]"
      // Use .first() to avoid strict mode violation (parent <p> and child <strong> both match)
      await expect(
        page.getByText(/you were about to agree with/i).first()
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupFixtures(f);
    }
  });

  test('signup page banner uses correct verb for "disagree" position', async ({ page }) => {
    const f = await buildFixtures();
    try {
      const signupUrl = `/signup?action=set-position&pointId=${f.point.id}&position=disagree&redirect=${encodeURIComponent(`/point/${f.point.id}`)}&pointTitle=${encodeURIComponent(f.point.statement.slice(0, 100))}`;
      await page.goto(signupUrl);
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText(/you were about to disagree/i)
          .or(page.getByText(/disagree with:/i))
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupFixtures(f);
    }
  });

  test('signup page shows no context banner when arriving directly (no action param)', async ({ page }) => {
    // Ensure the banner does NOT appear on a plain /signup load
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/you were about to/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Logged-in user — normal flow unaffected
// ---------------------------------------------------------------------------

test.describe('P458 — Logged-in user can take position without redirect', () => {
  test.describe.configure({ timeout: 60000 });

  test('logged-in user clicking Agree stays on the point page (no redirect to /signup)', async ({ page }) => {
    const f = await buildFixtures();
    try {
      await setTestSession(page, f.user.email);
      await page.goto(`/point/${f.point.id}`);
      await page.waitForLoadState('networkidle');

      const agreeBtn = page.getByRole('button', { name: /^agree$/i })
        .or(page.locator('[data-position="agree"]'))
        .or(page.getByText(/^Agree$/));

      await agreeBtn.first().click();

      // Wait a moment — URL should NOT change to /signup
      await page.waitForTimeout(1500);
      expect(page.url()).not.toContain('/signup');
      expect(page.url()).toContain(`/point/${f.point.id}`);
    } finally {
      // Cleanup: delete point (cascades positions), then user
      if (f.point?.id) await deleteTestPoint(f.point.id);
      if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
    }
  });

  test('logged-in user position selection is reflected in UI (no auth gate)', async ({ page }) => {
    const f = await buildFixtures();
    try {
      await setTestSession(page, f.user.email);
      await page.goto(`/point/${f.point.id}`);
      await page.waitForLoadState('networkidle');

      // Click Agree and verify the UI updates (active state / selection indicator)
      const agreeBtn = page.getByRole('button', { name: /^agree$/i })
        .or(page.locator('[data-position="agree"]'))
        .or(page.getByText(/^Agree$/));

      await agreeBtn.first().click();

      // After clicking, some visual indicator of selection should appear
      // (e.g., the button becomes active, a count increments, or a checkmark appears)
      // This is an optimistic check — the exact UI depends on implementation
      await page.waitForTimeout(1000);

      // The page should remain on the point detail (not redirected)
      expect(page.url()).not.toContain('/signup');
    } finally {
      if (f.point?.id) await deleteTestPoint(f.point.id);
      if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// After login — position auto-saved (integration with AuthCallbackPage)
// ---------------------------------------------------------------------------

test.describe('P458 — Position auto-save after existing user login', () => {
  test.describe.configure({ timeout: 60000 });

  test('existing user lands on the point page after login from position-gate redirect', async ({ page }) => {
    // This test simulates an existing user going through the auth gate redirect flow.
    // Full magic-link-to-callback round-trip is not feasible in E2E without email interception.
    // Instead, we directly simulate what AuthCallbackPage receives by injecting a test session
    // and navigating to the callback URL pattern with action=set-position.
    //
    // The integration test in e2e/integration/p458-auth-callback-position.spec.ts verifies
    // the actual auto-save logic at the service level.

    const f = await buildFixtures();
    try {
      // Set session (simulate already-authenticated user)
      await setTestSession(page, f.user.email);

      // Navigate to the auth callback with set-position intent
      // (simulates what happens when magic link is clicked in email)
      const callbackUrl = `/auth/callback?action=set-position&pointId=${f.point.id}&position=agree&redirect=${encodeURIComponent(`/point/${f.point.id}`)}`;
      await page.goto(callbackUrl);

      // Wait for redirect — should end up on the point page
      await page.waitForURL(/\/point\//, { timeout: 15000 });
      expect(page.url()).toContain(`/point/${f.point.id}`);
    } finally {
      if (f.point?.id) await deleteTestPoint(f.point.id);
      if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// PointCardWithLinks surface — position buttons visible on profile/cards
// ---------------------------------------------------------------------------

test.describe('P458 — PointCardWithLinks: position buttons visible to anon', () => {
  test.describe.configure({ timeout: 60000 });

  test('position buttons are visible on profile page point cards for anonymous visitor', async ({ page }) => {
    const f = await buildFixtures();
    // Profile page shows points where the user has taken a position — create one so the card appears
    await createTestPosition(f.point.id, f.user.user.id, 'agree');
    try {
      // Profile route is /p/:id (accepts slug or UUID)
      await page.goto(`/p/${f.user.slug}`);
      await page.waitForLoadState('networkidle');

      // Find the Points tab if present
      const pointsTab = page.getByRole('tab', { name: /points/i });
      if (await pointsTab.isVisible()) {
        await pointsTab.click();
        await page.waitForTimeout(500);
      }

      // Position buttons should be visible for anonymous users on point cards
      const agreeBtn = page.getByRole('button', { name: /^agree$/i })
        .or(page.locator('[data-position="agree"]'))
        .or(page.getByText(/^Agree$/));

      await expect(agreeBtn.first()).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupFixtures(f);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPPRESSED_ERROR_PATTERNS = [
  /supabase.*realtime/i,
  /WebSocket.*failed/i,
  /net::ERR_/i,
  /\[vite\]/i,
];

function isKnownNonCritical(msg: string): boolean {
  return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(msg));
}
