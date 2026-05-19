/**
 * @file p848-progress-bar-real-scroll.spec.ts
 * @description P848 canary — measures progress bar position before AND after
 *   a real scroll. Asserts the bar's viewport y-position is unchanged, which
 *   is what "sticky" means to the user.
 *
 * Why this canary exists when p846-2 already tests sticky:
 *   p846-2 walks the DOM ancestor chain looking for `position: sticky` set in
 *   CSS. That property can be set on a wrapper whose scroll ancestor is not the
 *   element actually scrolling — in which case sticky is a no-op and the bar
 *   moves with the page. p846-2 passes; the bar scrolls away.
 *
 * Before fix: FAILS — bar's getBoundingClientRect().top moves by ~scrollDelta px.
 *   Also captures which element actually scrolled (window vs [data-letter-scroll])
 *   to confirm the root-cause hypothesis that window scrolls, not the inner div.
 *
 * After fix: PASSES — bar's top is unchanged within a small pixel tolerance.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createTestLetter,
  createTestStorySnapshot,
  createTestPrediction,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { supabaseAdmin } from './helpers/supabase-admin';

const SCROLL_DELTA = 400;
const POSITION_TOLERANCE_PX = 2;

test.describe('P848: Letter progress bar real-scroll behavior', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let storyId: string;
  let pointId: string;
  let docId: string;
  let letterId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P848 Sender' });
    receiver = await createTestUser({ name: 'P848 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P848 Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Failed to create test doc');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P848 sticky-test story — long enough title that we want the page to scroll' });
    storyId = story.id;

    // Long enough statement that point-engage phase definitely exceeds viewport
    const longPoint = 'P848 sticky-test point — lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';
    const point = await createTestPoint(sender.user.id, { statement: longPoint });
    pointId = point.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions').select('id').eq('story_id', storyId).order('version_number', { ascending: false }).limit(1).single();
    if (!version) throw new Error('No story version found');

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    await createTestStorySnapshot(letterId, storyId, version.id, {
      position: 0,
      pointConfig: { points: [{ id: pointId, visibility: 'visible', statement: longPoint, senderPosition: 'agree' }] },
    });

    const delivery = await createTestDelivery(letterId, { receiverEmail: receiver.email, receiverProfileId: receiver.user.id });
    await createTestPrediction(letterId, storyId, 7, delivery.id);
    deliveryToken = delivery.invitationToken;
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    try { await deleteTestLetter(letterId); } catch { /* noop */ }
    try { await deleteTestPoint(pointId); } catch { /* noop */ }
    try { await deleteTestStory(storyId); } catch { /* noop */ }
    try { await supabaseAdmin.from('clarity_docs').delete().eq('id', docId); } catch { /* noop */ }
    try { await deleteTestUser(receiver.user.id); } catch { /* noop */ }
    try { await deleteTestUser(sender.user.id); } catch { /* noop */ }
  });

  test('progress bar stays pinned at the same viewport y-position when the page scrolls', async ({ page }) => {
    // Use mobile viewport so content overflows and forces scroll
    await page.setViewportSize({ width: 375, height: 700 });

    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Past cover if needed
    const startBtn = page.getByRole('button', { name: /start reading|begin|open.*letter/i });
    if (await startBtn.isVisible({ timeout: 5000 })) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toBeVisible({ timeout: 10000 });

    // Diagnostic snapshot — which element actually scrolls?
    const beforeState = await page.evaluate(() => {
      const inner = document.querySelector('[data-letter-scroll]') as HTMLElement | null;
      const bar = document.querySelector('[role="progressbar"]') as HTMLElement | null;
      return {
        windowScrollTop: window.scrollY,
        innerScrollTop: inner?.scrollTop ?? null,
        innerScrollable: inner ? inner.scrollHeight > inner.clientHeight : null,
        documentScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        barTop: bar?.getBoundingClientRect().top ?? null,
      };
    });

    console.log('[P848] Before scroll:', beforeState);

    // Scroll BOTH potential targets — whichever actually scrolls will move.
    // This is intentional: the test should not need to know in advance which
    // element is the scroll container. We compare bar position before/after
    // any actual scroll.
    const scrollResult = await page.evaluate(({ delta }) => {
      const inner = document.querySelector('[data-letter-scroll]') as HTMLElement | null;

      // Try window first
      window.scrollTo({ top: delta, behavior: 'instant' as ScrollBehavior });
      // Then inner
      if (inner) inner.scrollTo({ top: delta, behavior: 'instant' as ScrollBehavior });

      return {
        windowScrollTopAfter: window.scrollY,
        innerScrollTopAfter: inner?.scrollTop ?? null,
      };
    }, { delta: SCROLL_DELTA });

    // Give layout a moment to settle
    await page.waitForTimeout(150);

    const afterState = await page.evaluate(() => {
      const bar = document.querySelector('[role="progressbar"]') as HTMLElement | null;
      return {
        barTop: bar?.getBoundingClientRect().top ?? null,
      };
    });

    console.log('[P848] After scroll:', { ...scrollResult, ...afterState });

    // Sanity: SOMETHING must have scrolled, otherwise the test is meaningless.
    const actualScrollDelta = Math.max(
      scrollResult.windowScrollTopAfter - beforeState.windowScrollTop,
      (scrollResult.innerScrollTopAfter ?? 0) - (beforeState.innerScrollTop ?? 0),
    );
    expect(actualScrollDelta, 'page should have scrolled at least 100px — otherwise test is meaningless').toBeGreaterThan(100);

    // The actual canary assertion: bar's viewport y-position is unchanged.
    // BEFORE fix: bar moves by ~scrollDelta px (NOT sticky in practice).
    // AFTER fix: bar stays at same y within tolerance.
    expect(beforeState.barTop, 'bar must be in viewport before scroll').not.toBeNull();
    expect(afterState.barTop, 'bar must still be in viewport after scroll').not.toBeNull();
    const positionDelta = Math.abs((afterState.barTop ?? 0) - (beforeState.barTop ?? 0));

    expect(
      positionDelta,
      `progress bar moved ${positionDelta}px after scrolling — sticky is not working in this layout. ` +
      `window scrolled by ${scrollResult.windowScrollTopAfter}px, inner scrolled by ${scrollResult.innerScrollTopAfter ?? 0}px. ` +
      `If window scrolled more than inner, the sticky ancestor [data-letter-scroll] is not the one actually scrolling.`,
    ).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
  });
});
