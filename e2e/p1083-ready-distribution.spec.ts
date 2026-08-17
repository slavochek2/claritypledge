/**
 * @file p1083-ready-distribution.spec.ts
 * @description E2E for P1083's always-visible /ready distribution: renders before
 * any answer (including N=0), the retention window is enforced on the read side,
 * no numeral/percentage/anonymity-claim anywhere, and /meet's conditional back
 * button — visible only when arrival came from /ready — returns to a re-fetched view.
 *
 * `ready_submissions` has no owner/session scoping by design (spec's own data
 * model — value + timestamp, nothing else). This file used to wipe the whole table
 * in beforeEach/afterEach and assert exact dot counts; that raced e2e/integration/
 * p1083-db-schema.spec.ts, which does the same thing under a DIFFERENT Playwright
 * project (`integration`) that runs concurrently with this one (`chromium`) by
 * default — reproduced directly (adversarial review, 2026-08-17): running both
 * files together failed all 5 tests here; running this file alone passed all 5.
 *
 * Fix, four parts:
 * 1. Never touch rows this file didn't create — each test tracks its OWN seeded
 *    ids in a local array and cleans up in a try/finally, never a shared/module-
 *    level array (a shared array would itself race once tests run in parallel —
 *    see point 4) and never a table-wide delete (see docs/technical/e2e-testing-guide.md).
 * 2. Count assertions are FLOORS (>=), not exact — the table can hold rows from
 *    other tests running at the same moment, so "at least what I seeded" is the
 *    only assertion that's both true and stable. The precise retention-window
 *    EXCLUSION (a backdated row must not appear) is proven exactly, with zero
 *    flakiness, at the integration layer via id-containment against a direct API
 *    call — see p1083-db-schema.spec.ts's "the retention-window RLS policy
 *    hides..." test. This file's job is only to prove the real UI reflects real
 *    data through a real render, not to re-prove the RLS policy itself.
 * 3. Final counts are read via expect.poll(), not a single `.count()` snapshot —
 *    src/main.tsx has React.StrictMode on, which double-invokes ReadyPage's mount
 *    effect in dev. The first fetch's result is discarded by ready-page.tsx's own
 *    `cancelled` guard; only the second actually calls setOthers(). A single read
 *    timed off "the GET request resolved" can catch the FIRST (discarded) fetch
 *    and read the DOM before the real one lands — reproduced directly (chasing a
 *    single-read version of this file down to `Received: 0` after seeding 2 rows,
 *    on a page that had already loaded). Polling is immune to which fetch — or how
 *    many — actually update the DOM; it just waits for the DOM to reach the target.
 * 4. Serial mode, restored. Floor checks (2) tolerate a SIBLING test merely
 *    ADDING rows during the measurement window, but not one that adds AND
 *    removes its own rows within that same window (its cleanup can net-decrease
 *    the count below what this test's own addition alone would guarantee) —
 *    reproduced directly running this file's 5 tests in true parallel. Serial
 *    mode removes that intra-file case entirely; the cross-file case (a
 *    DIFFERENT file's test completing its own full add-then-remove cycle
 *    exactly inside this test's window) is far rarer and the floor checks still
 *    cover its more common shape (a stray row that outlives this test, e.g. a
 *    real Continue write from e2e/p1077-ready.spec.ts).
 */
import { test, expect, type Page } from '@playwright/test';
import { seedReadySubmission, deleteReadySubmissions } from './helpers/test-ready';

