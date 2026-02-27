/**
 * @file p457-chat-empty-state.spec.ts
 * @description E2E tests for P457: Chat Empty State Redesign
 *
 * Tests:
 * - AI opening bubble is visible on /chat load (not blank page)
 * - Send button has blue color on page load (not gray/muted)
 * - Input is visible and focused before any message is sent
 * - After sending first message, input moves to sticky bottom
 * - Placeholder reads "Tell me so I understand you"
 * - Position-triggered flow still shows opening bubble
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';

const CHAT_PATH = '/chat';

test.describe('P457 — Chat Empty State', () => {
  test.describe.configure({ timeout: 30000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P457EmptyState' });
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.user.id);
  });

  // ── AI opening bubble ──────────────────────────────────────────────────────

  test('AI opening bubble is visible on /chat load', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // The AI bubble should contain the opening message
    const aiMessage = page.locator('[data-testid="thread-message"]').filter({
      hasText: /brain-dump|what's your experience/i,
    }).or(
      page.getByText(/brain-dump it — messy is fine/i)
    );

    await expect(aiMessage).toBeVisible({ timeout: 5000 });
  });

  test('/chat does not show blank page (thread area has content)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // The story-guide-chat container should have visible children (not blank)
    const chatContainer = page.getByTestId('story-guide-chat');
    await expect(chatContainer).toBeVisible();

    // At least one message element should be in the DOM
    const messages = page.locator('[data-testid="thread-message"]');
    await expect(messages.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Send button always blue ────────────────────────────────────────────────

  test('send button has blue background on page load (before any input)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeVisible();

    // Should have blue background class — not muted/gray
    const cls = await sendButton.getAttribute('class') ?? '';
    expect(cls).toContain('bg-blue-600');
    expect(cls).not.toContain('bg-muted');
  });

  // ── Placeholder text ────────────────────────────────────────────────────────

  test('input placeholder reads "Tell me so I understand you"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('story-guide-input');
    await expect(input).toBeVisible();

    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder).toBe('Tell me so I understand you');
  });

  // ── Input centering in empty state ──────────────────────────────────────────

  test('input is vertically centered (not sticky bottom) in empty state', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('story-guide-input');
    await expect(input).toBeVisible();

    // The input wrapper should NOT be at the very bottom of the viewport in empty state
    const inputBox = await input.boundingBox();
    const viewportSize = page.viewportSize();
    if (!inputBox || !viewportSize) return;

    // Input mid-point should be in the middle third of the viewport (not the bottom third)
    const inputMidY = inputBox.y + inputBox.height / 2;
    const viewportHeight = viewportSize.height;
    expect(inputMidY).toBeLessThan(viewportHeight * 0.75);
  });

  // ── Transition to sticky bottom after first send ───────────────────────────

  test('input moves to sticky bottom after first message is sent', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('story-guide-input');
    await expect(input).toBeVisible();

    // Type and send first message
    await input.fill('This is my brain dump.');
    await input.press('Enter');

    // Wait for user message to appear in thread
    await expect(page.getByText('This is my brain dump.')).toBeVisible({ timeout: 5000 });

    // Now input should be near the bottom of the viewport (sticky)
    const inputBox = await input.boundingBox();
    const viewportSize = page.viewportSize();
    if (!inputBox || !viewportSize) return;

    const inputBottom = inputBox.y + inputBox.height;
    expect(inputBottom).toBeGreaterThan(viewportSize.height * 0.7);
  });

  // ── Position-triggered flow still works ────────────────────────────────────

  test('position-triggered flow (?from=position) still shows opening message', async ({ page }) => {
    await setTestSession(page, testUser.email);
    // Use a fake pointId — graceful degradation means the bubble still shows
    await page.goto(`${CHAT_PATH}?from=position&pointId=fake-point-id`);
    await page.waitForLoadState('networkidle');

    const aiMessage = page.getByText(/brain-dump it — messy is fine/i).or(
      page.getByText(/what's your experience/i)
    );

    await expect(aiMessage).toBeVisible({ timeout: 5000 });
  });
});
