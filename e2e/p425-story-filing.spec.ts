/**
 * @file p425-story-filing.spec.ts
 * @description E2E tests for P425: AI-Guided Story Creation — Core Loop
 *
 * Tests user flows through the /chat page:
 * - Flow A: Position-triggered entry (?from=position&pointId=XYZ)
 * - Flow B: Direct visit (/chat — brain dump → draft card in thread)
 * - Filing loop: rating → revision → 10 → polish → save
 * - Escape hatch: 3 iterations without rating 10
 * - Empty state: no context chip without position params
 * - Auth gate: unauthenticated user redirected to /signup
 *
 * NOTE: Tests that require a real AI response (streaming) are marked with
 * TODO and skipped until the edge function (story-guide) is deployed and
 * VITE_STORY_GUIDE_EDGE_FN_URL is set in .env.test.local.
 *
 * Selectors use data-testid where possible. TODOs mark where implementation
 * selectors are not yet known and will need updating post-implementation.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_PATH = '/chat';

/** Navigates to /chat and waits for the page to be ready. */
async function gotoChat(page: Parameters<typeof setTestSession>[0], path = CHAT_PATH) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

test.describe('P425 Auth gate', () => {
  test('unauthenticated user navigating to /chat is redirected to /signup', async ({ page }) => {
    // No session injected — browser is unauthenticated
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // Should land on /signup (or /login — project convention is /signup for new users)
    const url = page.url();
    expect(
      url,
      `Expected redirect to /signup but got: ${url}`
    ).toContain('/signup');
  });
});

// ---------------------------------------------------------------------------
// Smoke: page structure
// ---------------------------------------------------------------------------

test.describe('P425 Page structure — authenticated user', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425FilingTest' });
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.user.id);
  });

  test('/chat loads for authenticated user without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, testUser.email);
    await gotoChat(page);

    expect(
      consoleErrors.filter(e => !e.includes('favicon')),
      `Console errors on /chat: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);

    await expect(page.locator('body')).toBeVisible();
  });

  test('input bar renders on /chat', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await gotoChat(page);

    // TODO: Replace with actual data-testid once StoryGuideChat.tsx is implemented
    // Expected: <textarea data-testid="story-guide-input"> or <input data-testid="story-guide-input">
    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /what's on your mind/i })
    );

    await expect(inputBar).toBeVisible({ timeout: 10000 });
  });

  test('input bar is focusable on /chat', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await gotoChat(page);

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /what's on your mind/i })
    );
    await expect(inputBar).toBeVisible({ timeout: 10000 });
    await inputBar.focus();
    await expect(inputBar).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// Flow A: Position-triggered entry
// ---------------------------------------------------------------------------

test.describe('P425 Flow A — Position-triggered entry', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let pointId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425FlowA' });

    // Find or create a test point to use as the position context
    const { data: existing } = await supabaseAdmin
      .from('points')
      .select('id')
      .limit(1)
      .single();

    if (existing?.id) {
      pointId = existing.id;
    } else {
      // TODO: Use createTestPoint helper once available
      const { data: newPoint, error } = await supabaseAdmin
        .from('points')
        .insert({ statement: 'P425 test point for position entry', author_id: testUser.user.id })
        .select('id')
        .single();
      if (error || !newPoint) throw new Error(`Failed to create test point: ${error?.message}`);
      pointId = newPoint.id;
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.user.id);
  });

  test('/chat?from=position&pointId=XYZ loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, testUser.email);
    await gotoChat(page, `${CHAT_PATH}?from=position&pointId=${pointId}`);

    expect(
      consoleErrors.filter(e => !e.includes('favicon')),
      `Console errors on /chat with pointId: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('context chip is visible when ?from=position&pointId=XYZ is provided', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await gotoChat(page, `${CHAT_PATH}?from=position&pointId=${pointId}`);

    // TODO: Replace with data-testid="context-chip" once implemented
    // Spec: "pinned context chip" showing which point this story is linked to
    const contextChip = page.getByTestId('context-chip').or(
      page.locator('[aria-label*="context"]').first()
    );

    await expect(contextChip).toBeVisible({ timeout: 10000 });
  });

  test('no context chip on /chat without position params', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await gotoChat(page);

    // TODO: Replace with data-testid="context-chip" once implemented
    const contextChip = page.getByTestId('context-chip');
    await expect(contextChip).not.toBeVisible();
  });

  test('AI sends an opening message when /chat loads with position context', async ({ page }) => {
    // TODO: This test requires the story-guide edge function to be running.
    // Skip until VITE_STORY_GUIDE_EDGE_FN_URL is set in .env.test.local.
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping AI response test — VITE_STORY_GUIDE_EDGE_FN_URL not set'
    );

    await setTestSession(page, testUser.email);
    await gotoChat(page, `${CHAT_PATH}?from=position&pointId=${pointId}`);

    // Wait for an AI message in the thread
    // TODO: Replace with data-testid="thread-message-ai" once implemented
    const aiMessage = page.getByTestId('thread-message-ai').first().or(
      page.locator('[data-role="assistant"]').first()
    );
    await expect(aiMessage).toBeVisible({ timeout: 30000 });
  });
});

