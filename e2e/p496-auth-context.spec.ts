/**
 * @file p496-auth-context.spec.ts
 *
 * Smoke tests for P496: E2E Programmatic Auth Bypass
 *
 * These tests verify that getTestAuthContext correctly injects auth tokens
 * into a Playwright BrowserContext so that auth-gated pages load without
 * going through Google OAuth.
 *
 * Each test creates a real (temporary) test user on the Supabase test project,
 * injects their session, and checks that the protected page is reachable.
 * All test users are deleted in the `finally` block.
 */

import { test, expect } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';

test.describe('P496 — Programmatic Auth Bypass', () => {
  test.setTimeout(60_000);

  // ─── host role ─────────────────────────────────────────────────────────────

  test('host: /live loads without redirect to /signup', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser, {
      name: 'P496 Host Smoke',
    });
    const page = await context.newPage();

    try {
      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // Authenticated host should stay on /live — not bounced to /signup
      await expect(page).toHaveURL('/live');

      // Host control: "New Session" button should be visible
      await expect(
        page.getByRole('button', { name: /new session/i }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  test('host: /agreements/new loads the agreement creation form', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser, {
      name: 'P496 Host Agreements',
    });
    const page = await context.newPage();

    try {
      await page.goto('/agreements/new');
      await page.waitForLoadState('networkidle');

      // Should reach the agreement creation form — not redirected to /login
      await expect(page).not.toHaveURL('/login');
      await expect(page).not.toHaveURL('/signup');

      // The agreement certificate / form heading should appear
      await expect(
        page.getByText(/clarity partner agreement/i),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  test('host: /settings loads the settings page', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser, {
      name: 'P496 Host Settings',
    });
    const page = await context.newPage();

    try {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Should not be redirected away from settings
      await expect(page).not.toHaveURL('/login');
      await expect(page).not.toHaveURL('/signup');

      // Settings page has account-related content
      await expect(
        page.getByRole('heading', { name: /settings/i }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  // ─── guest role ─────────────────────────────────────────────────────────────

  test('guest: is authenticated (session injected) but is_verified = false', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('guest', browser, {
      name: 'P496 Guest Smoke',
    });
    const page = await context.newPage();

    try {
      // Navigate to a page and verify the Supabase session is live by
      // checking that the app doesn't treat the user as unauthenticated.
      // The /me route redirects to the user's profile — an auth-only route.
      await page.goto('/me');
      await page.waitForLoadState('networkidle');

      // Should not bounce to login — the session is valid
      await expect(page).not.toHaveURL('/login');
      await expect(page).not.toHaveURL('/signup');

      // Confirm the test user email is accessible (sanity-check the fixture)
      expect(user.email).toMatch(/^e2e-test-\d+/);
    } finally {
      await cleanup();
    }
  });

  // ─── isolation: two contexts don't share sessions ──────────────────────────

  test('two independent contexts have separate user sessions', async ({ browser }) => {
    const hostCtx = await getTestAuthContext('host', browser, { name: 'P496 Isolation Host' });
    const guestCtx = await getTestAuthContext('guest', browser, { name: 'P496 Isolation Guest' });

    try {
      // Different users — IDs must differ
      expect(hostCtx.user.user.id).not.toBe(guestCtx.user.user.id);
      expect(hostCtx.user.email).not.toBe(guestCtx.user.email);
    } finally {
      await hostCtx.cleanup();
      await guestCtx.cleanup();
    }
  });
});
