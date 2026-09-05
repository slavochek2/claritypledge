import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';

/**
 * P1253: this file used to keep a describe-scope `testUsers` array, filled by `beforeEach` and
 * emptied by `afterEach`. `docs/technical/e2e-testing-guide.md` (P1083) names that exact shape as
 * the thing not to do — once two tests in the file run at the same time, one test's cleanup
 * deletes rows another test is still asserting on. The file was only safe because of the `serial`
 * guard below, i.e. its correctness lived in a config line rather than in the fixture.
 *
 * The seeding is now a Playwright fixture whose tracking array is per-test and whose teardown runs
 * in `finally`, so a test can only ever delete ids it created itself. `serial` stays as defence in
 * depth; removing it no longer introduces a cleanup race.
 */
const SEED_COUNT = 25;

type PledgerSeed = { prefix: string; users: TestUser[] };

// Destructuring `seeded` in a test's signature is what ACTIVATES this fixture — Playwright builds
// only the fixtures a test asks for. Several tests below therefore name `seeded` without reading
// it under the alias `_seeded` (a destructuring RENAME — Playwright matches the fixture by the
// property name `seeded`, so activation is unaffected, while the local binding satisfies the
// unused-args lint rule). Asserting on seeded.users.length inside a test would be
// a tautology (the fixture rejects rather than yielding a short list), so those assertions are
// deliberately absent.
const seededTest = test.extend<{ seeded: PledgerSeed }>({
  // Playwright requires the destructuring pattern for a fixture's first argument ("First argument
  // must use the object destructuring pattern") and rejects a plain identifier at runtime. This
  // fixture depends on no other fixture, so the pattern is legitimately empty.
  // eslint-disable-next-line no-empty-pattern
  seeded: async ({}, provide) => {
    // Per-run prefix: rows from a different run (or an interrupted one that left orphans behind)
    // can never satisfy or defeat this test's assertions.
    const prefix = `Test Pledger ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const created: TestUser[] = [];
    try {
      // Track each user AS IT IS CREATED, not after Promise.all resolves. Promise.all rejects on
      // the first failure and never yields the successes, so `created.push(...users)` after the
      // await leaves every already-created row untracked — and therefore undeleted — whenever
      // seeding partially fails or the run is interrupted mid-flight. That is the mechanism behind
      // the orphan `Test Pledger N` rows in the shared test project (P1253).
      await Promise.all(
        Array.from({ length: SEED_COUNT }, async (_, i) => {
          const user = await createTestUser({
            name: `${prefix} ${i + 1}`,
            role: `Role ${i + 1}`,
            reason: `Reason for signing ${i + 1}`,
          });
          created.push(user);
          return user;
        })
      );
      await provide({ prefix, users: created });
    } finally {
      // Only ids this test created. Never a shared array.
      //
      // The .catch matches the established convention in this repo (21 other call sites wrap
      // deleteTestUser this way) and is deliberate, not an oversight: deleteTestUser already
      // warns-and-continues internally on profile/auth delete errors, so the only thing that can
      // throw out of it is a network-level exception, and letting one id's network blip abort the
      // Promise.all would skip the deletion of every other id in the batch — strictly more
      // orphans, not fewer. Note the limit honestly: the zero-orphan guarantee below covers the
      // creation-failure path, not a deletion-failure one, and nothing covers a worker crash,
      // which never runs `finally` at all.
      await Promise.all(created.map((u) => deleteTestUser(u.user.id).catch(() => undefined)));
    }
  },
});

/**
 * Wait for pledger cards to be on screen.
 *
 * NOT "wait for a named seeded row". `pledger-grid.tsx` renders the mobile carousel (`md:hidden`)
 * and the desktop grid (`hidden md:grid`) into the same DOM, so a bare `text=` match resolves into
 * whichever tree is currently `display:none` and waits forever (P1229). And the mobile carousel
 * shows only the first 20 rows of a page ordered newest-first, while the 25 fixture users are
 * created concurrently — so any *individual* seeded name has a real chance of being outside the
 * visible slice. Both failure modes disappear by asserting on the visible cards themselves, which
 * is what these tests actually care about.
 */
async function waitForPledgerCards(page: import('@playwright/test').Page) {
  await expect(page.locator('[href^="/p/"]:visible').first()).toBeVisible({ timeout: 15000 });
}

test.describe('Pledgers Page', () => {
  test.describe.configure({ mode: 'serial' });

  seededTest('Mobile viewport - carousel scrolls horizontally', async ({ page, seeded: _seeded }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    const carousel = page.locator('[role="region"][aria-label="Pledger profiles carousel"]');
    await expect(carousel).toBeVisible();

    const scrollWidth = await carousel.evaluate((el) => el.scrollWidth);
    const clientWidth = await carousel.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    await carousel.evaluate((el) => {
      el.scrollLeft = 400;
    });

    const newScrollLeft = await carousel.evaluate((el) => el.scrollLeft);
    expect(newScrollLeft).toBeGreaterThan(0);
  });

  seededTest('Clicking dot navigates to corresponding profile card', async ({ page, seeded: _seeded }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    const carousel = page.locator('[role="region"][aria-label="Pledger profiles carousel"]');
    const initialScroll = await carousel.evaluate((el) => el.scrollLeft);

    await page.click('button[aria-label="Go to profile 3"]');
    await page.waitForTimeout(500);

    const newScroll = await carousel.evaluate((el) => el.scrollLeft);
    expect(newScroll).toBeGreaterThan(initialScroll);
  });

  seededTest('Scroll position updates currentIndex (dot indicator highlights)', async ({ page, seeded: _seeded }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    const firstDot = page.locator('button[aria-label="Go to profile 1"]');
    await expect(firstDot).toHaveClass(/bg-blue-600/);
    await expect(firstDot).toHaveClass(/w-4/);

    const carousel = page.locator('[role="region"][aria-label="Pledger profiles carousel"]');
    await carousel.evaluate((el) => {
      el.scrollLeft = el.scrollWidth / 3;
    });
    await page.waitForTimeout(300);

    // Exactly one dot is active at a time — a property of the control, not of the table.
    const activeDots = page.locator('button.bg-blue-600.w-4');
    await expect(activeDots).toHaveCount(1);
  });

  seededTest('Clicking pledger card navigates to pledge certificate', async ({ page, seeded: _seeded }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    const firstCard = page.locator('[href^="/p/"]:visible').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/\/p\/.+\/pledge$/);

    await firstCard.click();
    await page.waitForURL(/\/p\/.+\/pledge/);

    expect(page.url()).toMatch(/\/p\/.+\/pledge/);
  });

  seededTest('Desktop viewport - profiles render in grid (no carousel)', async ({ page, seeded }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    // Floor, not an exact count: the table is shared, and the desktop page renders one page
    // (PLEDGERS_PAGE_SIZE = 30) which is >= the SEED_COUNT this fixture guarantees exists.
    await expect
      .poll(() => page.locator('[href^="/p/"]:visible').count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(seeded.users.length);
  });

  seededTest('Mobile shows "Showing 20 of X" when profiles exceed limit', async ({ page, seeded: _seeded }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    // The 20 is MAX_MOBILE_CAROUSEL, a cap. The total after "of" is whatever the shared table
    // holds, so it is deliberately not asserted.
    await expect(page.locator('text=/Showing 20 of/i')).toBeVisible({ timeout: 10000 });
  });

  seededTest('Dot indicators count matches mobile profiles (max 20)', async ({ page, seeded: _seeded }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await waitForPledgerCards(page);

    // Asserts the CAP, not the population: the fixture guarantees >= 25 rows exist, so the
    // carousel is always saturated and the dot count is MAX_MOBILE_CAROUSEL exactly. This stays
    // true no matter how many other rows the shared table holds.
    const dots = page.locator('button[aria-label^="Go to profile"]');
    await expect(dots).toHaveCount(20);
  });
});

/**
 * These two read no rows, so they seed none. Keeping them under the seeding fixture cost ~50 real
 * Supabase writes per run that nothing read, and was the largest single source of the orphan
 * `Test Pledger N` rows that accumulate whenever a run is interrupted (P1253).
 */
test.describe('Pledgers Page — no fixture rows needed', () => {
  test('Page title and header render correctly', async ({ page }) => {
    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Clarity Pledgers")')).toBeVisible();
    await expect(page.locator('text=Ready to Commit?')).toBeVisible();
  });

  test('Empty state shows when no profiles exist', async ({ page }) => {
    // P1229: this used to delete the seeded users and assert the page was empty — a GLOBAL
    // property of a table other sessions also write to, so it passed or failed on how much
    // orphaned data happened to be present. Stub the RPC: the behaviour under test is the
    // component's empty state, not the table's contents.
    await page.route('**/rest/v1/rpc/get_pledgers_page', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, profiles: [] }),
      });
    });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=No Verified Pledgers Yet')).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('text=Be the first to sign the pledge and verify your commitment!')
    ).toBeVisible();
  });
});
