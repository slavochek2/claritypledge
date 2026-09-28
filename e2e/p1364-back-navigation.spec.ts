/**
 * @file p1364-back-navigation.spec.ts
 * @description P1364 — Back returns to where the reader was, at the position they were at.
 *
 * Scroll ACs need a real layout, so they live here, not in jsdom. "Same position" is measured
 * the way the spec defines it: the data-testid of the FIRST CARD FULLY IN VIEW is the same
 * before leaving the list and after coming back.
 *
 * Read-only against the test database: every test browses public content anonymously and
 * writes nothing. Tests that need a long list skip (with the reason) when the database does not
 * hold one, rather than asserting on a list too short to scroll.
 */
import { test, expect, type Page } from '@playwright/test';

// A phone-sized viewport: a list scrolls after a handful of cards.
test.use({ viewport: { width: 390, height: 700 } });

const CARD = '[data-testid^="feed-point-card-"], [data-testid^="feed-story-card-"]';

async function waitForCards(page: Page, min = 1) {
  await expect(page.locator(CARD).first()).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.locator(CARD).count(), { timeout: 10000 }).toBeGreaterThanOrEqual(min);
}

/** The data-testid of the first card whose whole box is inside the viewport. */
function firstFullyVisibleCard(page: Page): Promise<string | null> {
  return page.evaluate((sel) => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight) return el.dataset.testid ?? null;
    }
    return null;
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
        test.skip(count < 12, `the test database holds ${count} ${detail} cards on ${listUrl}; this AC needs at least 12`);

        await scrollToCard(page, 10);
        const before = await firstFullyVisibleCard(page);
        expect(before).not.toBeNull();
        const urlBefore = page.url();

        await openCard(page, before!);
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
    test.skip(count < 4, `aisafety1 holds ${count} points on the test database; this AC needs a scrollable list`);

    await scrollToCard(page, Math.min(4, count - 1));
    const before = await firstFullyVisibleCard(page);
    const urlBefore = page.url();
    await openCard(page, before!);
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