// ---------------------------------------------------------------------------
// Flow B: Direct visit — brain dump → draft card in thread
// ---------------------------------------------------------------------------

test.describe('P425 Flow B — Direct visit, brain dump → draft card', () => {
  test.describe.configure({ timeout: 90000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425FlowB' });
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.user.id);
  });

  test('sending a brain dump results in a draft card (not a message bubble)', async ({ page }) => {
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping AI response test — VITE_STORY_GUIDE_EDGE_FN_URL not set'
    );

    await setTestSession(page, testUser.email);
    await gotoChat(page);

    // Find the input bar and type a brain dump
    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /what's on your mind/i })
    );
    await expect(inputBar).toBeVisible({ timeout: 10000 });

    const brainDump =
      'I was in a meeting last week and said something that I immediately regretted. ' +
      'My colleague was presenting and I interrupted her with a contradicting point. ' +
      'I could see her face fall and felt terrible. Later she avoided me.';

    await inputBar.fill(brainDump);

    // Send via Ctrl+Enter (spec: input bar send shortcut)
    await page.keyboard.press('Control+Enter');

    // Wait for AI streaming to complete and a draft card to appear in the thread
    // Spec: "Draft v1 · Draft · not saved" label on the card
    // TODO: Replace with data-testid="draft-card" once DraftCard.tsx is implemented
    const draftCard = page.getByTestId('draft-card').first().or(
      page.getByText(/Draft v1/i).first()
    );
    await expect(draftCard).toBeVisible({ timeout: 30000 });

    // Confirm it is NOT rendered as a message bubble
    // A message bubble would have a different component signature
    // TODO: Adjust selector once ThreadMessage component has data-testid="message-bubble"
    const messageBubble = page.getByTestId('message-bubble').filter({ hasText: brainDump });
    await expect(messageBubble).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Filing loop: rating → revision → 10 → polish → save
// ---------------------------------------------------------------------------

test.describe('P425 Filing loop — rating and save', () => {
  test.describe.configure({ timeout: 120000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  const createdStoryIds: string[] = [];

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425FilingLoop' });
  });

  test.afterAll(async () => {
    if (createdStoryIds.length > 0) {
      await supabaseAdmin.from('story_points').delete().in('story_id', createdStoryIds);
      await supabaseAdmin.from('stories').delete().in('id', createdStoryIds);
    }
    await deleteTestUser(testUser.user.id);
  });

  test('full filing loop: brain dump → Draft v1 → rating 7 → Draft v2 → rating 10 → polish → save privately', async ({ page }) => {
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping AI response test — VITE_STORY_GUIDE_EDGE_FN_URL not set'
    );

    await setTestSession(page, testUser.email);
    await gotoChat(page);

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /what's on your mind/i })
    );
    await expect(inputBar).toBeVisible({ timeout: 10000 });

    // Step 1: Send brain dump
    await inputBar.fill('I want to tell the story of how I overcame my fear of public speaking.');
    await page.keyboard.press('Control+Enter');

    // Wait for Draft v1
    const draftV1 = page.getByText(/Draft v1/i).first();
    await expect(draftV1).toBeVisible({ timeout: 30000 });

    // Step 2: Rate 7 (mid band — triggers revision)
    await inputBar.fill('7');
    await page.keyboard.press('Control+Enter');

    // Wait for Draft v2
    const draftV2 = page.getByText(/Draft v2/i).first();
    await expect(draftV2).toBeVisible({ timeout: 30000 });

    // Step 3: Rate 10 (perfect — triggers polish)
    await inputBar.fill('10');
    await page.keyboard.press('Control+Enter');

    // Wait for polish draft card
    // Spec: "Draft v3 · Polish · not saved" or similar
    // TODO: Replace with data-testid="draft-card-polish"
    const polishCard = page.getByTestId('draft-card-polish').or(
      page.getByText(/Polish/i).first()
    );
    await expect(polishCard).toBeVisible({ timeout: 30000 });

    // Step 4: Visibility selector appears
    // TODO: Replace with data-testid="visibility-selector"
    const visibilitySelector = page.getByTestId('visibility-selector').or(
      page.getByRole('group', { name: /visibility/i })
    );
    await expect(visibilitySelector).toBeVisible({ timeout: 10000 });

    // Step 5: Click "Save privately" (default is Private)
    // TODO: Replace with data-testid="save-story-button"
    const saveButton = page.getByTestId('save-story-button').or(
      page.getByRole('button', { name: /save privately/i })
    );
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Step 6: Toast appears
    // Sonner toast: "Story saved."
    const toast = page.getByText(/Story saved/i);
    await expect(toast).toBeVisible({ timeout: 10000 });

    // Step 7: Draft card transitions to saved story card in thread
    // TODO: Replace with data-testid="saved-story-chat-card"
    const savedCard = page.getByTestId('saved-story-chat-card').or(
      page.getByRole('article', { name: /saved story/i })
    );
    await expect(savedCard).toBeVisible({ timeout: 10000 });

    // Capture story ID for cleanup
    // TODO: Read data-story-id attribute from saved card once implemented
  });
});

