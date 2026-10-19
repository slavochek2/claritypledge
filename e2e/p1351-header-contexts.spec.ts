/**
 * @file p1351-header-contexts.spec.ts
 * @description P1351 — the header's primary action follows context. Walks every header
 * context the spec names, at 320 / 375 / desktop, and asserts:
 *   - no "Start a Clarity Session" button in any header;
 *   - a labeled "Tools" trigger wherever the menu is enabled (product surface, or signed in);
 *   - "Today's event" (P1433: renamed) for a signed-in attendee on the event day, on every page
 *     except the one it links to (P1433 D1 — the event's own pages and room pages included);
 *   - P1433 D2: a signed-out visitor sees it, instead of the marketing CTA, only for a
 *     prep-enabled event inside its window;
 *   - at most one blue primary button in the header;
 *   - every header control on screen, and the Tools trigger unwrapped and >= 44px tall.
 * Set P1351_SHOTS=<dir> to also save a screenshot per context and width (for visual review).
 *
 * P1512: signed in, the header is no longer the top nav. A signed-in person gets the desktop
 * SIDEBAR (data-nav="sidebar") and, on a phone, the BOTTOM bar (data-nav="bottom") whose Me tab
 * opens a sheet carrying Tools; focus pages (room flow) keep the slim top nav below lg. The same
 * invariants are asserted on whichever of those is on screen — see checkSignedInChrome. Signed-out
 * chrome is unchanged and keeps its original checks.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

const WIDTHS = [
  { name: '320', width: 320, height: 568 },
  // 360: the most common Android width (Today's event is icon-only below 390, P1433).
  { name: '360', width: 360, height: 640 },
  { name: '375', width: 375, height: 667 },
  // 390 / 412: the common iPhone and Android widths, either side of the label breakpoint.
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const SHOTS = process.env.P1351_SHOTS;

/**
 * P1433 D2: a signed-out or non-registered visitor sees ANY prep-enabled event in its window, so
 * on the shared test DB another run's event (or a leftover demo) leaks into these assertions. Keep
 * the real query, but let only this run's own event through (none, when `slug` is null).
 */
async function isolatePublicEvents(page: Page, slug: string | null) {
  await page.route('**/rest/v1/events?*', async route => {
    if (!route.request().url().includes('preparation_enabled=eq.true')) return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: Array.isArray(body) ? body.filter((r: { slug?: string }) => r.slug === slug) : body });
  });
}

async function setViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  expect(await page.evaluate(() => window.innerWidth), `resize to ${width} did not take`).toBe(width);
}

/**
 * The avatar renders only once the profile resolves (the logged-out hamburger shares its name).
 * P1512: signed in it lives in whichever navigation is on screen — the sidebar's account row, the
 * bottom bar's Me tab, or the slim top nav on a phone focus page.
 */
async function expectSignedInAvatar(page: Page) {
  await expect(page.locator('nav[data-nav] [data-testid="gravatar-avatar-wrapper"]').filter({ visible: true }).first())
    .toBeVisible({ timeout: 20_000 });
}

/** Wait out the app splash and data loads so checks and screenshots see the settled page. */
async function settle(page: Page, signedIn: boolean) {
  await page.waitForLoadState('networkidle');
  if (signedIn) await expectSignedInAvatar(page);
  await page.waitForTimeout(400);
}

const SHELL_NAVS = 'nav[data-nav="sidebar"], nav[data-nav="bottom"], nav[data-nav="main"]';

/**
 * P1512: the signed-in counterpart of checkHeader — same invariants, measured on the navigation a
 * signed-in person actually has at this width (sidebar / bottom bar / slim top nav).
 *
 * Two deliberate differences from the header: Tools is a sidebar ROW on desktop (>= 40px tall, the
 * row height the shell uses) and a sheet ROW behind the Me tab on a phone bar (>= 44px); and the
 * bottom bar's tabs are flush by design, so the 4px-gap collision rule is not applied between them
 * (they still may not intersect).
 */
