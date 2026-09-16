/**
 * @file p1323-links-menu-surfaces.spec.ts
 * @description P1323 — the acceptance criteria that jsdom CANNOT see, run in a real browser
 * against a real signed-in user with a real capture running.
 *
 * Why this file exists at all: the unit suites prove the menu's contents and its mount rule,
 * but three P1323 failure modes live only in layout and in live state:
 *   - AC-9: deleting the room page's bar slot does not remove the bar — an app-wide fallback
 *     re-draws it as a `sticky top-0` overlay. jsdom does not lay out `position: sticky`, so
 *     only a browser with a capture ACTUALLY RUNNING can tell "no bar" from "bar moved".
 *   - AC-2: the trigger adopted into /transcribe/:code's own header must not overlap the logo
 *     or End Session at 320px, and exactly one trigger may be VISIBLE at each width.
 *   - AC-11c: a HOST who starts from the /live lobby never gets a /live/:code URL — the view
 *     changes in state — so a URL-only check would pass while the host keeps the menu.
 *
 * Every viewport is CONFIRMED via window.innerWidth before measuring (.claude/rules/browser.md:
 * a resize can silently no-op, and a 320px assertion taken at 375px passes for the wrong reason).
 *
 * Microphone: fake media device flags, as e2e/p1307-event-transcription.spec.ts does.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

const WIDTHS = [
  { name: '320', width: 320, height: 568 },
  { name: '375', width: 375, height: 667 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

async function setViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const actual = await page.evaluate(() => window.innerWidth);
  expect(actual, `viewport did not take the resize — measured at ${actual}px, not ${width}px`).toBe(width);
}

/** Only triggers a person can actually see. One is CSS-hidden per breakpoint by design. */
function visibleLinksTriggers(page: Page): Locator {
  return page.getByTestId('event-links-button').filter({ visible: true });
}

