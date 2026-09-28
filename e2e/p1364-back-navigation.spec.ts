/**
 * @file p1364-back-navigation.spec.ts
 * @description P1364 — Back returns to where the reader was, at the position they were at.
 *
 * Scroll ACs need a real layout, so they live here, not in jsdom. "Same position" is measured
 * the way the spec defines it: the data-testid of the FIRST CARD FULLY IN VIEW is the same
 * before leaving the list and after coming back.
 *
 * Read-only against the test database: every test browses public content anonymously and
 * writes nothing. Tests that need a long list FAIL (never skip) when the database does not hold
 * one — a skipped scroll AC reads as a pass in a summary. The e2e guide's seeding path writes to
 * the shared test DB, which this spec deliberately does not do; the test DB holds well over 12
 * public stories and points, so the guard is a tripwire for a wiped DB, not an expected branch.
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test';

// A phone-sized viewport: a list scrolls after a handful of cards.
test.use({ viewport: { width: 390, height: 700 } });

const CARD = '[data-testid^="feed-point-card-"], [data-testid^="feed-story-card-"]';

async function waitForCards(page: Page, min = 1) {
  await expect(page.locator(CARD).first()).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.locator(CARD).count(), { timeout: 10000 }).toBeGreaterThanOrEqual(min);
}

/**
 * The data-testid of the first card whose whole box is inside the viewport. When no card fits —
 * the test DB holds story cards taller than this 700px viewport — the topmost card crossing the
 * viewport, tagged `~crossing`, so the before/after comparison still pins the same card.
 */
function firstFullyVisibleCard(page: Page): Promise<string | null> {
  return page.evaluate((sel) => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(el => el.getBoundingClientRect().height > 0);
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) return el.dataset.testid ?? null;
    }
    const crossing = cards.find(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; });
    return crossing ? `${crossing.dataset.testid}~crossing` : null;
  }, CARD);
}

/** Scroll so card `index` sits near the top, then let the scroll tracker record it. */
async function scrollToCard(page: Page, index: number) {
  await page.locator(CARD).nth(index).evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

/** Open a card the way a tap does (the card root's own click handler). */
async function openCard(page: Page, testId: string) {
  await page.getByTestId(testId).dispatchEvent('click');
}

/** Record whether the list skeleton appears at any point from now on (same SPA window). */
async function watchForSkeleton(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sawSkeleton: boolean };
    w.__sawSkeleton = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="feed-skeleton"]')) w.__sawSkeleton = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const sawSkeleton = (page: Page) => page.evaluate(() => (window as unknown as { __sawSkeleton: boolean }).__sawSkeleton);

type BackWay = 'top control' | 'bottom pill' | 'browser back';

async function goBack(page: Page, way: BackWay, detail: 'story' | 'point') {
  if (way === 'top control') await page.getByRole('button', { name: 'Go back', exact: true }).click();
  else if (way === 'bottom pill') await page.getByTestId(`${detail}-bottom-back`).getByRole('button').click();
  else await page.goBack();
}

