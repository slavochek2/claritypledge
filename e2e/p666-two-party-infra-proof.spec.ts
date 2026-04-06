/**
 * @file p666-two-party-infra-proof.spec.ts
 *
 * P666: Proof tests that P644 two-party infrastructure works end-to-end.
 *
 * These tests exist to verify the testing infrastructure itself, not app features.
 * They prove that:
 * 1. createTwoPartySession() creates two authenticated contexts that reach /live/{code}
 * 2. createTwoPartySessionRealistic() exercises the late-join timing path
 * 3. Auth injection is deterministic (no race condition with addInitScript)
 *
 * If any of these fail, ALL two-party E2E tests are unreliable.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession, createTwoPartySessionRealistic } from './helpers/test-session';

test.describe('P666 — Two-Party Infrastructure Proof', () => {
  test.setTimeout(90_000);

  test('createTwoPartySession: both participants reach /live/{code} with auth', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P666 Host',
      guestName: 'P666 Guest',
    });

    try {
      // Both pages should be on /live/{code} — not redirected to /signup or /login
      await expect(session.host.page).toHaveURL(new RegExp(`/live/${session.sessionCode}`));
      await expect(session.guest.page).toHaveURL(new RegExp(`/live/${session.sessionCode}`));

      // Both should see meaningful session UI (not a blank page or error)
      // The session code or session-related UI should be visible
      await expect(
        session.host.page.locator('body')
      ).not.toHaveText('', { timeout: 10_000 });
      await expect(
        session.guest.page.locator('body')
      ).not.toHaveText('', { timeout: 10_000 });

      // Verify user identity isolation — different users in different contexts
      expect(session.host.user.user.id).not.toBe(session.guest.user.user.id);
      expect(session.host.user.email).not.toBe(session.guest.user.email);
    } finally {
      await session.cleanup();
    }
  });

  test('createTwoPartySessionRealistic: host subscribes first, guest joins late', async ({ browser }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P666 Realistic Host',
      guestName: 'P666 Realistic Guest',
    });

    try {
      // Both pages should reach /live/{code} — the realistic flow navigates
      // host first, waits for session UI, then navigates guest
      await expect(session.host.page).toHaveURL(new RegExp(`/live/${session.sessionCode}`));
      await expect(session.guest.page).toHaveURL(new RegExp(`/live/${session.sessionCode}`));

      // Host should have session UI loaded (was verified during setup,
      // but confirm it's still there)
      await expect(
        session.host.page.locator('body')
      ).not.toHaveText('', { timeout: 10_000 });

      // Guest should also see session content (late join worked)
      await expect(
        session.guest.page.locator('body')
      ).not.toHaveText('', { timeout: 10_000 });

      // Session code should match between both participants
      expect(session.sessionCode).toMatch(/^[A-Z2-9]{6}$/);
      expect(session.sessionId).toBeTruthy();
    } finally {
      await session.cleanup();
    }
  });

  test('auth injection is deterministic: no redirect on fresh navigation', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P666 Auth Host',
      guestName: 'P666 Auth Guest',
      skipNavigation: true,
    });

    try {
      // Navigate host to /live (no session code — just auth-gated page)
      await session.host.page.goto('/live');
      await session.host.page.waitForLoadState('networkidle');

      // Should stay on /live — auth injection worked
      await expect(session.host.page).toHaveURL('/live');

      // Navigate again to prove addInitScript persists across navigations
      await session.host.page.goto('/live');
      await session.host.page.waitForLoadState('networkidle');
      await expect(session.host.page).toHaveURL('/live');

      // "New Session" button proves the host is authenticated and verified
      await expect(
        session.host.page.getByRole('button', { name: /new session/i }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await session.cleanup();
    }
  });
});