function overlaps(a: { x: number; y: number; width: number; height: number },
                  b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe('P1323 — the Links menu across surfaces, with live state', () => {
  test.setTimeout(90_000);

  let attendee: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    attendee = await createTestUser({ name: 'P1323 E2E Attendee' });
    event = await createTestEvent(attendee.user.id, new Date(), { title: 'P1323 E2E Event' });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterEach(async () => {
    try {
      const { data: members } = await supabaseAdmin
        .from('transcribe_room_members').select('room_id').eq('profile_id', attendee.user.id);
      for (const m of members ?? []) {
        await supabaseAdmin.from('transcribe_rooms').delete().eq('id', m.room_id);
      }
    } catch {
      // Best-effort: a test that failed before creating a room has nothing to delete.
    }
    if (event?.id) await deleteTestEvent(event.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  /** Same path as P1307's reachCapturing: ready switch on → Continue → the bar shows. */
  async function reachCapturing(page: Page) {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByTestId('room-capture-bar')).toBeVisible({ timeout: 20_000 });
  }

  test('AC-9 + AC-2 + AC-12: the running room has one End, no bar, the indicator, and one adopted trigger', async ({ page }) => {
    await reachCapturing(page);
    const navs: string[] = [];
    page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname); });
    await page.getByTestId('room-capture-bar-open').click();
    await expect(page).toHaveURL(/\/transcribe\//, { timeout: 15_000 });
    try {
      await expect(page.getByTestId('transcribe-room-screen')).toBeVisible({ timeout: 20_000 });
    } catch (err) {
      // Diagnostic kept deliberately: this step failed once in the first run with a /meet frame on
      // screen, and passed on the next. Without the navigation sequence a recurrence is unreadable.
       
      console.log('P1323-NAVS', JSON.stringify(navs), 'FINAL', new URL(page.url()).pathname,
        'SCREENS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-testid^="transcribe-"]')].map(e => e.getAttribute('data-testid')))));
      throw err;
    }

    for (const w of WIDTHS) {
      await setViewport(page, w.width, w.height);

      // AC-9 — the failure mode R6 names: NOT in flow and NOT as a sticky overlay.
      await expect(page.getByTestId('room-capture-bar'), `${w.name}: the session bar must not render on the room page`).toHaveCount(0);
      await expect(page.getByTestId('room-capture-bar-open'), `${w.name}: no "Open" pointing at this page`).toHaveCount(0);
      await expect(page.getByTestId('transcribe-listening-indicator'), `${w.name}: D9 indicator must be on screen`).toBeVisible();
      const ends = page.getByRole('button', { name: /end session/i }).filter({ visible: true });
      await expect(ends, `${w.name}: exactly one End control`).toHaveCount(1);

      // AC-2 — exactly one VISIBLE trigger, inside the page's own header, overlapping nothing.
      const triggers = visibleLinksTriggers(page);
      await expect(triggers, `${w.name}: exactly one visible Links trigger`).toHaveCount(1);
      const trigger = await triggers.first().boundingBox();
      const end = await ends.first().boundingBox();
      const logo = await page.getByTestId('transcribe-room-screen').locator('svg').first().boundingBox();
      expect(trigger, `${w.name}: trigger has a box`).not.toBeNull();
      expect(trigger!.x + trigger!.width, `${w.name}: trigger inside the viewport`).toBeLessThanOrEqual(w.width);
      expect(overlaps(trigger!, end!), `${w.name}: trigger overlaps End Session`).toBe(false);
      if (logo) expect(overlaps(trigger!, logo), `${w.name}: trigger overlaps the logo`).toBe(false);

      // AC-12 — the End control is neutral at rest, not destructive-red.
      const color = await ends.first().evaluate(el => getComputedStyle(el).color);
      const destructive = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.className = 'text-destructive';
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(color, `${w.name}: End Session must not be red at rest`).not.toBe(destructive);
    }

    // The adopted trigger actually opens the panel from inside the room.
    await setViewport(page, 320, 568);
    await visibleLinksTriggers(page).first().click();
    await expect(page.getByTestId('event-links-menu')).toBeVisible();
    await expect(page.getByTestId('event-links-menu')).toHaveAttribute('data-shape', 'sheet');
  });

  test('AC-10 + AC-12: on /feed while capturing, the bar keeps Open and End, and End is not red at rest', async ({ page }) => {
    await reachCapturing(page);
    await page.goto('/feed');
    const bar = page.getByTestId('room-capture-bar');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('room-capture-bar-open')).toBeVisible();
    const end = page.getByTestId('room-capture-bar-end');
    await expect(end).toBeVisible();
    await expect(end).not.toHaveClass(/(^|\s)text-destructive(\s|$)/);
    // And the product index is reachable here too (R2).
    await expect(visibleLinksTriggers(page)).toHaveCount(1);
  });

  test('AC-15: from /feed a letter opens in a NEW tab, the room keeps recording, and the menu stays reachable', async ({ page, context }) => {
    await reachCapturing(page);
    await page.goto('/feed');
    await expect(page.getByTestId('room-capture-bar')).toBeVisible({ timeout: 15_000 });
    await setViewport(page, 1280, 800);

    await visibleLinksTriggers(page).first().click();
    await page.getByTestId('event-links-tab-letters').click();
    const popupPromise = context.waitForEvent('page');
    await page.getByTestId('event-links-entry').first().click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/letter\//, { timeout: 15_000 });

    // The ORIGINAL tab: still on /feed, still recording, menu still there.
    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByTestId('room-capture-bar'), 'capture must not pause when a letter opens').toBeVisible();
    await expect(page.getByTestId('event-links-menu'), 'the dropdown closes after opening a letter').toHaveCount(0);
    await expect(visibleLinksTriggers(page)).toHaveCount(1);
    await popup.close();
  });

  test('AC-11c: the /live lobby keeps the menu; a /live/:code link and a HOST-started session decline it', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');

    await page.goto('/live');
    await expect(visibleLinksTriggers(page), 'the lobby keeps the menu').toHaveCount(1, { timeout: 15_000 });

    await page.goto('/live/ABCDEF');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('event-links-button'), '/live/:code declines — no trigger anywhere').toHaveCount(0);

    // The case a URL-only check misses: start from the lobby. The URL stays /live.
    await page.goto('/live');
    await expect(visibleLinksTriggers(page)).toHaveCount(1, { timeout: 15_000 });
    const newSession = page.getByRole('button', { name: /new session/i });
    await expect(newSession, 'the lobby must offer New session for this test to mean anything').toBeEnabled({ timeout: 15_000 });
    await newSession.click();
    await expect(page, 'a host-started session stays on /live — which is exactly why the URL cannot be the test').toHaveURL(/\/live\/?$/, { timeout: 15_000 });
    await expect(page.getByTestId('event-links-button'), 'inside a host-started session the trigger is declined').toHaveCount(0, { timeout: 15_000 });
  });

  test('AC-1 + AC-17: a bare /stake/:tag carries the menu, signed OUT, at desktop width, non-compact routes too', async ({ page }) => {
    // Signed out on purpose: the signed-out desktop non-compact nav branch had no trigger at all.
    await setViewport(page, 1280, 800);
    await page.goto('/stake/understanding');
    await expect(visibleLinksTriggers(page), 'bare /stake/:tag, signed out').toHaveCount(1, { timeout: 15_000 });

    // /feed is NOT compact — this is the branch that had no button.
    await page.goto('/feed');
    await expect(visibleLinksTriggers(page), '/feed, signed out, desktop, non-compact').toHaveCount(1, { timeout: 15_000 });

    // Control: a public page must still have none, or the two assertions above prove nothing.
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('event-links-button'), 'a public page has no trigger').toHaveCount(0);
  });
});
