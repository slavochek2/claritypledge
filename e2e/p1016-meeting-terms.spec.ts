/**
 * @file p1016-meeting-terms.spec.ts
 * @description E2E for the Clarity Meeting Principle page (P1016, redesigned by P1024,
 * route /meet).
 *
 * Covers the Done-When lists of both specs: public access, the three-stop track, the
 * choosing → rating → in-meeting state machine, the opt-out acknowledgement branch, the
 * lock while a meeting runs, localStorage persistence across reload, and the absence of
 * any backend call.
 *
 * Filename and storage key still say "terms" deliberately — P1024 renamed only what a
 * participant sees, not the internal identifiers.
 *
 * Runs signed out on purpose — the page must work for someone who has never seen this
 * product before.
 */
import { test, expect, type Page } from '@playwright/test';

const STORAGE_KEY = 'cp.meeting-terms.v1';
const PRINCIPLE_TITLE = 'Clarity Meeting Principle';

/** The three radio stops, in ladder order. */
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

const optIn = (page: Page) => page.getByRole('button', { name: 'Opt in', exact: true });
const optOut = (page: Page) => page.getByRole('button', { name: 'Opt out', exact: true });
const startMeeting = (page: Page) => page.getByRole('button', { name: 'Start meeting' });
const endMeeting = (page: Page) => page.getByRole('button', { name: 'End meeting' });
/**
 * The opt-out path's counterpart to "Start meeting" (P1024 UAT). It replaced the
 * "Noted. Nothing agreed." marker and the "Back to the principles" button, both cut:
 * the first said nothing the host could not see, the second read as pressure to revise
 * an answer just given. Same shape, same weight, same person tapping it — the host.
 */
const submit = (page: Page) => page.getByRole('button', { name: 'Submit', exact: true });

/**
 * The 0-10 row rendered by ComprehensionRatingCard. The buttons carry
 * `aria-label="Rate N"`, which overrides their visible text as the accessible name —
 * matching on the bare digit finds nothing.
 */
function ratingButton(page: Page, value: number) {
  return page.getByRole('button', { name: `Rate ${value}`, exact: true });
}

/** Answer, then state a number — the full participant turn. */
async function answerAndRate(page: Page, answer: 'in' | 'out', value: number) {
  await (answer === 'in' ? optIn(page) : optOut(page)).click();
  await expect(page.getByText(/How much do you think you understand/)).toBeVisible();
  await ratingButton(page, value).click();
}

