/**
 * P1415 — in a real browser, at the widths the spec names:
 *   - Home rail (desktop): Next events above Groups; Groups names only the Communication Activism
 *     group (/groups/cm), plus "All groups". Phones: no Groups section at all.
 *   - List cards open only via `Details →`: tapping a card's body leaves the reader on the list.
 *
 * Read-only against the test DB (anonymous, no fixtures). jsdom cannot prove the second half —
 * a click handler anywhere up the tree would still navigate — so it is asserted here, by tapping
 * on the card's own text at phone width.
 */
import { test, expect, type Page } from '@playwright/test';

const PHONE = { width: 375, height: 800 };
const NARROW = { width: 320, height: 700 };
const DESKTOP = { width: 1280, height: 900 };

async function openFeed(page: Page, url: string, card: string) {
  await page.goto(url);
  await expect(page.locator(card).first()).toBeVisible({ timeout: 20000 });
}

test.describe('P1415 — home rail', () => {
  test('smoke: /feed loads at desktop with no console errors; Next events above Groups, only the CA group', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(DESKTOP);
    await page.goto('/feed');
    const rail = page.getByTestId('home-side-rail');
    await expect(rail).toBeVisible({ timeout: 20000 });
    await expect(rail).toHaveAttribute('aria-label', 'Events and groups');
    const groupLink = rail.getByRole('link', { name: /Communication Activism/ });
    await expect(groupLink).toBeVisible({ timeout: 20000 });
    await expect(groupLink).toHaveAttribute('href', '/groups/cm');
    await expect(rail.getByRole('link', { name: /Clarity Practice Community/ })).toHaveCount(0);
    await expect(rail.getByRole('link', { name: 'All groups' })).toBeVisible();
    const headings = await rail.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.map((h) => h.trim())).toEqual([expect.stringMatching(/^Next events?$/), 'Groups']);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  for (const vp of [PHONE, NARROW]) {
    test(`phone ${vp.width}px: no Groups section, group tile or "All groups" link`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/feed');
      await expect(page.getByPlaceholder('Search stories and points...')).toBeVisible({ timeout: 20000 });
      expect(await page.evaluate(() => window.innerWidth)).toBe(vp.width);
      await expect(page.getByTestId('home-side-rail')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Groups' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'All groups' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Communication Activism/ })).toHaveCount(0);
    });
  }
});

test.describe('P1415 — list cards open only via Details', () => {
  for (const [kind, url, card, detail] of [
    ['point', '/feed?tab=points', 'article[data-testid^="feed-point-card-"]', /\/point\//],
    ['story', '/feed?tab=stories', 'article[data-testid^="feed-story-card-"]', /\/story\//],
  ] as const) {
    test(`${kind} card at ${PHONE.width}px: tapping the body stays on the list; Details opens it`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await openFeed(page, url, card);
      const first = page.locator(card).first();
      await first.scrollIntoViewIfNeeded();
      // Non-link areas only (a statement can hold a linkified URL, which SHOULD navigate): the
      // card's padding at its top-left corner, and the left edge beside the body.
      await first.click({ position: { x: 6, y: 6 } });
      await first.click({ position: { x: 8, y: 60 } });
      await page.waitForTimeout(500);
      await expect(page).not.toHaveURL(detail);
      await expect(page).toHaveURL(/\/feed/);
      await expect(first).not.toHaveAttribute('role', 'button');
      expect(await first.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');
      // No "the whole card is a link" hover highlight: hovering changes no border colour.
      const borders = () => first.evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
      });
      const before = await borders();
      await first.hover({ position: { x: 6, y: 6 } });
      await page.waitForTimeout(400);
      expect(await borders()).toEqual(before);

      await first.getByRole('button', { name: `Details for this ${kind}`, exact: true }).click();
      await expect(page).toHaveURL(detail);
    });
  }
});
