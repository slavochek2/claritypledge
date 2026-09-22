/**
 * @file p1351-header-contexts.spec.ts
 * @description P1351 — the header's primary action follows context. Walks every header
 * context the spec names, at 320 / 375 / desktop, and asserts:
 *   - no "Start a Clarity Session" button in any header;
 *   - a labeled "Tools" trigger wherever the menu is enabled (product surface, or signed in);
 *   - "Tonight's event" only for a signed-in attendee on the event day, never on that event's
 *     own pages;
 *   - at most one blue primary button in the header;
 *   - every header control on screen, and the Tools trigger unwrapped and >= 44px tall.
 * Set P1351_SHOTS=<dir> to also save a screenshot per context and width (for visual review).
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

const WIDTHS = [
  { name: '320', width: 320, height: 568 },
  // 360: the most common Android width, and the breakpoint where Tonight's event gains its label.
  { name: '360', width: 360, height: 640 },
  { name: '375', width: 375, height: 667 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const SHOTS = process.env.P1351_SHOTS;

async function setViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  expect(await page.evaluate(() => window.innerWidth), `resize to ${width} did not take`).toBe(width);
}

/** Wait out the app splash and data loads so checks and screenshots see the settled page. */
async function settle(page: Page, signedIn: boolean) {
  await page.waitForLoadState('networkidle');
  if (signedIn) {
    // The avatar renders only once the profile resolves (the logged-out hamburger shares its name).
    await expect(page.locator('nav[data-nav="main"] [data-testid="gravatar-avatar-wrapper"]').filter({ visible: true }).first())
      .toBeVisible({ timeout: 20_000 });
  }
  await page.waitForTimeout(400);
}