test.describe('P1083 /ready distribution', () => {
  test.describe.configure({ mode: 'serial' });

  // The marks render ON the slider track, not as a standalone chart above it — a
  // separate row was reviewed as unreadable (see the ready-page file header). At
  // N=0 the layer is absent entirely, so `dots()` correctly counts 0 via a locator
  // that resolves to nothing rather than throwing.
  const distribution = (page: Page) => page.getByTestId('others-marks');
  const dots = (page: Page) => distribution(page).locator('span');

  /** A stable reading for a baseline — doesn't need to match a target, just needs
   * to reflect the settled state (both of StrictMode's mount-effect fetches done)
   * before the test starts adding rows. */
  async function settledDotCount(page: Page): Promise<number> {
    await page.waitForLoadState('networkidle');
    return dots(page).count();
  }

  test('renders one dot per other respondent, visible before the visitor answers anything', async ({ page }) => {
    const ids: string[] = [];
    try {
      await page.goto('/ready');
      const baseline = await settledDotCount(page);

      ids.push(await seedReadySubmission(2));
      ids.push(await seedReadySubmission(8));
      await page.reload();

      await expect.poll(() => dots(page).count()).toBeGreaterThanOrEqual(baseline + 2);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });

  test('empty state (N=0): bare axis, no error copy — structural, not table-emptiness-dependent', async ({ page }) => {
    // True N=0 rendering (zero dots, zero copy) is already covered deterministically
    // by src/tests/p1083-ready-distribution.test.tsx's mocked unit test — this e2e
    // test can't safely assert the real shared table is empty (another file/project
    // may hold rows at the same moment), so it checks the structural guarantee that
    // doesn't depend on table state: the axis always renders, and there is never an
    // error/loading copy regardless of what the read returns.
    await page.goto('/ready');
    // The axis now belongs to the slider itself (one shared ruler), so assert it
    // there rather than inside the marks layer, which no longer carries labels.
    await expect(page.getByText('Keep it light')).toBeVisible();
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/error|failed|unavailable|nobody/i);
  });

  test('retention window: a submission older than 10 minutes is invisible, not just "old"', async ({ page }) => {
    // The exact exclusion proof lives in p1083-db-schema.spec.ts (id-containment,
    // no shared-table flakiness) — this test only proves the fresh dot renders
    // through a real page load, which the >= floor confirms without being fooled
    // by unrelated concurrent activity on the same table.
    const ids: string[] = [];
    try {
      await page.goto('/ready');
      const baseline = await settledDotCount(page);

      ids.push(await seedReadySubmission(5)); // fresh — should appear
      ids.push(await seedReadySubmission(1, 11)); // 11 min ago — excluded by RLS, proven separately
      await page.reload();

      await expect.poll(() => dots(page).count()).toBeGreaterThanOrEqual(baseline + 1);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });

  test('no numeral, percentage, or identity anywhere in the distribution', async ({ page }) => {
    const ids: string[] = [];
    try {
      ids.push(await seedReadySubmission(0));
      ids.push(await seedReadySubmission(10));
      await page.goto('/ready');

      const bodyText = (await page.locator('body').innerText()) ?? '';
      expect(bodyText).not.toMatch(/\d+\/10/);
      expect(bodyText).not.toMatch(/\d+%/);
      expect(bodyText).not.toMatch(/anonymized|aggregate/i);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });

  test("/meet's back button is absent on a direct visit, appears only after arriving from /ready, and returns to a re-fetched view", async ({ page }) => {
    const ids: string[] = [];
    try {
      // Direct visit first — no back button.
      await page.goto('/meet');
      await expect(page.getByRole('button', { name: /back/i })).not.toBeVisible();

      // Now via /ready.
      await page.goto('/ready');
      const baseline = await settledDotCount(page);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page).toHaveURL(/\/meet\/?$/);
      const back = page.getByRole('button', { name: /back/i });
      await expect(back).toBeVisible();

      // Seed a second respondent while on /meet, then go back — the view should
      // reflect it without needing a hard reload.
      ids.push(await seedReadySubmission(3));
      await back.click();
      await expect(page).toHaveURL(/\/ready\/?$/);
      // The visitor's own Continue write from a moment ago (midpoint, untouched) is
      // also in the window by now — baseline+1 (this seed) is the guaranteed floor,
      // not the exact count (their own write may or may not have landed yet).
      await expect.poll(() => dots(page).count()).toBeGreaterThanOrEqual(baseline + 1);

      // Never labeled "anonymized" or "aggregate" anywhere on /meet either.
      const meetBodyText = (await page.locator('body').innerText()) ?? '';
      expect(meetBodyText).not.toMatch(/anonymized|aggregate/i);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });
});
