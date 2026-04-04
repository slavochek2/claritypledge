/**
 * @file p425-smoke.spec.ts
 * @description Smoke tests for P425: AI-Guided Story Creation — Core Loop
 *
 * Verifies that /chat loads without JS errors for authenticated users
 * in both entry modes (direct and position-triggered).
 *
 * Does NOT require the story-guide edge function to be running.
 * These tests should pass at any stage of implementation.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P425 Smoke — /chat page loads without errors', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let pointId: string;
  let pointCreatedByTest = false;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425Smoke' });

    // Find any existing point for position-triggered entry test
    const { data: existing } = await supabaseAdmin
      .from('points')
      .select('id')
      .limit(1)
      .single();

    if (existing?.id) {
      pointId = existing.id;
    } else {
      // No points exist yet — create a minimal one for smoke testing
      // TODO: Use createTestPoint helper once available in e2e/helpers/test-point.ts
      const { data: newPoint, error } = await supabaseAdmin
        .from('points')
        .insert({ statement: 'P425 smoke test point', author_id: testUser.user.id })
        .select('id')
        .single();
      if (error || !newPoint) {
        console.warn('[P425 Smoke] Could not create test point:', error?.message);
        pointId = 'fallback-smoke-test-id';
      } else {
        pointId = newPoint.id;
        pointCreatedByTest = true;
      }
    }
  });

  test.afterAll(async () => {
    if (pointCreatedByTest && pointId) {
      await supabaseAdmin.from('points').delete().eq('id', pointId);
    }
    await deleteTestUser(testUser.user.id);
  });

  // ── /chat (direct) ─────────────────────────────────────────────────────────

  test('/chat loads for authenticated user without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, testUser.email);
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const relevant = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') // network errors from external resources (fonts, etc.) are not our concern
    );

    expect(
      relevant,
      `Console errors on /chat: ${relevant.join('\n')}`
    ).toHaveLength(0);

    await expect(page.locator('body')).toBeVisible();
  });

  test('/chat returns 200 (not 404 or 500)', async ({ page }) => {
    await setTestSession(page, testUser.email);

    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/chat') && resp.status() !== undefined),
      page.goto('/chat'),
    ]);

    // SPA: the route is client-side, so the initial HTML fetch is what we check.
    // The app's root HTML should always return 200.
    expect(response.status()).toBeLessThan(400);
  });

  // ── /chat?from=position&pointId=XYZ (position-triggered) ──────────────────

  test('/chat?from=position&pointId=XYZ loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${pointId}`);
    await page.waitForLoadState('networkidle');

    const relevant = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR')
    );

    expect(
      relevant,
      `Console errors on /chat?from=position: ${relevant.join('\n')}`
    ).toHaveLength(0);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Input bar renders ──────────────────────────────────────────────────────

  test('input bar renders and is focusable on /chat', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // TODO: Replace with data-testid="story-guide-input" once StoryGuideChat.tsx is implemented
    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );

    await expect(inputBar).toBeVisible({ timeout: 10000 });
    await inputBar.focus();
    await expect(inputBar).toBeFocused();
  });

  test('input bar is visible on /chat?from=position&pointId=XYZ', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${pointId}`);
    await page.waitForLoadState('networkidle');

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );

    await expect(inputBar).toBeVisible({ timeout: 10000 });
  });

  // ── No 404 / no broken resources ──────────────────────────────────────────

  test('/chat does not trigger any 404 or 500 responses for static assets', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('response', response => {
      // Only care about same-origin assets (JS, CSS, fonts bundled by Vite)
      const url = response.url();
      const isSameOrigin = url.startsWith(page.url().split('/').slice(0, 3).join('/'));
      if (isSameOrigin && [404, 500].includes(response.status())) {
        failedRequests.push(`${response.status()} ${url}`);
      }
    });

    await setTestSession(page, testUser.email);
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    expect(
      failedRequests,
      `Failed requests on /chat: ${failedRequests.join('\n')}`
    ).toHaveLength(0);
  });

  // ── Unauthenticated redirect ───────────────────────────────────────────────

  test('unauthenticated /chat visit redirects to /signup (no JS errors from auth gate)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // No session injected
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Auth gate redirect — no JS errors expected
    const relevant = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR')
    );

    expect(
      relevant,
      `Console errors during auth redirect: ${relevant.join('\n')}`
    ).toHaveLength(0);

    const finalUrl = page.url();
    expect(finalUrl).toContain('/signup');
  });
});
