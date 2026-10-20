/**
 * P1522 — an idle open tab must not keep calling Supabase. The free plan's egress ran over quota;
 * the measured cause was not a poller but the offline pack, a ~30-request burst that every fresh
 * browser (every e2e context, every headless crawler) paid in its first minute.
 *
 * Budget: after the page settles, at most IDLE_BUDGET Supabase requests in the next WINDOW_MS;
 * hidden, zero. A request volume assertion, not a behaviour one (decisions.md 2026-09-30, P1369:
 * a retry storm passed 23 behaviour tests).
 *
 * The control proves the budget binds: the same page with the pack opted back in exceeds it.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';

const SETTLE_MS = 5_000;
const WINDOW_MS = 45_000;
/** After settling: an idle visible tab may make at most this many requests in WINDOW_MS. */
const IDLE_BUDGET = 3;
/**
 * From navigation, over LOAD_WINDOW_MS: /feed's own load measured 25-27 requests without the pack
 * and ~70 with it (scripts/measure-idle-requests.mjs --from-navigation). A poller or the pack under
 * automation both break this; counting from navigation means a fast pack cannot hide in a settle.
 */
const LOAD_WINDOW_MS = 50_000;
const LOAD_BUDGET = 40;

async function countFromNavigation(page: Page, path: string): Promise<string[]> {
  const seen: string[] = [];
  const onReq = (req: { url(): string; method(): string }) => {
    if (/supabase\.co\/(rest|auth|storage|functions)\//.test(req.url())) seen.push(`${req.method()} ${new URL(req.url()).pathname}`);
  };
  page.on('request', onReq);
  try {
    await page.goto(path);
    await page.waitForTimeout(LOAD_WINDOW_MS);
  } finally {
    page.off('request', onReq);
  }
  return seen;
}

async function countSupabaseRequests(page: Page, ms: number): Promise<string[]> {
  const seen: string[] = [];
  const onReq = (req: { url(): string; method(): string }) => {
    const url = req.url();
    if (!/supabase\.co\/(rest|auth|storage|functions)\//.test(url)) return;
    seen.push(`${req.method()} ${new URL(url).pathname}`);
  };
  page.on('request', onReq);
  await page.waitForTimeout(ms);
  page.off('request', onReq);
  return seen;
}

async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('P1522 idle request budget', () => {
  test.describe.configure({ timeout: 120_000 });

  test('smoke: signed-out /feed stays within the idle budget once settled', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForTimeout(SETTLE_MS);
    const reqs = await countSupabaseRequests(page, WINDOW_MS);
    expect(reqs.length, reqs.join('\n')).toBeLessThanOrEqual(IDLE_BUDGET);
  });

  test('a fresh signed-out /feed load stays within the load budget (no pack under automation)', async ({ page }) => {
    const reqs = await countFromNavigation(page, '/feed');
    expect(reqs.length, reqs.join('\n')).toBeLessThanOrEqual(LOAD_BUDGET);
  });

  test('control: with the offline pack opted back in, the same load blows the budget', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('clarity-offline-pack-allow-automation', '1'));
    const reqs = await countFromNavigation(page, '/feed');
    expect(reqs.length).toBeGreaterThan(LOAD_BUDGET);
  });

  test('hidden signed-out tab makes zero Supabase requests, even with the offline pack allowed', async ({ page }) => {
    // Opted in, so this exercises the pack's own hidden-tab guard (the preloader starts it ~3s
    // after load): hidden at 1.5s, a working guard means it never runs; a broken one bursts.
    await page.addInitScript(() => localStorage.setItem('clarity-offline-pack-allow-automation', '1'));
    await page.goto('/feed');
    await page.waitForTimeout(1_500);
    await hide(page);
    await page.waitForTimeout(SETTLE_MS);
    const reqs = await countSupabaseRequests(page, WINDOW_MS);
    expect(reqs, reqs.join('\n')).toEqual([]);
  });

  test.describe('signed in', () => {
    let user: TestUser | undefined;
    test.beforeAll(async () => {
      user = await createTestUser({ name: 'P1522 Idle', email: generateTestEmail() });
    });
    test.afterAll(async () => {
      if (user) await deleteTestUser(user.user.id);
    });

    test('signed-in /feed stays within the idle budget, and hidden makes zero', async ({ page }) => {
      await setTestSession(page, user!.email);
      await page.goto('/feed');
      await page.waitForTimeout(SETTLE_MS);
      const visible = await countSupabaseRequests(page, WINDOW_MS);
      expect(visible.length, visible.join('\n')).toBeLessThanOrEqual(IDLE_BUDGET);
      await hide(page);
      const hidden = await countSupabaseRequests(page, WINDOW_MS);
      expect(hidden, hidden.join('\n')).toEqual([]);
    });
  });
});
