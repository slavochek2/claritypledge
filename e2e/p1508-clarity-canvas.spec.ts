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
  /** a second canvas of the owner's (public), and one made only of private points */
  secondTag: string;
  privateTag: string;
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
  const secondTag = `${tag}b`;
  const privateTag = `${tag}p`;
  await insertPoint(owner.user.id, 'P1508 second canvas point', [secondTag], ['canvas:problem']);
  await insertPoint(owner.user.id, 'P1508 private-only canvas point', [privateTag], ['canvas:problem'], 'private');

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

  return { owner, other, tag, uvpPointId, revenuePointId, privatePointId, secondTag, privateTag, url: `/canvas/${owner.slug}/${tag}` };
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
    await expect(page.getByTestId('canvas-project-tag')).toHaveValue(fx.tag); // the picker: the owner has more than one canvas
    for (const title of ['Problem', 'Customer Segments', 'Unique Value Proposition', 'Solution', 'Channels',
      'Revenue Streams', 'Cost Structure', 'Key Metrics', 'Unfair Advantage',
      'What I love', "What I'm good at", 'What the world needs']) {
      await expect(page.getByRole('heading', { level: 3, name: title, exact: true })).toBeVisible();
    }
    // The two frames are the h2s; the twelve boxes sit under them.
    for (const frame of ['Ikigai', 'Lean Canvas']) await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${frame}`) })).toBeVisible();
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

  test('every card shows its spread, always; no switch, no legend, no story count; no buttons inside a card', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    const card = page.getByTestId(`canvas-point-card-${fx.uvpPointId}`);
    await expect(page.getByTestId('canvas-positions-switch')).toHaveCount(0);
    await expect(page.getByTestId('canvas-spread-legend')).toHaveCount(0);
    await expect(card.getByTestId('canvas-card-stories')).toHaveCount(0);
    // Seven bars, strongly disagree to strongly agree; the numbers are in the label.
    const spread = card.getByTestId('canvas-card-spread');
    await expect(spread).toHaveAttribute('aria-label', '1 disagree, 1 agree');
    await expect(spread.locator('[data-count]')).toHaveCount(7);
    await expect(page.getByTestId(`canvas-point-card-${fx.revenuePointId}`).getByTestId('canvas-card-no-positions')).toHaveText('No positions yet');
    await expect(card.locator('button')).toHaveCount(0);
    expect(await card.evaluate(el => el.tagName)).toBe('BUTTON'); // the whole card opens the point
  });

  test('Compare sets two people side by side in the compare page\'s columns; the viewer\'s column reads You', async ({ page }) => {
    // Signed out: nobody by default; picking someone sets the owner against them.
    await page.goto(fx.url);
    await waitForCanvas(page);
    const card = page.getByTestId(`canvas-point-card-${fx.uvpPointId}`);
    await expect(page.getByLabel('Compare with')).toHaveValue('');
    await expect(card.getByTestId('canvas-card-compare')).toHaveCount(0);
    await page.getByLabel('Compare with').selectOption(fx.other.user.id);
    await expect(page).toHaveURL(new RegExp(`with=${fx.other.user.id}`));
    await expect(card.getByTestId('canvas-card-compare')).toContainText('P1508'); // first names in the narrow columns
    await expect(card.getByTestId('canvas-card-compare')).toContainText('Agrees');
    await expect(card.getByTestId('canvas-card-compare')).toContainText('Disagrees');
    await expect(page.getByTestId(`canvas-point-card-${fx.revenuePointId}`).getByTestId('canvas-card-compare')).toContainText('No position');
    // Signed in as the owner: "You" against the other person, and the way to the full compare page.
    await setTestSession(page, fx.owner.email);
    await page.goto(`${fx.url}?with=${fx.other.user.id}`);
    await waitForCanvas(page);
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).getByTestId('canvas-card-compare')).toContainText('You');
    await expect(page.getByTestId('canvas-compare-full')).toHaveAttribute('href', `/compare/${fx.other.slug}?tag=${fx.tag}`);
    // The spread and Compare show together.
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).getByTestId('canvas-card-spread')).toBeVisible();
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).getByTestId('canvas-card-compare')).toBeVisible();
    // Back to "No one" (a real choice, not the picker's own title): the columns go.
    await expect(page.getByLabel('Compare with').locator('option').first()).toHaveText('No one');
    await page.getByLabel('Compare with').selectOption('');
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).getByTestId('canvas-card-compare')).toHaveCount(0);
    await expect(page.getByTestId('canvas-compare-full')).toHaveCount(0);
    // Another signed-in person finds the owner first in the list (review fix: the owner is always listed).
    await setTestSession(page, fx.other.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByLabel('Compare with').locator('option').nth(1)).toHaveAttribute('value', fx.owner.user.id);
  });

  test('opening a point shows its stories behind one tap and everyone by name; a position taken there persists', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);

    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId(`feed-point-card-${fx.uvpPointId}`)).toBeVisible();
    // Folded, as in the feed: a point with many stories stays short.
    await expect(panel.getByText(STORY_TEXT)).toHaveCount(0);
    await panel.getByTestId('feed-point-story-expander').click();
    await expect(panel.getByText(STORY_TEXT)).toBeVisible();
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
    await expect(panel.getByTestId('canvas-panel-box')).toHaveText('Unique Value Proposition');
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

  test('Back closes an open point and stays on the canvas; Previous / Next do not add Back steps', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await expect(panel).toBeVisible();
    await panel.getByTestId('canvas-panel-previous').click();
    await expect(panel.getByTestId('canvas-panel-step')).toHaveText('6 of 8');
    await page.goBack();
    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/canvas/${fx.owner.slug}/${fx.tag}$`));
    await expect(page.getByTestId('canvas-grid')).toBeVisible();
    // The close button takes the same step back: Back afterwards does not reopen the point.
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page).not.toHaveURL(/point=/);
  });

  test('review fix: an address naming a point not on screen is reused, so closing never steps back onto it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Signed out, a private point id does not open: the address names a point not on screen.
    await page.goto(`${fx.url}?point=${fx.privatePointId}`);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toHaveCount(0);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page).not.toHaveURL(/point=/);
  });

  test('every box has an icon; the three ikigai boxes sit in an Ikigai frame above the Lean Canvas frame', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    const ikigai = page.getByTestId('canvas-frame-ikigai');
    const lean = page.getByTestId('canvas-frame-lean');
    for (const tag of ['canvas:love', 'canvas:world-needs', 'canvas:good-at']) {
      await expect(ikigai.getByTestId(`canvas-box-${tag}`)).toHaveCount(1);
    }
    for (const tag of ['canvas:segments', 'canvas:uvp', 'canvas:revenue']) {
      await expect(lean.getByTestId(`canvas-box-${tag}`)).toHaveCount(1);
    }
    const [i, l] = [await ikigai.boundingBox(), await lean.boundingBox()];
    expect(i && l && l.y > i.y).toBe(true);
    expect(await page.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll(boxes => boxes.every(b => !!b.querySelector('svg')))).toBe(true);
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

  test('boxes follow the reading order: Ikigai, then the classic Lean Canvas grid', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    const order = await page.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')?.replace('canvas-box-', '')));
    expect(order).toEqual([
      'canvas:love', 'canvas:good-at', 'canvas:world-needs',
      'canvas:problem', 'canvas:solution', 'canvas:metrics', 'canvas:uvp',
      'canvas:advantage', 'canvas:channels', 'canvas:segments', 'canvas:cost', 'canvas:revenue',
    ]);
    // The classic grid: Problem | Solution | UVP | Advantage | Segments across the top, Key Metrics
    // under Solution, Cost and Revenue sharing the bottom row.
    const box = async (tag: string) => page.getByTestId(`canvas-box-canvas:${tag}`).boundingBox();
    const [problem, solution, uvp, advantage, segments, metrics, cost, revenue] = await Promise.all(
      ['problem', 'solution', 'uvp', 'advantage', 'segments', 'metrics', 'cost', 'revenue'].map(box));
    const top = [problem, solution, uvp, advantage, segments];
    expect(top.every(b => b && problem && Math.abs(b.y - problem.y) < 2)).toBe(true);
    expect(top.every((b, n) => n === 0 || (b && top[n - 1] && b.x > top[n - 1]!.x))).toBe(true);
    expect(metrics && solution && Math.abs(metrics.x - solution.x) < 2 && metrics.y > solution.y).toBe(true);
    expect(problem && metrics && uvp && Math.abs(problem.height - uvp.height) < 2 && problem.height > metrics.height).toBe(true);
    expect(cost && revenue && Math.abs(cost.y - revenue.y) < 2 && revenue.x > cost.x).toBe(true);
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

  test('the header is the owner, "Clarity Canvas" and the project tag; no intro line and no sales call-to-action', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('P1508 Canvas Owner');
    await expect(page.getByTestId('canvas-kind')).toHaveText('Clarity Canvas');
    await expect(page.getByTestId('canvas-project-tag')).toHaveValue(fx.tag);
    await expect(page.getByTestId('canvas-intro')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /discovery call/i })).toHaveCount(0);
    // Inside the canvas the project tag is where the reader already is: not a link to the feed.
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel.getByText(`#${fx.tag}`)).toBeVisible();
    await expect(panel.locator(`a[href*="tag=${fx.tag}"]`)).toHaveCount(0);
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

  test('review fix: a signed-out vote in the panel is still there when the point is opened again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    const panel = page.getByTestId('canvas-point-panel');
    await panel.getByRole('button', { name: /^disagree/i }).first().click();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    // The card shows the room's spread, not the viewer's own position (founder: open it to see yours).
    await expect(page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).getByTestId('canvas-viewer-position')).toHaveCount(0);
    await page.getByTestId(`canvas-point-card-${fx.uvpPointId}`).click();
    await expect(panel.getByRole('button', { name: /^disagree/i }).first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('the canvas picker lists the owner\'s canvases and switches between them; a private-only canvas is listed for the owner only', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    const picker = page.getByTestId('canvas-project-tag');
    await expect(picker).toHaveValue(fx.tag);
    await expect(picker.locator('option')).toHaveText([`#${fx.tag}`, `#${fx.secondTag}`]);
    await picker.selectOption(fx.secondTag);
    await expect(page).toHaveURL(new RegExp(`/canvas/${fx.owner.slug}/${fx.secondTag}$`));
    await waitForCanvas(page);
    await expect(page.getByText('P1508 second canvas point')).toBeVisible();

    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-project-tag').locator('option')).toHaveText([`#${fx.tag}`, `#${fx.secondTag}`, `#${fx.privateTag}`]);
  });

  test('a visitor opening a point sees the owner\'s position above it; the owner does not see it repeated', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fx.url}?point=${fx.uvpPointId}`);
    await waitForCanvas(page);
    const stance = page.getByTestId('canvas-point-panel').getByTestId('canvas-owner-stance');
    await expect(stance).toContainText('P1508 Canvas Owner');
    await expect(stance).toContainText(/agree/i); // another test moves it between agree and disagree
    await setTestSession(page, fx.owner.email);
    await page.goto(`${fx.url}?point=${fx.uvpPointId}`);
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-point-panel')).toBeVisible();
    await expect(page.getByTestId('canvas-owner-stance')).toHaveCount(0);
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
