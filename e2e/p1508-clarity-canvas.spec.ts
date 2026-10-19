/**
 * @file p1508-clarity-canvas.spec.ts
 * @description P1508 — Clarity Canvas at /canvas/:handle/:projectTag, against the TEST DB.
 *
 * Every test builds its own canvas under a fresh owner (service role writes the box tags, as the
 * seed does), with a unique project tag, so nothing depends on the founder's seeded canvas:
 *   - Problem: six public points (more than a box shows) + one PRIVATE point
 *   - Unique Value Proposition: one point with a public story; the owner agrees, the other user
 *     disagrees
 *   - a point by ANOTHER user with the same project tag and a box tag   (must not appear)
 *   - an owner point with the project tag and NO box tag                (must not appear)
 *   - Revenue Streams: one public point; Cost Structure stays empty (so for a visitor, Revenue
 *     takes the whole bottom row)
 *   - the ikigai boxes stay empty
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

const PRIVATE_TEXT = 'P1508 private bet the owner alone can see';
const STORY_TEXT = 'P1508 story arguing the value proposition point.';
const FOREIGN_TEXT = 'P1508 foreign point by someone else with the same tag';
const UNBOXED_TEXT = 'P1508 owner point with the project tag and no box';
const UVP_TEXT = 'P1508 the value proposition point';
const REVENUE_TEXT = 'P1508 the revenue point';

interface Fixture {
  owner: TestUser;
  other: TestUser;
  tag: string;
  uvpPointId: string;
  revenuePointId: string;
  privatePointId: string;
  url: string;
}

async function insertPoint(ownerId: string, statement: string, tags: string[], systemTags: string[], visibility = 'public') {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement, first_validator_id: ownerId, visibility, tags, system_tags: systemTags,
  }).select('id').single();
  if (error) throw new Error(`[P1508 fixture] point: ${error.message}`);
  return data.id as string;
}

/** Fills `made` as it goes, so a setup that fails half-way is still cleaned up. */
async function buildCanvas(made: Partial<Fixture>): Promise<Fixture> {
  const tag = `p1508e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  made.tag = tag;
  const owner = await createTestUser({ name: 'P1508 Canvas Owner' });
  made.owner = owner;
  const other = await createTestUser({ name: 'P1508 Other User' });
  made.other = other;
  for (let i = 1; i <= 6; i++) {
    await insertPoint(owner.user.id, `P1508 problem point number ${i} with enough words to wrap onto two lines`, [tag], ['canvas:problem']);
  }
  const privatePointId = await insertPoint(owner.user.id, PRIVATE_TEXT, [tag], ['canvas:problem'], 'private');
  const uvpPointId = await insertPoint(owner.user.id, UVP_TEXT, [tag], ['canvas:uvp']);
  const revenuePointId = await insertPoint(owner.user.id, REVENUE_TEXT, [tag], ['canvas:revenue']);
  await insertPoint(other.user.id, FOREIGN_TEXT, [tag], ['canvas:problem']);
  await insertPoint(owner.user.id, UNBOXED_TEXT, [tag], []);

  const { data: story, error } = await supabaseAdmin.from('stories').insert({
    content: STORY_TEXT, author_id: owner.user.id, visibility: 'public',
  }).select('id').single();
  if (error) throw new Error(`[P1508 fixture] story: ${error.message}`);
  const link = await supabaseAdmin.from('story_points').insert({ story_id: story.id, point_id: uvpPointId, author_id: owner.user.id });
  if (link.error) throw new Error(`[P1508 fixture] link: ${link.error.message}`);
  const pos = await supabaseAdmin.from('point_positions').insert([
    { point_id: uvpPointId, user_id: owner.user.id, position: 'agree' },
    { point_id: uvpPointId, user_id: other.user.id, position: 'disagree' },
  ]);
  if (pos.error) throw new Error(`[P1508 fixture] positions: ${pos.error.message}`);

  return { owner, other, tag, uvpPointId, revenuePointId, privatePointId, url: `/canvas/${owner.slug}/${tag}` };
}

const CARD = '[data-testid^="canvas-point-card-"]';

async function waitForCanvas(page: Page) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
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
    if (made.owner) await deleteTestUser(made.owner.user.id);
    if (made.other) await deleteTestUser(made.other.user.id);
  });

  test('smoke: the owner sees their canvas in twelve titled boxes, private point included, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fx.owner.name);
    await expect(page.getByText(`#${fx.tag}`)).toBeVisible();
    for (const title of ['Problem', 'Customer Segments', 'Unique Value Proposition', 'Solution', 'Channels',
      'Revenue Streams', 'Cost Structure', 'Key Metrics', 'Unfair Advantage',
      'What I love', "What I'm good at", 'What the world needs']) {
      await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    }
    const problem = page.getByTestId('canvas-box-canvas:problem');
    await expect(problem.getByTestId('canvas-box-count')).toHaveText('7');
    await problem.getByTestId('canvas-box-more').click();
    await expect(problem.locator(CARD)).toHaveCount(7);
    await expect(problem.getByText(PRIVATE_TEXT)).toBeVisible();
    expect(errors.filter(e => !/favicon|ResizeObserver/i.test(e))).toEqual([]);
  });

  test('a point by another user with the same tag, and a point with no box tag, do not appear', async ({ page }) => {
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId('canvas-box-canvas:problem').getByTestId('canvas-box-more').click();
    await expect(page.getByText(FOREIGN_TEXT)).toHaveCount(0);
    await expect(page.getByText(UNBOXED_TEXT)).toHaveCount(0);
  });

  test('signed out, the same address shows only the public points', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fx.owner.name);
    const problem = page.getByTestId('canvas-box-canvas:problem');
    await expect(problem.getByTestId('canvas-box-count')).toHaveText('6');
    await problem.getByTestId('canvas-box-more').click();
    await expect(problem.locator(CARD)).toHaveCount(6);
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await expect(page.getByText(UVP_TEXT)).toBeVisible();
  });

  test('a box card is text to read: owner position, tally and story count, no buttons inside', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    const card = page.getByTestId(`canvas-point-card-${fx.uvpPointId}`);
    await expect(card.getByTestId('canvas-owner-position')).toHaveText('P1508: Agree');
    await expect(card.getByTestId('canvas-card-meta')).toHaveText('1 agree · 1 disagree · 1 story');
    await expect(card.locator('button')).toHaveCount(0);
    expect(await card.evaluate(el => el.tagName)).toBe('BUTTON'); // the whole card opens the point
  });

  test('opening a point shows its stories, the owner position and everyone by name; a position taken there persists', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);

    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId(`feed-point-card-${fx.uvpPointId}`)).toBeVisible();
    await expect(panel.getByText(STORY_TEXT)).toBeVisible(); // open without a tap
    await expect(panel.getByTestId('canvas-panel-owner-position')).toContainText('Agree');
    await expect(panel.getByTestId('canvas-who-agree')).toContainText(fx.owner.name);
    await expect(panel.getByTestId('canvas-who-disagree')).toContainText('P1508 Other User');

    // Move the owner's position from agree to disagree in the panel.
    await panel.getByRole('button', { name: /disagree/i }).first().click();
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('point_positions').select('position')
        .eq('point_id', fx.uvpPointId).eq('user_id', fx.owner.user.id).maybeSingle();
      return data?.position ?? null;
    }, { timeout: 10_000 }).toMatch(/disagree/);
    // review fix: the names under the point move with the vote, the panel still open
    await expect(panel.getByTestId('canvas-who-disagree')).toContainText(fx.owner.name);
    await expect(panel.getByTestId('canvas-panel-owner-position')).toContainText('Disagree');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.reload();
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await expect(page.getByTestId('canvas-point-panel').getByRole('button', { name: /disagree/i, pressed: true }).first()).toBeVisible();
    await expect(page.getByTestId('canvas-point-panel').getByTestId('canvas-who-disagree')).toContainText(fx.owner.name);
  });

  test('Previous and Next walk the canvas without closing the panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    // Box order: Problem (6 public), then UVP, then Revenue.
    await expect(panel.getByTestId('canvas-panel-step')).toHaveText('7 of 8');
    await panel.getByTestId('canvas-panel-previous').click();
    await expect(panel.getByTestId('canvas-panel-step')).toHaveText('6 of 8');
    await expect(page).not.toHaveURL(new RegExp(`point=${fx.uvpPointId}`));
    await expect(panel.locator('p', { hasText: /P1508 problem point number 6/ })).toBeVisible();
    await panel.getByTestId('canvas-panel-next').click();
    await expect(panel.locator('p', { hasText: UVP_TEXT })).toBeVisible();
    // review fix: Enter on Next lands on the last point, where Next is gone — focus stays in the
    // panel, so Escape still closes it, and focus returns to the card now on screen.
    await panel.getByTestId('canvas-panel-next').focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByTestId('canvas-panel-step')).toHaveText('8 of 8');
    await expect(panel.getByTestId('canvas-panel-next')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="canvas-point-panel"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.revenuePointId}`);
  });

  test('review fix: closing a point opened from the address returns focus to its card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.url}?point=${fx.uvpPointId}`);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-point-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.uvpPointId}`);
  });

  test('review fix: for a visitor, Revenue takes the whole bottom row when Cost is not shown', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-box-canvas:cost')).toHaveCount(0);
    const [grid, revenue] = [await page.getByTestId('canvas-grid').boundingBox(), await page.getByTestId('canvas-box-canvas:revenue').boundingBox()];
    expect(grid && revenue && Math.abs(grid.width - revenue.width) < 2).toBe(true);
  });

  test('review fix: an open point past a box\'s first three opens the box, so its card is on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await page.getByTestId('canvas-panel-previous').click(); // problem point 6, past the first three
    await expect(page.getByTestId('canvas-panel-step')).toHaveText('6 of 8');
    await page.keyboard.press('Escape');
    const problem = page.getByTestId('canvas-box-canvas:problem');
    await expect(problem.locator(CARD)).toHaveCount(6);
    await expect(problem.locator('[data-selected="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="canvas-box-canvas:problem"]') !== null)).toBe(true);
  });

  test('at 1440x900 the page scrolls; a box shows three cards and how many more it holds', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    const problem = page.getByTestId('canvas-box-canvas:problem');
    await expect(problem.locator(CARD)).toHaveCount(3);
    await expect(problem.getByTestId('canvas-box-more')).toHaveText('4 more');
    await problem.getByTestId('canvas-box-more').click();
    await expect(problem.locator(CARD)).toHaveCount(7);
    await expect(problem.getByTestId('canvas-box-more')).toHaveText('Show fewer');
    // No box scrolls inside itself any more.
    expect(await problem.getByTestId('canvas-box-list').evaluate(el => getComputedStyle(el).overflowY)).toBe('visible');
  });

  test('the canvas shows no sales call-to-action; an intro says whose canvas it is', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-intro')).toContainText("P1508's business on one page");
    await expect(page.getByTestId('canvas-intro')).toContainText('Sign in so P1508 sees your answer.');
    await expect(page.getByRole('link', { name: /discovery call/i })).toHaveCount(0);
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
      const uvp = page.getByTestId('canvas-box-canvas:uvp');
      const [a, b] = [await problem.boundingBox(), await uvp.boundingBox()];
      expect(a && b && Math.abs(a.x - b.x) < 2 && b.y > a.y).toBe(true); // stacked, same column
      const cards = problem.locator(CARD);
      const [c1, c2] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
      expect(c1 && c2 && Math.abs(c1.x - c2.x) < 2 && c2.y > c1.y).toBe(true); // cards stack too
    });
  }

  test('an empty box shows to the owner only; an unknown canvas address shows not-found', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-box-canvas:love')).toHaveCount(0);

    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    const love = page.getByTestId('canvas-box-canvas:love');
    await expect(love).toHaveAttribute('data-empty', 'true');
    await expect(love.getByRole('heading', { name: 'What I love' })).toBeVisible();
    await expect(love.locator(CARD)).toHaveCount(0);

    for (const path of [`/canvas/${fx.owner.slug}/nosuchtag${Date.now()}`, `/canvas/no-such-owner-${Date.now()}/${fx.tag}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 20_000 });
    }
  });

  test('after signing out on the owner canvas, no private point, story or open panel stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId('canvas-box-canvas:problem').getByTestId('canvas-box-more').click();
    await page.getByTestId(`canvas-point-card-${fx.privatePointId}`).click();
    await expect(page.getByTestId('canvas-point-panel')).toBeVisible();

    // The app's own client, as a sign-out in another tab reaches this one.
    await page.evaluate(async () => {
      const mod = await import('/src/lib/supabase.ts');
      await mod.supabase.auth.signOut();
    });
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await waitForCanvas(page);
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await expect(page.getByText(UVP_TEXT)).toBeVisible();
  });

  test('review fix: a signed-out vote in the panel shows on the box card after closing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await panel.getByRole('button', { name: /^disagree/i }).first().click();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).getByTestId('canvas-viewer-position')).toHaveText('You: Disagree');
  });

  test('review fix: the open point is in the address — reload reopens it; a private id does not open signed out', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await expect(page).toHaveURL(new RegExp(`point=${fx.uvpPointId}`));
    await page.reload();
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${fx.uvpPointId}`)).toBeVisible();
    // the open card is marked in its box
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`)).toHaveAttribute('data-selected', 'true');

    const anon = await page.context().browser()!.newContext();
    const other = await anon.newPage();
    await other.setViewportSize({ width: 1440, height: 900 });
    await other.goto(`${fx.url}?point=${fx.privatePointId}`);
    await expect(other.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
    await expect(other.getByTestId('canvas-point-panel')).toHaveCount(0);
    await expect(other.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await anon.close();
  });

  test('review fix: the panel is modal — the page behind is inert, the backdrop closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
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
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`canvas-point-card-${fx.uvpPointId}`);
  });
});