async function checkHeader(page: Page, ctx: string, w: (typeof WIDTHS)[number], expectTools: boolean, expectTonight: boolean) {
  await settle(page, ctx.startsWith('loggedin'));
  const nav = page.locator('nav[data-nav="main"]');
  const label = `${ctx} @ ${w.name}`;
  await expect(nav.getByText('Start a Clarity Session'), `${label}: no session button`).toHaveCount(0);
  await expect(nav.getByText('Start a Session'), `${label}: no short session button`).toHaveCount(0);

  const tools = page.getByTestId('event-links-button').filter({ visible: true });
  if (expectTools) {
    await expect(tools, `${label}: one visible Tools trigger`).toHaveCount(1, { timeout: 20_000 });
    await expect(tools).toHaveText(/Tools/);
    const b = (await tools.boundingBox())!;
    expect(b.height, `${label}: Tools >= 44px`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${label}: Tools not wrapped`).toBeLessThanOrEqual(48);
  } else {
    await expect(tools, `${label}: no Tools trigger`).toHaveCount(0);
  }

  const tonight = nav.getByTestId('tonights-event-cta').filter({ visible: true });
  await expect(tonight, `${label}: Tonight's event`).toHaveCount(expectTonight ? 1 : 0, { timeout: 20_000 });

  // At most one blue primary in the header.
  const blue = await nav.evaluate(el => [...el.querySelectorAll('a, button')].filter(n => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && /bg-blue-500/.test(n.className.toString());
  }).length);
  expect(blue, `${label}: blue primaries in header`).toBeLessThanOrEqual(1);

  // Every visible header control is on screen.
  const boxes = await nav.evaluate(el => [...el.querySelectorAll('a, button')]
    .map(n => { const r = n.getBoundingClientRect(); return { t: (n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 24), x: r.x, w: r.width, h: r.height, y: r.y }; })
    .filter(b => b.w > 0 && b.h > 0 && b.y < 90));
  for (const b of boxes) {
    expect(b.x, `${label}: "${b.t}" starts on screen`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, `${label}: "${b.t}" ends on screen`).toBeLessThanOrEqual(w.width + 0.5);
  }
  // No two header controls overlap (visual QA caught "Tonight's event" over the logo at 375;
  // the on-screen check above passed it). Nested controls share a box and are skipped.
  const inside = (p: typeof boxes[number], q: typeof boxes[number]) =>
    p.x <= q.x && p.y <= q.y && p.x + p.w >= q.x + q.w && p.y + p.h >= q.y + q.h;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!; const b = boxes[j]!;
    if (inside(a, b) || inside(b, a)) continue;
    // Collision = overlapping OR closer than a 4px gap on the same row. Strict overlap alone was
    // blind: at 375 the full label left the button touching the logo (logo box ends at x=40, button
    // starts at x=40), which reads as the logo being covered, and a pure-overlap test passed it.
    const GAP = 4;
    const sameRow = a.y < b.y + b.h && b.y < a.y + a.h;
    const collide = sameRow && a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP;
    expect(collide, `${label}: "${a.t}" collides with "${b.t}" (under ${GAP}px apart)`).toBe(false);
  }

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ctx}-${w.name}.png` });
}

test.describe('P1351 — header primary action across contexts', () => {
  test.setTimeout(180_000);

  let attendee: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    attendee = await createTestUser({ name: 'P1351 Attendee' });
    // Two hours from now, in UTC, so "today in the event's zone" is unambiguous for the run.
    event = await createTestEvent(attendee.user.id, new Date(Date.now() + 2 * 3600 * 1000), {
      title: 'P1351 E2E Night', timezone: 'UTC',
    });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  test('logged out: public page has no Tools; product page has a labeled Tools', async ({ page }) => {
    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);
      await page.goto('/manifesto');
      await checkHeader(page, 'loggedout-public', w, false, false);
      await page.goto('/feed');
      await checkHeader(page, 'loggedout-product', w, true, false);
    }
  });

  test('signed in on the event day: Tonight\'s event everywhere except that event\'s own pages', async ({ page }) => {
    await setTestSession(page, attendee.email);
    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);
      await page.goto('/feed');
      await expect(page.getByRole('button', { name: /open menu|menu/i }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
      await checkHeader(page, 'loggedin-event-feed', w, true, true);
      await page.goto('/pricing');
      // Not on pricing: the page's own paid offer is the only blue primary there (P1087).
      await checkHeader(page, 'loggedin-event-pricing', w, true, false);
      await page.goto(`/events/${event.slug}`);
      await checkHeader(page, 'loggedin-event-detail', w, true, false);
      await page.goto(`/events/${event.slug}/room`);
      await checkHeader(page, 'loggedin-event-room', w, true, false);
    }
    await setViewport(page, 375, 667);
    await page.goto('/feed');
    // Wait for the SIGNED-IN header (Tonight's event renders only then — the logged-out
    // hamburger is also named "Open menu") and for the sheet's slide-up to finish.
    await expect(page.getByTestId('tonights-event-cta').filter({ visible: true })).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('event-links-button').filter({ visible: true }).click();
    await expect(page.getByTestId('event-links-entry').first()).toHaveText('Ready');
    await page.waitForTimeout(600); // drawer animation — screenshot only, no assertion depends on it
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/loggedin-tools-open-375.png` });
    await page.keyboard.press('Escape');
    await setViewport(page, 1280, 800);
    const tonight = page.getByTestId('tonights-event-cta').filter({ visible: true });
    await page.goto('/feed');
    await tonight.click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`));
  });
});

test.describe('P1351 — signed in, no event', () => {
  test.setTimeout(180_000);
  let user: TestUser;
  test.beforeAll(async () => { user = await createTestUser({ name: 'P1351 Plain' }); });
  test.afterAll(async () => { if (user?.user?.id) await deleteTestUser(user.user.id); });

  test('Tools on product AND public pages; no blue primary; Tools reaches /live', async ({ page }) => {
    await setTestSession(page, user.email);
    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);
      for (const [ctx, path] of [['loggedin-feed', '/feed'], ['loggedin-pricing', '/pricing'], ['loggedin-groups', '/groups']] as const) {
        await page.goto(path);
        await checkHeader(page, ctx, w, true, false);
      }
    }
    await page.goto('/pricing');
    await settle(page, true);
    await page.getByTestId('event-links-button').filter({ visible: true }).click();
    await expect(page.getByTestId('event-links-entry').first()).toBeVisible();
    await page.waitForTimeout(600); // dropdown fade-in — screenshot only
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/loggedin-tools-open-desktop.png` });
    await expect(page.getByTestId('event-links-entry').first()).toHaveText('Ready');
    await page.getByTestId('event-links-entry').filter({ hasText: 'Start a Clarity Session' }).click();
    await expect(page).toHaveURL(/\/live/);
  });
});
