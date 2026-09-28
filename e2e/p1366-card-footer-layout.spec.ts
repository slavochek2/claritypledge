/**
 * @file p1366-card-footer-layout.spec.ts
 * @description P1366 — measured layout of the list-card footer and the top-right `⋯`, on real
 * cards against the test DB, at 375×800 and 320×700 (plus a 1280×900 screenshot).
 *
 * Per state and width:
 *   375 — the footer is ONE line: every direct child of the footer's left group and `Details →`
 *         share the same top (±2px), and the row is at most 44px tall.
 *   320 — nothing overflows: the footer row (and each control in it) ends inside the card, and the
 *         `⋯` trigger does not intersect the author / owner name (or, on the feed point card,
 *         which has no name, the statement it sits beside).
 *   (The no-overflow check also runs at 375 — a stronger check, never a looser one.)
 *   Both — no control in the left group reaches under `Details →`: each one's right edge is at or
 *         before Details' left edge (1px tolerance). Ending inside the CARD is not enough — a long
 *         `<First>'s story` once ran 20px (375) / 75px (320) under Details while doing so.
 *
 * FOUNDER DECISION 2026-09-28 (after the /tree footer-placement demo): on someone ELSE's profile
 * the bottom row sits OUTSIDE the grey quote box, at card level, like the own-profile card. Inside
 * the box it had 249px at 375 and `Maya's story` + `+ Add a story` + `Details →` needs ~331px.
 * ACCEPTED by the founder: with the expander AND a viewer link both showing (states A and B), the
 * row wraps to two lines at 375 and 320. So for A and B only, the one-line check is replaced by:
 *   - the row is outside the quote box, a card-level row, as wide as the plain-branch row
 *     (291px at 375, ±2);
 *   - `<First>'s story` is NOT truncated (label scrollWidth ≤ clientWidth) at 375 and 320;
 *   - `Details →` stays right-aligned (its right edge = the row's content right, ±2);
 *   - the sibling-overlap and no-overflow checks, as for every state.
 * State G (owner's story only, no viewer link) must still be ONE line at 375 AND 320, untruncated.
 *
 * Screenshots: test-results/p1366-visual/<state>-<width>.png (the card), plus the open `⋯` menu
 * for state C. Measurements: test-results/p1366-visual/<state>-<width>.json.
 *
 * States: A — someone else's profile, owner has a story, viewer holds a position with no story.
 *         B — someone else's profile, viewer has a story on the point.
 *         C — own profile, Stories tab, own story card (⋯ open: Share / Edit / Delete).
 *         D — own profile, Points tab, a position and no story.
 *         E — a long owner name next to the ⋯ (story card and quote row).
 *         F — /feed, signed in, a point the viewer holds a position on with no story.
 *         G — someone else's profile, owner's story only, the viewer holds no position.
 *
 * Role names use `exact: true` throughout: name matching is substring by default, and a card
 * root (role=button, named from its content) would otherwise match too.
 */
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, deleteTestStory } from './helpers/test-story';

const OUT_DIR = path.resolve('test-results/p1366-visual');
const CHECK_WIDTHS = [
  { width: 375, height: 800 },
  { width: 320, height: 700 },
] as const;
const DESKTOP = { width: 1280, height: 900 } as const;

const OWNER_NAME = 'Maya P1366owner';
const OWNER_FIRST = 'Maya';
const VIEWER_NAME = 'Pia P1366viewer';
const LONG_NAME = 'Maximiliana Konstantinopoulou-Vandenberghe';
const LONG_FIRST = 'Maximiliana';

const RUN = Date.now();
const STMT = {
  A: `P1366 layout A ${RUN}: short meetings beat long ones`,
  B: `P1366 layout B ${RUN}: written specs reduce rework`,
  D: `P1366 layout D ${RUN}: async updates respect focus time`,
  E: `P1366 layout E ${RUN}: naming things is half of design`,
  F: `P1366 layout F ${RUN}: small teams move faster than large ones`,
  G: `P1366 layout G ${RUN}: a written agenda shortens meetings`,
};
const STORY = {
  ownerA: `P1366 owner story A ${RUN}. We cut our standup to ten minutes and nobody missed the rest.`,
  ownerB: `P1366 owner story B ${RUN}. The spec caught three misunderstandings before any code.`,
  viewerB: `P1366 viewer story B ${RUN}. Writing it down made the disagreement visible early.`,
  long: `P1366 long-name story ${RUN}. A name this long must truncate beside the menu, not run under it.`,
  ownerG: `P1366 owner story G ${RUN}. The agenda went out the day before and the meeting took half the time.`,
};

