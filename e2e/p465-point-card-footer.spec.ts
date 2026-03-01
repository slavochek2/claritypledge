/**
 * @file p465-point-card-footer.spec.ts
 * @description E2E tests for P465: Point card footer redesign.
 *
 * P465 fixes three bugs introduced by P456:
 *   1. Own-profile duplication — two rows showing the same story count
 *   2. Actor confusion — "✓ Agree ·" prefix reads as profile owner's stance
 *   3. Viewer story count always 0 on other profiles (data pipeline gap)
 *
 * Surface contexts:
 *   - Own profile (viewer === owner): Points tab, via /:slug
 *   - Other profile (viewer !== owner): Points tab, via /:slug of Alice
 *
 * CTA ordering rule (P465 core change from P456):
 *   Profile surfaces: CTA sits BETWEEN position buttons and stories row.
 *   This differs from P456 which appended CTA AFTER stories row.
 *
 * Auth pattern: createTestUser + setTestSession (password-based, no magic link)
 * Point/position helpers: createTestPoint + createTestPosition
 * Story helpers: createTestStory + linkStoryToPoint
 *
 * NOTE: Tests use DOM ordering assertions (locator().nth(), evaluateHandle)
 * to verify the CTA appears before the stories row in the rendered DOM.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestPoint,
  createTestPosition,
  deleteTestPoint,
  type TestPoint,
} from './helpers/test-point';
import {
  createTestStory,
  linkStoryToPoint,
  deleteTestStory,
  type TestStory,
} from './helpers/test-story';

// ─── Fixture builders ──────────────────────────────────────────────────────────

interface TwoUserFixtures {
  viewer: TestUser;
  owner: TestUser;
  point: TestPoint;
  viewerStory: TestStory | null;
  ownerStory: TestStory | null;
}

async function buildTwoUserFixtures(options: {
  viewerPosition?: 'agree' | 'disagree' | 'unsure';
  withViewerStory?: boolean;
  withOwnerStory?: boolean;
} = {}): Promise<TwoUserFixtures> {
  const viewer = await createTestUser({ name: 'P465Viewer' });
  const owner = await createTestUser({ name: 'P465Owner' });

  const point = await createTestPoint(owner.user.id, {
    statement: `P465 footer test point ${Date.now()}`,
  });

  if (options.viewerPosition) {
    await createTestPosition(point.id, viewer.user.id, options.viewerPosition);
  }

  let viewerStory: TestStory | null = null;
  if (options.withViewerStory && options.viewerPosition) {
    viewerStory = await createTestStory(viewer.user.id, {
      title: `P465 viewer story ${Date.now()}`,
    });
    // include author_id in story_points if migration is applied
    await linkStoryToPoint(viewerStory.id, point.id);
  }

  let ownerStory: TestStory | null = null;
  if (options.withOwnerStory) {
    ownerStory = await createTestStory(owner.user.id, {
      title: `P465 owner story ${Date.now()}`,
    });
    await linkStoryToPoint(ownerStory.id, point.id);
  }

  return { viewer, owner, point, viewerStory, ownerStory };
}

async function cleanupTwoUserFixtures(f: TwoUserFixtures) {
  if (f.viewerStory?.id) await deleteTestStory(f.viewerStory.id);
  if (f.ownerStory?.id) await deleteTestStory(f.ownerStory.id);
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.viewer?.user?.id) await deleteTestUser(f.viewer.user.id);
  if (f.owner?.user?.id) await deleteTestUser(f.owner.user.id);
}

// Helper: navigate to profile Points tab
async function goToProfilePointsTab(page: import('@playwright/test').Page, slug: string) {
  await page.goto(`/${slug}`);
  await page.waitForLoadState('networkidle');

  const pointsTab = page.getByRole('tab', { name: /points/i });
  if (await pointsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await pointsTab.click();
    await page.waitForLoadState('networkidle');
  }
}

// ─── Own profile — no duplication ─────────────────────────────────────────────

test.describe('P465 Own profile — no duplication', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile, position taken, no story: exactly one story count row, no duplicate', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465OwnNoDup' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 own no dup ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      // The CTA must appear — "Why do you agree? →"
      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // There should be exactly ONE element containing a story count numeric reference
      // (e.g. "0 stories" or "0 story"). Two occurrences = duplication bug.
      const storyCountMatches = await page
        .getByText(/\d+\s+stor(y|ies)/i)
        .all();

      // Filter to those visible
      let visibleCount = 0;
      for (const el of storyCountMatches) {
        if (await el.isVisible()) visibleCount++;
      }

      expect(
        visibleCount,
        'Expected exactly one story-count element — P465 eliminates own-profile duplication'
      ).toBe(1);
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('own profile, story exists: no CTA row, single unified footer row', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465OwnHasStory' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 own has story ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');
    const story = await createTestStory(viewer.user.id, {
      title: `P465 own story ${Date.now()}`,
    });
    await linkStoryToPoint(story.id, point.id);

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      // Story count row must be visible
      await expect(page.getByText(/1\s+stor(y|ies)/i)).toBeVisible({ timeout: 10000 });

      // CTA must NOT appear (story already exists — no create path)
      await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();
      await expect(page.getByText(/Why do you disagree\?/)).not.toBeVisible();
      await expect(page.getByText(/Why are you unsure\?/)).not.toBeVisible();

      // No duplication: one story count element
      const storyCountMatches = await page.getByText(/1\s+stor(y|ies)/i).all();
      let visibleCount = 0;
      for (const el of storyCountMatches) {
        if (await el.isVisible()) visibleCount++;
      }
      expect(visibleCount, 'Story count must appear exactly once on own profile').toBe(1);
    } finally {
      await deleteTestStory(story.id);
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('own profile, no position: no CTA and stories row shows 0', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465OwnNoPos' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 own no pos ${Date.now()}`,
    });

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      // No CTA when no position
      await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();
      await expect(page.getByText(/Why do you disagree\?/)).not.toBeVisible();
      await expect(page.getByText(/Why are you unsure\?/)).not.toBeVisible();

      // Stories row: "0 stories"
      await expect(page.getByText(/0\s+stor(y|ies)/i)).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });
});

// ─── Actor confusion fix — no "✓ Agree ·" prefix ─────────────────────────────

test.describe('P465 No actor prefix — "✓ Agree ·" removed', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile: no "✓ Agree ·" prefix in footer (CTA text only)', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465NoPrefix' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 no prefix ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // The combined "✓ Agree · Why do you agree?" pattern must NOT appear
      // (P456 showed this; P465 removes the "✓ Agree ·" prefix)
      await expect(page.getByText(/✓\s*Agree\s*·/)).not.toBeVisible();
      await expect(page.getByText(/✗\s*Disagree\s*·/)).not.toBeVisible();
      await expect(page.getByText(/~\s*Unsure\s*·/)).not.toBeVisible();
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('other profile: no "✓ Agree ·" prefix (actor confusion fix)', async ({ page }) => {
    const f = await buildTwoUserFixtures({
      viewerPosition: 'agree',
      withOwnerStory: true,
    });

    try {
      await setTestSession(page, f.viewer.email);
      await goToProfilePointsTab(page, f.owner.slug);

      // CTA must be present (viewer has position, no viewer story)
      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // P456 actor confusion pattern must NOT appear
      await expect(page.getByText(/✓\s*Agree\s*·/)).not.toBeVisible();
    } finally {
      await cleanupTwoUserFixtures(f);
    }
  });

  test('other profile disagree: no "✗ Disagree ·" prefix', async ({ page }) => {
    const f = await buildTwoUserFixtures({
      viewerPosition: 'disagree',
    });

    try {
      await setTestSession(page, f.viewer.email);
      await goToProfilePointsTab(page, f.owner.slug);

      await expect(page.getByText(/Why do you disagree\?/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/✗\s*Disagree\s*·/)).not.toBeVisible();
    } finally {
      await cleanupTwoUserFixtures(f);
    }
  });
});

// ─── CTA ordering — CTA appears before stories row ────────────────────────────

test.describe('P465 CTA ordering — CTA before stories row', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile: CTA row appears before stories row in DOM (position between buttons and stories)', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465OrderOwn' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 order own ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/stor(y|ies)/i)).toBeVisible();

      // Verify DOM order: CTA element appears before stories row element
      const ctaIndex = await page.evaluate(() => {
        const allText = Array.from(document.querySelectorAll('*'));
        const ctaEl = allText.find(el =>
          el.textContent?.trim().startsWith('Why do you agree?') &&
          el.children.length === 0
        );
        const storyRowEl = allText.find(el => /\d+\s+stor(y|ies)/i.test(el.textContent || '') &&
          el.children.length === 0
        );

        if (!ctaEl || !storyRowEl) return null;

        // Compare DOM positions
        const pos = ctaEl.compareDocumentPosition(storyRowEl);
        // DOCUMENT_POSITION_FOLLOWING = 4 means storyRowEl comes after ctaEl
        return (pos & 4) ? 'cta-before-stories' : 'stories-before-cta';
      });

      // CTA must appear before stories row (P465 ordering rule)
      // Note: 'null' means one of the elements wasn't found — fail with informative message
      expect(
        ctaIndex,
        'CTA row must appear before the stories row in DOM — P465 ordering rule'
      ).toBe('cta-before-stories');
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('other profile: CTA appears before stories row (no actor confusion)', async ({ page }) => {
    const f = await buildTwoUserFixtures({
      viewerPosition: 'agree',
      withOwnerStory: true,
    });

    try {
      await setTestSession(page, f.viewer.email);
      await goToProfilePointsTab(page, f.owner.slug);

      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/stor(y|ies)/i)).toBeVisible();

      // On other profile: "stories by [Alice]" must appear AFTER the CTA in DOM
      const orderResult = await page.evaluate(() => {
        const allLeafNodes = Array.from(document.querySelectorAll('*')).filter(
          el => el.children.length === 0 && (el.textContent?.trim().length ?? 0) > 0
        );
        const ctaEl = allLeafNodes.find(el =>
          el.textContent?.includes('Why do you agree?')
        );
        const storyRowEl = allLeafNodes.find(el =>
          /stor(y|ies)/i.test(el.textContent || '')
        );
        if (!ctaEl || !storyRowEl) return null;
        const pos = ctaEl.compareDocumentPosition(storyRowEl);
        return (pos & 4) ? 'cta-before-stories' : 'stories-before-cta';
      });

      expect(
        orderResult,
        'On other profile: CTA must precede stories row — P465 actor confusion fix'
      ).toBe('cta-before-stories');
    } finally {
      await cleanupTwoUserFixtures(f);
    }
  });
});

// ─── Other profile — viewer story count ───────────────────────────────────────

test.describe('P465 Other profile — viewer story count', () => {
  test.describe.configure({ timeout: 60000 });

  test('other profile, viewer has story: "· N by you" appended, no CTA', async ({ page }) => {
    const f = await buildTwoUserFixtures({
      viewerPosition: 'agree',
      withViewerStory: true,
      withOwnerStory: true,
    });

    try {
      await setTestSession(page, f.viewer.email);
      await goToProfilePointsTab(page, f.owner.slug);

      // Stories row with viewer count
      await expect(
        page.getByText(/by you/i),
        '"by you" suffix must appear when viewer has a story on the other profile'
      ).toBeVisible({ timeout: 15000 });

      // CTA must NOT appear (viewer already has a story)
      await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();
    } finally {
      await cleanupTwoUserFixtures(f);
    }
  });

  test('other profile, viewer has no story, position taken: CTA visible, no "by you"', async ({ page }) => {
    const f = await buildTwoUserFixtures({
      viewerPosition: 'agree',
      withOwnerStory: true,
    });

    try {
      await setTestSession(page, f.viewer.email);
      await goToProfilePointsTab(page, f.owner.slug);

      // CTA visible (no viewer story)
      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // "by you" must NOT appear (viewer has no story)
      await expect(page.getByText(/by you/i)).not.toBeVisible();
    } finally {
      await cleanupTwoUserFixtures(f);
    }
  });

  test('other profile, viewer has no position: no CTA, no "by you"', async ({ page }) => {
    const f = await buildTwoUserFixtures({
      withOwnerStory: true,
    });

    try {
      await setTestSession(page, f.viewer.email);
      await goToProfilePointsTab(page, f.owner.slug);

      // No CTA (no position → no story context)
      await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();
      await expect(page.getByText(/Why do you disagree\?/)).not.toBeVisible();

      // "by you" not shown (no story)
      await expect(page.getByText(/by you/i)).not.toBeVisible();

      // Stories row for owner still visible
      await expect(page.getByText(/stor(y|ies)/i)).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupTwoUserFixtures(f);
    }
  });
});

// ─── CTA copy accuracy — add vs edit ──────────────────────────────────────────

test.describe('P465 CTA copy — adaptive text (no story = add, story exists = no CTA)', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile, agree position, no story: CTA reads "Why do you agree? →"', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465CTAAgree' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 cta agree ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you agree\? →/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Why do you disagree\?/)).not.toBeVisible();
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('own profile, disagree position, no story: CTA reads "Why do you disagree? →"', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465CTADisagree' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 cta disagree ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'disagree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you disagree\? →/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('own profile, unsure position, no story: CTA reads "Why are you unsure? →"', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465CTAUnsure' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 cta unsure ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'unsure');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why are you unsure\? →/)).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('CTA navigates to /chat?from=position&pointId={id} on click', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465CTANav' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 cta nav ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });
      await page.getByText(/Why do you agree\?/).click();

      await page.waitForURL(/\/chat/, { timeout: 10000 });
      expect(page.url()).toContain('from=position');
      expect(page.url()).toContain(`pointId=${point.id}`);
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });
});

// ─── P451 dead code removed ────────────────────────────────────────────────────

test.describe('P465 P451 dead code removed — "Tell your story →" gone', () => {
  test.describe.configure({ timeout: 60000 });

  test('generic "Tell your story →" does NOT appear on own profile', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465NoP451' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 no p451 ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // P451 generic CTA must be gone
      await expect(page.getByText(/Tell your story →/i)).not.toBeVisible();
      await expect(page.getByText(/Tell your story/i)).not.toBeVisible();
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });
});

// ─── 1-story-per-user constraint (UI layer) ────────────────────────────────────

test.describe('P465 1 story per user per point — UI prevents second story', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile: after story linked, CTA is hidden (no add-second-story path)', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465OneStory' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 one story ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');
    const story = await createTestStory(viewer.user.id, {
      title: `P465 viewer existing story ${Date.now()}`,
    });
    await linkStoryToPoint(story.id, point.id);

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      // Story count is visible
      await expect(page.getByText(/1\s+stor(y|ies)/i)).toBeVisible({ timeout: 10000 });

      // No CTA means no path to create a second story
      await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();

      // No "+ add story →" remnant from P456 split footer
      await expect(page.getByText(/add story/i)).not.toBeVisible();
    } finally {
      await deleteTestStory(story.id);
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });
});

// ─── Edit/delete controls on own profile ─────────────────────────────────────

test.describe('P465 Own profile — edit/delete icons present when story exists', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile, story exists: edit and delete icons are visible in stories row', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465EditDel' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 edit del ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');
    const story = await createTestStory(viewer.user.id, {
      title: `P465 edit del story ${Date.now()}`,
    });
    await linkStoryToPoint(story.id, point.id);

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/1\s+stor(y|ies)/i)).toBeVisible({ timeout: 10000 });

      // Edit icon (aria-label="Edit your story for this point" or similar)
      const editBtn = page.getByRole('button', { name: /edit.*story|story.*edit/i });
      await expect(editBtn).toBeVisible({ timeout: 5000 });

      // Delete icon (aria-label="Delete your story for this point" or similar)
      const deleteBtn = page.getByRole('button', { name: /delete.*story|story.*delete/i });
      await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteTestStory(story.id);
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });

  test('own profile, no story: edit and delete icons NOT visible (only share + open)', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465NoEditDel' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 no edit del ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await goToProfilePointsTab(page, viewer.slug);

      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // Edit/delete must not appear (no story to edit/delete)
      await expect(
        page.getByRole('button', { name: /edit.*story|story.*edit/i })
      ).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: /delete.*story|story.*delete/i })
      ).not.toBeVisible();
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });
});

// ─── Regression — surfaces NOT in scope are unchanged ─────────────────────────

test.describe('P465 Regression — point detail page (not in scope) is unchanged', () => {
  test.describe.configure({ timeout: 60000 });

  test('point detail page: CTA still appears for viewer with position (P456 behavior preserved)', async ({ page }) => {
    const viewer = await createTestUser({ name: 'P465RegDetail' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 regression detail ${Date.now()}`,
    });
    await createTestPosition(point.id, viewer.user.id, 'agree');

    try {
      await setTestSession(page, viewer.email);
      await page.goto(`/point/${point.id}`);
      await page.waitForLoadState('networkidle');

      // Point detail page behavior (P456 correct — P465 does not change it)
      await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

      // No actor prefix even here
      await expect(page.getByText(/✓\s*Agree\s*·/)).not.toBeVisible();
    } finally {
      await deleteTestPoint(point.id);
      await deleteTestUser(viewer.user.id);
    }
  });
});
