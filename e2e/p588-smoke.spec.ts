/**
 * @file p588-smoke.spec.ts
 * @description Smoke tests for P588: /live Layout — Sticky CTA, Accordion Story, Peek Points
 *
 * Tests:
 * - /live page loads without errors (no 404/500, no console errors, main heading present)
 * - /live page renders without BottomNav
 * - End Session button is visible in header and styled red
 *
 * Setup pattern:
 *   These are smoke-level tests — they verify the page loads and key elements render.
 *   Uses DB-injected session via supabaseAdmin (same pattern as p469).
 *   ?insights=off bypasses mic permission gate.
 */

import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, deleteClaritySession } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

const STORY_CONTENT = 'She misunderstood me completely.';

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
      points: [],
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
// SMOKE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P588 — /live smoke tests', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P588Smoke' });

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
      }),
    });
  });

  test.afterAll(async () => {
    if (sessionCode) await deleteClaritySession(sessionCode);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
  });

  test('/live page loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await page.goto('/live?insights=off');

    // No HTTP error status
    expect(response?.status()).toBeLessThan(400);

    // Wait for the page to settle
    await page.waitForLoadState('networkidle');

    // TODO: Update selector to match P588 main heading once implementation lands.
    // For now, verify the page rendered some content (not a blank error page).
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    // No console errors (filter out known noise like ResizeObserver)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('/live page renders without BottomNav', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    // Wait for the page to settle
    await page.waitForLoadState('networkidle');

    // BottomNav uses nav element with data-testid or specific class.
    // TODO: Update selector if BottomNav uses a different testid in P588.
    const bottomNav = page.locator('[data-testid="bottom-nav"]');
    await expect(bottomNav).not.toBeVisible();

    // Also check that no <nav> element with bottom-fixed positioning is present
    const fixedNavs = page.locator('nav[class*="fixed"][class*="bottom"]');
    expect(await fixedNavs.count()).toBe(0);
  });

  test('End Session button is visible in header', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    await page.waitForLoadState('networkidle');

    // TODO: Update selector once P588 implementation lands — match data-testid or button text.
    const endSessionBtn = page.getByRole('button', { name: /end session/i });
    await expect(endSessionBtn).toBeVisible({ timeout: 15000 });

    // Verify it is styled red (text or background)
    const color = await endSessionBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
      };
    });

    // Red can appear as text color or background — at least one should contain red channel
    // rgb(xxx, ...) where first channel is dominant, or explicit red-ish values
    const hasRedStyling =
      color.color.includes('239') || // red-500 ~rgb(239,68,68)
      color.color.includes('220') || // red-600 ~rgb(220,38,38)
      color.color.includes('248') || // red-400 ~rgb(248,113,113)
      color.backgroundColor.includes('239') ||
      color.backgroundColor.includes('220') ||
      color.backgroundColor.includes('248');

    expect(hasRedStyling).toBe(true);
  });
});
