/**
 * @file p1114-gate.spec.ts
 * @description P1114 revision 2 — the registration gate, end to end.
 *
 * WHY THIS FILE EXISTS: revision 2 replaced "anyone with the link can put a name on the
 * wall" with "registered for this event AND signed in". That is a trust boundary, and the
 * composition tests in src/tests/ read source — they cannot prove a real browser is turned
 * away. This file does.
 *
 * TEST-ID CONTRACT this file requires (none exist yet — written before the build, same TDD
 * convention as e2e/integration/p1114-*.spec.ts):
 *   - `room-gate`            — the gate screen's root container
 *   - `room-gate-register`   — the "Register for this event" action
 *   - `room-gate-signin`     — the "Sign in" action
 *   - `room-ready`           — the room's readiness page root
 *   - `room-meet`            — the room's principle page root
 *
 * Gate 7b note: this file exercises the gate from the OUTSIDE only — an unauthenticated
 * browser and a signed-in-but-unregistered browser. It cannot prove the database would
 * refuse a hand-rolled request; that is what src/tests/p1114-no-anon-surface.test.ts and
 * the integration specs cover. Neither file alone is the whole boundary.
 */
import { test, expect } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';

const GATE_HEADING = 'This is for people coming to the event';
const GATE_BODY =
  'Register for the event to see the Clarity Meeting Principle and who has opted in.';

/** Seeded by the build's own fixture helper; the slug is read from it at run time so this
 *  file never hardcodes an event that a later migration renames. */
const EVENT_SLUG = process.env.P1114_TEST_EVENT_SLUG ?? 'p1114-gate-fixture';

test.describe('P1114 rev2: the registration gate', () => {
  test('a signed-out visitor sees the gate and nothing about the room', async ({ page }) => {
    await page.goto(`/events/${EVENT_SLUG}/room`);

    await expect(page.getByTestId('room-gate')).toBeVisible();
    await expect(page.getByText(GATE_HEADING)).toBeVisible();
    await expect(page.getByText(GATE_BODY)).toBeVisible();
    await expect(page.getByTestId('room-gate-register')).toBeVisible();
    await expect(page.getByTestId('room-gate-signin')).toBeVisible();

    // "Learns nothing else about the room" — an acceptance criterion, asserted literally.
    await expect(page.getByTestId('room-roster')).toHaveCount(0);
    await expect(page.getByText('Who opted in')).toHaveCount(0);
    await expect(page.getByText('Clarity Meeting Principle')).toHaveCount(0);
    await expect(page.getByRole('slider')).toHaveCount(0);
  });

  test('the gate is the same wall on the readiness and principle routes', async ({ page }) => {
    for (const route of ['ready', 'meet']) {
      await page.goto(`/events/${EVENT_SLUG}/${route}`);
      await expect(
        page.getByTestId('room-gate'),
        `/events/:slug/${route} did not gate a signed-out visitor. Every door into the room is gated, not just /room — otherwise the gate is decoration.`,
      ).toBeVisible();
    }
  });

  test('"Register for this event" goes to the event page, not a second RSVP path', async ({ page }) => {
    await page.goto(`/events/${EVENT_SLUG}/room`);
    await page.getByTestId('room-gate-register').click();
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_SLUG}(\\?|$|#)`));
  });

  test('a signed-in but unregistered person still sees the gate', async ({ browser }) => {
    const { page, cleanup } = await getTestAuthContext('guest', browser, { name: 'P1114 Unregistered' });
    try {
      await page.goto(`/events/${EVENT_SLUG}/room`);
      await expect(
        page.getByTestId('room-gate'),
        'A signed-in person who never registered for this event reached the room. Registration is the gate, not merely having an account — event_rsvps is what the gate reads.',
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('no room page ever renders a guest-join name field', async ({ page }) => {
    for (const route of ['room', 'ready', 'meet']) {
      await page.goto(`/events/${EVENT_SLUG}/${route}`);
      await expect(
        page.getByText('What should we call you?'),
        `/events/:slug/${route} still offers name-only entry. The guest door was removed from the room in revision 2; that form belongs to /live now.`,
      ).toHaveCount(0);
    }
  });

  test('neither room page renders the marketing footer', async ({ page }) => {
    for (const route of ['ready', 'meet']) {
      await page.goto(`/events/${EVENT_SLUG}/${route}`);
      await expect(
        page.getByText('Open Source (AGPL-3.0)'),
        `/events/:slug/${route} renders the site footer. The founder annotated "hide footer"; both pages mount under the compact layout, as the shipped /ready and /meet already do.`,
      ).toHaveCount(0);
    }
  });
});
