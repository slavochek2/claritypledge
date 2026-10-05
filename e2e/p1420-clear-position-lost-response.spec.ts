/**
 * @file p1420-clear-position-lost-response.spec.ts
 * @description P1420 reproduction: "Clear position" on a /feed point card over a bad connection.
 *
 * Each test asserts the EXPECTED behaviour, so on the unfixed code every one of them fails.
 * Network conditions are staged with page.route against the TEST Supabase project:
 *   - lost answer: the DELETE reaches the server (route.fetch) and the answer is then aborted
 *   - slow connection: every Supabase answer held 5s (longer than the 4s offline-read deadline)
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';

let me: TestUser;
let other: TestUser;
let pointId: string;
let tag: string;

test.beforeEach(async () => {
  tag = `p1420${Date.now().toString(36)}`;
  me = await createTestUser({ name: 'P1420Clear' });
  other = await createTestUser({ name: 'P1420Other' });
  const point = await createTestPoint(me.user.id, { statement: `P1420 clear position ${tag}`, tags: [tag] });
  pointId = point.id;
  await createTestPosition(pointId, me.user.id, 'agree');
  // A second holder keeps the point on the feed after the viewer's position is removed.
  await createTestPosition(pointId, other.user.id, 'agree');
});

test.afterEach(async () => {
  try { await deleteTestPoint(pointId); } catch { /* cascade handles it */ }
  try { await deleteTestUser(other.user.id); } catch { /* noop */ }
  try { await deleteTestUser(me.user.id); } catch { /* noop */ }
});

async function dbPosition(): Promise<string | null> {
  const { data } = await supabaseAdmin.from('point_positions').select('position')
    .eq('point_id', pointId).eq('user_id', me.user.id).maybeSingle();
  return data?.position ?? null;
}

const card = (page: Page) => page.getByTestId(`feed-point-card-${pointId}`);

async function openRemoveDialog(page: Page) {
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await expect(card(page).locator('button[aria-pressed="true"]')).toHaveCount(1);
  await card(page).getByTestId('agree-group').click();
  await page.getByRole('option', { name: /Clear position/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** The DELETE reaches the server and is applied; the answer never reaches the page. */
async function loseDeleteAnswer(page: Page) {
  let dropped = false;
  await page.route('**/rest/v1/point_positions*', async (route: Route) => {
    // `{ times: 1 }` would be spent on the first GET to this table, so count DELETEs by hand.
    if (route.request().method() !== 'DELETE' || dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await new Promise((r) => setTimeout(r, 1_500)); // a slow mobile round trip, then the drop
    await route.abort('failed');
  });
}

test.describe('P1420: Clear position over a bad connection', () => {
  // Staged network delays plus a 25s observation window exceed the 30s default.
  test.describe.configure({ timeout: 120_000 });

  test('lost answer: no toast claims "nothing was saved" for a removal the server applied', async ({ page }) => {
    await setTestSession(page, me.email);
    await loseDeleteAnswer(page);
    // Record every toast that appears: a correct fix may settle (and dismiss its toast) within
    // milliseconds, so waiting for one to be visible would be a race, not a check.
    await page.addInitScript(() => {
      const w = window as unknown as { __p1420Toasts: string[] };
      w.__p1420Toasts = [];
      new MutationObserver(() => {
        for (const el of Array.from(document.querySelectorAll('[data-sonner-toast]'))) {
          const text = el.textContent ?? '';
          if (text && !w.__p1420Toasts.includes(text)) w.__p1420Toasts.push(text);
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto(`/feed?tab=points&tag=${tag}`);
    await openRemoveDialog(page);
    await page.getByRole('button', { name: 'Remove position' }).click();

    await expect.poll(dbPosition, { timeout: 10_000 }).toBeNull(); // the server DID remove it
    await page.waitForTimeout(4_000); // the old false toast appeared ~1.5s in and lasted ~4s
    const toasts = await page.evaluate(() => (window as unknown as { __p1420Toasts: string[] }).__p1420Toasts);
    // Before the fix: "You're offline. This needs internet, so nothing was saved." — false here.
    expect(toasts.filter((t) => /nothing was saved/i.test(t))).toEqual([]);
  });

  test('lost answer: the card ends up matching the server without a reload', async ({ page }) => {
    await setTestSession(page, me.email);
    await loseDeleteAnswer(page);
    await page.goto(`/feed?tab=points&tag=${tag}`);
    await openRemoveDialog(page);
    await page.getByRole('button', { name: 'Remove position' }).click();
    await expect.poll(dbPosition, { timeout: 10_000 }).toBeNull();

    // Before the fix the dialog stayed open; the founder's natural next move was to tap again,
    // and that second tap closed it at once (no "Removing…", no request) with Agree still lit.
    // If the dialog is still offered, take that same path; either way the card must converge.
    const removeAgain = page.getByRole('button', { name: 'Remove position' });
    if (await removeAgain.isVisible().catch(() => false)) await removeAgain.click();

    await expect(card(page).locator('button[aria-pressed="true"]')).toHaveCount(0, { timeout: 20_000 });
  });

  test('slow connection (every answer 5s): the card the reader is acting on is not unmounted and remounted', async ({ page }) => {
    await setTestSession(page, me.email);
    // One normal visit stores this feed in the offline read cache, as any earlier visit would.
    await page.goto(`/feed?tab=points&tag=${tag}`);
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_500);

    await page.route(/supabase\.co\/(rest|auth|functions)\//, async (route: Route) => {
      const res = await route.fetch().catch(() => null);
      await new Promise((r) => setTimeout(r, 5_000));
      if (!res) return route.abort('failed').catch(() => {});
      await route.fulfill({ response: res }).catch(() => {});
    });
    await page.addInitScript((pid) => {
      const w = window as unknown as { __p1420Unmounts: number };
      w.__p1420Unmounts = 0;
      let wasMounted = false;
      setInterval(() => {
        const mounted = !!document.querySelector(`[data-testid="feed-point-card-${pid}"]`);
        if (wasMounted && !mounted) w.__p1420Unmounts++;
        wasMounted = mounted;
      }, 100);
    }, pointId);
    await page.reload();
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(25_000);

    // Today: the feed flips saved copy → skeleton → saved copy every ~5–10s (reconnect re-read),
    // which also unmounts an open "Remove position?" dialog mid-request.
    const unmounts = await page.evaluate(() => (window as unknown as { __p1420Unmounts: number }).__p1420Unmounts);
    expect(unmounts).toBe(0);
  });
});
