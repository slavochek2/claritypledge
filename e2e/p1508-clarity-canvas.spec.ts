/**
 * @file p1508-clarity-canvas.spec.ts
 * @description P1508 — Clarity Canvas at /p/:handle/canvas/:projectTag (R14), against the TEST DB.
 *
 * Every test builds its own canvas under a fresh owner (service role writes the box tags and the
 * canvas's reserved `canvas_<name>` tag, as the seed does), with a unique name, so nothing depends
 * on the founder's seeded canvas:
 *   - Problem: seven points (more than a box shows); every point on a canvas is PRIVATE (P1515: the
 *     database refuses a public point carrying a canvas_ tag, so a canvas's audience, not a point's
 *     own flag, decides who reads it)
 *   - Solution: one point with a public story by the owner and a story the other user ADDED through
 *     the canvas; the owner agrees, the other user disagrees
 *
 * P1515 (founder ruling 2026-10-21): the canvas's audience decides everything inside it. The owner
 * hosts an event the canvas is shared with and the other user is registered for it in time, so the
 * default viewer here is that admitted reader. A stranger (signed in or out) sees not-found, even
 * though the canvas has points.
 *   - a point by ANOTHER user with the same canvas tag and a box tag    (must not appear)
 *   - an owner point with the canvas tag and NO box tag                 (must not appear)
 *   - Offers & Pricing: one point; Cost Structure stays empty
 *   - the "Why I do this" boxes stay empty
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

const PRIVATE_TEXT = 'P1508 private bet the owner alone can see';
const STORY_TEXT = 'P1508 story arguing the solution point.';
const OTHER_STORY_TEXT = 'P1508 the other user explains why they disagree.';
const FOREIGN_TEXT = 'P1508 foreign point by someone else with the same tag';
const UNBOXED_TEXT = 'P1508 owner point with the project tag and no box';
const SOLUTION_TEXT = 'P1508 the solution point';
const REVENUE_TEXT = 'P1508 the revenue point';

interface Fixture {
  /** a PUBLIC point with no canvas tag, on the owner's profile, for the profile-vs-canvas comparison */
  profilePointId: string;
  owner: TestUser;
  /** admitted through the event the canvas is shared with */
  other: TestUser;
  /** signed in, but not part of the audience */
  stranger: TestUser;
  event: TestEvent;
  tag: string;
  solutionPointId: string;
  revenuePointId: string;
  privatePointId: string;
  /** a second canvas of the owner's, never shared, and a third */
  secondTag: string;
  privateTag: string;
  url: string;
}

async function insertPoint(ownerId: string, statement: string, tags: string[], systemTags: string[], visibility = 'private') {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement, first_validator_id: ownerId, visibility, tags, system_tags: systemTags,
  }).select('id').single();
  if (error) throw new Error(`[P1508 fixture] point: ${error.message}`);
  return data.id as string;
}

/** A canvas point's system tags: its box, and the canvas's reserved tag (R9). */
const sys = (canvas: string, ...box: string[]) => [...box, `canvas_${canvas}`];

