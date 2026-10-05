/**
 * @file p1424-nested-details-only.spec.ts
 * @description P1424 — at phone width, real taps: the items NESTED inside a list card (a linked
 * story under a point card, a quoted point under a story card) open only through their own small
 * `Details →`. A tap on the nested body stays on the list. Outside list cards (the point page
 * embed) the nested story still opens on tap — the non-goal guard.
 *
 * Seeds its own point + linked story under a unique tag, so every surface has nested items:
 * /stake/:tag (feed cards), and the author's profile (Stories and Points tabs).
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, deleteTestStory } from './helpers/test-story';

const PHONE = { width: 375, height: 800 };
const TAG = `p1424e${Date.now().toString(36)}`;
const STATEMENT = `P1424 nested point ${TAG}: tapping a quoted item should not navigate.`;
const STORY_TEXT = `P1424 nested story ${TAG}. I kept opening quoted points by accident while voting.`;

let owner: TestUser;
let pointId = '';
let storyId = '';

/** Expand the card's nested list: "1 point" / "1 story", or "Their story" on the profile's point
 *  card, where the only linked story is the owner's (P1366). */
async function expand(card: Locator, noun: 'point' | 'story') {
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  const label = noun === 'story' ? /^(1 story|Their story)$/ : /^1 point$/;
  await card.getByRole('button', { name: label }).click();
}

/** The nested item's bordered box (the byline row sits above it, outside the box). */
const nestedBox = (card: Locator, testId: 'quoted-story' | 'quoted-point-card') =>
  card.getByTestId(testId).first().locator(':scope > div').last();

async function assertDetailsOnly(page: Page, box: Locator, listUrl: RegExp, detail: RegExp) {
  await expect(box).toBeVisible();
  await box.scrollIntoViewIfNeeded();
  // Two real taps on the nested body: its padding corner, then into the text.
  await box.click({ position: { x: 6, y: 6 } });
  await box.click({ position: { x: 60, y: 18 } });
  await page.waitForTimeout(500);
  await expect(page).not.toHaveURL(detail);
  await expect(page).toHaveURL(listUrl);
  await expect(box).not.toHaveAttribute('role', 'button');
  expect(await box.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');

  const details = box.getByTestId(/^nested-details-/);
  const size = await details.boundingBox();
  expect(size!.height, 'the nested Details → is a 40px tap target').toBeGreaterThanOrEqual(40);
  await details.click();
  await expect(page).toHaveURL(detail);
}

test.describe('P1424 — nested items open only via their own Details', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 });

  test.beforeAll(async () => {
    test.setTimeout(120000);
    owner = await createTestUser({ name: 'Nia P1424owner' });
    const point = await createTestPoint(owner.user.id, { statement: STATEMENT, tags: [TAG] });
    pointId = point.id;
    await createTestPosition(pointId, owner.user.id, 'agree');
    const story = await createTestStory(owner.user.id, { content: `${STORY_TEXT} #${TAG}`, visibility: 'public', tags: [TAG] });
    storyId = story.id;
    const { error } = await supabaseAdmin
      .from('story_points')
      .insert({ story_id: storyId, point_id: pointId, author_id: owner.user.id });
    if (error) throw new Error(`link failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId).catch(() => {});
    if (pointId) await deleteTestPoint(pointId).catch(() => {});
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id).catch(() => {});
  });

  test('smoke: /stake/:tag loads at 375 with no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(PHONE);
    await page.goto(`/stake/${TAG}`);
    await expect(page.locator(`article[data-point-id="${pointId}"]`)).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(PHONE.width);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('/stake point card: the linked story opens only via its Details', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/stake/${TAG}`);
    const card = page.locator(`article[data-point-id="${pointId}"]`);
    await expand(card, 'story');
    await assertDetailsOnly(page, nestedBox(card, 'quoted-story'), /\/stake\//, new RegExp(`/story/${storyId}`));
  });

  test('/stake story card: the quoted point opens only via its Details', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/stake/${TAG}?tab=stories`);
    const card = page.getByTestId(`feed-story-card-${storyId}`);
    await expand(card, 'point');
    await assertDetailsOnly(page, nestedBox(card, 'quoted-point-card'), /\/stake\//, new RegExp(`/point/${pointId}`));
  });

  test('profile Stories tab: the quoted point opens only via its Details', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/p/${owner.slug}`);
    await page.getByRole('tab', { name: /^Stories/ }).click();
    const card = page.locator('article').filter({ hasText: STORY_TEXT }).first();
    await expand(card, 'point');
    await assertDetailsOnly(page, nestedBox(card, 'quoted-point-card'), /\/p\//, new RegExp(`/point/${pointId}`));
  });

  test('profile Points tab: the linked story opens only via its Details', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/p/${owner.slug}`);
    await page.getByRole('tab', { name: /^Points/ }).click();
    const card = page.locator('article').filter({ hasText: STATEMENT }).first();
    await expand(card, 'story');
    await assertDetailsOnly(page, nestedBox(card, 'quoted-story'), /\/p\//, new RegExp(`/story/${storyId}`));
  });

  /* FIXME (pre-existing, reproduced on main at the P1424 base): on `/point/:id?embed=true` the
     "Expand linked stories" toggle renders no story at all, so this guard cannot reach a story to
     tap. Filed in the task inbox. The guard is held at component level meanwhile
     (src/tests/p1424-nested-details-only.test.tsx, "non-goal guard"). */
  test.fixme('non-goal guard: the point page embed still opens the linked story on tap', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/point/${pointId}?embed=true`);
    const expander = page.getByRole('button', { name: 'Expand linked stories' }).first();
    await expect(expander).toBeVisible({ timeout: 20000 });
    await expander.click();
    const box = page.getByTestId('quoted-story').first().locator(':scope > div').last();
    await expect(box).toHaveAttribute('role', 'button');
    await expect(box.getByTestId(/^nested-details-/)).toHaveCount(0);
  });
});
