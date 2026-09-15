/**
 * @file p491-hashtag-feed.spec.ts
 * @description P491: E2E tests for the hashtag feed feature — user flows for
 * browsing feed, filtering by tag, tab switching, tag pill clicks,
 * home redirect, and navigation changes.
 *
 * Uses real DB fixtures for content. Tests run as both anonymous and
 * authenticated users where relevant.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from './helpers/test-story';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';

// Two properties this fixture has to satisfy, both learned by measurement:
//
// 1. The story card STRIPS `#tag` tokens out of the prose and re-renders them as
//    separate tag-pill links, so the rendered paragraph never equals the stored
//    `content` ("A story about #x for #y." renders as "A story about  for ."").
//    Assertions target the prose half, and the hashtags are appended at the END,
//    where removing them leaves the prose intact.
// 2. `fullyParallel: true` runs this file across 3 workers against ONE shared
//    database, so a fixed fixture string means three identical rows are live at
//    once and every `getByText` becomes a strict-mode violation. Each test gets
//    its own suffix so concurrent runs cannot see each other's rows.
const TAGGED_STORY_PROSE_BASE = 'A story about fundraising for startups.';
const POINT_STATEMENT_BASE = 'Fundraising is harder than building product.';
const UNTAGGED_STORY_BASE = 'A story without any tags.';

test.describe('P491: Hashtag Feed — User Flows', () => {
  let author: TestUser;
  let taggedStory: TestStory;
  let untaggedStory: TestStory;
  let taggedPoint: TestPoint;
  let taggedStoryProse: string;

  test.beforeEach(async () => {
    author = await createTestUser({ name: 'Feed Author' });

    // See note above property 2: unique per test, so parallel workers do not
    // collide in the shared database.
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    taggedStoryProse = `${TAGGED_STORY_PROSE_BASE} ${unique}`;

    // The hashtags live in the CONTENT, not in a `tags:` option, because the
    // database owns this column: P592's BEFORE INSERT trigger
    // (20260327084215_auto_extract_story_hashtags.sql) unconditionally does
    //   NEW.tags := ARRAY(regexp_matches(NEW.content, '#(\w+)', 'g'))
    // so any `tags:` passed to createTestStory is overwritten on write. With
    // plain prose the story landed with tags = {}, and every ?tag= assertion
    // below failed against a story that genuinely carried no tags — while the
    // UNFILTERED Stories tab still showed it, which is why this looked like a
    // filter bug rather than a fixture one. Tagging via content is also how a
    // real author tags a story, which is the P1078 invariant.
    taggedStory = await createTestStory(author.user.id, {
      title: 'Tagged Story',
      content: `${taggedStoryProse} #fundraising #startups`,
      visibility: 'public',
    });

    untaggedStory = await createTestStory(author.user.id, {
      title: 'Untagged Story',
      content: `${UNTAGGED_STORY_BASE} ${unique}`,
      visibility: 'public',
    });

    taggedPoint = await createTestPoint(author.user.id, {
      statement: `${POINT_STATEMENT_BASE} ${unique}`,
      tags: ['fundraising', 'startup-advice'],
    });

    // Author takes a position — P543 hides zero-position points from every
    // listing surface (feed included), so without this the fixture is invisible.
    await createTestPosition(taggedPoint.id, author.user.id, 'agree');
  });

  test.afterEach(async () => {
    if (taggedPoint?.id) await deleteTestPoint(taggedPoint.id);
    if (untaggedStory?.id) await deleteTestStory(untaggedStory.id);
    if (taggedStory?.id) await deleteTestStory(taggedStory.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  // ==========================================================================
  // Flow A: Browse the Feed (anonymous)
  // ==========================================================================

  test('anonymous user can browse Points tab (default)', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Points tab is default active
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await expect(pointsTab).toHaveAttribute('aria-selected', 'true');

    // Should see the tagged point
    await expect(page.getByText(taggedPoint.statement)).toBeVisible();
  });

  test('anonymous user can switch to Stories tab', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Click Stories tab
    await page.getByRole('tab', { name: /stories/i }).click();

    // URL should update
    await expect(page).toHaveURL(/tab=stories/);

    // Stories tab should be active
    const storiesTab = page.getByRole('tab', { name: /stories/i });
    await expect(storiesTab).toHaveAttribute('aria-selected', 'true');

    // Should see the tagged story
    await expect(page.getByText(taggedStoryProse)).toBeVisible();
  });

  // ==========================================================================
  // Flow B: Filter by Tag
  // ==========================================================================

  test('clicking a tag pill navigates to /feed?tag=X', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Find and click a tag pill
    const tagPill = page.getByRole('link', { name: /filter feed by tag: fundraising/i }).first();
    await tagPill.click();

    // URL should contain tag param
    await expect(page).toHaveURL(/tag=fundraising/);

    // Active tag filter should be visible
    await expect(page.getByLabel('Remove filter for #fundraising')).toBeVisible();
  });

  test('dismissing tag filter returns to unfiltered /feed', async ({ page }) => {
    await page.goto('/feed?tag=fundraising');
    await page.waitForLoadState('networkidle');

    // Click dismiss button
    await page.getByLabel(/remove filter for #/i).click();

    // URL should no longer have tag param
    await expect(page).not.toHaveURL(/tag=/);
  });

  test('tag filter shows only matching content', async ({ page }) => {
    await page.goto('/feed?tag=fundraising&tab=stories');
    await page.waitForLoadState('networkidle');

    // Tagged story should be visible
    await expect(page.getByText(taggedStoryProse)).toBeVisible();

    // Untagged story should NOT be visible
    await expect(page.getByText(untaggedStory.content)).not.toBeVisible();
  });

  test('tag filter with nonexistent tag shows empty state', async ({ page }) => {
    await page.goto('/feed?tag=nonexistent');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/no content matching #nonexistent yet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /browse all content/i })).toBeVisible();
  });

  // ==========================================================================
  // Flow C: Shareable URL
  // ==========================================================================

  test('shared /feed?tag=X URL works for anonymous users', async ({ page }) => {
    await page.goto('/feed?tag=fundraising');
    await page.waitForLoadState('networkidle');

    // Should see filtered content (not an auth wall)
    expect(page.url()).toContain('/feed');
    await expect(page.getByLabel('Remove filter for #fundraising')).toBeVisible();
  });

  // ==========================================================================
  // Tab switching preserves tag filter
  // ==========================================================================

  test('switching tabs preserves tag filter in URL', async ({ page }) => {
    await page.goto('/feed?tag=fundraising');
    await page.waitForLoadState('networkidle');

    // Switch to Stories tab
    await page.getByRole('tab', { name: /stories/i }).click();

    // Both params should be present
    await expect(page).toHaveURL(/tag=fundraising/);
    await expect(page).toHaveURL(/tab=stories/);
  });

  // ==========================================================================
  // Browser back/forward
  // ==========================================================================

  test('browser back restores previous filter/tab state', async ({ page }) => {
    // Start unfiltered
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Apply tag filter
    const tagPill = page.getByRole('link', { name: /filter feed by tag: fundraising/i }).first();
    await tagPill.click();
    await expect(page).toHaveURL(/tag=fundraising/);

    // Go back
    await page.goBack();

    // Should be back to unfiltered
    await expect(page).not.toHaveURL(/tag=/);
  });
});

// ============================================================================
// Flow D: Authenticated User Flows (UAT-7, UAT-9, UAT-10)
// ============================================================================

test.describe('P491: Authenticated User Flows', () => {
  let author: TestUser;

  test.beforeEach(async () => {
    author = await createTestUser({ name: 'Feed Auth User' });
  });

  test.afterEach(async () => {
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('authenticated user visiting / is redirected to /feed (UAT-7)', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByRole('heading', { name: /home/i, level: 1 })).toBeVisible();
  });

  test('bottom nav links to the feed, not History, on mobile (UAT-9)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, author.email);
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // The feed entry is labelled "Home", not "Feed" — bottom-nav.tsx:86-88 is
    // `{ label: "Home", to: "/feed" }`. Same rename as the page's own <h1>Home</h1>
    // (feed-page.tsx:323), which this file already corrects one test above; the
    // nav assertion was missed. UAT-9's subject is the DESTINATION — that the
    // feed replaced History in the bottom nav — so the link target is asserted
    // too, and it is what would actually regress if the entry were repointed.
    const bottomNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(bottomNav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/feed');

    // History should NOT be in bottom nav
    await expect(bottomNav.getByText('History')).not.toBeVisible();
  });

  test('History accessible from avatar/hamburger menu (UAT-10)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, author.email);
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Open the mobile hamburger/avatar menu
    const menuTrigger = page.getByRole('button', { name: /open menu/i });
    await menuTrigger.click();

    // Session History should be in the menu
    await expect(page.getByText('Session History')).toBeVisible();
  });
});

// ============================================================================
// Flow F: Tags in /live Context (display-only)
// ============================================================================

test.describe('P491: Tags in /live Context', () => {
  // These tests verify that tag pills in /live are display-only (not clickable).
  // Requires a /live session setup — complex E2E scenario.

  test.skip('tag pills in /live are visible but not clickable', async () => {
    // TODO: Implement after /live session fixture helpers are available.
    // 1. Create a /live session with tagged stories
    // 2. Navigate to /live session
    // 3. Verify tag pills are <span> elements (not <a>)
    // 4. Click tag pill — verify no navigation occurs
  });
});