// Story-points link carrying author_id (the P465 helper shape).
async function linkStory(storyId: string, pointId: string, authorId: string) {
  const { error } = await supabaseAdmin
    .from('story_points')
    .insert({ story_id: storyId, point_id: pointId, author_id: authorId });
  if (error) throw new Error(`linkStory failed: ${error.message}`);
}

type Box = { x: number; y: number; width: number; height: number };
const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;
const intersects = (a: Box, b: Box) =>
  a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);

async function box(l: Locator, what: string): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error(`no bounding box for ${what}`);
  return b;
}

async function setWidth(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize(vp);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(vp.width);
}

function writeMeasurements(name: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

interface LayoutTarget {
  state: string;
  card: Locator;
  type: 'point' | 'story';
  /** The box the ⋯ must not intersect (the name, or the statement on the feed card). */
  nameBox: Locator;
  /**
   * Founder-accepted wrap (states A and B, 2026-09-28): replaces the one-line check at 375 with
   * the card-level-row / width / right-aligned-Details checks.
   */
  wrapAccepted?: boolean;
  /** One line at 320 too (state G). */
  oneLineAt320?: boolean;
  /** The expander whose label must not be truncated at 375 and 320. */
  expanderName?: string;
}

/** The plain-branch (own profile) footer row width at 375 — measured in state D. */
const PLAIN_ROW_WIDTH_375 = 291;

/**
 * Measures the footer and ⋯ at the current width and asserts:
 *  - (1) one line at 375: equal tops (±2px) across the left group's children and Details; row ≤ 44px;
 *  - (2) no overflow: row and every control end inside the card; ⋯ ∩ name = ∅.
 */
async function checkLayout(t: LayoutTarget, width: number) {
  const details = t.card.getByRole('button', { name: `Details for this ${t.type}`, exact: true });
  await expect(details).toBeVisible();
  const row = details.locator('xpath=..');
  const left = row.locator(':scope > div').first();
  const kids = await left.locator(':scope > *').all();
  const menu = t.card.getByRole('button', { name: `More actions for this ${t.type}`, exact: true });

  const cardBox = await box(t.card, 'card');
  const rowBox = await box(row, 'footer row');
  const detailsBox = await box(details, 'Details');
  const leftBox = await box(left, 'left group');
  const menuBox = await box(menu, '⋯ trigger');
  const nameBox = await box(t.nameBox, 'name');
  const children: { text: string; box: Box }[] = [];
  for (const k of kids) {
    children.push({ text: ((await k.textContent()) ?? '').trim(), box: await box(k, 'footer child') });
  }

  writeMeasurements(`${t.state}-${width}`, {
    width,
    cardInnerWidth: cardBox.width,
    card: cardBox,
    row: rowBox,
    leftGroup: leftBox,
    details: detailsBox,
    children,
    menu: menuBox,
    name: nameBox,
  });

  const where = `${t.state} @${width}`;
  const oneLine = (width === 375 && !t.wrapAccepted) || (width === 320 && t.oneLineAt320);
  if (oneLine) {
    for (const c of children) {
      expect(Math.abs(c.box.y - detailsBox.y), `${where}: "${c.text}" top ${c.box.y} vs Details top ${detailsBox.y}`)
        .toBeLessThanOrEqual(2);
    }
    expect(rowBox.height, `${where}: footer row height`).toBeLessThanOrEqual(44);
  }
  if (t.wrapAccepted) {
    // a card-level row, not inside the grey quote box
    const placement = await details.evaluate((el) => {
      const wrapper = el.closest('[role="presentation"]');
      const card = el.closest('[role="button"]');
      return {
        inQuoteBox: !!el.closest('.bg-gray-50'),
        wrapperIsCardChild: !!wrapper && wrapper.parentElement === card,
      };
    });
    expect(placement.inQuoteBox, `${where}: footer inside the quote box`).toBe(false);
    expect(placement.wrapperIsCardChild, `${where}: footer wrapper is not a direct child of the card`).toBe(true);
    if (width === 375) {
      expect(Math.abs(rowBox.width - PLAIN_ROW_WIDTH_375), `${where}: row width ${rowBox.width} vs plain-branch ${PLAIN_ROW_WIDTH_375}`)
        .toBeLessThanOrEqual(2);
    }
    // Details stays right-aligned: its right edge = the row wrapper's content right
    const contentRight = await details.evaluate((el) => {
      const wrapper = el.closest('[role="presentation"]') as HTMLElement;
      const r = wrapper.getBoundingClientRect();
      return r.right - parseFloat(getComputedStyle(wrapper).paddingRight);
    });
    expect(Math.abs(right(detailsBox) - contentRight), `${where}: Details right ${right(detailsBox)} vs row content right ${contentRight}`)
      .toBeLessThanOrEqual(2);
  }
  if (t.expanderName) {
    const label = t.card.getByRole('button', { name: t.expanderName, exact: true }).locator('span.truncate');
    const fit = await label.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(fit.scroll, `${where}: "${t.expanderName}" is truncated (scrollWidth ${fit.scroll} > clientWidth ${fit.client})`)
      .toBeLessThanOrEqual(fit.client);
  }
  // no sibling overlap: nothing in the left group runs under Details (both widths)
  for (const c of children) {
    expect(right(c.box), `${where}: "${c.text}" right ${right(c.box)} vs Details left ${detailsBox.x}`)
      .toBeLessThanOrEqual(detailsBox.x + 1);
  }
  // no overflow (asserted at both widths; the spec requires it at 320)
  expect(right(rowBox), `${where}: footer row right ${right(rowBox)} vs card right ${right(cardBox)}`)
    .toBeLessThanOrEqual(right(cardBox) + 0.5);
  for (const c of [...children, { text: 'Details', box: detailsBox }]) {
    expect(right(c.box), `${where}: "${c.text}" right ${right(c.box)} vs card right ${right(cardBox)}`)
      .toBeLessThanOrEqual(right(cardBox) + 0.5);
  }
  expect(right(menuBox), `${where}: ⋯ right vs card right`).toBeLessThanOrEqual(right(cardBox) + 0.5);
  expect(intersects(menuBox, nameBox), `${where}: ⋯ ${JSON.stringify(menuBox)} overlaps name ${JSON.stringify(nameBox)}`)
    .toBe(false);
}

async function shoot(t: LayoutTarget, width: number) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await t.card.scrollIntoViewIfNeeded();
  await t.card.screenshot({ path: path.join(OUT_DIR, `${t.state}-${width}.png`) });
}