test.describe('P1364 — Back returns to the exact place', () => {
  test('smoke: /feed loads with cards and no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/feed');
    await waitForCards(page);
    await page.waitForTimeout(1500);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  for (const [detail, listUrl] of [['story', '/feed?tab=stories'], ['point', '/feed']] as const) {
    for (const way of ['top control', 'bottom pill', 'browser back'] as const) {
      test(`feed (${detail}s) scrolled past 10 cards → open a ${detail} → ${way}: same URL, same first card, no skeleton`, async ({ page }) => {
        await page.goto(listUrl);
        await waitForCards(page);
        const count = await page.locator(CARD).count();
        expect(count, `the test database holds ${count} ${detail} cards on ${listUrl}; this AC needs at least 12 to scroll past 10`).toBeGreaterThanOrEqual(12);

        await scrollToCard(page, 10);
        const before = await firstFullyVisibleCard(page);
        expect(before).not.toBeNull();
        const urlBefore = page.url();

        await openCard(page, before!.replace(/~crossing$/, ''));
        await expect(page).toHaveURL(new RegExp(`/${detail}/`));
        await expect(page.getByRole('button', { name: 'Go back', exact: true })).toBeVisible({ timeout: 20000 });
        if (way === 'bottom pill') await expect(page.getByTestId(`${detail}-bottom-back`)).toBeVisible({ timeout: 20000 });

        await watchForSkeleton(page);
        await goBack(page, way, detail);
        await expect(page).toHaveURL(urlBefore);
        await waitForCards(page);
        await page.waitForTimeout(600); // let any late restore or late footer settle
        expect(await firstFullyVisibleCard(page)).toBe(before);
        expect(await sawSkeleton(page)).toBe(false);
      });
    }
  }

  test('/stake/:tag scrolled → open a point → Back: same stake tab, same first card', async ({ page }) => {
    await page.goto('/stake/aisafety1');
    await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });
    await waitForCards(page);
    const count = await page.locator('[data-testid^="feed-point-card-"]').count();
    expect(count, `aisafety1 holds ${count} points on the test database; this AC needs a scrollable list`).toBeGreaterThanOrEqual(4);

    await scrollToCard(page, Math.min(4, count - 1));
    const before = await firstFullyVisibleCard(page);
    const urlBefore = page.url();
    await openCard(page, before!.replace(/~crossing$/, ''));
    await expect(page).toHaveURL(/\/point\//);
    await watchForSkeleton(page);
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page).toHaveURL(urlBefore);
    await waitForCards(page);
    await page.waitForTimeout(600);
    expect(await firstFullyVisibleCard(page)).toBe(before);
    expect(await sawSkeleton(page)).toBe(false);
  });
});

test.describe('P1364 — cold arrivals and outside pages', () => {
  async function firstCardId(page: Page, url: string, prefix: string) {
    await page.goto(url);
    await waitForCards(page);
    const id = await page.locator(`[data-testid^="${prefix}"]`).first().getAttribute('data-testid');
    return id!.slice(prefix.length);
  }

  for (const [detail, url, prefix] of [
    ['story', '/feed?tab=stories', 'feed-story-card-'],
    ['point', '/feed', 'feed-point-card-'],
  ] as const) {
    test(`cold /${detail}/:id in a fresh tab → Back → /feed, still inside the site`, async ({ page, context, baseURL }) => {
      const id = await firstCardId(page, url, prefix);
      // A tab Playwright creates starts on about:blank, which is itself a history entry
      // (history.length 2 — indistinguishable from arriving from an outside page). A tab opened
      // with noopener starts directly on the URL: history.length 1, a true cold arrival.
      const [fresh] = await Promise.all([
        context.waitForEvent('page'),
        page.evaluate((u) => { window.open(u, '_blank', 'noopener'); }, `${baseURL}/${detail}/${id}`),
      ]);
      await expect(fresh.getByRole('button', { name: 'Go back', exact: true })).toBeVisible({ timeout: 20000 });
      expect(await fresh.evaluate(() => window.history.length)).toBe(1);
      await fresh.getByRole('button', { name: 'Go back', exact: true }).click();
      await expect(fresh).toHaveURL(/\/feed(\?|$)/);
    });
  }

  test('cold /stake/:tag → open a point → browser back → Back still works (goes to /feed, not a dead button)', async ({ page, context, baseURL }) => {
    // Review finding 2: at index 0 with a FORWARD entry, history.length is 2 and the old test
    // popped at index 0 — which does nothing.
    const [fresh] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((u) => { window.open(u, '_blank', 'noopener'); }, `${baseURL}/stake/aisafety1`),
    ]);
    await expect(fresh.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });
    const first = await fresh.locator('[data-testid^="feed-point-card-"]').first().getAttribute('data-testid');
    await fresh.getByTestId(first!).dispatchEvent('click');
    await expect(fresh).toHaveURL(/\/point\//);
    await fresh.goBack();
    await expect(fresh).toHaveURL(/\/stake\/aisafety1/);
    expect(await fresh.evaluate(() => window.history.length)).toBe(2);
    await fresh.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(fresh).toHaveURL(/\/feed(\?|$)/);
  });

  test('arriving at /story/:id from an outside page → Back → that outside page', async ({ page, baseURL }) => {
    const id = await firstCardId(page, '/feed?tab=stories', 'feed-story-card-');
    const outside = await page.context().newPage();
    await outside.goto('about:blank');
    await outside.setContent(`<a id="go" href="${baseURL}/story/${id}">read the story</a>`);
    await outside.click('#go');
    await expect(outside.getByRole('button', { name: 'Go back', exact: true })).toBeVisible({ timeout: 20000 });
    await outside.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(outside).toHaveURL('about:blank');
  });
});

