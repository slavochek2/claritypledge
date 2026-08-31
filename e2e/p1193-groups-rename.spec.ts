/**
 * @file p1193-groups-rename.spec.ts
 * @description P1193 — the Clarity Organization → Clarity Group rename, in a browser.
 *
 * The source contract (src/tests/p1193-source-contract.test.ts) proves the routes are
 * DECLARED and the redirect is WRITTEN. This proves they actually resolve — which is a
 * different claim, and the one that matters for links already in circulation.
 *
 * The `?from=` case is the reason this file exists. P1076 attribution rides on invite
 * links that were handed out before the rename; if the redirect drops the query string
 * there is no error, no missing page and no failing route — just an attribution that
 * silently never arrives. Nothing but an end-to-end assertion catches that.
 */
import { test, expect } from '@playwright/test';

test.describe('P1193: /groups is the route', () => {
  test('smoke: the directory loads and has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/groups');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Clarity Groups' })).toBeVisible({ timeout: 10000 });
    expect(errors, `console errors on /groups:\n${errors.join('\n')}`).toEqual([]);
  });

  test('a group page loads on the new path', async ({ page }) => {
    await page.goto('/groups/cm');
    await page.waitForLoadState('networkidle');
    // Not the not-found state — that is what a half-applied route rename looks like.
    await expect(page.getByRole('heading', { name: /group not found/i })).not.toBeVisible();
    await expect(page.getByRole('tab', { name: /events/i })).toBeVisible({ timeout: 10000 });
  });

  test('the footer nav offers Groups, and no longer offers Events', async ({ page }) => {
    // On "/" — NOT on /groups. The full ClarityFooter that renders NAV_LINKS is
    // gated on isLandingPage (clarity-landing-layout.tsx); every other route gets
    // LegalFooter, which carries no site nav at all. Asserting this on /groups looks
    // reasonable and fails for a reason that has nothing to do with the rename.
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Groups', exact: true })).toBeVisible({ timeout: 10000 });
    // The label left the menu with the rename. Exact match: "Groups" must not satisfy
    // a loose /events/i, and neither may any other link on the page.
    await expect(footer.getByRole('link', { name: 'Events', exact: true })).toHaveCount(0);
  });
});

test.describe('P1193: /org* keeps working, permanently', () => {
  // Each case is a link shape that has actually been shared. A 404 on any of them is
  // a broken invite, not a tidy-up opportunity.
  const cases: Array<[string, string]> = [
    ['/org', '/groups'],
    ['/org/cm', '/groups/cm'],
    ['/org/cm/join', '/groups/cm/join'],
  ];

  for (const [from, to] of cases) {
    test(`${from} redirects to ${to}`, async ({ page }) => {
      await page.goto(from);
      await page.waitForURL(`**${to}`, { timeout: 10000 });
      expect(new URL(page.url()).pathname).toBe(to);
    });
  }

  test('?from= attribution survives the hop — P1076', async ({ page }) => {
    // The silent-failure case. A dropped query string breaks nothing visible; it just
    // stops recording who invited whom, forever, on every pre-rename link.
    const fromId = '00000000-0000-4000-8000-000000000abc';
    await page.goto(`/org/cm?from=${fromId}`);
    await page.waitForURL('**/groups/cm**', { timeout: 10000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe('/groups/cm');
    expect(url.searchParams.get('from'), 'the attribution param must survive the redirect').toBe(fromId);
  });

  test('?from= survives on the JOIN path too', async ({ page }) => {
    // The join page is where the param is actually consumed, so this is the shape
    // that costs something if it breaks.
    const fromId = '00000000-0000-4000-8000-000000000abc';
    await page.goto(`/org/cm/join?from=${fromId}`);
    await page.waitForURL('**/groups/cm/join**', { timeout: 10000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe('/groups/cm/join');
    expect(url.searchParams.get('from')).toBe(fromId);
  });

  test('an unknown group under the legacy path still redirects, then reports not-found', async ({ page }) => {
    // The redirect must not try to be clever about whether the group exists — that is
    // the page's job. A redirect that 404'd first would break nothing today and break
    // every renamed slug later.
    await page.goto('/org/no-such-group-p1193');
    await page.waitForURL('**/groups/no-such-group-p1193', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /group not found/i })).toBeVisible({ timeout: 10000 });
  });
});
