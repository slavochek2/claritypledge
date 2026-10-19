/**
 * @file p1508-clarity-canvas.spec.ts
 * @description P1508 — Clarity Canvas at /canvas/:handle/:projectTag, against the TEST DB.
 *
 * Every test builds its own canvas under a fresh owner (service role writes the box tags, as the
 * seed does), with a unique project tag, so nothing depends on the founder's seeded canvas:
 *   - Problem: six public points (enough to overflow the box) + one PRIVATE point
 *   - Unique Value Proposition: one point with a public story
 *   - a point by ANOTHER user with the same project tag and a box tag   (must not appear)
 *   - an owner point with the project tag and NO box tag                (must not appear)
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

interface Fixture {
  owner: TestUser;
  other: TestUser;
  tag: string;
  uvpPointId: string;
  url: string;
}

async function insertPoint(ownerId: string, statement: string, tags: string[], systemTags: string[], visibility = 'public') {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement, first_validator_id: ownerId, visibility, tags, system_tags: systemTags,
  }).select('id').single();
  if (error) throw new Error(`[P1508 fixture] point: ${error.message}`);
  return data.id as string;
}

async function buildCanvas(): Promise<Fixture> {
  const owner = await createTestUser({ name: 'P1508 Canvas Owner' });
  const other = await createTestUser({ name: 'P1508 Other User' });
  const tag = `p1508e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  for (let i = 1; i <= 6; i++) {
    await insertPoint(owner.user.id, `P1508 problem point number ${i} with enough words to wrap onto two lines`, [tag], ['canvas:problem']);
  }
  await insertPoint(owner.user.id, PRIVATE_TEXT, [tag], ['canvas:problem'], 'private');
  const uvpPointId = await insertPoint(owner.user.id, UVP_TEXT, [tag], ['canvas:uvp']);
  await insertPoint(other.user.id, FOREIGN_TEXT, [tag], ['canvas:problem']);
  await insertPoint(owner.user.id, UNBOXED_TEXT, [tag], []);

  const { data: story, error } = await supabaseAdmin.from('stories').insert({
    content: STORY_TEXT, author_id: owner.user.id, visibility: 'public',
  }).select('id').single();
  if (error) throw new Error(`[P1508 fixture] story: ${error.message}`);
  const link = await supabaseAdmin.from('story_points').insert({ story_id: story.id, point_id: uvpPointId, author_id: owner.user.id });
  if (link.error) throw new Error(`[P1508 fixture] link: ${link.error.message}`);
  await supabaseAdmin.from('point_positions').insert({ point_id: uvpPointId, user_id: owner.user.id, position: 'agree' });

  return { owner, other, tag, uvpPointId, url: `/canvas/${owner.slug}/${tag}` };
}

async function waitForCanvas(page: Page) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
}

test.describe('P1508: Clarity Canvas', () => {
  test.describe.configure({ timeout: 90_000 });
  let fx: Fixture;

  test.beforeAll(async () => { fx = await buildCanvas(); });
  test.afterAll(async () => {
    if (fx?.owner) await deleteTestUser(fx.owner.user.id);
    if (fx?.other) await deleteTestUser(fx.other.user.id);
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
    await expect(page.getByTestId('canvas-box-canvas:problem').getByText(PRIVATE_TEXT)).toBeAttached();
    await expect(page.getByTestId('canvas-box-canvas:problem').locator('[data-card="point"]')).toHaveCount(7);
    expect(errors.filter(e => !/favicon|ResizeObserver/i.test(e))).toEqual([]);
  });

  test('a point by another user with the same tag, and a point with no box tag, do not appear', async ({ page }) => {
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByText(FOREIGN_TEXT)).toHaveCount(0);
    await expect(page.getByText(UNBOXED_TEXT)).toHaveCount(0);
  });

  test('signed out, the same address shows only the public points', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fx.owner.name);
    await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
    await expect(page.getByTestId('canvas-box-canvas:problem').locator('[data-card="point"]')).toHaveCount(6);
    await expect(page.getByText(UVP_TEXT)).toBeVisible();
  });

  test('opening a point shows the full card with its stories; a position taken there persists', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);

    await page.getByRole('button', { name: UVP_TEXT }).click();
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId(`feed-point-card-${fx.uvpPointId}`)).toBeVisible();
    await panel.getByTestId('feed-point-story-expander').click();
    await expect(panel.getByText(STORY_TEXT)).toBeVisible();

    // Move the owner's position from agree to disagree in the panel.
    await panel.getByRole('button', { name: /disagree/i }).first().click();
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('point_positions').select('position')
        .eq('point_id', fx.uvpPointId).eq('user_id', fx.owner.user.id).maybeSingle();
      return data?.position ?? null;
    }, { timeout: 10_000 }).toMatch(/disagree/);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.reload();
    await waitForCanvas(page);
    await page.getByRole('button', { name: UVP_TEXT }).click();
    await expect(page.getByTestId('canvas-point-panel').getByRole('button', { name: /disagree/i, pressed: true }).first()).toBeVisible();
  });

  test('at 1440x900 the page does not scroll; a box with many points scrolls inside itself', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, fx.owner.email);
    await page.goto(fx.url);
    await waitForCanvas(page);
    const fits = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight, inner: window.innerHeight, width: window.innerWidth,
    }));
    expect(fits.width).toBe(1440);
    expect(fits.scroll).toBeLessThanOrEqual(fits.inner);
    const list = page.getByTestId('canvas-box-canvas:problem').getByTestId('canvas-box-list');
    const overflow = await list.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }));
    expect(overflow.oy).toBe('auto');
    expect(overflow.sh).toBeGreaterThan(overflow.ch);
  });

  test('signed out at 1440x900 the page does not scroll either', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(fx.url);
    await waitForCanvas(page);
    const fits = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: window.innerHeight }));
    expect(fits.scroll).toBeLessThanOrEqual(fits.inner);
  });

  for (const width of [375, 320]) {
    test(`at ${width}px boxes stack with titles; a box with 2+ points swipes sideways and shows n / N`, async ({ page }) => {
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

      const counter = problem.getByTestId('canvas-box-counter');
      await expect(counter).toHaveText('1 / 7');
      const list = problem.getByTestId('canvas-box-list');
      expect(await list.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await list.evaluate(el => {
        const second = el.children[1] as HTMLElement;
        el.scrollTo({ left: second.offsetLeft - el.offsetLeft, behavior: 'instant' as ScrollBehavior });
      });
      await expect(counter).toHaveText('2 / 7');
      await expect(uvp.getByTestId('canvas-box-counter')).toHaveCount(0); // one point: no counter
    });
  }

  test('an empty box renders titled; an unknown canvas address shows not-found', async ({ page }) => {
    await page.goto(fx.url);
    await waitForCanvas(page);
    const love = page.getByTestId('canvas-box-canvas:love');
    await expect(love).toHaveAttribute('data-empty', 'true');
    await expect(love.getByRole('heading', { name: 'What I love' })).toBeVisible();
    await expect(love.locator('[data-card="point"]')).toHaveCount(0);

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
    await page.getByRole('button', { name: new RegExp(PRIVATE_TEXT) }).click();
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
});