/** Fills `made` as it goes, so a setup that fails half-way is still cleaned up. */
async function buildCanvas(made: Partial<Fixture>): Promise<Fixture> {
  const tag = `p1508e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  made.tag = tag;
  const owner = await createTestUser({ name: 'P1508 Canvas Owner' });
  made.owner = owner;
  const other = await createTestUser({ name: 'P1508 Other User' });
  made.other = other;
  const stranger = await createTestUser({ name: 'P1508 Stranger' });
  made.stranger = stranger;
  for (let i = 1; i <= 6; i++) {
    await insertPoint(owner.user.id, `P1508 problem point number ${i} with enough words to wrap onto two lines`, [tag], sys(tag, 'canvas:problem'));
  }
  const privatePointId = await insertPoint(owner.user.id, PRIVATE_TEXT, [tag], sys(tag, 'canvas:problem'), 'private');
  const solutionPointId = await insertPoint(owner.user.id, SOLUTION_TEXT, [tag], sys(tag, 'canvas:solution'));
  const revenuePointId = await insertPoint(owner.user.id, REVENUE_TEXT, [tag], sys(tag, 'canvas:revenue'));
  await insertPoint(other.user.id, FOREIGN_TEXT, [tag], sys(tag, 'canvas:problem'));
  await insertPoint(owner.user.id, UNBOXED_TEXT, [tag], sys(tag));
  const secondTag = `${tag}b`;
  const privateTag = `${tag}p`;
  await insertPoint(owner.user.id, 'P1508 second canvas point', [tag], sys(secondTag, 'canvas:problem'));
  await insertPoint(owner.user.id, 'P1508 private-only canvas point', [tag], sys(privateTag, 'canvas:problem'), 'private');
  // R9: a user tag alone never makes a canvas, so this one is not listed in the picker.
  await insertPoint(owner.user.id, 'P1508 user-tag-only point', [`${tag}u`, tag], ['canvas:problem']);

  const { data: story, error } = await supabaseAdmin.from('stories').insert({
    content: STORY_TEXT, author_id: owner.user.id, visibility: 'private', // linked to a private point: it must be private too
  }).select('id').single();
  if (error) throw new Error(`[P1508 fixture] story: ${error.message}`);
  const link = await supabaseAdmin.from('story_points').insert({ story_id: story.id, point_id: solutionPointId, author_id: owner.user.id });
  if (link.error) throw new Error(`[P1508 fixture] link: ${link.error.message}`);
  // P1515: the canvas is shared with an event the owner hosts; the other user is registered in time.
  const event = await createTestEvent(owner.user.id, new Date(Date.now() - 3_600_000), { title: 'P1508 canvas event' });
  made.event = event;
  const rsvp = await supabaseAdmin.from('event_rsvps').insert({ event_id: event.id, profile_id: other.user.id, rsvped_at: new Date(Date.now() - 3 * 3_600_000).toISOString() });
  if (rsvp.error) throw new Error(`[P1508 fixture] rsvp: ${rsvp.error.message}`);
  const canvas = await supabaseAdmin.from('canvases').insert({ owner_id: owner.user.id, name: tag }).select('id').single();
  if (canvas.error) throw new Error(`[P1508 fixture] canvas: ${canvas.error.message}`);
  const audience = await supabaseAdmin.from('canvas_audience').insert({ canvas_id: canvas.data.id, kind: 'event', event_id: event.id });
  if (audience.error) throw new Error(`[P1508 fixture] audience: ${audience.error.message}`);
  // The other user's story is one ADDED through the canvas: a private story of theirs, recorded
  // against the point, never an ordinary story link.
  const { data: otherStory, error: otherError } = await supabaseAdmin.from('stories').insert({
    content: OTHER_STORY_TEXT, author_id: other.user.id, visibility: 'private',
  }).select('id').single();
  if (otherError) throw new Error(`[P1508 fixture] other story: ${otherError.message}`);
  const added = await supabaseAdmin.from('canvas_added_stories').insert({
    canvas_id: canvas.data.id, point_id: solutionPointId, story_id: otherStory.id, author_id: other.user.id,
  });
  if (added.error) throw new Error(`[P1508 fixture] added story: ${added.error.message}`);
  // A point on the owner's PROFILE (public, no canvas tag): a canvas point can no longer be public, so the
  // D5 comparison measures the profile card of this one against the canvas card of the solution point.
  const profilePointId = await insertPoint(owner.user.id, 'P1508 profile point the owner agrees with', [tag], [], 'public');
  const pos = await supabaseAdmin.from('point_positions').insert([
    { point_id: profilePointId, user_id: owner.user.id, position: 'agree' },
    { point_id: solutionPointId, user_id: owner.user.id, position: 'agree' },
    { point_id: solutionPointId, user_id: other.user.id, position: 'disagree' },
  ]);
  if (pos.error) throw new Error(`[P1508 fixture] positions: ${pos.error.message}`);

  return { owner, other, stranger, event, tag, profilePointId, solutionPointId, revenuePointId, privatePointId, secondTag, privateTag, url: `/p/${owner.slug}/canvas/${tag}` };
}

const CARD = '[data-testid^="canvas-point-card-"]';

async function waitForCanvas(page: Page) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
}

test.describe('P1508: Clarity Canvas', () => {
  test.describe.configure({ timeout: 90_000 });
  let fx: Fixture;
  const made: Partial<Fixture> = {};

  test.beforeAll(async () => {
    test.setTimeout(120_000); // two users + ten rows against the shared test DB
    fx = await buildCanvas(made);
  });
  test.afterAll(async () => {
    test.setTimeout(120_000);
    const check = (label: string, r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(`[P1508 cleanup] ${label}: ${r.error.message}`);
    };
    // Points outlive their author (first_validator_id is ON DELETE SET NULL), so remove this
    // run's rows by its unique tag before the users.
    if (made.tag) {
      const { data: pts, error } = await supabaseAdmin.from('points').select('id').contains('tags', [made.tag]);
      if (error) throw new Error(`[P1508 cleanup] find points: ${error.message}`);
      const ids = (pts ?? []).map(p => p.id as string);
      if (ids.length) {
        check('story links', await supabaseAdmin.from('story_points').delete().in('point_id', ids));
        check('positions', await supabaseAdmin.from('point_positions').delete().in('point_id', ids));
        check('points', await supabaseAdmin.from('points').delete().in('id', ids));
      }
    }
    if (made.owner) check('story', await supabaseAdmin.from('stories').delete().eq('author_id', made.owner.user.id).eq('content', STORY_TEXT));
    if (made.other) check('other story', await supabaseAdmin.from('stories').delete().eq('author_id', made.other.user.id).eq('content', OTHER_STORY_TEXT));
    if (made.owner) await deleteTestUser(made.owner.user.id);
    if (made.event) await deleteTestEvent(made.event.id);
    if (made.other) await deleteTestUser(made.other.user.id);
    if (made.stranger) await deleteTestUser(made.stranger.user.id);
  });

  // The default viewer is the admitted reader; tests that need the owner, a stranger or a signed-out
  // visitor say so.
  test.beforeEach(async ({ page }) => {
    await setTestSession(page, fx.other.email);
  });

  test('smoke: the owner sees their canvas in eleven titled boxes under four layers, private point included, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clarity Canvas');
    await expect(page.getByTestId('canvas-owner-name')).toHaveText(fx.owner.name);
    await expect(page.getByTestId('canvas-project-tag')).toHaveText(fx.tag); // the plain name: one version (the owner's other canvases are not listed here)
    for (const title of ['What I love', "What I'm good at", 'What the world needs',
      'Customer Segments', 'Problem', 'Solution', 'Unfair Advantage', 'Distribution', 'Key Metrics',
      'Offers & Pricing', 'Cost Structure']) {
      await expect(page.getByRole('heading', { level: 3, name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(11);
    await expect(page.getByText('Unique Value Proposition')).toHaveCount(0);
    // R1: the four layers, named, in order; no other frames.
    await expect(page.getByTestId('canvas-layer-name')).toHaveText(['Why I do this', 'The core bet', 'How we win', 'How it pays']);
    await expect(page.getByText(/^(Ikigai|Lean Canvas)$/)).toHaveCount(0);
    // R2: two cards, then "N more", which opens the whole box in the panel — the grid stays put.
    const problem = page.getByTestId('canvas-box-canvas:problem');
    await expect(problem.locator(CARD)).toHaveCount(2);
    await expect(problem.getByTestId('canvas-box-more')).toHaveText('See all 7');
    await problem.getByTestId('canvas-box-more').click();
    const list = page.getByTestId('canvas-panel-box-list');
    await expect(list.locator(CARD)).toHaveCount(7);
    await expect(list.getByText(PRIVATE_TEXT)).toBeVisible();
    await expect(problem.locator(CARD)).toHaveCount(2);
    expect(errors.filter(e => !/favicon|ResizeObserver/i.test(e))).toEqual([]);
  });

  test('a point by another user with the same tag, and a point with no box tag, do not appear', async ({ page }) => {
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId('canvas-box-canvas:problem').getByTestId('canvas-box-more').click();
    await expect(page.getByTestId('canvas-panel-box-list').locator(CARD)).toHaveCount(7);
    await expect(page.getByText(FOREIGN_TEXT)).toHaveCount(0);
    await expect(page.getByText('P1508 user-tag-only point')).toHaveCount(0);
    await expect(page.getByText(UNBOXED_TEXT)).toHaveCount(0);
  });

  test('an admitted reader sees the whole canvas, private points included; a signed-in stranger and a signed-out visitor see not-found', async ({ page, browser }) => {
    // The admitted reader (the default session).
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-owner-name')).toHaveText(fx.owner.name);
    const problem = page.getByTestId('canvas-box-canvas:problem');
    await expect(problem.locator(CARD)).toHaveCount(2);
    await expect(problem.getByTestId('canvas-box-more')).toHaveText('See all 7');
    await problem.getByTestId('canvas-box-more').click();
    await expect(page.getByTestId('canvas-panel-box-list').locator(CARD)).toHaveCount(7);
    await expect(page.getByTestId('canvas-panel-box-list').getByText(PRIVATE_TEXT)).toBeVisible(); // CONTROL for the absences below
    await page.keyboard.press('Escape');
    await expect(page.getByText(SOLUTION_TEXT)).toBeVisible();

    // A signed-in stranger: not-found.
    await setTestSession(page, fx.stranger.email);
    await page.goto(fx.url);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await expect(page.getByText(SOLUTION_TEXT)).toHaveCount(0);

    // Signed out: the same.
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.goto(fx.url);
    await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 20_000 });
    await expect(visitor.getByText(SOLUTION_TEXT)).toHaveCount(0);
    await expect(visitor.getByTestId('canvas-grid')).toHaveCount(0);
    await anon.close();
  });

  test('every card shows its spread, always; no switch, no legend, no story count; no buttons inside a card', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    const card = page.getByTestId(`canvas-point-card-${fx.solutionPointId}`);
    await expect(page.getByTestId('canvas-positions-switch')).toHaveCount(0);
    await expect(page.getByTestId('canvas-spread-legend')).toHaveCount(0);
    await expect(card.getByTestId('canvas-card-stories')).toHaveCount(0);
    // Seven bars, strongly disagree to strongly agree; the numbers are in the label.
    const spread = card.getByTestId('canvas-card-spread-row').getByTestId('position-spread');
    await expect(spread).toHaveAttribute('aria-label', '1 disagree, 1 agree');
    await expect(spread).toHaveAttribute('title', '1 disagree, 1 agree');
    await expect(spread.locator('[data-count]')).toHaveCount(7);
    // D4: one grey for every level (no colour per position), on a baseline with a centre tick.
    const colours = await spread.locator('[data-count]').evaluateAll(bars => bars.map(b => getComputedStyle(b).backgroundColor));
    expect(new Set(colours).size).toBe(1);
    expect(await spread.locator('[data-count]').first().evaluate(b => b.className)).toContain('bg-foreground/40');
    expect(await spread.getByTestId('position-spread-baseline').evaluate(b => b.className)).toContain('bg-border');
    const tick = await spread.getByTestId('position-spread-centre').boundingBox();
    const base = await spread.getByTestId('position-spread-baseline').boundingBox();
    expect(tick && base && tick.height > base.height).toBe(true);
    // One on each side is not contested (two on each side is: unit-tested in p1508-canvas-fifth-round).
    await expect(card.getByTestId('contested')).toHaveCount(0);
    await expect(page.getByTestId(`canvas-point-card-${fx.revenuePointId}`).getByTestId('spread-no-positions')).toHaveText('No positions yet');
    await expect(card.locator('button')).toHaveCount(0);
    expect(await card.evaluate(el => el.tagName)).toBe('BUTTON'); // the whole card opens the point
  });

  test('Compare sets two people side by side in the compare page\'s columns; the viewer\'s column reads You', async ({ page }) => {
    // The admitted reader: nobody by default; picking the owner sets "You" against them.
    await page.goto(fx.url);
    await waitForCanvas(page);
    const card = page.getByTestId(`canvas-point-card-${fx.solutionPointId}`);
    await expect(page.getByLabel('Compare positions with')).toHaveValue('');
    await expect(card.getByTestId('canvas-card-compare')).toHaveCount(0);
    await page.getByLabel('Compare positions with').selectOption(fx.owner.user.id);
    await expect(page.getByTestId('canvas-compare-picker')).toContainText(`Comparing with ${fx.owner.name}`);
    await expect(page).toHaveURL(new RegExp(`with=${fx.owner.user.id}`));
    await expect(card.getByTestId('canvas-card-compare')).toContainText('You');
    await expect(card.getByTestId('canvas-card-compare')).toContainText('P1508'); // first names in the narrow columns
    await expect(card.getByTestId('canvas-card-compare')).toContainText('Agrees'); // the owner
    await expect(card.getByTestId('canvas-card-compare')).toContainText(/disagree/i); // "You": the first person
    const noPosition = page.getByTestId(`canvas-point-card-${fx.revenuePointId}`).getByTestId('canvas-card-compare').getByTestId('stance-none');
    await expect(noPosition).toHaveCount(2);
    await expect(noPosition.first()).toHaveText('No position');
    // D8: the compact columns are text-xs; the card stays in its box.
    expect(await card.getByTestId('stance-label').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
    await expect(page.getByTestId('canvas-box-canvas:revenue').locator(CARD)).toHaveCount(1);
    // Signed in as the owner: "You" against the other person. No link to the full compare page (R14):
    // it lists points without their boxes.
    await setTestSession(page, fx.owner.email);
    await page.goto(`${fx.url}?with=${fx.other.user.id}`);
    await waitForCanvas(page);
    await expect(page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).getByTestId('canvas-card-compare')).toContainText('You');
    await expect(page.getByTestId('canvas-compare-full')).toHaveCount(0);
    // The spread and Compare show together.
    await expect(page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).getByTestId('position-spread')).toBeVisible();
    await expect(page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).getByTestId('canvas-card-compare')).toBeVisible();
    // Back to "No one" (a real choice, not the picker's own title): the columns go.
    await expect(page.getByLabel('Compare positions with').locator('option').first()).toHaveText('No one');
    await page.getByLabel('Compare positions with').selectOption('');
    await expect(page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).getByTestId('canvas-card-compare')).toHaveCount(0);
    await expect(page.getByTestId('canvas-compare-full')).toHaveCount(0);
    // Another signed-in person finds the owner first in the list (review fix: the owner is always listed).
    await setTestSession(page, fx.other.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByLabel('Compare positions with').locator('option').nth(1)).toHaveAttribute('value', fx.owner.user.id);
  });

  test('opening a point shows its stories behind one tap and everyone by name; a position taken there persists', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);

    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId(`feed-point-card-${fx.solutionPointId}`)).toBeVisible();
    // Folded, as in the feed: a point with many stories stays short.
    await expect(panel.getByText(STORY_TEXT)).toHaveCount(0);
    // D5: the owner reads their own point — the own-card header, and only their story, "Your story".
    const cardInPanel = panel.getByTestId(`feed-point-card-${fx.solutionPointId}`);
    await expect(cardInPanel.getByTestId('point-owner-row')).toBeVisible();
    await expect(cardInPanel.getByTestId('feed-point-story-expander')).toHaveText(/Your story/);
    await expect(cardInPanel.getByText('Your story')).toHaveCount(1); // never two
    await cardInPanel.getByTestId('feed-point-story-expander').click();
    await expect(cardInPanel.getByText(STORY_TEXT)).toBeVisible();
    await expect(cardInPanel.getByText(OTHER_STORY_TEXT)).toHaveCount(0);
    // D6: the point page's block under the card; the owner's row has a story toggle too (R13),
    // the other person's opens their story.
    const block = panel.getByTestId('point-positions-block');
    await expect(block.getByText('Filter by position:')).toBeVisible();
    const ownerRow = block.getByRole('button', { name: `${fx.owner.name}'s profile` });
    const otherRow = block.getByRole('button', { name: "P1508 Other User's profile" });
    await expect(ownerRow).toContainText(/Agrees/);
    await expect(ownerRow.getByTestId('story-toggle')).toHaveCount(1);
    await otherRow.getByTestId('story-toggle').click();
    await expect(panel.getByText(OTHER_STORY_TEXT)).toBeVisible();
    // Escape inside the expanded story closes only the story.
    await panel.getByRole('region', { name: "P1508 Other User's story" }).locator('a[href], button').first().focus();
    await page.keyboard.press('Escape');
    await expect(panel.getByText(OTHER_STORY_TEXT)).toHaveCount(0);
    await expect(panel).toBeVisible();
    // Review fix: Escape straight after opening (focus still on the toggle) also closes only the story.
    await otherRow.getByTestId('story-toggle').click();
    await expect(panel.getByText(OTHER_STORY_TEXT)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel.getByText(OTHER_STORY_TEXT)).toHaveCount(0);
    await expect(panel).toBeVisible();
    // The filter lives in the canvas, not the address.
    await block.getByRole('button', { name: /^Disagree \(/ }).click();
    await expect(page).not.toHaveURL(/filter=/);
    await expect(ownerRow).toHaveCount(0);
    // It resets when the point changes — also on the way back to this point (review fix).
    await panel.getByTestId('canvas-panel-previous').click();
    await panel.getByTestId('canvas-panel-next').click();
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Solution');
    await expect(ownerRow).toBeVisible();

    // Move the owner's position from agree to disagree in the panel.
    await panel.getByRole('button', { name: /disagree/i }).first().click();
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('point_positions').select('position')
        .eq('point_id', fx.solutionPointId).eq('user_id', fx.owner.user.id).maybeSingle();
      return data?.position ?? null;
    }, { timeout: 10_000 }).toMatch(/disagree/);
    // review fix: the names under the point move with the vote, the panel still open
    await expect(block.getByRole('button', { name: `${fx.owner.name}'s profile` })).toContainText(/Disagrees/);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.reload();
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await expect(page.getByTestId('canvas-point-panel').getByRole('button', { name: /disagree/i, pressed: true }).first()).toBeVisible();
    await expect(page.getByTestId('canvas-point-panel').getByRole('button', { name: `${fx.owner.name}'s profile` })).toContainText(/Disagrees/);
  });

  test('Previous and Next walk the canvas without closing the panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    // Reading order: Problem (seven points; the admitted reader sees them all), then Solution, then Offers & Pricing. D7: no "N of M"; the box title stays.
    await expect(panel.getByTestId('canvas-panel-step')).toHaveCount(0);
    await expect(panel.getByText(/\d+ of \d+/)).toHaveCount(0);
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Solution');
    await expect(panel.getByTestId('canvas-panel-previous')).toHaveText('Previous');
    await expect(panel.getByTestId('canvas-panel-next')).toHaveText('Next');
    expect(await panel.getByTestId('canvas-panel-next').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    // R6: outline buttons — a border, white.
    for (const id of ['canvas-panel-previous', 'canvas-panel-next']) {
      const style = await panel.getByTestId(id).evaluate(el => ({ border: getComputedStyle(el).borderTopWidth, bg: getComputedStyle(el).backgroundColor }));
      expect(style.border).toBe('1px');
      expect(style.bg).toBe('rgb(255, 255, 255)');
    }
    await panel.getByTestId('canvas-panel-previous').click();
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Problem');
    await expect(page).not.toHaveURL(new RegExp(`point=${fx.solutionPointId}`));
    await expect(panel.locator('p', { hasText: PRIVATE_TEXT })).toBeVisible(); // the last point of the Problem box
    await panel.getByTestId('canvas-panel-next').click();
    await expect(panel.locator('p', { hasText: SOLUTION_TEXT })).toBeVisible();
    // review fix: Enter on Next lands on the last point, where Next is gone — focus stays in the
    // panel, so Escape still closes it, and focus returns to the card now on screen.
    await panel.getByTestId('canvas-panel-next').focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Offers & Pricing');
    await expect(panel.getByTestId('canvas-panel-next')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="canvas-point-panel"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.revenuePointId}`);
  });

  test('Back closes an open point and stays on the canvas; Previous / Next do not add Back steps', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await expect(panel).toBeVisible();
    await panel.getByTestId('canvas-panel-previous').click();
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Problem');
    await page.goBack();
    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/p/${fx.owner.slug}/canvas/${fx.tag}$`));
    await expect(page.getByTestId('canvas-grid')).toBeVisible();
    // The close button takes the same step back: Back afterwards does not reopen the point.
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page).not.toHaveURL(/point=/);
  });

  test('review fix: an address naming a point not on this canvas is reused, so closing never steps back onto it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // An id that is not one of this canvas's points does not open: the address names a point not on screen.
    await page.goto(`${fx.url}?point=00000000-0000-0000-0000-0000000000cc`);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toHaveCount(0);
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page).not.toHaveURL(/point=/);
  });

  test('D3 + founder contrast pass: grey boxes holding white cards; the outline icon in a tinted circle; no uppercase, no count', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    const boxes = page.locator('[data-testid^="canvas-box-canvas:"]');
    const report = await boxes.evaluateAll(els => els.map(box => {
      const h = box.querySelector('h3')!;
      const chip = box.querySelector('[data-testid="canvas-box-icon"]')!;
      const icon = chip.querySelector('svg')!;
      const card = box.querySelector('[data-testid^="canvas-point-card-"]');
      return {
        transform: getComputedStyle(h).textTransform,
        size: getComputedStyle(h).fontSize,
        weight: getComputedStyle(h).fontWeight,
        chipTinted: getComputedStyle(chip).backgroundColor !== 'rgba(0, 0, 0, 0)',
        stroke: icon.getAttribute('stroke-width'),
        fill: icon.getAttribute('fill'),
        // a card (where the box has one) stands out from its box
        cardContrasts: !card || getComputedStyle(card).backgroundColor !== getComputedStyle(box).backgroundColor,
      };
    }));
    expect(report).toHaveLength(11);
    for (const r of report) expect(r).toEqual({ transform: 'none', size: '14px', weight: '600', chipTinted: true, stroke: '2', fill: 'none', cardContrasts: true });
    await expect(page.getByTestId('canvas-box-count')).toHaveCount(0);
  });

  test('review fix: closing a point opened from the address returns focus to its card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.url}?point=${fx.solutionPointId}`);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-point-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.solutionPointId}`);
  });

  test('R1: four layers in reading order — three columns from 1024px (the money row in halves), two from 640px, one below', async ({ page }) => {
    const ORDER = [
      'canvas:love', 'canvas:good-at', 'canvas:world-needs',
      'canvas:segments', 'canvas:problem', 'canvas:solution',
      'canvas:advantage', 'canvas:channels', 'canvas:metrics',
      'canvas:revenue', 'canvas:cost',
    ];
    for (const [width, columns] of [[1440, 3], [1024, 3], [1023, 2], [640, 2], [639, 1], [375, 1]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(fx.url);
      await waitForCanvas(page);
      const order = await page.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')?.replace('canvas-box-', '')));
      expect(order, `order at ${width}px`).toEqual(ORDER);
      const rects = await page.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) })));
      const firstNine = rects.slice(0, 9);
      expect(new Set(firstNine.map(r => r.x)).size, `columns at ${width}px`).toBe(columns);
      expect(new Set(firstNine.map(r => r.w)).size, `equal widths at ${width}px`).toBe(1);
      if (columns === 3) {
        // The money layer's two boxes share the row in halves.
        const [offers, cost] = rects.slice(9);
        expect(offers.y).toBe(cost.y);
        expect(Math.abs(offers.w - cost.w)).toBeLessThanOrEqual(1);
        expect(offers.w).toBeGreaterThan(firstNine[0].w * 1.4);
      }
      // Row by row, left to right: reading order is visual order.
      for (let i = 1; i < rects.length; i++) {
        const [p, c] = [rects[i - 1], rects[i]];
        expect(c.y > p.y || (c.y === p.y && c.x > p.x), `box ${i} follows box ${i - 1} at ${width}px`).toBe(true);
      }
      // Each layer's label sits above its first box.
      const labels = await page.getByTestId('canvas-layer-title').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().bottom)));
      for (const [layer, firstBox] of [[0, 0], [1, 3], [2, 6], [3, 9]] as const) {
        expect(labels[layer] <= rects[firstBox].y, `layer ${layer} label above its boxes at ${width}px`).toBe(true);
      }
    }
  });

  test('R2: a point past a box\'s first two leaves the grid as it is; closing returns focus to the card that opened the panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await page.getByTestId('canvas-panel-previous').click(); // problem point 6, not on the grid
    await expect(page.getByTestId('canvas-panel-box')).toHaveText('Problem');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    await expect(page.getByTestId('canvas-box-canvas:problem').locator(CARD)).toHaveCount(2);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.solutionPointId}`);
  });

  test('R2: "N more" opens the box in the panel; a card there opens the point; Back returns to the list, then to the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    const problem = page.getByTestId('canvas-box-canvas:problem');
    const more = problem.getByTestId('canvas-box-more');
    await expect(more).toHaveText('See all 7');
    const gridBefore = await page.getByTestId('canvas-grid').boundingBox();
    await more.click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Problem');
    await expect(panel.getByTestId('canvas-panel-box-list').locator(CARD)).toHaveCount(7);
    // A list has nothing to step through.
    await expect(panel.getByTestId('canvas-panel-previous')).toHaveCount(0);
    await expect(panel.getByTestId('canvas-panel-next')).toHaveCount(0);
    // The canvas behind did not move or grow.
    expect(await page.getByTestId('canvas-grid').boundingBox()).toEqual(gridBefore);
    await expect(problem.locator(CARD)).toHaveCount(2);
    // A card in the list opens that point; Back returns to the list.
    await panel.getByTestId(`canvas-point-card-${fx.privatePointId}`).click();
    await expect(panel.getByTestId(`feed-point-card-${fx.privatePointId}`)).toBeVisible();
    await page.goBack();
    await expect(panel.getByTestId('canvas-panel-box-list')).toBeVisible();
    // The close button steps out one level too: from the list, back to the canvas, focus on "N more".
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page).not.toHaveURL(/box=|point=/);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('canvas-box-more');
    // No box scrolls inside itself.
    expect(await problem.getByTestId('canvas-box-list').evaluate(el => getComputedStyle(el).overflowY)).toBe('visible');
  });

  test('header (R10): "Clarity Canvas" on its own line, then "by <owner> · <canvas>" with Compare on the right; no intro, no call-to-action, no footer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email); // the owner has several canvases: the picker is a menu
    await page.goto(fx.url);
    await waitForCanvas(page);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText('Clarity Canvas');
    expect(await h1.evaluate(el => getComputedStyle(el).fontWeight)).toBe('700');
    const name = page.getByTestId('canvas-owner-name');
    await expect(name).toHaveAttribute('href', `/p/${fx.owner.slug}`);
    await name.hover();
    expect(await name.evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('underline');
    const byline = page.getByTestId('canvas-byline');
    await expect(byline).toContainText(`by ${fx.owner.name}`);
    await expect(byline).toContainText('·');
    await expect(byline).not.toContainText('/');
    const [title, owner, picker, controls] = await Promise.all([
      h1.boundingBox(), page.getByTestId('canvas-owner').boundingBox(),
      page.getByTestId('canvas-project-tag').boundingBox(), page.getByTestId('canvas-controls').boundingBox(),
    ]);
    const mid = (b: { y: number; height: number } | null) => (b ? b.y + b.height / 2 : NaN);
    expect(title && owner && picker && controls).toBeTruthy();
    expect(title!.y + title!.height <= owner!.y + 1).toBe(true); // the title on its own line, above
    expect(Math.abs(mid(owner) - mid(picker)) < 6).toBe(true);
    expect(owner!.x < picker!.x && controls!.x > picker!.x + picker!.width).toBe(true);
    // The menu is a filled pill, not white like the canvas cards.
    for (const id of ['canvas-compare-picker']) {
      expect(await page.getByTestId(id).evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    }
    await expect(page.getByTestId('canvas-project-tag')).toHaveText(fx.tag);
    await expect(page.getByTestId('canvas-intro')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /discovery call/i })).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(0);
    // Inside the canvas the project's user tag is where the reader already is: not a link to the
    // feed; the reserved canvas tag is never shown.
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel.getByText(`#${fx.tag}`)).toBeVisible();
    await expect(panel.locator(`a[href*="tag=${fx.tag}"]`)).toHaveCount(0);
    await expect(panel.getByText(/canvas_/)).toHaveCount(0);
    // R3–R5 on the open card: tags, then the spread row, then the buttons, which carry no counts.
    const card = panel.getByTestId(`feed-point-card-${fx.solutionPointId}`);
    const boxes = await Promise.all([card.getByText(`#${fx.tag}`), card.getByTestId('point-spread-row'), card.getByTestId('agree-group')].map(l => l.boundingBox()));
    expect(boxes[0]!.y < boxes[1]!.y && boxes[1]!.y < boxes[2]!.y).toBe(true);
    await expect(card.locator('[data-testid$="-count-badge"]')).toHaveCount(0);
  });

  test('D2: the owner\'s photo carries the pledge ring when the owner has pledged', async ({ page }) => {
    await supabaseAdmin.from('profiles').update({ has_pledged: true }).eq('id', fx.owner.user.id);
    try {
      await page.goto(fx.url);
      await waitForCanvas(page);
      const ring = await page.getByTestId('canvas-owner').evaluate(el => {
        const ringed = [el, ...el.querySelectorAll('*')].find(n => /ring-/.test((n as HTMLElement).className?.toString?.() ?? ''));
        return ringed ? getComputedStyle(ringed).boxShadow : 'none';
      });
      expect(ring).not.toBe('none');
    } finally {
      await supabaseAdmin.from('profiles').update({ has_pledged: false }).eq('id', fx.owner.user.id);
    }
  });

  for (const width of [375, 320]) {
    test(`at ${width}px boxes and cards stack with titles; no sideways page scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setTestSession(page, fx.owner.email);
      await page.goto(fx.url);
      await waitForCanvas(page);
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      const problem = page.getByTestId('canvas-box-canvas:problem');
      const solution = page.getByTestId('canvas-box-canvas:solution');
      const [a, b] = [await problem.boundingBox(), await solution.boundingBox()];
      expect(a && b && Math.abs(a.x - b.x) < 2 && b.y > a.y).toBe(true); // stacked, same column
      const cards = problem.locator(CARD);
      const [c1, c2] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
      expect(c1 && c2 && Math.abs(c1.x - c2.x) < 2 && c2.y > c1.y).toBe(true); // cards stack too
      // The pickers wrap under the owner and stay inside the page.
      const [owner, controls] = [await page.getByTestId('canvas-owner').boundingBox(), await page.getByTestId('canvas-controls').boundingBox()];
      expect(owner && controls && controls.y >= owner.y + owner.height - 1).toBe(true);
      for (const id of ['canvas-compare-picker']) {
        const r = await page.getByTestId(id).boundingBox();
        expect(r && r.x >= 0 && r.x + r.width <= width).toBe(true);
      }
      // D7: below 1024px the sheet shows the back arrow; it closes the point and stays on the canvas.
      await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
      const panel = page.getByTestId('canvas-point-panel');
      await expect(panel.getByTestId('canvas-panel-close')).toBeHidden();
      await panel.getByRole('button', { name: 'Close point' }).click();
      await expect(panel).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/p/${fx.owner.slug}/canvas/${fx.tag}$`));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  test('an empty box shows to everyone (the grid keeps its shape); an unknown canvas address shows not-found', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-box-canvas:love')).toHaveAttribute('data-empty', 'true');

    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    const love = page.getByTestId('canvas-box-canvas:love');
    await expect(love).toHaveAttribute('data-empty', 'true');
    await expect(love.getByRole('heading', { name: 'What I love' })).toBeVisible();
    await expect(love.locator(CARD)).toHaveCount(0);
    await expect(love.getByText('Empty', { exact: true })).toBeVisible(); // D3: the owner too, no call to action

    for (const path of [`/p/${fx.owner.slug}/canvas/nosuchtag${Date.now()}`, `/p/no-such-owner-${Date.now()}/canvas/${fx.tag}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 20_000 });
    }
  });

  test('after signing out on the owner canvas, no point, story or open panel stays on screen (the canvas is not-found)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId('canvas-box-canvas:problem').getByTestId('canvas-box-more').click();
    await page.getByTestId('canvas-panel-box-list').getByTestId(`canvas-point-card-${fx.privatePointId}`).click();
    await expect(page.getByTestId('canvas-point-panel')).toBeVisible();

    // The app's own client, as a sign-out in another tab reaches this one.
    await page.evaluate(async () => {
      const mod = await import('/src/lib/supabase.ts');
      await mod.supabase.auth.signOut();
    });
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    // P1515: signed out, the canvas is not for the visitor at all — not-found, nothing of it on screen.
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await expect(page.getByText(SOLUTION_TEXT)).toHaveCount(0);
  });

  test('the header shows this canvas\'s name only (no dropdown of the owner\'s other canvases: they are reached by their own address); a reader sees the same plain name', async ({ page }) => {
    // R9: only reserved canvas tags name a canvas — the user-tag-only point adds none.
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-project-tag')).toHaveText(fx.tag);
    await expect(page.getByTestId('canvas-project-picker')).toHaveCount(0);
    await expect(page.getByTestId('canvas-version-picker')).toHaveCount(0);
    // The owner's second canvas opens through its own address.
    await page.goto(`/p/${fx.owner.slug}/canvas/${fx.secondTag}`);
    await waitForCanvas(page);
    await expect(page.getByText('P1508 second canvas point')).toBeVisible();
    await expect(page.getByTestId('canvas-project-tag')).toHaveText(fx.secondTag);

    // The admitted reader sees the plain name too.
    await setTestSession(page, fx.other.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-project-tag')).toHaveText(fx.tag);
    await expect(page.getByTestId('canvas-project-picker')).toHaveCount(0);
    // ...and the owner's second canvas, never shared, is not-found for them (not a single point of it).
    await page.goto(`/p/${fx.owner.slug}/canvas/${fx.secondTag}`);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('P1508 second canvas point')).toHaveCount(0);
  });

  test('D5: a reader sees the owner exactly as the owner\'s profile shows them — owner row above a quoted box, "Their story"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const measure = (root: import('@playwright/test').Locator) => root.evaluate(card => {
      const row = card.querySelector('[data-testid="point-owner-row"]') as HTMLElement;
      const pick = (el: Element | null, keys: string[]) => el ? Object.fromEntries(keys.map(k => [k, getComputedStyle(el).getPropertyValue(k)])) : null;
      const avatar = row.querySelector('img, [class*="rounded-full"]');
      const badge = [...row.querySelectorAll('span')].find(s => /Agrees|Disagrees/.test(s.textContent ?? '') && s.children.length === 0) ?? null;
      const name = [...row.querySelectorAll('span')].find(s => s.classList.contains('font-medium')) ?? null;
      const quoted = card.querySelector('.bg-gray-50') as HTMLElement | null;
      return {
        row: pick(row, ['display', 'font-size', 'color', 'gap', 'margin-bottom', 'justify-content']),
        avatar: avatar ? { w: avatar.getBoundingClientRect().width, h: avatar.getBoundingClientRect().height } : null,
        name: pick(name, ['font-size', 'font-weight', 'color']),
        badge: pick(badge, ['font-size', 'background-color', 'color', 'border-radius', 'padding']),
        quoted: pick(quoted, ['background-color', 'border-top-width', 'border-radius', 'padding']),
      };
    });
    // The owner's profile (as the same reader), the same point.
    await page.goto(`/p/${fx.owner.slug}?tab=points`);
    const profileCard = page.getByTestId(`point-card-with-links-${fx.profilePointId}`);
    await expect(profileCard).toBeVisible({ timeout: 20_000 });
    const onProfile = await measure(profileCard);
    // The canvas, the same reader.
    await page.goto(`${fx.url}?point=${fx.solutionPointId}`);
    await waitForCanvas(page);
    const panelCard = page.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${fx.solutionPointId}`);
    await expect(panelCard.getByTestId('point-owner-row')).toContainText(fx.owner.name);
    expect(await measure(panelCard)).toEqual(onProfile);
    // Owner stories only, labelled the profile's way; the other user's story is not on the card.
    await expect(panelCard.getByTestId('feed-point-story-expander')).toHaveText(/Their story/);
    await panelCard.getByTestId('feed-point-story-expander').click();
    await expect(panelCard.getByText(STORY_TEXT)).toBeVisible();
    await expect(panelCard.getByText(OTHER_STORY_TEXT)).toHaveCount(0);
    await expect(page.getByTestId('canvas-owner-stance')).toHaveCount(0);

    // The revenue point: the owner holds no position — the row still shows, "No position".
    await page.goto(`${fx.url}?point=${fx.revenuePointId}`);
    await waitForCanvas(page);
    const revenueCard = page.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${fx.revenuePointId}`);
    await expect(revenueCard.getByTestId('point-owner-no-position')).toHaveText('No position');
    await expect(revenueCard.getByTestId('feed-point-story-expander')).toHaveCount(0); // no owner story, no label

    // The reader has a story here, added through the canvas: it is read in the block below, not
    // as a link to a story page ("Your story" opens /story/:id, which a reader does not use here),
    // and no second "+ Add a story" is offered: one added story per person per point.
    await page.goto(`${fx.url}?point=${fx.solutionPointId}`);
    await waitForCanvas(page);
    const asOther = page.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${fx.solutionPointId}`);
    await expect(asOther.getByTestId('feed-point-story-expander')).toHaveText(/Their story/);
    await expect(asOther.getByText('Your story')).toHaveCount(0);
    await expect(asOther.getByRole('button', { name: /add a story|why you/i })).toHaveCount(0);
  });

  test('the spread lives on the open card (founder): its info button explains it on hover and click; Escape closes only the popover; focus that falls out still lets Escape close the panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.url}?point=${fx.solutionPointId}`);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    const cardInPanel = panel.getByTestId(`feed-point-card-${fx.solutionPointId}`);
    await expect(cardInPanel.getByTestId('point-spread-row').getByTestId('position-spread')).toHaveAttribute('aria-label', /disagree|agree/);
    await expect(panel.getByTestId('point-positions-block').getByTestId('position-spread')).toHaveCount(0);
    const info = cardInPanel.getByTestId('spread-info');
    await info.hover();
    const text = 'How everyone stands on this point: strongly disagree on the left, strongly agree on the right. Contested means at least two people on each side.';
    await expect(page.getByTestId('spread-info-content')).toHaveText(text);
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('spread-info-content')).toHaveCount(0);
    await info.click();
    await expect(page.getByTestId('spread-info-content')).toBeVisible();
    // Review fix: hover, wait, then click keeps it open (the click pins it; it used to toggle it shut).
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('spread-info-content')).toBeVisible(); // pinned
    await info.click();
    await expect(page.getByTestId('spread-info-content')).toHaveCount(0);
    await info.hover();
    await page.waitForTimeout(300);
    await info.click();
    await expect(page.getByTestId('spread-info-content')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('spread-info-content')).toHaveCount(0);
    await expect(panel).toBeVisible();
    // Review fix: clicking the popover's text then Escape drops focus to <body>; Escape still closes the panel.
    await info.click();
    await page.getByTestId('spread-info-content').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('spread-info-content')).toHaveCount(0);
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('review fix: browser Back on a point opened from a link closes it and stays on the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/feed');
    await page.goto(`${fx.url}?point=${fx.solutionPointId}`);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-point-panel')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/p/${fx.owner.slug}/canvas/${fx.tag}$`));
    await expect(page.getByTestId('canvas-grid')).toBeVisible();
  });

  test('review fix: the open point is in the address — reload reopens it; a private id gets a signed-out visitor not-found', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await expect(page).toHaveURL(new RegExp(`point=${fx.solutionPointId}`));
    await page.reload();
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${fx.solutionPointId}`)).toBeVisible();
    // the open card is marked in its box
    await expect(page.getByTestId(`canvas-point-card-${fx.solutionPointId}`)).toHaveAttribute('data-selected', 'true');

    // A visitor with the private point's id gets not-found: no panel, none of the text.
    const anon = await page.context().browser()!.newContext();
    const other = await anon.newPage();
    await other.setViewportSize({ width: 1440, height: 900 });
    await other.goto(`${fx.url}?point=${fx.privatePointId}`);
    await expect(other.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 45_000 });
    await expect(other.getByTestId('canvas-point-panel')).toHaveCount(0);
    await expect(other.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await anon.close();
  });

  test('review fix: the panel is modal — the page behind is inert, the backdrop closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
    await expect(page.getByTestId('canvas-point-panel')).toHaveAttribute('aria-modal', 'true');
    expect(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(true);
    const inPanel = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="canvas-point-panel"]'));
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); expect(await inPanel()).toBe(true); }
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Shift+Tab'); expect(await inPanel()).toBe(true); }
    await page.getByTestId('canvas-panel-backdrop').click({ position: { x: 100, y: 400 } });
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    expect(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(false);
    await expect(page).not.toHaveURL(/point=/);
    // focus returns to the same point's card in its box
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.solutionPointId}`);
  });
  test('layers are numbered and spaced, with no rules; cards show an open chevron; Previous / Next carry a blue edge', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-layer-number')).toHaveText(['01', '02', '03', '04']);
    // Compare reads as an action until someone is picked; the list holds only people.
    await expect(page.getByTestId('canvas-compare-picker')).toContainText('Compare positions');
    await expect(page.getByLabel('Compare positions with').locator('option:not([hidden])').first()).not.toHaveText('Compare positions');
    // The menu covers the whole pill, so a tap on the words opens it, not only the arrow.
    const pill = await page.getByTestId('canvas-compare-picker').boundingBox();
    const menu = await page.getByLabel('Compare positions with').boundingBox();
    expect(Math.abs(pill!.x - menu!.x) <= 1 && Math.abs(pill!.width - menu!.width) <= 2).toBe(true);
    const titles = page.getByTestId('canvas-layer-title');
    for (const i of [0, 1, 2, 3]) expect(await titles.nth(i).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    await expect(page.locator('[data-testid^="canvas-point-card-"]').first().getByTestId('canvas-card-open')).toBeVisible();
    const box = page.getByTestId('canvas-box-canvas:problem');
    await box.getByTestId('canvas-box-more').click();
    await page.getByTestId('canvas-panel-box-list').locator('[role="button"], button').first().click();
    // The panel header names the box with its icon, as on the canvas.
    await expect(page.getByTestId('canvas-panel-box').getByTestId('canvas-box-icon')).toBeVisible();
    const next = page.getByTestId('canvas-panel-next');
    await expect(next).toBeVisible();
    expect(await next.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgb(37, 99, 235)');
  });

  test('R9: a signed-in user cannot give a point a canvas_ tag through the API (insert or update)', async () => {
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email: fx.owner.email, password: TEST_PASSWORD });
    expect(signInError).toBeNull();
    const forged = [`canvas_forged${Date.now()}`, 'canvas:problem'];
    // Insert: whatever the client sends, the stored row carries no canvas_ or box tag.
    // Read back by the unique statement with the service role, so a refused insert and a stripped
    // one both count, and nothing passes because the client's own read-back came back empty.
    const statement = `P1508 forged canvas tag ${Date.now()}`;
    await client.from('points').insert({ statement, first_validator_id: fx.owner.user.id, visibility: 'private', tags: [fx.tag], system_tags: forged });
    const { data: row, error: readError } = await supabaseAdmin.from('points').select('system_tags').eq('statement', statement).maybeSingle();
    expect(readError).toBeNull();
    expect((row?.system_tags ?? []).filter((t: string) => t.startsWith('canvas'))).toEqual([]);
    // Update: the owner's own point keeps exactly the tags the service role wrote.
    const before = (await supabaseAdmin.from('points').select('system_tags').eq('id', fx.revenuePointId).single()).data?.system_tags;
    expect(before).toContain(`canvas_${fx.tag.toLowerCase()}`);
    await client.from('points').update({ system_tags: forged }).eq('id', fx.revenuePointId);
    const after = (await supabaseAdmin.from('points').select('system_tags').eq('id', fx.revenuePointId).single()).data?.system_tags;
    expect(after).toEqual(before);
    await client.auth.signOut();
  });

  test('load time: Back to the canvas shows it as left without re-reading it; after a vote elsewhere it reads fresh', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    let canvasReads = 0;
    // P1515: the canvas is one rpc read now (get_canvas), for its owner and every reader alike.
    page.on('request', r => {
      if (/\/rest\/v1\/rpc\/get_canvas/.test(r.url()) && (r.postData() ?? '').includes(fx.tag.toLowerCase())) canvasReads++;
    });
    const original = (await supabaseAdmin.from('point_positions').select('position')
      .eq('point_id', fx.solutionPointId).eq('user_id', fx.owner.user.id).maybeSingle()).data?.position ?? null;
    await page.goto(fx.url);
    await waitForCanvas(page);
    const openDetails = async () => {
      await page.getByTestId(`canvas-point-card-${fx.solutionPointId}`).click();
      await page.getByTestId('canvas-point-panel').getByRole('button', { name: /^Details/ }).click();
      await expect(page).toHaveURL(new RegExp(`/point/${fx.solutionPointId}`));
    };
    // No write: Back serves the canvas from the return cache. Opening the panel re-reads the canvas by
    // design, and that request leaves only after the owner's profile lookup (a few hundred ms), so it can
    // land AFTER the Details page is reached. Wait for THAT read's response before counting; the count
    // taken then must not move on Back (it is observed for a fixed window, never waited to "settle").
    const panelRead = page.waitForResponse(r => /\/rest\/v1\/rpc\/get_canvas/.test(r.url()) && (r.request().postData() ?? '').includes(fx.tag.toLowerCase()));
    await openDetails();
    await panelRead;
    const before = canvasReads;
    await page.goBack();
    await waitForCanvas(page);
    await expect(page.getByTestId(`canvas-point-card-${fx.solutionPointId}`)).toBeVisible();
    // A read Back started would put its request on the wire only after the owner's profile lookup, so the
    // count taken the moment the card shows cannot see it. Observe for a fixed window first.
    await page.waitForTimeout(1_500);
    expect(canvasReads).toBe(before);
    // A position taken on the point page clears the cache: Back reads the canvas again.
    await page.keyboard.press('Escape');
    await openDetails();
    await page.getByRole('button', { name: /^Unsure$/ }).first().click();
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('point_positions').select('position')
        .eq('point_id', fx.solutionPointId).eq('user_id', fx.owner.user.id).maybeSingle();
      return data?.position ?? null;
    }, { timeout: 10_000 }).toBe('unsure');
    const beforeVote = canvasReads;
    await page.goBack();
    await waitForCanvas(page);
    await expect.poll(() => canvasReads).toBeGreaterThan(beforeVote);
    if (original) {
      const { error } = await supabaseAdmin.from('point_positions').update({ position: original })
        .eq('point_id', fx.solutionPointId).eq('user_id', fx.owner.user.id);
      if (error) throw new Error(`[P1508] restore position: ${error.message}`);
    }
  });

  test('founder follow-up: "+ Add a story" writes the story in place, on the canvas, private like its point, saying who reads it', async ({ page }) => {
    await setTestSession(page, fx.owner.email);
    await page.goto(`${fx.url}?point=${fx.revenuePointId}`);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    // The invitation follows a position (P1296): take one first.
    await panel.getByTestId('agree-group').click();
    await panel.getByRole('button', { name: /add a story|why you/i }).first().click();
    const dialog = page.getByRole('dialog').filter({ has: page.locator('textarea') });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/canvas\//); // never left for /create
    // It says who will read the story, as /create says where it will show (P610).
    await expect(dialog.getByRole('status')).toContainText(`Visible to you and ${fx.event.title}`);
    // Escape closes only the composer; the panel stays, and focus stays in it.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="canvas-point-panel"]'))).toBe(true);
    await panel.getByRole('button', { name: /add a story|why you/i }).first().click();
    await expect(dialog).toBeVisible();
    const text = `P1508 in-place story ${Date.now()}`;
    await dialog.locator('textarea').fill(text);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`point=${fx.revenuePointId}`));
    // Stories start folded on the card: the invitation becomes the viewer's own "Your story".
    await expect(panel.getByRole('button', { name: 'Your story' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole('button', { name: /add a story|why you/i })).toHaveCount(0);
    const { data } = await supabaseAdmin.from('stories').select('visibility').eq('content', text).single();
    expect(data?.visibility).toBe('private'); // it follows its point, and the canvas's audience reads it
  });
});