async function checkSignedInChrome(page: Page, ctx: string, w: (typeof WIDTHS)[number], expectTonight: boolean) {
  await settle(page, true);
  const label = `${ctx} @ ${w.name}`;
  const chrome = page.locator(SHELL_NAVS).filter({ visible: true });
  await expect(chrome.first(), `${label}: a signed-in navigation is on screen`).toBeVisible();
  await expect(chrome.getByText('Start a Clarity Session'), `${label}: no session button`).toHaveCount(0);
  await expect(chrome.getByText('Start a Session'), `${label}: no short session button`).toHaveCount(0);

  const desktop = w.width >= 1024;
  const onBottomBar = await page.locator('nav[data-nav="bottom"]').isVisible();
  const tools = page.getByTestId('event-links-button').filter({ visible: true });
  if (onBottomBar) {
    // Phone browse page: Tools is one tap behind Me, not loose on the bar.
    await expect(tools, `${label}: Tools is behind the Me tab, not on the bar`).toHaveCount(0);
    await page.getByTestId('bottom-nav-me').click();
    await expect(tools, `${label}: one visible Tools trigger in the Me sheet`).toHaveCount(1, { timeout: 20_000 });
    await expect(tools).toHaveText(/Tools/);
    const b = (await tools.boundingBox())!;
    expect(b.height, `${label}: Tools >= 44px`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${label}: Tools not wrapped`).toBeLessThanOrEqual(48);
    // The Me sheet is the portal sheet (Drawer forceSheet): its dismissal is a tap on the overlay —
    // that branch has no Escape handler — so close it the way a person does and check it went.
    await page.mouse.click(5, 5);
    await expect(page.getByTestId('me-sheet'), `${label}: Me sheet closed`).toHaveCount(0);
  } else {
    await expect(tools, `${label}: one visible Tools trigger`).toHaveCount(1, { timeout: 20_000 });
    await expect(tools).toHaveText(/Tools/);
    const b = (await tools.boundingBox())!;
    expect(b.height, `${label}: Tools >= ${desktop ? 40 : 44}px`).toBeGreaterThanOrEqual(desktop ? 40 : 44);
    expect(b.height, `${label}: Tools not wrapped`).toBeLessThanOrEqual(48);
  }

  const tonight = chrome.getByTestId('tonights-event-cta').filter({ visible: true });
  await expect(tonight, `${label}: Today's event`).toHaveCount(expectTonight ? 1 : 0, { timeout: 20_000 });

  // At most one blue primary in the navigation.
  const blue = await page.evaluate(sel => [...document.querySelectorAll(sel)]
    .flatMap(nav => [...nav.querySelectorAll('a, button')])
    .filter(n => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /bg-blue-500/.test(n.className.toString());
    }).length, SHELL_NAVS);
  expect(blue, `${label}: blue primaries in the navigation`).toBeLessThanOrEqual(1);

  // Every visible control is on screen and none overlap.
  const boxes = await page.evaluate(sel => [...document.querySelectorAll(sel)].flatMap(nav =>
    [...nav.querySelectorAll('a, button')].map(n => {
      const r = n.getBoundingClientRect();
      return { nav: nav.getAttribute('data-nav') ?? '', t: (n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 24), x: r.x, w: r.width, h: r.height, y: r.y };
    })).filter(b => b.w > 0 && b.h > 0), SHELL_NAVS);
  expect(boxes.length, `${label}: found navigation controls`).toBeGreaterThanOrEqual(2);
  for (const b of boxes) {
    expect(b.x, `${label}: "${b.t}" starts on screen`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, `${label}: "${b.t}" ends on screen`).toBeLessThanOrEqual(w.width + 0.5);
  }
  const inside = (p: typeof boxes[number], q: typeof boxes[number]) =>
    p.x <= q.x && p.y <= q.y && p.x + p.w >= q.x + q.w && p.y + p.h >= q.y + q.h;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!; const b = boxes[j]!;
    if (inside(a, b) || inside(b, a)) continue;
    const GAP = a.nav === 'bottom' && b.nav === 'bottom' ? 0 : 4;
    const sameRow = a.y < b.y + b.h && b.y < a.y + a.h;
    const collide = sameRow && a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP;
    expect(collide, `${label}: "${a.t}" collides with "${b.t}" (under ${GAP}px apart)`).toBe(false);
  }

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ctx}-${w.name}.png` });
}

async function checkHeader(page: Page, ctx: string, w: (typeof WIDTHS)[number], expectTools: boolean, expectTonight: boolean) {
  if (ctx.startsWith('loggedin')) return checkSignedInChrome(page, ctx, w, expectTonight);
  await settle(page, false);
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
  await expect(tonight, `${label}: Today's event`).toHaveCount(expectTonight ? 1 : 0, { timeout: 20_000 });

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
    // Two hours from now, in a fixed-offset zone where it is around noon, so "today in the event's
    // zone" holds at any hour the suite runs (in UTC it failed after 22:00 — P1434 review, Codex).
    // IANA's Etc/GMT sign is inverted: Etc/GMT-5 is UTC+5.
    const offset = Math.max(-12, Math.min(14, 12 - new Date().getUTCHours()));
    const timezone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
    event = await createTestEvent(attendee.user.id, new Date(Date.now() + 2 * 3600 * 1000), {
      title: 'P1351 E2E Night', timezone,
    });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  test('logged out: public page has no Tools; product page has a labeled Tools', async ({ page }) => {
    await isolatePublicEvents(page, event.slug);
    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);
      await page.goto('/manifesto');
      await checkHeader(page, 'loggedout-public', w, false, false);
      await page.goto('/feed');
      await checkHeader(page, 'loggedout-product', w, true, false);
    }
  });

  test('signed in on the event day: Today\'s event everywhere except the page it links to (P1433)', async ({ page }) => {
    await isolatePublicEvents(page, event.slug);
    await setTestSession(page, attendee.email);
    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);
      await page.goto('/feed');
      await expectSignedInAvatar(page);
      await checkHeader(page, 'loggedin-event-feed', w, true, true);
      await page.goto('/pricing');
      // Not on pricing: the page's own paid offer is the only blue primary there (P1087).
      await checkHeader(page, 'loggedin-event-pricing', w, true, false);
      // Two hours out, preparation off: the button links to the event page, so it hides there
      // and shows everywhere else in the event, the room flow included (P1433 D1).
      await page.goto(`/events/${event.slug}`);
      await checkHeader(page, 'loggedin-event-detail', w, true, false);
      await page.goto(`/events/${event.slug}/room`);
      await checkHeader(page, 'loggedin-event-room', w, true, true);
    }
    await setViewport(page, 375, 667);
    await page.goto('/feed');
    // Wait for the SIGNED-IN chrome (Today's event renders only then — on a phone it is the strip on
    // the bottom bar) and for the sheet's slide-up to finish. P1512: Tools is behind the Me tab.
    await expect(page.getByTestId('tonights-event-cta').filter({ visible: true })).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('bottom-nav-me').click();
    await page.getByTestId('event-links-button').filter({ visible: true }).click();
    await expect(page.getByTestId('event-links-entry').first()).toHaveText('Learn the Clarity process'); // P1402: first Tools entry
    await page.waitForTimeout(600); // drawer animation — screenshot only, no assertion depends on it
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/loggedin-tools-open-375.png` });
    await page.keyboard.press('Escape');
    await setViewport(page, 1280, 800);
    const tonight = page.getByTestId('tonights-event-cta').filter({ visible: true });
    await page.goto('/feed');
    await tonight.click();
    // P1428: two hours out and no preparation — not yet the room's time, so the event page.
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`));

    // P1428: a Clarity Night (preparation on) starting in 30 minutes — the room's arrival window is
    // open, so the button opens the room flow. A fresh load drops the hook's 5-minute cache.
    const { error } = await supabaseAdmin.from('events')
      .update({ preparation_enabled: true, datetime: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
      .eq('id', event.id);
    expect(error).toBeNull();
    await page.goto('/feed');
    await tonight.click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/(room|ready|meet|prepare|arriving)`));
  });

  test('P1433 D2: signed out — Today\'s event replaces the marketing CTA only in a prep-enabled window', async ({ page }) => {
    await isolatePublicEvents(page, event.slug);
    // In its window: a prep-enabled event starting in 30 minutes.
    const { error } = await supabaseAdmin.from('events')
      .update({ preparation_enabled: true, datetime: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
      .eq('id', event.id);
    expect(error).toBeNull();
    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);
      await page.goto('/manifesto');
      await checkHeader(page, 'loggedout-window-public', w, false, true);
      const cta = page.getByTestId('tonights-event-cta').filter({ visible: true });
      await expect(cta).toHaveAttribute('href', `/events/${event.slug}/room`);
      await expect(page.getByTitle('Book a 15-min discovery call').filter({ visible: true })).toHaveCount(0);
    }
    // Control: preparation off — a visitor does not see it (registered-only).
    const off = await supabaseAdmin.from('events').update({ preparation_enabled: false }).eq('id', event.id);
    expect(off.error).toBeNull();
    await setViewport(page, 1280, 800);
    await page.goto('/manifesto');
    await checkHeader(page, 'loggedout-prepoff-public', WIDTHS.find(w => w.name === 'desktop')!, false, false);
  });
});

test.describe('P1351 — signed in, no event', () => {
  test.setTimeout(180_000);
  let user: TestUser;
  test.beforeAll(async () => { user = await createTestUser({ name: 'P1351 Plain' }); });
  test.afterAll(async () => { if (user?.user?.id) await deleteTestUser(user.user.id); });

  test('Tools on product AND public pages; no blue primary; Tools reaches /live', async ({ page }) => {
    await isolatePublicEvents(page, null);
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
    await expect(page.getByTestId('event-links-entry').first()).toHaveText('Learn the Clarity process'); // P1402: first Tools entry
    await page.getByTestId('event-links-entry').filter({ hasText: 'Start a Clarity Session' }).click();
    await expect(page).toHaveURL(/\/live/);
  });
});
