/**
 * @file p588-accessibility.spec.ts
 * @description Accessibility tests for P588: /live Layout — Sticky CTA, Accordion Story, Peek Points
 *
 * Covers:
 * - Sticky CTA bar has proper ARIA region landmark
 * - Points toggle has aria-expanded attribute
 * - Point peek cards are keyboard accessible (Tab, Enter, Escape)
 * - Accordion announces state change via aria-live region
 * - CTA buttons are keyboard accessible in sticky bar
 *
 * Setup pattern:
 *   Uses DB-injected session via supabaseAdmin (same as p469/p566).
 *   ?insights=off bypasses mic permission gate.
 */

import { test, Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  deleteClaritySession,
  type TestUser,
} from '../helpers/test-user';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

const STORY_CONTENT = "She's someone I've known for years. We were on a call trying to work something out.";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makeLiveState(options: {
  storyId: string;
  storyContent: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  points?: Array<{ id: string; content: string }>;
}) {
  return {
    ratingPhase: 'idle',
    selectedStoryId: options.storyId,
    selectedStoryData: {
      id: options.storyId,
      content: options.storyContent,
      authorId: options.authorId,
      authorName: options.authorName,
      authorSlug: options.authorSlug,
      authorAvatarColor: '#4A90E2',
      authorHasPledged: false,
      visibility: 'public',
      points: options.points ?? [],
    },
    checkerRating: undefined,
    responderRating: undefined,
    explainBackRatings: [],
    checkerSubmitted: false,
    responderSubmitted: false,
    checkerName: undefined,
    explainBackDone: false,
    speakerSawExplainBackDone: false,
    sessionEnded: false,
  };
}

async function createTestSession(options: {
  creatorName: string;
  creatorProfileId: string;
  liveState: Record<string, unknown>;
}): Promise<string> {
  const code = genCode();
  const { error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_name: options.creatorName,
      creator_profile_id: options.creatorProfileId,
      joiner_name: 'TestPartner',
      state: {},
      live_state: options.liveState,
      is_private: true,
    });
  if (error) throw new Error(`Failed to create test session: ${error.message}`);
  return code;
}