test.describe('P1024 Clarity Meeting Principle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/meet');
    // Clear any state left by a previous test in the same browser context, then
    // reload so the page re-reads storage rather than keeping in-memory state.
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.goto('/meet');
    await page.waitForSelector('h1');
  });

  test('loads signed out with no redirect to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/meet$/);
    await expect(page.getByRole('heading', { name: PRINCIPLE_TITLE, level: 1 })).toBeVisible();
  });

  test('the old /terms path is gone, and the legal terms of service still loads', async ({ page }) => {
    // P1016 was never deployed, so /terms never resolved for anyone and no redirect is
    // owed. What must NOT happen is this page answering on the legal route.
    await page.goto('/terms-of-service');
    await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
    await expect(page.getByText(PRINCIPLE_TITLE)).toHaveCount(0);
  });

  test('no user-visible string on the page says "Terms"', async ({ page }) => {
    // The whole point of the rename: "terms" framed an invitation as an obligation.
    // Scoped to the page's own content — the shared site chrome carries a "Terms of
    // Service" link to the genuinely legal page, which the rename deliberately spares.
    const main = await page.locator('main').innerText();
    expect(main).not.toMatch(/\bterms\b/i);

    // Every step, not just the first: the rename has to survive the state machine.
    await optIn(page).click();
    expect(await page.locator('main').innerText()).not.toMatch(/\bterms\b/i);
    await ratingButton(page, 5).click();
    expect(await page.locator('main').innerText()).not.toMatch(/\bterms\b/i);
    await startMeeting(page).click();
    expect(await page.locator('main').innerText()).not.toMatch(/\bterms\b/i);
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
    const certBox = await page.locator(`[aria-label="${PRINCIPLE_TITLE}"]`).first().boundingBox();
    expect(certBox!.y).toBeLessThan(navBox!.height + 40);
  });

  test('selecting a stop swaps the rendered principle', async ({ page }) => {
    // The certificate title is constant by design — the selected level is signalled by
    // the track and by WHICH commitment the document carries, so assert on the body
    // text, not on a per-level heading.
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

  test('rung 1 is a permission to ask and promises nothing back', async ({ page }) => {
    // P1024 replaced this rung's content. The removed half — "you may also give me your
    // own number" — was a promise wearing a right's clothing.
    await selectStop(page, 1);
    const body = await page.locator('main').innerText();
    expect(body).toContain('YOUR RIGHT');
    expect(body).toContain('feel free to ask');
    expect(body).not.toContain('your own number');
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

  test('Opt in leads as primary; Opt out stays the same size, and neither is pre-selected', async ({ page }) => {
    await expect(optIn(page)).toBeVisible();
    await expect(optOut(page)).toBeVisible();

    // P1024 UAT reversal: the two answers no longer carry equal weight. `Opt in` is the
    // filled primary. What still holds — and what this asserts — is that `Opt out` keeps
    // the SAME BOX. A secondary that also shrinks stops reading as an offered choice, and
    // the whole point of the opt-out is that it is genuinely on the table.
    const inBox = await optIn(page).boundingBox();
    const outBox = await optOut(page).boundingBox();
    expect(Math.abs(inBox!.width - outBox!.width)).toBeLessThan(2);
    expect(Math.abs(inBox!.height - outBox!.height)).toBeLessThan(2);
    expect(inBox!.height).toBeGreaterThanOrEqual(40);

    // The hierarchy itself: filled navy vs transparent. Asserted on computed style rather
    // than class strings, so a refactor that keeps the look keeps the test.
    const inBg = await optIn(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    const outBg = await optOut(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(inBg).toBe('rgb(0, 43, 92)');
    expect(outBg).toBe('rgba(0, 0, 0, 0)');

    // …but `Opt out` still draws a real border. This is the line between "secondary" and
    // "hidden", and the spec forbids crossing it.
    const outBorder = await optOut(page).evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(parseFloat(outBorder)).toBeGreaterThanOrEqual(1);

    // Nothing is committed yet, on either path.
    await expect(startMeeting(page)).toHaveCount(0);
    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
  });

  test('no "Not legally binding" disclaimer renders anywhere', async ({ page }) => {
    // Removed at UAT by founder decision. Asserted rather than merely deleted, so the
    // string cannot drift back in unnoticed — and checked at the rating step too, not
    // only where it used to sit.
    await expect(page.getByText(/legally binding/i)).toHaveCount(0);
    await optIn(page).click();
    await expect(page.getByText(/legally binding/i)).toHaveCount(0);
  });

  test('the principle stays on screen while the understanding question is asked', async ({ page }) => {
    // The question asks how well the participant understood THIS principle. Hiding the
    // principle to ask it is the one thing the question cannot afford — the first build
    // did exactly that, and this test is what stops a regression to it.
    await selectStop(page, 2);
    const principleBody = await page.locator('main').innerText();

    await optIn(page).click();
    await expect(page.getByText(/How much do you think you understand/)).toBeVisible();

    // Certificate title and the selected rung's body are both still rendered.
    await expect(page.getByText('Clarity Meeting Principle').first()).toBeVisible();
    const duringRating = await page.locator('main').innerText();
    expect(duringRating).toContain('How much do you think you understand');
    // A distinctive slice of the rung text survives the step change.
    expect(duringRating.length).toBeGreaterThan(principleBody.length / 2);
  });

  test('the 0-10 row is reachable without scrolling at 320px', async ({ page }) => {
    // The reason the bar is fixed rather than stacked under the certificate. The longest
    // rung is the worst case, so test that one.
    await page.setViewportSize({ width: 320, height: 700 });
    await selectStop(page, 2);
    await optIn(page).click();

    const zero = ratingButton(page, 0);
    const ten = ratingButton(page, 10);
    await expect(zero).toBeInViewport();
    await expect(ten).toBeInViewport();
  });

  test('the certificate can be scrolled clear of the rating bar', async ({ page }) => {
    // A fixed bar over a scrolling document hides the document's tail unless its height
    // is reserved. Without the reservation the last lines of the longest rung are
    // unreachable at any scroll position.
    await page.setViewportSize({ width: 320, height: 700 });
    await selectStop(page, 2);
    await optIn(page).click();
    await expect(page.getByText(/How much do you think you understand/)).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const clearance = await page.evaluate(() => {
      const bar = document.querySelector('.fixed.inset-x-0.bottom-0');
      const barTop = bar!.getBoundingClientRect().top;
      // The lowest text node of the certificate must come to rest above the bar.
      const cert = document.querySelector('[aria-label="Clarity Meeting Principle"]');
      return barTop - cert!.getBoundingClientRect().bottom;
    });
    expect(clearance).toBeGreaterThanOrEqual(0);
  });

  test('opting IN or OUT reveals the SAME question, without navigating', async ({ page }) => {
    const urlBefore = page.url();

    await optIn(page).click();
    const afterOptIn = await page.locator('main').innerText();
    expect(page.url()).toBe(urlBefore);
    expect(afterOptIn).toContain('How much do you think you understand');

    await page.reload();
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();
    await page.waitForSelector('h1');

    await optOut(page).click();
    const afterOptOut = await page.locator('main').innerText();
    expect(page.url()).toBe(urlBefore);
    expect(afterOptOut).toContain('How much do you think you understand');
  });

  test('Start meeting is ABSENT until a number is chosen — never disabled', async ({ page }) => {
    // P955: a disabled primary rendered as decoration is forbidden. Absence is the
    // requirement, so asserting "not visible" would pass on a disabled button too.
    await optIn(page).click();
    await expect(page.getByText(/How much do you think you understand/)).toBeVisible();
    await expect(startMeeting(page)).toHaveCount(0);

    await ratingButton(page, 7).click();
    await expect(startMeeting(page)).toBeVisible();
    await expect(startMeeting(page)).toBeEnabled();
  });

  test('regression: a 0 proceeds exactly like a 10 — no threshold exists', async ({ page }) => {
    // The number generates a spoken question; it never gates. A threshold would select
    // FOR overconfidence, which inverts the point of asking.
    await answerAndRate(page, 'in', 0);
    await expect(startMeeting(page)).toBeVisible();
    await expect(startMeeting(page)).toBeEnabled();
  });

  test('a 0 also proceeds on the opt-out path', async ({ page }) => {
    await answerAndRate(page, 'out', 0);
    await expect(submit(page)).toBeVisible();
  });

  test('Start meeting locks the track and marks it accepted — no navigation', async ({ page }) => {
    await selectStop(page, 2);
    const urlBefore = page.url();

    await answerAndRate(page, 'in', 9);
    await startMeeting(page).click();

    await expect(page.getByTestId('accepted-marker')).toBeVisible();
    await expect(endMeeting(page)).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    // Every stop is disabled while the meeting runs.
    for (const level of [1, 2, 3]) {
      await expect(stop(page, level)).toBeDisabled();
    }
  });

  test('the level cannot be changed while in meeting', async ({ page }) => {
    await selectStop(page, 2);
    await answerAndRate(page, 'in', 5);
    await startMeeting(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    // A disabled radio ignores clicks; force the click past the pointer-events guard
    // so this asserts the STATE is locked, not merely that the cursor is blocked.
    await stopTarget(page, 1).click({ force: true }).catch(() => { /* a disabled control may reject the click outright */ });
    await expect(stop(page, 2)).toBeChecked();
    // …and the document still carries rung 2's commitment, not rung 1's.
    await expect(page.locator('main')).toContainText('mirror back');
  });

  test('opting out ends in a Submit that mirrors Start meeting, and locks nothing', async ({ page }) => {
    await selectStop(page, 2);
    const urlBefore = page.url();

    await answerAndRate(page, 'out', 3);

    await expect(submit(page)).toBeVisible();
    // Nothing was agreed: no accepted marker, and no way to start anyway.
    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await expect(startMeeting(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /start meeting anyway/i })).toHaveCount(0);
    // The URL never changes — this is a state, not a route.
    expect(page.url()).toBe(urlBefore);

    // Exactly one action, and its label must not imply retry or correction. "Back to the
    // principles" was cut for exactly this reason; a regression to that family is a fail.
    const actions = page.locator('.fixed.inset-x-0.bottom-0').getByRole('button');
    const labels = await actions.allInnerTexts();
    const nonRating = labels.filter((l) => !/^\d+$/.test(l.trim()));
    expect(nonRating).toEqual(['Submit']);
    expect(nonRating[0]).not.toMatch(/try again|retry|are you sure|back to/i);
  });

  test('Submit and Start meeting are the same control in different clothes', async ({ page }) => {
    // The symmetry is load-bearing: the opt-out is not a lesser path, and an opt-out that
    // ends in silence or in a weaker-looking button reads as the app disapproving.
    await selectStop(page, 2);
    await answerAndRate(page, 'in', 6);
    const startBox = await startMeeting(page).boundingBox();
    const startBg = await startMeeting(page).evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();
    await page.waitForSelector('h1');
    await selectStop(page, 2);
    await answerAndRate(page, 'out', 6);
    const submitBox = await submit(page).boundingBox();
    const submitBg = await submit(page).evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(submitBg).toBe(startBg);
    expect(Math.abs(submitBox!.width - startBox!.width)).toBeLessThan(2);
    expect(Math.abs(submitBox!.height - startBox!.height)).toBeLessThan(2);
  });

  test('Submit returns to the ladder with the rung still selected, committing nothing', async ({ page }) => {
    await selectStop(page, 2);
    await answerAndRate(page, 'out', 4);

    await submit(page).click();

    await expect(submit(page)).toHaveCount(0);
    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await expect(optIn(page)).toBeVisible();
    await expect(optOut(page)).toBeVisible();
    await expect(stop(page, 2)).toBeChecked();
    await expect(stop(page, 2)).toBeEnabled();
  });

  test('the opt-out state does not auto-return after a delay', async ({ page }) => {
    // An instant or timed snap-back reads as the app rejecting the answer, which is the
    // opposite of what an opt-out should feel like. The participant leaves by choice.
    await answerAndRate(page, 'out', 2);
    await expect(submit(page)).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(submit(page)).toBeVisible();
  });

  test('opting out of the LIGHTEST rung has nowhere lighter to go, and invents nothing', async ({ page }) => {
    await selectStop(page, 1);
    await answerAndRate(page, 'out', 1);
    await expect(submit(page)).toBeVisible();

    await submit(page).click();
    // Still three rungs — the ladder does not grow a fourth, lighter one.
    await expect(stops(page)).toHaveCount(3);
    await expect(stop(page, 1)).toBeChecked();
  });

  test('ending the meeting returns to choosing with the level preserved', async ({ page }) => {
    await selectStop(page, 1);
    await answerAndRate(page, 'in', 8);
    await startMeeting(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    await endMeeting(page).click();

    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await expect(optIn(page)).toBeVisible();
    await expect(stop(page, 1)).toBeChecked();
    await expect(stop(page, 1)).toBeEnabled();
  });

  test('a mid-meeting reload preserves the level, the answer and the number', async ({ page }) => {
    await selectStop(page, 1);
    await answerAndRate(page, 'in', 6);
    await startMeeting(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    await page.reload();

    await expect(page.getByTestId('accepted-marker')).toBeVisible();
    await expect(stop(page, 1)).toBeChecked();
    await expect(endMeeting(page)).toBeVisible();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(stored!)).toMatchObject({ level: 1, accepted: true, answer: 'in', rating: 6 });
  });

  test('a reload mid-RATING keeps the answer and returns to the question', async ({ page }) => {
    await selectStop(page, 3);
    await optIn(page).click();
    await ratingButton(page, 4).click();

    await page.reload();
    await page.waitForSelector('h1');

    // The answer survives, so the participant is not asked to opt in twice.
    await expect(page.getByText(/How much do you think you understand/)).toBeVisible();
    await expect(startMeeting(page)).toBeVisible();
    await expect(stop(page, 3)).toBeChecked();
  });

  test('clearing site data returns to choosing at the default level', async ({ page }) => {
    await selectStop(page, 2);
    await answerAndRate(page, 'in', 5);
    await startMeeting(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();

    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();

    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await expect(stop(page, 3)).toBeChecked();
  });

  test('a stored level from the retired 4-rung ladder resolves DOWN, never up', async ({ page }) => {
    // Level 0 ("Just talk") was cut. Someone who chose it has it in storage. Resolving
    // that to the default would move them from the lightest terms on offer to the
    // heaviest — the one direction a consent control must never drift by itself.
    await page.evaluate(
      (key) => window.localStorage.setItem(key, JSON.stringify({ level: 0, accepted: false })),
      STORAGE_KEY,
    );
    await page.reload();
    await page.waitForSelector('h1');

    await expect(stop(page, 1)).toBeChecked();
    await expect(stop(page, 3)).not.toBeChecked();
  });

  test('a P1016-era stored state restores without an answer or a number', async ({ page }) => {
    // The key was NOT bumped for P1024: the two new fields are additive. Someone mid-flow
    // when the change landed must not lose their rung.
    await page.evaluate(
      (key) => window.localStorage.setItem(key, JSON.stringify({ level: 2, accepted: false })),
      STORAGE_KEY,
    );
    await page.reload();
    await page.waitForSelector('h1');

    await expect(stop(page, 2)).toBeChecked();
    await expect(optIn(page)).toBeVisible();
    await expect(startMeeting(page)).toHaveCount(0);
  });

  test('records nothing: no backend call from choosing, answering, rating, or ending', async ({ page }) => {
    // The shared site chrome (nav) issues its own read — an events GET for the nav
    // badge — on every route including this one. That request is not this page's and
    // carries no agreement data. The invariant that actually matters is narrower and
    // stronger: the answer and the number are never RECORDED anywhere. So this asserts
    // (a) zero backend requests of any kind during the interactions, and (b) zero
    // mutating requests at any point in the visit.
    const duringInteraction: string[] = [];
    const mutations: string[] = [];
    let watching = false;

    page.on('request', (req) => {
      if (!/supabase\.co|\/rest\/v1\/|\/functions\/v1\//.test(req.url())) return;
      if (req.method() !== 'GET') mutations.push(`${req.method()} ${req.url()}`);
      if (watching) duringInteraction.push(`${req.method()} ${req.url()}`);
    });

    await page.goto('/meet');
    await page.waitForSelector('h1');
    // Let the chrome's own on-load reads settle before the window opens.
    await page.waitForLoadState('networkidle');

    watching = true;
    await selectStop(page, 2);
    await answerAndRate(page, 'in', 7);
    await startMeeting(page).click();
    await expect(page.getByTestId('accepted-marker')).toBeVisible();
    await endMeeting(page).click();
    await expect(page.getByTestId('accepted-marker')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    watching = false;

    expect(duringInteraction).toEqual([]);
    expect(mutations).toEqual([]);
  });

  test('no horizontal overflow at 320px, on the answer step AND the rating step', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/meet');
    await page.waitForSelector('h1');

    const overflows = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

    expect(await overflows()).toBe(false);
    await expect(optIn(page)).toBeInViewport();
    await expect(optOut(page)).toBeInViewport();

    // The 0-10 row is the widest thing this page renders — eleven targets across 320px.
    await optIn(page).click();
    await expect(page.getByText(/How much do you think you understand/)).toBeVisible();
    expect(await overflows()).toBe(false);
    await expect(ratingButton(page, 10)).toBeInViewport();

    await ratingButton(page, 10).click();
    await expect(startMeeting(page)).toBeInViewport();
    // Touch target minimum from the visual-QA checklist.
    const box = await startMeeting(page).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });
});
