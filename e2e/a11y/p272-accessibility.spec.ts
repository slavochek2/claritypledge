/**
 * @file p272-accessibility.spec.ts
 * @description Accessibility tests for P272: Story Verification in /live
 *
 * Scope: Pilot-appropriate minimum (per UX spec). Tests semantic HTML and
 * aria-labels on interactive elements. No aria-live announcements (deferred).
 *
 * Tests that require an active live session use the two-party pattern.
 * Tests that can run without an active session use single-page navigation.
 *
 * Aria requirements per UX spec:
 * - Story picker search input: aria-label="Search your stories."
 * - Story card expand toggle: aria-expanded="true"/"false"
 * - Story card expand toggle: aria-label "Expand linked points" / "Collapse linked points"
 * - Story result rows: <button> elements with accessible names
 *
 * Auth notes:
 * - Two-party tests: both creator and joiner authenticated (avoids signInAnonymously)
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
import { completeLiveJoinIfPrompted } from '../helpers/live-join';

// ─── Helper: setup two-party session ─────────────────────────────────────────

async function enterLiveSession(
  speakerPage: Parameters<typeof mockMicPermission>[0],
  listenerPage: Parameters<typeof mockMicPermission>[0],
  joinerEmail: string,
  joinerName: string
): Promise<string> {
  await speakerPage.goto('/live');
  await speakerPage.waitForLoadState('networkidle');
  await speakerPage.getByRole('button', { name: 'New session' }).click();
  await expect(speakerPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await speakerPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;

  await listenerPage.goto(`/live/${roomCode}`);
  // P1232: P396 removed the guest email input and the consent checkbox, and
  // "Join Session" now renders only when auto-join FAILS — an unconditional
  // click on either hangs until the test times out. See helpers/live-join.ts.
  await completeLiveJoinIfPrompted(listenerPage);

  try {
    await listenerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await listenerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog
  }

  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerName, 'code', roomCode);
  return roomCode;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('P272 Accessibility — Story Picker', () => {
  test.describe.configure({ timeout: 60000 });

  test('Story picker search input has aria-label="Search your stories."', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P272 A11y Creator' });
      joinerUser = await createTestUser({ name: 'P272A11yJoiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: 'P272 a11y test story content',
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await enterLiveSession(speakerPage, listenerPage, joinerUser.email, joinerUser.name);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // The story picker search input must have an aria-label for screen readers
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      const ariaLabel = await searchInput.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toMatch(/search.*stories/i);

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('Story picker result rows are <button> elements with accessible story text', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const searchTerm = `A11yResultTest${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272 A11y Creator' });
      joinerUser = await createTestUser({ name: 'P272A11yJoiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${searchTerm}: Accessible result row content for screen readers`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await enterLiveSession(speakerPage, listenerPage, joinerUser.email, joinerUser.name);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Type search term to trigger results
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(searchTerm);

      // Result row must be a <button> element (not a div or span)
      const resultButton = speakerPage.getByRole('button', { name: new RegExp(searchTerm) });
      await expect(resultButton).toBeVisible({ timeout: 5000 });

      // The accessible name must include the story text (not just the truncated preview)
      const accessibleName = await resultButton.getAttribute('aria-label');
      // Either aria-label or text content provides the accessible name
      const textContent = await resultButton.textContent();
      const hasAccessibleName = (accessibleName && accessibleName.length > 5) ||
        (textContent && textContent.includes(searchTerm));
      expect(hasAccessibleName).toBe(true);

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});

test.describe('P272 Accessibility — Story Card Expand Toggle', () => {
  test.describe.configure({ timeout: 60000 });

  test('Expand toggle has aria-expanded attribute (false when collapsed, true when expanded)', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `ExpandA11y${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272 A11y Creator' });
      joinerUser = await createTestUser({ name: 'P272A11yJoiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Expand toggle aria-expanded test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await enterLiveSession(speakerPage, listenerPage, joinerUser.email, joinerUser.name);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Select story via search
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      const storyResult = speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) });
      await expect(storyResult).toBeVisible({ timeout: 5000 });
      await storyResult.click();

      // Story card should be visible
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

      // Find the expand toggle button
      const expandToggle = speakerPage
        .getByTestId('live-story-card-expanded')
        .getByRole('button', { name: /expand|collapse|linked points/i });
      await expect(expandToggle).toBeVisible({ timeout: 5000 });

      // Initially collapsed → aria-expanded should be "false"
      await expect(expandToggle).toHaveAttribute('aria-expanded', 'false');

      // Click to expand
      await expandToggle.click();

      // After click → aria-expanded should be "true"
      await expect(expandToggle).toHaveAttribute('aria-expanded', 'true');

      // Click again to collapse
      await expandToggle.click();
      await expect(expandToggle).toHaveAttribute('aria-expanded', 'false');

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('Expand toggle is keyboard accessible (Tab + Enter)', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `KeyboardA11y${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272 A11y Creator' });
      joinerUser = await createTestUser({ name: 'P272A11yJoiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Keyboard navigation test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await enterLiveSession(speakerPage, listenerPage, joinerUser.email, joinerUser.name);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Select story
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await expect(speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) })).toBeVisible({ timeout: 5000 });
      await speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

      // Focus the expand toggle and use Enter to expand
      const expandToggle = speakerPage
        .getByTestId('live-story-card-expanded')
        .getByRole('button', { name: /expand|collapse|linked points/i });

      await expandToggle.focus();
      await expect(expandToggle).toBeFocused();
      await expect(expandToggle).toHaveAttribute('aria-expanded', 'false');

      // Press Enter to expand
      await speakerPage.keyboard.press('Enter');
      await expect(expandToggle).toHaveAttribute('aria-expanded', 'true');

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});

test.describe('P272 Accessibility — Story Card Actions Hidden', () => {
  test.describe.configure({ timeout: 60000 });

  test('Share and external-link icons are hidden on story card inside /live', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `HideActions${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272 A11y Creator' });
      joinerUser = await createTestUser({ name: 'P272A11yJoiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Share icon hidden test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await enterLiveSession(speakerPage, listenerPage, joinerUser.email, joinerUser.name);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Select story
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

      // Share button and external link button must NOT be present in /live story card
      // (hideActions=true is set — navigation away from /live session is prevented)
      const storyCard = speakerPage.getByTestId('live-story-card-expanded');
      await expect(storyCard.getByRole('button', { name: /share/i })).not.toBeVisible();
      await expect(storyCard.getByRole('link', { name: /open|external/i })).not.toBeVisible();

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