test.describe('P1364 — feed URL state', () => {
  test('a tab or sort change, then Back → leaves the feed (no tab flip-back)', async ({ page }) => {
    await page.goto('/terms-of-service');
    await page.goto('/feed');
    await waitForCards(page);
    await page.getByRole('tab', { name: /stories/i }).click();
    await expect(page).toHaveURL(/[?&]tab=stories/);
    await page.getByRole('button', { name: /currently newest first/i }).click();
    await expect(page).toHaveURL(/[?&]sort=oldest/);
    await page.getByRole('tab', { name: /points/i }).click();
    await page.goBack();
    await expect(page).toHaveURL(/\/terms-of-service/);
  });

  test('a tab change alone shows no skeleton', async ({ page }) => {
    await page.goto('/feed');
    await waitForCards(page);
    await watchForSkeleton(page);
    await page.getByRole('tab', { name: /stories/i }).click();
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForTimeout(800);
    expect(await sawSkeleton(page)).toBe(false);
  });

  test('typing in search makes no network request and does not move the scroll; the query survives open item → Back', async ({ page }) => {
    await page.goto('/feed');
    await waitForCards(page, 3);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.waitForTimeout(200);
    const yBefore = await page.evaluate(() => window.scrollY);

    const requests: string[] = [];
    page.on('request', (r) => { if (/supabase\.(co|in)/.test(r.url())) requests.push(r.url()); });
    const term = ((await page.locator('[data-testid^="feed-point-card-"]').first().getAttribute('aria-label')) ?? 'Point: a')
      .replace(/^Point:\s*/, '')
      .slice(0, 4);
    await page.getByPlaceholder(/search stories and points/i).pressSequentially(term, { delay: 60 });
    await expect(page).toHaveURL(/[?&]q=/);
    await page.waitForTimeout(800);
    expect(requests, requests.join('\n')).toEqual([]);
    expect(await page.evaluate(() => window.scrollY)).toBe(yBefore);

    const first = await page.locator('[data-testid^="feed-point-card-"]').first().getAttribute('data-testid');
    await openCard(page, first!);
    await expect(page).toHaveURL(/\/point\//);
    await page.goBack();
    await expect(page.getByPlaceholder(/search stories and points/i)).toHaveValue(term);
    await expect(page).toHaveURL(/[?&]q=/);
  });
});

/** First card fully in the viewport among `sel`; else the topmost crossing it (`~crossing`). */
function firstVisible(page: Page, sel: string): Promise<string | null> {
  return page.evaluate((selector) => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el => el.getBoundingClientRect().height > 0);
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) return el.dataset.testid ?? null;
    }
    const crossing = cards.find(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; });
    return crossing ? `${crossing.dataset.testid}~crossing` : null;
  }, sel);
}

/**
 * P1364 review — the profile under test is found by querying the test database directly
 * (anonymous REST reads only; nothing is written), not by scraping whatever the feed happened to
 * load. Points tab = public points the subject holds a position on; Stories tab = the subject's
 * public stories. The profile with the most of each (ties by id) is used; if none has enough,
 * the run fails naming the missing data.
 */
const MIN_CARDS = 8;
interface ProfilePick { slug: string; count: number }

