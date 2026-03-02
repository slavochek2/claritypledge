/**
 * @file p467-smoke.spec.ts
 * @description Smoke tests for P467: /chat — slim context header + inline rating (remove drawer)
 *
 * Tests:
 * - /chat page loads without JS errors
 * - ChatContextHeader element present in DOM (when pointId param provided)
 * - No Drawer/drawer element rendered on initial load
 * - AI message thread container present
 * - Input bar is focusable
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';

test.describe('P467 Smoke — /chat ChatContextHeader + no Drawer', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let testPoint: Awaited<ReturnType<typeof createTestPoint>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P467Smoke' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'P467 smoke test point — context header verification',
    });
    await createTestPosition(testPoint.id, testUser.user.id, 'agree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // ── Page loads ────────────────────────────────────────────────────────────

  test('/chat?from=position&pointId=X loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const relevant = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR')
    );

    expect(
      relevant,
      `Console errors on /chat: ${relevant.join('\n')}`
    ).toHaveLength(0);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── ChatContextHeader present ─────────────────────────────────────────────

  test('ChatContextHeader element is present in DOM when pointId param provided', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });
  });

  test('ChatContextHeader is NOT rendered when no pointId param', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // No pointId → no context header
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).not.toBeAttached();
  });

  // ── No Drawer on initial load ─────────────────────────────────────────────

  test('No Drawer/dialog element rendered on initial /chat load', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Drawer renders as <dialog> or vaul-drawer attribute
    const drawerDialog = page.locator('dialog');
    await expect(drawerDialog).not.toBeAttached();

    const vaulDrawer = page.locator('[data-vaul-drawer]');
    await expect(vaulDrawer).not.toBeAttached();
  });

  // ── Thread container present ──────────────────────────────────────────────

  test('AI message thread container is present', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // The main chat container
    const chatContainer = page.getByTestId('story-guide-chat');
    await expect(chatContainer).toBeVisible({ timeout: 10000 });

    // At least one AI thread message visible (opening AI bubble)
    const aiMessage = page.getByTestId('thread-message-ai').first();
    await expect(aiMessage).toBeVisible({ timeout: 10000 });
  });

  // ── Input bar ────────────────────────────────────────────────────────────

  test('Input bar is visible and focusable on /chat?from=position', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const inputBar = page.getByTestId('story-guide-input');
    await expect(inputBar).toBeVisible({ timeout: 10000 });
    await inputBar.focus();
    await expect(inputBar).toBeFocused();
  });

  // ── No PointCardWithLinks in header position ──────────────────────────────

  test('PointCardWithLinks is not rendered in the sticky header position', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // The old context card (PointCardWithLinks) had data-testid="context-card" wrapping it
    // and the PointCardWithLinks pattern included 3rd-person name
    // After P467, context-card wrapper should either be gone or replaced by chat-context-header
    const oldContextCard = page.getByTestId('context-card');

    // If context-card is still present, it must NOT contain PointCardWithLinks
    const contextCardExists = await oldContextCard.count() > 0;
    if (contextCardExists) {
      const pointCardWithLinks = oldContextCard.getByTestId('point-card-with-links');
      await expect(pointCardWithLinks).not.toBeAttached();
    }

    // The new ChatContextHeader must be present instead
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });
  });

  // ── Unauthenticated redirect ──────────────────────────────────────────────

  test('Unauthenticated visit to /chat redirects to /signup without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // No session
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const relevant = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR')
    );

    expect(relevant, `Console errors during auth redirect: ${relevant.join('\n')}`).toHaveLength(0);
    expect(page.url()).toContain('/signup');
  });

  // ── No static asset failures ──────────────────────────────────────────────

  test('/chat does not trigger 404 or 500 for static assets', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('response', response => {
      const url = response.url();
      const isSameOrigin = url.startsWith(page.url().split('/').slice(0, 3).join('/'));
      if (isSameOrigin && [404, 500].includes(response.status())) {
        failedRequests.push(`${response.status()} ${url}`);
      }
    });

    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    expect(
      failedRequests,
      `Failed requests: ${failedRequests.join('\n')}`
    ).toHaveLength(0);
  });
});