function injectSessionStorage(page: Page, code: string, userName: string) {
  page.context().addInitScript(
    ({ keys }: { keys: Record<string, string> }) => {
      for (const [k, v] of Object.entries(keys)) {
        sessionStorage.setItem(k, v);
      }
    },
    {
      keys: {
        clarity_live_session_code: code,
        clarity_live_user_name: userName,
        clarity_live_is_creator: 'true',
      },
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

let testUser: TestUser;
let storyId: string;
let sessionCode: string;

const SAMPLE_POINTS = [
  { id: 'pt-1', content: 'She felt unheard during the conversation' },
  { id: 'pt-2', content: 'The timing of the call was rushed' },
  { id: 'pt-3', content: 'Both sides had valid concerns' },
];

test.beforeAll(async () => {
  testUser = await createTestUser({ name: 'P588A11y' });

  const { data: story, error } = await supabaseAdmin
    .from('stories')
    .insert({ author_id: testUser.user.id, content: STORY_CONTENT, visibility: 'public' })
    .select('id')
    .single();
  if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
  storyId = story.id;

  sessionCode = await createTestSession({
    creatorName: testUser.name,
    creatorProfileId: testUser.user.id,
    liveState: makeLiveState({
      storyId,
      storyContent: STORY_CONTENT,
      authorId: testUser.user.id,
      authorName: testUser.name,
      authorSlug: testUser.slug,
      points: SAMPLE_POINTS,
    }),
  });
});

test.afterAll(async () => {
  if (sessionCode) await deleteClaritySession(sessionCode);
  if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
  if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sticky CTA Bar — ARIA Region
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P588: Accessibility — Sticky CTA bar', () => {
  test('sticky CTA bar has proper ARIA region', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');
    await page.waitForLoadState('networkidle');

    // TODO: Update selector once P588 sticky CTA bar is implemented.
    // The sticky bar should be a landmark region for screen readers.
    //
    // const ctaBar = page.locator('[data-testid="sticky-cta-bar"]');
    // await expect(ctaBar).toHaveAttribute('role', 'region');
    // await expect(ctaBar).toHaveAttribute('aria-label', 'Session actions');

    test.skip(true, 'Requires P588 sticky CTA bar implementation — wire when it lands');
  });

  test('CTA buttons are keyboard accessible in sticky bar', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');
    await page.waitForLoadState('networkidle');

    // TODO: Once sticky CTA bar is implemented:
    // 1. Tab to the first CTA button in the sticky bar
    // 2. Verify it receives focus (visible focus ring)
    // 3. Press Enter to activate
    // 4. Verify the action fires (e.g., navigation or state change)
    //
    // await page.keyboard.press('Tab');
    // ... tab until CTA button is focused ...
    // const ctaBtn = page.locator('[data-testid="sticky-cta-bar"] button').first();
    // await expect(ctaBtn).toBeFocused();
    // await page.keyboard.press('Enter');

    test.skip(true, 'Requires P588 sticky CTA bar implementation — wire when it lands');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Points Toggle — aria-expanded
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P588: Accessibility — Points toggle', () => {
  test('points toggle has aria-expanded attribute', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');
    await page.waitForLoadState('networkidle');

    // TODO: Update selector once P588 points peek toggle is implemented.
    // The "N points" button should toggle aria-expanded between true/false.
    //
    // const pointsToggle = page.getByRole('button', { name: /\d+ points?/i });
    // await expect(pointsToggle).toBeVisible();
    // await expect(pointsToggle).toHaveAttribute('aria-expanded', 'false');
    //
    // await pointsToggle.click();
    // await expect(pointsToggle).toHaveAttribute('aria-expanded', 'true');
    //
    // await pointsToggle.click();
    // await expect(pointsToggle).toHaveAttribute('aria-expanded', 'false');

    test.skip(true, 'Requires P588 points peek toggle implementation — wire when it lands');
  });

  test('point peek cards are keyboard accessible', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');
    await page.waitForLoadState('networkidle');

    // TODO: Once P588 point peek cards are implemented:
    // 1. Tab to the points toggle button
    // 2. Press Enter to expand the points list
    // 3. Tab to first point card
    // 4. Press Enter to expand the point detail
    // 5. Press Escape to collapse back
    //
    // const pointsToggle = page.getByRole('button', { name: /\d+ points?/i });
    // await pointsToggle.focus();
    // await page.keyboard.press('Enter');
    // await expect(pointsToggle).toHaveAttribute('aria-expanded', 'true');
    //
    // // Tab to first point card
    // await page.keyboard.press('Tab');
    // const firstPoint = page.locator('[data-testid="peek-point-card"]').first();
    // await expect(firstPoint).toBeFocused();
    //
    // // Enter to expand
    // await page.keyboard.press('Enter');
    // // ... verify expanded state ...
    //
    // // Escape to collapse
    // await page.keyboard.press('Escape');
    // // ... verify collapsed state ...

    test.skip(true, 'Requires P588 point peek cards implementation — wire when it lands');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Accordion Story — State Announcements
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P588: Accessibility — Accordion story', () => {
  test('accordion announces state change', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');
    await page.waitForLoadState('networkidle');

    // TODO: Once P588 accordion story is implemented:
    // When the story collapses/expands, an aria-live region should announce the change.
    //
    // 1. Locate the story accordion trigger
    // 2. Click to collapse the story
    // 3. Verify an aria-live region contains the announcement text
    //    (e.g., "Story collapsed" or "Story expanded")
    //
    // const storyAccordion = page.locator('[data-testid="story-accordion-trigger"]');
    // await storyAccordion.click();
    //
    // const liveRegion = page.locator('[aria-live="polite"]');
    // await expect(liveRegion).toContainText(/collapsed|minimized/i);
    //
    // await storyAccordion.click();
    // await expect(liveRegion).toContainText(/expanded|showing/i);

    test.skip(true, 'Requires P588 accordion story implementation — wire when it lands');
  });
});
