/**
 * @file p456-story-cta-footer.spec.ts
 * @description Regression tests for nested <button> violations on the point card and on
 * story-card-with-links QuotedPoint.
 *
 * P1217 RETIREMENT NOTE (2026-09-01): P456 (`superseded_by: p465`, itself
 * `superseded_by: p470`) designed a "split footer" that showed the viewer's position
 * symbol inline (a check symbol, "Agree", then "Why do you agree?"), navigated to
 * /chat?from=position, and rendered a disabled CTA with the hint "Available after the
 * session" inside /live. All three are gone: the CTA is now the P822 inline pill
 * (`renderAddStoryPill`, point-card-with-links.tsx) which renders only `ctaCopy.ctaText`
 * and navigates to /create?pointId=, no position symbol is rendered anywhere in
 * point-card-with-links.tsx, and src/tests/p733-letter-live-position-preload.test.tsx
 * asserts the /live hint does NOT render. Surfaces A, E and G were deleted.
 *
 * What is kept: the nested-<button> regression checks. `story-card-with-links.tsx`
 * (QuotedPoint) and `point-detail-page.tsx` are both live, and the /story/:id surface has
 * no other nested-button coverage anywhere in e2e/.
 *
 * Auth pattern: createTestUser + setTestSession (password-based, no magic link)
 * Point/position helpers: createTestPoint + createTestPosition
 * Story helpers: createTestStory + linkStoryToPoint
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory, type TestStory } from './helpers/test-story';

// ─── Shared test context ──────────────────────────────────────────────────────

interface Fixtures {
  viewer: TestUser;
  point: TestPoint;
  story: TestStory | null;
}

async function buildFixtures(options: { withStory?: boolean; withPosition?: 'agree' | 'disagree' | 'unsure' } = {}): Promise<Fixtures> {
  const viewer = await createTestUser({ name: 'CTAViewer' });
  const point = await createTestPoint(viewer.user.id, {
    statement: `P456 test point ${Date.now()}`,
  });

  if (options.withPosition) {
    await createTestPosition(point.id, viewer.user.id, options.withPosition);
  }

  let story: TestStory | null = null;
  if (options.withStory && options.withPosition) {
    story = await createTestStory(viewer.user.id, { title: `P456 story ${Date.now()}` });
    await linkStoryToPoint(story.id, point.id);
  }

  return { viewer, point, story };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.story?.id) await deleteTestStory(f.story.id);
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.viewer?.user?.id) await deleteTestUser(f.viewer.user.id);
}

// ─── Surface A: Own profile — Points tab ─────────────────────────────────────

// ─── Nested button fix regression ────────────────────────────────────────────

test.describe('P456 Nested button fix — no nested <button> violations', () => {
  test.describe.configure({ timeout: 60000 });

  test('story-card-with-links QuotedPoint: no <button> nested inside another <button>', async ({ page }) => {
    const f = await buildFixtures({ withPosition: 'agree', withStory: true });
    let storyWithLinkedPoint: TestStory | null = null;

    try {
      // Create a story authored by viewer, link it to the point
      storyWithLinkedPoint = await createTestStory(f.viewer.user.id, {
        title: `Nested button test story ${Date.now()}`,
        content: 'A story with a linked point to test for nested button violations.',
      });
      await linkStoryToPoint(storyWithLinkedPoint.id, f.point.id);

      await setTestSession(page, f.viewer.email);

      // Navigate to a page that renders story-card-with-links (e.g., the story detail or feed)
      await page.goto(`/story/${storyWithLinkedPoint.id}`);
      await page.waitForLoadState('networkidle');

      // Check for nested <button> violations via DOM query
      const nestedButtonCount = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        return allButtons.filter(btn => btn.closest('button') !== btn).length;
      });

      expect(
        nestedButtonCount,
        `Found ${nestedButtonCount} <button> elements nested inside another <button> — HTML spec violation`
      ).toBe(0);
    } finally {
      if (storyWithLinkedPoint?.id) await deleteTestStory(storyWithLinkedPoint.id);
      await cleanupFixtures(f);
    }
  });

  test('point detail page: no <button> nested inside another <button>', async ({ page }) => {
    const f = await buildFixtures({ withPosition: 'agree' });
    try {
      await setTestSession(page, f.viewer.email);
      await page.goto(`/point/${f.point.id}`);
      await page.waitForLoadState('networkidle');

      const nestedButtonCount = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        return allButtons.filter(btn => btn.closest('button') !== btn).length;
      });

      expect(
        nestedButtonCount,
        `Found ${nestedButtonCount} <button> elements nested inside another <button> — HTML spec violation`
      ).toBe(0);
    } finally {
      await cleanupFixtures(f);
    }
  });
});
