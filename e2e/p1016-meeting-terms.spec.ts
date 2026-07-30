/**
 * @file p1016-meeting-terms.spec.ts
 * @description E2E for the Clarity Meeting Terms page (P1016, route /terms).
 *
 * Covers the Done-When list in features/p1016_clarity_meeting_terms.md: public
 * access, the four-stop track, the choosing → in-meeting → choosing state machine,
 * the lock while a meeting runs, localStorage persistence across reload, and the
 * absence of any backend call.
 *
 * Runs signed out on purpose — the page must work for someone who has never seen
 * this product before.
 */
import { test, expect, type Page } from '@playwright/test';

const STORAGE_KEY = 'cp.meeting-terms.v1';

/** The four radio stops, in ladder order. */
function stops(page: Page) {
  return page.locator('input[name="meeting-terms-level"]');
}

function stop(page: Page, level: number) {
  return page.locator(`input[name="meeting-terms-level"][value="${level}"]`);
}

/**
 * The visible target for a stop — the label column, which is what a finger or a
 * cursor actually hits. The radio itself is `sr-only` (1px, for screen readers and
 * keyboard), so driving it with `check()` fails on pointer interception from the
 * dot span and, once scrolled to, from the fixed top nav. Clicking the label is
 * both the real user gesture and the stable one.
 */
function stopTarget(page: Page, level: number) {
  return page.getByTestId(`terms-stop-${level}`);
}

async function selectStop(page: Page, level: number) {
  await stopTarget(page, level).click();
  await expect(stop(page, level)).toBeChecked();
}

function primaryButton(page: Page) {
  return page.getByRole('button', { name: /Accept and start meeting|End meeting/ });
}