async function discoverProfiles(): Promise<{ points: ProfilePick; stories: ProfilePick }> {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('P1364 profile e2e: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.test.local');
  const api = await pwRequest.newContext({ baseURL: `${url}/rest/v1/`, extraHTTPHeaders: { apikey: anon, Authorization: `Bearer ${anon}` } });
  const getAll = async <T,>(path: string): Promise<T[]> => {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      const res = await api.get(path, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
      if (!res.ok()) throw new Error(`P1364 profile e2e: GET ${path} → ${res.status()} ${await res.text()}`);
      const page = (await res.json()) as T[];
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  };
  const top = (counts: Map<string, number>) =>
    [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const slugOf = async (id: string): Promise<string> => {
    const res = await api.post('rpc/get_profile_by_id', { data: { p_id: id } });
    const body = (await res.json()) as Array<{ slug?: string | null }> | { slug?: string | null };
    const row = Array.isArray(body) ? body[0] : body;
    if (!res.ok() || !row?.slug) throw new Error(`P1364 profile e2e: no public slug for profile ${id} (${res.status()})`);
    return row.slug;
  };
  try {
    const publicPoints = new Set((await getAll<{ id: string }>('points?select=id&visibility=eq.public')).map(p => p.id));
    const positions = await getAll<{ user_id: string; point_id: string }>('point_positions?select=user_id,point_id');
    const perHolder = new Map<string, number>();
    for (const p of positions) if (publicPoints.has(p.point_id)) perHolder.set(p.user_id, (perHolder.get(p.user_id) ?? 0) + 1);
    const stories = await getAll<{ author_id: string }>('stories?select=author_id&visibility=eq.public');
    const perAuthor = new Map<string, number>();
    for (const st of stories) perAuthor.set(st.author_id, (perAuthor.get(st.author_id) ?? 0) + 1);
    const bestPoints = top(perHolder);
    const bestStories = top(perAuthor);
    if (!bestPoints || bestPoints[1] < MIN_CARDS) {
      throw new Error(`P1364 profile e2e needs a profile holding positions on >= ${MIN_CARDS} public points; the test DB's best has ${bestPoints?.[1] ?? 0}`);
    }
    if (!bestStories || bestStories[1] < MIN_CARDS) {
      throw new Error(`P1364 profile e2e needs a profile with >= ${MIN_CARDS} public stories; the test DB's best has ${bestStories?.[1] ?? 0}`);
    }
    return {
      points: { slug: await slugOf(bestPoints[0]), count: bestPoints[1] },
      stories: { slug: await slugOf(bestStories[0]), count: bestStories[1] },
    };
  } finally {
    await api.dispose();
  }
}

test.describe('P1364 — profile: Back returns to the same tab and card', () => {
  let picks: { points: ProfilePick; stories: ProfilePick };
  test.beforeAll(async () => {
    picks = await discoverProfiles();
    console.log(`[p1364 profile e2e] Points: /p/${picks.points.slug} (${picks.points.count}); Stories: /p/${picks.stories.slug} (${picks.stories.count})`);
  });

  async function watchForProfileLoaders(page: Page) {
    await page.evaluate(() => {
      const w = window as unknown as { __sawLoader: boolean };
      w.__sawLoader = false;
      new MutationObserver(() => {
        if (document.querySelector('.clarity-page-loader, [data-testid="profile-content-skeleton"]')) w.__sawLoader = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
  }

  const TABS = [
    { tab: 'Points', param: '?tab=points', card: '[data-testid^="point-card-with-links-"]', detail: 'point', pick: 'points' as const },
    { tab: 'Stories', param: '', card: '[data-testid^="profile-story-card-"]', detail: 'story', pick: 'stories' as const },
  ];

  for (const t of TABS) {
    for (const way of ['top control', 'bottom pill', 'browser back'] as const) {
      test(`profile ${t.tab} tab${t.param ? '' : ' (default, no param)'}, scrolled → open a ${t.detail} → ${way}: same tab, same first card, no loader`, async ({ page }) => {
        test.setTimeout(60000);
        const slug = picks[t.pick].slug;
        await page.goto('/feed'); // a page before the profile, so Back has somewhere to go
        await page.goto(`/p/${slug}`);
        await page.getByTestId('profile-content-skeleton').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
        if (t.param) {
          await page.getByRole('tab', { name: new RegExp(`^${t.tab}`) }).click();
          await expect(page).toHaveURL(new RegExp(`[?&]tab=${t.tab.toLowerCase()}`));
        }
        await expect(page.getByRole('tab', { name: new RegExp(`^${t.tab}`) })).toHaveAttribute('aria-selected', 'true');
        const cards = page.locator(t.card);
        await expect.poll(() => cards.count(), { timeout: 15000 }).toBeGreaterThanOrEqual(MIN_CARDS);
        await cards.nth(5).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
        await page.waitForTimeout(300);
        const before = await firstVisible(page, t.card);
        expect(before).not.toBeNull();
        const urlBefore = page.url();

        await page.getByTestId(before!.replace(/~crossing$/, '')).dispatchEvent('click');
        await expect(page).toHaveURL(new RegExp(`/${t.detail}/`));
        await expect(page.getByRole('button', { name: 'Go back', exact: true })).toBeVisible({ timeout: 20000 });
        if (way === 'bottom pill') await expect(page.getByTestId(`${t.detail}-bottom-back`)).toBeVisible({ timeout: 20000 });

        await watchForProfileLoaders(page);
        if (way === 'top control') await page.getByRole('button', { name: 'Go back', exact: true }).click();
        else if (way === 'bottom pill') await page.getByTestId(`${t.detail}-bottom-back`).getByRole('button').click();
        else await page.goBack();

        await expect(page).toHaveURL(urlBefore);
        await expect(page.getByRole('tab', { name: new RegExp(`^${t.tab}`) })).toHaveAttribute('aria-selected', 'true');
        await page.locator(t.card).first().waitFor();
        await page.waitForTimeout(600);
        expect(await firstVisible(page, t.card)).toBe(before);
        // Served from the cache: no page loader and no content skeleton on the way back.
        expect(await page.evaluate(() => (window as unknown as { __sawLoader: boolean }).__sawLoader)).toBe(false);
      });
    }
  }
});

test.describe('P1364 — Back remembers which cards were open', () => {
  test('feed: expand a point\'s stories, scroll → open a linked story → Back → that card is still expanded and is the first visible card', async ({ page }) => {
    await page.goto('/feed');
    await waitForCards(page);
    // A point card with linked stories, far enough down to need scrolling.
    const expanders = page.locator('[data-testid^="feed-point-card-"] [data-testid="feed-point-story-expander"]');
    await expect.poll(() => expanders.count(), { timeout: 15000 }).toBeGreaterThan(0);
    const count = await expanders.count();
    const expander = expanders.nth(Math.min(3, count - 1));
    const cardId = await expander.evaluate(el => el.closest<HTMLElement>('[data-testid^="feed-point-card-"]')!.dataset.testid!);
    const card = page.getByTestId(cardId);
    await expander.click();
    await expect(expander).toHaveAttribute('aria-expanded', 'true');
    // Its top at the viewport's top: expanded, the card can be taller than the viewport, and any
    // margin would leave the card above it as the one crossing the top edge.
    await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY));
    await page.waitForTimeout(300);
    expect((await firstVisible(page, CARD))?.replace(/~crossing$/, '')).toBe(cardId);

    // The story box inside the quote (the attribution row above it opens the profile instead).
    await card.getByTestId('quoted-story').first().locator(':scope > div[role="button"]').dispatchEvent('click');
    await expect(page).toHaveURL(/\/story\//);
    await expect(page.getByRole('button', { name: 'Go back', exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Go back', exact: true }).click();

    await expect(page).toHaveURL(/\/feed(\?|$)/);
    await expect(page.getByTestId(cardId).getByTestId('feed-point-story-expander')).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(600);
    expect((await firstVisible(page, CARD))?.replace(/~crossing$/, '')).toBe(cardId);
  });
});
