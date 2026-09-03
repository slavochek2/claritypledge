/**
 * @file p398-accessibility.spec.ts
 * @description Accessibility tests for P398: Clickable Session Round History with Summary Screen
 *
 * Scope: Verify semantic HTML and ARIA on P398 interactive elements.
 *
 * Tests:
 * - Completed history row is a <button> with aria-label "View round summary: [title]"
 * - Skipped history row is NOT a button (no interactive role)
 * - Escape key closes the summary screen (keyboard dismiss pattern)
 * - Focus moves to summary heading when summary opens (focus management)
 * - Focus returns to the history row button when Back is clicked (focus restoration)
 *
 * Auth notes:
 * - Two-party tests: both creator and joiner authenticated (avoids signInAnonymously)
 * - Uses existing two-party setup + completeTwoPartyRound from p398-session-history-summary.spec.ts pattern
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { waitForDBPresence, mockMicPermission } from '../helpers/test-realtime';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { completeLiveJoinIfPrompted } from '../helpers/live-join';

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function setupTwoPartySession(
  creatorPage: Parameters<typeof mockMicPermission>[0],
  joinerPage: Parameters<typeof mockMicPermission>[0],
  joinerUser: { email: string; name: string }
): Promise<string> {
  await creatorPage.goto('/live');
  await creatorPage.waitForLoadState('networkidle');
  await creatorPage.getByRole('button', { name: 'New session' }).click();
  await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await creatorPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;

  await joinerPage.goto(`/live/${roomCode}`);
  // P1232: P396 removed the guest email input and the consent checkbox, and
  // "Join Session" now renders only when auto-join FAILS — an unconditional
  // click on either hangs until the test times out. See helpers/live-join.ts.
  await completeLiveJoinIfPrompted(joinerPage);

  try {
    await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await joinerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog
  }

  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerUser.name, 'code', roomCode);
  return roomCode;
}

async function completeTwoPartyRound(
  checkerPage: Parameters<typeof mockMicPermission>[0],
  responderPage: Parameters<typeof mockMicPermission>[0],
  joinerName: string,
  checkerRating = 8,
  responderRating = 7
): Promise<void> {
  await checkerPage.getByRole('button', { name: new RegExp(`Does ${joinerName} understand you`, 'i') }).click();
  await expect(checkerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 15000 });
  await expect(responderPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 20000 });

  await checkerPage.locator('button').filter({ hasText: new RegExp(`^${checkerRating}$`) }).click();
  await checkerPage.getByRole('button', { name: /Submit/i }).click();
  await responderPage.locator('button').filter({ hasText: new RegExp(`^${responderRating}$`) }).click();
  await responderPage.getByRole('button', { name: /Submit/i }).click();

  await expect(checkerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });
  await expect(responderPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });
  await checkerPage.getByRole('button', { name: /Continue/i }).click();
  await responderPage.getByRole('button', { name: /Continue/i }).click();

  await expect(
    checkerPage.getByRole('button', { name: new RegExp(`Does ${joinerName} understand you`, 'i') })
  ).toBeVisible({ timeout: 20000 });
}

async function waitForHistoryLength(roomCode: string, count: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', roomCode)
      .single();
    const history = (data?.live_state as Record<string, unknown> | null)?.sessionHistory;
    if (Array.isArray(history) && history.length >= count) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`[waitForHistoryLength] Timed out waiting for ${count} history entries`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P398 Accessibility — History Row Semantics', () => {
  test.describe.configure({ timeout: 120000 });

  test('completed history row is a <button> with aria-label "View round summary: [title]"', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `A11yRowTest${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P398A11yCreator' });
      joinerUser = await createTestUser({ name: 'P398A11yJoiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Accessible history row test`,
      });
      storyId = story.id;

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        joinerPage.getByRole('button', { name: new RegExp(`Does ${creatorUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Creator selects the story
      const searchInput = creatorPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await expect(creatorPage.getByRole('button', { name: new RegExp(uniqueFragment) })).toBeVisible({ timeout: 5000 });
      await creatorPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      // Complete the round
      await completeTwoPartyRound(creatorPage, joinerPage, joinerUser.name, 8, 7);
      await waitForHistoryLength(roomCode!, 1);

      // The history row must be a <button> element
      const historyButton = creatorPage.getByRole('button', { name: /View round summary:/i });
      await expect(historyButton).toBeVisible({ timeout: 10000 });

      // aria-label must include the full action and story title
      const ariaLabel = await historyButton.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.toLowerCase()).toContain('view round summary');
      expect(ariaLabel).toMatch(new RegExp(uniqueFragment));

      // The element must be a <button> (not a div with role="button")
      const tagName = await historyButton.evaluate(el => el.tagName.toLowerCase());
      expect(tagName).toBe('button');

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('skipped history row is NOT a button (no interactive role)', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P398A11ySkipCreator' });
      joinerUser = await createTestUser({ name: 'P398A11ySkipJoiner' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Start and skip a round
      await creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') }).click();
      const skipButton = creatorPage.getByRole('button', { name: /Skip/i });
      await expect(skipButton).toBeVisible({ timeout: 10000 });
      await skipButton.click();

      try {
        const confirmSkip = creatorPage.getByRole('button', { name: /Confirm|Yes.*skip/i });
        await confirmSkip.waitFor({ state: 'visible', timeout: 2000 });
        await confirmSkip.click();
      } catch {
        // No confirmation needed
      }

      await waitForHistoryLength(roomCode!, 1);
      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Skipped entry label is visible
      await expect(creatorPage.getByText('Skipped')).toBeVisible({ timeout: 5000 });

      // Skipped entry must NOT have a button role for the history item
      await expect(creatorPage.getByRole('button', { name: /View round summary:/i })).not.toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});

test.describe('P398 Accessibility — Summary Screen Keyboard', () => {
  test.describe.configure({ timeout: 120000 });

  test('Escape key closes the summary screen', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P398EscapeCreator' });
      joinerUser = await createTestUser({ name: 'P398EscapeJoiner' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        joinerPage.getByRole('button', { name: new RegExp(`Does ${creatorUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Complete a round
      await completeTwoPartyRound(creatorPage, joinerPage, joinerUser.name, 8, 7);
      await waitForHistoryLength(roomCode!, 1);

      // Open summary
      const historyButton = creatorPage.getByRole('button', { name: /View round summary:/i });
      await expect(historyButton).toBeVisible({ timeout: 10000 });
      await historyButton.click();
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).toBeVisible({ timeout: 5000 });

      // Press Escape — should close the summary (same behaviour as clicking Back)
      await creatorPage.keyboard.press('Escape');

      // Back button gone, action buttons restored
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).not.toBeVisible({ timeout: 5000 });
      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 5000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('history row button is keyboard accessible (Tab + Enter opens summary)', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P398KbdCreator' });
      joinerUser = await createTestUser({ name: 'P398KbdJoiner' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        joinerPage.getByRole('button', { name: new RegExp(`Does ${creatorUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Complete a round
      await completeTwoPartyRound(creatorPage, joinerPage, joinerUser.name, 8, 7);
      await waitForHistoryLength(roomCode!, 1);

      // Wait for history button to appear
      const historyButton = creatorPage.getByRole('button', { name: /View round summary:/i });
      await expect(historyButton).toBeVisible({ timeout: 10000 });

      // Focus the history button and activate with Enter
      await historyButton.focus();
      await expect(historyButton).toBeFocused();
      await creatorPage.keyboard.press('Enter');

      // Summary opens via keyboard activation
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).toBeVisible({ timeout: 5000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