test.describe('P1016 Clarity Meeting Terms', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terms');
    // Clear any state left by a previous test in the same browser context, then
    // reload so the page re-reads storage rather than keeping in-memory state.
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.goto('/terms');
    await page.waitForSelector('h1');
  });

  test('loads signed out with no redirect to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { name: 'Clarity Meeting Terms', level: 1 })).toBeVisible();
  });

  test('does not shadow the legal terms of service page', async ({ page }) => {
    await page.goto('/terms-of-service');
    await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
  });

  test('shows three labelled stops, weakest first, and exactly one is selected', async ({ page }) => {
    await expect(stops(page)).toHaveCount(3);
    await expect(page.locator('input[name="meeting-terms-level"]:checked')).toHaveCount(1);
    // Order matters — the founder's ladder puts "Explain back" on top. Reading the
    // labels in DOM order asserts the ordering, not merely their presence.
    const labels = await page.locator('label[data-testid^="terms-stop-"]').allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual(['You may ask', 'Reveal the gap', 'Explain back']);
  });

  test('the track renders INSIDE the nav row, not as a second row below it', async ({ page }) => {
    // Without this, a broken portal degrades silently: the page falls back to an
    // in-body sticky track whose markup is identical, so every other assertion in
    // this file still passes while the whole point of the change — one row, not two —
    // is gone. Anchoring on the nav is what makes that regression fail loudly.
    await expect(page.locator('[data-nav="main"] input[name="meeting-terms-level"]')).toHaveCount(3);

    // …and the certificate starts within one nav-height of the top, which is the
    // user-visible property the portal exists to produce.
    const navBox = await page.locator('[data-nav="main"]').boundingBox();
    const certBox = await page.locator('[aria-label="Clarity Meeting Terms"]').first().boundingBox();
    expect(certBox!.y).toBeLessThan(navBox!.height + 40);
  });

  test('selecting a stop swaps the rendered terms', async ({ page }) => {
    // The certificate title is constant ("Clarity Meeting Terms") by design — the
    // selected level is signalled by the track and by WHICH terms the document
    // carries, so assert on the body text, not on a per-level heading.
    await selectStop(page, 1);
    const atOne = await page.locator('main').innerText();

    await selectStop(page, 3);
    const atThree = await page.locator('main').innerText();

    expect(atOne).not.toEqual(atThree);
    // Rung 3 ("Reveal the gap") is the number-first pledge; rung 1 grants the right
    // to ask and promises nothing, so it carries no MY PROMISE clause at all.
    expect(atThree).toContain('honest number');
    expect(atOne).not.toContain('honest number');
    expect(atOne).not.toContain('MY PROMISE');
    expect(atThree).toContain('MY PROMISE');
  });

  test('the track is keyboard operable', async ({ page }) => {
    // Arrow keys walk DOM order, which is ladder order: 1 → 3 → 2.
    await selectStop(page, 1);
    await stop(page, 1).focus();
    await page.keyboard.press('ArrowRight');
    await expect(stop(page, 3)).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(stop(page, 2)).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(stop(page, 3)).toBeChecked();
  });

  test('accepting marks it accepted, locks the track, and swaps the button — no navigation', async ({ page }) => {
    await selectStop(page, 2);
    const urlBefore = page.url();

    await primaryButton(page).click();

    await expect(page.getByTestId('accepted-marker')).toBeVisible();
    await expect(page.getByRole('button', { name: 'End meeting' })).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    // Every stop is disabled while the meeting runs.
    for (const level of [1, 2, 3]) {
      await expect(stop(page, level)).toBeDisabled();
    }
  });

  test('the level cannot be changed while in meeting', async ({ page }) => {
    await selectStop(page, 2);
    await primaryButton(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    // A disabled radio ignores clicks; force the click past the pointer-events guard
    // so this asserts the STATE is locked, not merely that the cursor is blocked.
    await stopTarget(page, 1).click({ force: true }).catch(() => { /* a disabled control may reject the click outright */ });
    await expect(stop(page, 2)).toBeChecked();
    // …and the document still carries rung 2's terms, not rung 1's.
    await expect(page.locator('main')).toContainText('mirror back');
  });

  test('ending the meeting returns to choosing with the level preserved', async ({ page }) => {
    await selectStop(page, 1);
    await primaryButton(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    await page.getByRole('button', { name: 'End meeting' }).click();

    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept and start meeting' })).toBeVisible();
    await expect(stop(page, 1)).toBeChecked();
    await expect(stop(page, 1)).toBeEnabled();
  });

  test('a mid-meeting reload preserves both the level and the accepted state', async ({ page }) => {
    await selectStop(page, 1);
    await primaryButton(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    await page.reload();

    await expect(page.getByTestId('accepted-marker')).toBeVisible();
    await expect(stop(page, 1)).toBeChecked();
    await expect(page.getByRole('button', { name: 'End meeting' })).toBeVisible();
  });

  test('clearing site data returns to choosing at the default level', async ({ page }) => {
    await selectStop(page, 2);
    await primaryButton(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();

    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await expect(stop(page, 3)).toBeChecked();
  });

  test('records nothing: no backend call from choosing, accepting, or ending', async ({ page }) => {
    // The shared site chrome (nav) issues its own read — an events GET for the nav
    // badge — on every route including this one. That request is not this page's and
    // carries no acceptance data. The invariant that actually matters is narrower and
    // stronger: acceptance is never RECORDED anywhere. So this asserts (a) zero backend
    // requests of any kind during the accept/end interactions, and (b) zero mutating
    // requests at any point in the visit.
    const duringInteraction: string[] = [];
    const mutations: string[] = [];
    let watching = false;

    page.on('request', (req) => {
      if (!/supabase\.co|\/rest\/v1\/|\/functions\/v1\//.test(req.url())) return;
      if (req.method() !== 'GET') mutations.push(`${req.method()} ${req.url()}`);
      if (watching) duringInteraction.push(`${req.method()} ${req.url()}`);
    });

    await page.goto('/terms');
    await page.waitForSelector('h1');
    // Let the chrome's own on-load reads settle before the window opens.
    await page.waitForLoadState('networkidle');

    watching = true;
    await selectStop(page, 2);
    await primaryButton(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();
    await page.getByRole('button', { name: 'End meeting' }).click();
    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    watching = false;

    expect(duringInteraction).toEqual([]);
    expect(mutations).toEqual([]);
  });

  test('no horizontal overflow at 320px, and the sticky action stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/terms');
    await page.waitForSelector('h1');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);

    const button = primaryButton(page);
    await expect(button).toBeInViewport();
    // Touch target minimum from the visual-QA checklist.
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });
});