/** The 375 + 320 checks, and screenshots at 375, 320 and 1280. */
async function runAllWidths(page: Page, target: () => LayoutTarget) {
  for (const vp of CHECK_WIDTHS) {
    await setWidth(page, vp);
    const t = target();
    await t.card.scrollIntoViewIfNeeded();
    await checkLayout(t, vp.width);
    await shoot(t, vp.width);
  }
  await setWidth(page, DESKTOP);
  await shoot(target(), DESKTOP.width);
}

/** A profile point card (PointCardWithLinks): its root is the role=button holding the statement. */
const profilePointCard = (page: Page, statement: string) =>
  page.locator('[role="button"]').filter({ hasText: statement }).first();

async function openProfileTab(page: Page, slug: string, tab: 'Points' | 'Stories') {
  await page.goto(`/p/${slug}`);
  const tabEl = page.getByRole('tab', { name: new RegExp(`^${tab}`) });
  await expect(tabEl).toBeVisible({ timeout: 20000 });
  await tabEl.click();
}

test.describe('P1366 — card footer layout at 375 / 320', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 });

  let owner: TestUser;
  let viewer: TestUser;
  let longOwner: TestUser;
  const pointIds: string[] = [];
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120000);
    owner = await createTestUser({ name: OWNER_NAME });
    viewer = await createTestUser({ name: VIEWER_NAME });
    longOwner = await createTestUser({ name: LONG_NAME });

    // A — owner's point with the owner's story; the viewer holds a position, no story.
    const a = await createTestPoint(owner.user.id, { statement: STMT.A });
    pointIds.push(a.id);
    await createTestPosition(a.id, owner.user.id, 'agree');
    await createTestPosition(a.id, viewer.user.id, 'agree');
    const sA = await createTestStory(owner.user.id, { content: STORY.ownerA, visibility: 'public' });
    storyIds.push(sA.id);
    await linkStory(sA.id, a.id, owner.user.id);

    // B — owner's point with the owner's story AND the viewer's story.
    const b = await createTestPoint(owner.user.id, { statement: STMT.B });
    pointIds.push(b.id);
    await createTestPosition(b.id, owner.user.id, 'agree');
    await createTestPosition(b.id, viewer.user.id, 'disagree');
    const sB = await createTestStory(owner.user.id, { content: STORY.ownerB, visibility: 'public' });
    const vB = await createTestStory(viewer.user.id, { content: STORY.viewerB, visibility: 'public' });
    storyIds.push(sB.id, vB.id);
    await linkStory(sB.id, b.id, owner.user.id);
    await linkStory(vB.id, b.id, viewer.user.id);

    // D — a point the viewer holds a position on, with no story (own profile, Points tab).
    const d = await createTestPoint(viewer.user.id, { statement: STMT.D });
    pointIds.push(d.id);
    await createTestPosition(d.id, viewer.user.id, 'agree');

    // E — a long-named owner with a story on a point.
    const e = await createTestPoint(longOwner.user.id, { statement: STMT.E });
    pointIds.push(e.id);
    await createTestPosition(e.id, longOwner.user.id, 'agree');
    const sE = await createTestStory(longOwner.user.id, { content: STORY.long, visibility: 'public' });
    storyIds.push(sE.id);
    await linkStory(sE.id, e.id, longOwner.user.id);

    // G — owner's point with the owner's story; the viewer holds NO position.
    const g = await createTestPoint(owner.user.id, { statement: STMT.G });
    pointIds.push(g.id);
    await createTestPosition(g.id, owner.user.id, 'agree');
    const sG = await createTestStory(owner.user.id, { content: STORY.ownerG, visibility: 'public' });
    storyIds.push(sG.id);
    await linkStory(sG.id, g.id, owner.user.id);

    // F — a feed point the viewer holds a position on, with no story.
    const f = await createTestPoint(owner.user.id, { statement: STMT.F });
    pointIds.push(f.id);
    await createTestPosition(f.id, viewer.user.id, 'agree');
  });

  test.afterAll(async () => {
    for (const id of storyIds) await deleteTestStory(id).catch(() => {});
    for (const id of pointIds) await deleteTestPoint(id).catch(() => {});
    for (const u of [owner, viewer, longOwner]) {
      if (u?.user?.id) await supabaseAdmin.auth.admin.deleteUser(u.user.id).catch(() => {});
    }
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    await setTestSession(page, viewer.email);
  });

  test("A — someone else's profile: <First>'s story + + Add a story + Details", async ({ page }) => {
    await openProfileTab(page, owner.slug, 'Points');
    const card = profilePointCard(page, STMT.A);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByRole('button', { name: `${OWNER_FIRST}'s story`, exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Add a story for this point', exact: true })).toBeVisible();
    await runAllWidths(page, () => ({
      state: 'A',
      card: profilePointCard(page, STMT.A),
      type: 'point',
      wrapAccepted: true,
      expanderName: `${OWNER_FIRST}'s story`,
      nameBox: profilePointCard(page, STMT.A).getByTestId('point-owner-row').getByText(OWNER_NAME, { exact: true }),
    }));
  });

  test("B — someone else's profile, I wrote one: <First>'s story + ✓ Your story + Details", async ({ page }) => {
    await openProfileTab(page, owner.slug, 'Points');
    const card = profilePointCard(page, STMT.B);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByRole('button', { name: `${OWNER_FIRST}'s story`, exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Your story', exact: true })).toBeVisible();
    await runAllWidths(page, () => ({
      state: 'B',
      card: profilePointCard(page, STMT.B),
      type: 'point',
      wrapAccepted: true,
      expanderName: `${OWNER_FIRST}'s story`,
      nameBox: profilePointCard(page, STMT.B).getByTestId('point-owner-row').getByText(OWNER_NAME, { exact: true }),
    }));
  });

  test('C — own profile, Stories tab: own story card with ⋯ (Share/Edit/Delete) + + Add a point + Details', async ({ page }) => {
    await openProfileTab(page, viewer.slug, 'Stories');
    const cardFor = () => page.getByRole('button', { name: `Story by ${VIEWER_NAME}`, exact: true });
    await expect(cardFor()).toBeVisible({ timeout: 20000 });
    await expect(cardFor().getByRole('button', { name: 'Add a point to this story', exact: true })).toBeVisible();
    await runAllWidths(page, () => ({
      state: 'C',
      card: cardFor(),
      type: 'story',
      nameBox: cardFor().getByRole('button', { name: VIEWER_NAME, exact: true }),
    }));

    // the open ⋯ menu, at each width
    for (const vp of [...CHECK_WIDTHS, DESKTOP]) {
      await setWidth(page, vp);
      await cardFor().scrollIntoViewIfNeeded();
      await cardFor().getByRole('button', { name: 'More actions for this story', exact: true }).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem')).toHaveText(['Share', 'Edit', 'Delete']);
      await page.screenshot({ path: path.join(OUT_DIR, `C-menu-${vp.width}.png`), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    }
  });

  test('D — own profile, Points tab, a position and no story: + Add a story + Details', async ({ page }) => {
    await openProfileTab(page, viewer.slug, 'Points');
    const card = profilePointCard(page, STMT.D);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByRole('button', { name: 'Add a story for this point', exact: true })).toBeVisible();
    await runAllWidths(page, () => ({
      state: 'D',
      card: profilePointCard(page, STMT.D),
      type: 'point',
      nameBox: profilePointCard(page, STMT.D).getByTestId('point-owner-row').getByText(VIEWER_NAME, { exact: true }),
    }));
  });

  test('E — a long owner name next to the ⋯: story card and quote row', async ({ page }) => {
    await openProfileTab(page, longOwner.slug, 'Stories');
    const storyCard = () => page.getByRole('button', { name: `Story by ${LONG_NAME}`, exact: true });
    await expect(storyCard()).toBeVisible({ timeout: 20000 });
    await runAllWidths(page, () => ({
      state: 'E-story',
      card: storyCard(),
      type: 'story',
      nameBox: storyCard().getByRole('button', { name: LONG_NAME, exact: true }),
    }));

    await setWidth(page, CHECK_WIDTHS[0]);
    await page.getByRole('tab', { name: /^Points/ }).click();
    const pointCard = () => profilePointCard(page, STMT.E);
    await expect(pointCard()).toBeVisible({ timeout: 20000 });
    await expect(pointCard().getByRole('button', { name: `${LONG_FIRST}'s story`, exact: true })).toBeVisible();
    await runAllWidths(page, () => ({
      state: 'E-point',
      card: pointCard(),
      type: 'point',
      nameBox: pointCard().getByTestId('point-owner-row').getByText(LONG_NAME, { exact: true }),
    }));
  });

  test('F — /feed, signed in, a point with my position and no story: + Add a story + Details', async ({ page }) => {
    await page.goto('/feed');
    await page.getByPlaceholder('Search stories and points...').fill(`P1366 layout F ${RUN}`);
    const cardFor = () => page.getByRole('button', { name: `Point: ${STMT.F}`, exact: true });
    await expect(cardFor()).toBeVisible({ timeout: 20000 });
    await expect(cardFor().getByRole('button', { name: 'Add a story for this point', exact: true })).toBeVisible({ timeout: 15000 });
    await runAllWidths(page, () => ({
      state: 'F',
      card: cardFor(),
      type: 'point',
      // no name on a feed point card: the ⋯ sits beside the statement
      nameBox: cardFor().locator('p', { hasText: STMT.F }).first(),
    }));
  });

  test("G — someone else's profile, owner's story only: <First>'s story + Details, ONE line at 375 and 320", async ({ page }) => {
    await openProfileTab(page, owner.slug, 'Points');
    const card = profilePointCard(page, STMT.G);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByRole('button', { name: `${OWNER_FIRST}'s story`, exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Add a story for this point', exact: true })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Your story', exact: true })).toHaveCount(0);
    await runAllWidths(page, () => ({
      state: 'G',
      card: profilePointCard(page, STMT.G),
      type: 'point',
      oneLineAt320: true,
      expanderName: `${OWNER_FIRST}'s story`,
      nameBox: profilePointCard(page, STMT.G).getByTestId('point-owner-row').getByText(OWNER_NAME, { exact: true }),
    }));
  });
});