// ---------------------------------------------------------------------------
// Escape hatch: 3 iterations without rating 10
// ---------------------------------------------------------------------------

test.describe('P425 Escape hatch — 3 iterations', () => {
  test.describe.configure({ timeout: 120000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425EscapeHatch' });
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.user.id);
  });

  test('after 3 iterations without rating 10, escape hatch text appears in AI message', async ({ page }) => {
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping AI response test — VITE_STORY_GUIDE_EDGE_FN_URL not set'
    );

    await setTestSession(page, testUser.email);
    await gotoChat(page);

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /what's on your mind/i })
    );
    await expect(inputBar).toBeVisible({ timeout: 10000 });

    // Brain dump
    await inputBar.fill('Test story for escape hatch path.');
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText(/Draft v1/i).first()).toBeVisible({ timeout: 30000 });

    // 3 iterations with non-10 ratings
    for (let i = 1; i <= 3; i++) {
      await inputBar.fill('5');
      await page.keyboard.press('Control+Enter');
      const draftN = page.getByText(new RegExp(`Draft v${i + 1}`, 'i')).first();
      await expect(draftN).toBeVisible({ timeout: 30000 });
    }

    // Escape hatch should appear
    // Spec: "[Save at this version]" button + "[Keep refining]" button
    // TODO: Replace with data-testid="escape-hatch-save" once implemented
    const escapeHatchSave = page.getByTestId('escape-hatch-save').or(
      page.getByRole('button', { name: /save at this version/i })
    );
    await expect(escapeHatchSave).toBeVisible({ timeout: 10000 });

    const keepRefining = page.getByTestId('escape-hatch-keep-refining').or(
      page.getByRole('button', { name: /keep refining/i })
    );
    await expect(keepRefining).toBeVisible({ timeout: 5000 });
  });
});
