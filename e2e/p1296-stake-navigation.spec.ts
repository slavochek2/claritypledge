/**
 * @file p1296-stake-navigation.spec.ts
 * @description P1296 items 1–5 and 8 in a REAL browser, against the test database's
 * `aisafety1` tag (Points and Stories both present) and `cmp7` (Points only).
 *
 * Why an e2e and not only the unit suite: the cold-arrival fix reads the BROWSER history
 * index (`history.state.idx`), which an in-memory router does not have. The unit suite proves
 * the fallback; only a real page proves the path an attendee's phone actually takes when it
 * opens the Clarity Night link — `/stake/aisafety1?tab=stories` — in a fresh tab.
 */
import { test, expect, type Page } from '@playwright/test';

const EVENT_LINK = '/stake/aisafety1?tab=stories';

async function waitForList(page: Page) {
  await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });
}

test.describe('P1296 — /stake is linkable to a tab and leavable', () => {
  test('smoke: the event link loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(EVENT_LINK);
    await waitForList(page);
    // Let the footer's linked-content fetch land before judging the console.
    await expect(page.getByTestId('story-card-footer').first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test("the event's link opens on Stories, and ?tab=stories survives the data load", async ({ page }) => {
    await page.goto(EVENT_LINK);
    await waitForList(page);
    await expect(page.getByTestId('stake-tab-stories')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /^Story by / }).first()).toBeVisible();
    await expect(page).toHaveURL(/[?&]tab=stories/);
  });

  test('a Points-only tag ignores ?tab=stories — it opens on Points, with no tab bar', async ({ page }) => {
    await page.goto('/stake/cmp7?tab=stories');
    await expect(page.getByTestId('stake-list').or(page.getByTestId('stake-empty'))).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('stake-tabs')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Story by / })).toHaveCount(0);
  });

  test('tab switches keep ?event= and add no history entries', async ({ page }) => {
    await page.goto('/stake/aisafety1?event=e2e-p1296');
    await waitForList(page);
    const before = await page.evaluate(() => window.history.length);

    await page.getByTestId('stake-tab-stories').click();
    await expect(page).toHaveURL(/[?&]tab=stories/);
    await expect(page).toHaveURL(/[?&]event=e2e-p1296/);
    await page.getByTestId('stake-tab-points').click();
    await expect(page).not.toHaveURL(/[?&]tab=stories/);
    await expect(page).toHaveURL(/[?&]event=e2e-p1296/);

    expect(await page.evaluate(() => window.history.length)).toBe(before);
  });

  for (const [which, name] of [
    ['the header button', 'Go back'],
    ['the bottom CTA', 'Go back from the end of the list'],
  ] as const) {
    test(`cold arrival → two tab switches → ${which} lands on /feed, not outside the app`, async ({ page }) => {
      await page.goto(EVENT_LINK);
      await waitForList(page);
      // The first entry of this tab's history: exactly the state a fresh tab opening the link is in.
      expect(await page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx)).toBe(0);

      await page.getByTestId('stake-tab-points').click();
      await page.getByTestId('stake-tab-stories').click();
      await expect(page).toHaveURL(/[?&]tab=stories/);

      await page.getByRole('button', { name, exact: true }).click();
      await expect(page).toHaveURL(/\/feed(\?|$)/);
    });
  }

  test('the bottom "Go back" is reachable at the end of the list', async ({ page }) => {
    await page.goto(EVENT_LINK);
    await waitForList(page);
    const bottom = page.getByRole('button', { name: 'Go back from the end of the list', exact: true });
    await bottom.scrollIntoViewIfNeeded();
    await expect(bottom).toBeVisible();
    const list = await page.getByTestId('stake-list').boundingBox();
    const cta = await bottom.boundingBox();
    expect(cta!.y).toBeGreaterThan(list!.y + list!.height - 1);
  });

  test('both tabs carry the footer — count, share, open-in-new', async ({ page }) => {
    await page.goto('/stake/aisafety1');
    await waitForList(page);
    const pointFooter = page.getByTestId('point-card-footer').first();
    await expect(pointFooter).toBeVisible();
    await expect(pointFooter.getByRole('button', { name: 'Share point' })).toBeVisible();
    await expect(pointFooter.getByRole('button', { name: 'Open point' })).toBeVisible();
    await expect(pointFooter.getByText(/^\d+ (story|stories)$/)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('stake-tab-stories').click();
    const storyFooter = page.getByTestId('story-card-footer').first();
    await expect(storyFooter).toBeVisible();
    await expect(storyFooter.getByRole('button', { name: 'Share story' })).toBeVisible();
    await expect(storyFooter.getByRole('button', { name: 'Open story' })).toBeVisible();
    await expect(storyFooter.getByText(/^\d+ points?$/)).toBeVisible({ timeout: 15000 });
  });

  test('share opens the sheet with a link and an embed code', async ({ page }) => {
    await page.goto(EVENT_LINK);
    await waitForList(page);
    await page.getByTestId('story-card-footer').first().getByRole('button', { name: 'Share story' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy embed code' })).toBeVisible();
    // The sheet is not a navigation.
    await expect(page).toHaveURL(/\/stake\/aisafety1/);
  });

  test('supporting quotes are never folded: count heading plus visible timecodes (P1348)', async ({ page }) => {
    await page.goto(EVENT_LINK);
    await waitForList(page);
    const heading = page.getByTestId('story-video-quotes-heading').first();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(/^\d+ supporting quotes?$/);
    const card = page.getByRole('button', { name: /^Story by / }).first();
    await expect(card.getByTestId('story-video-quote-timecode').first()).toBeVisible();
    await expect(page).toHaveURL(/\/stake\/aisafety1/);
  });

});
