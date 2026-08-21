/**
 * @file p1114-gate.spec.ts
 * @description P1114 revision 2 — the registration gate, end to end.
 *
 * WHY THIS FILE EXISTS: revision 2 replaced "anyone with the link can put a name on the
 * wall" with "registered for this event AND signed in". That is a trust boundary, and the
 * composition tests in src/tests/ read source — they cannot prove a real browser is turned
 * away. This file does.
 *
 * TEST-ID CONTRACT: `room-gate`, `room-gate-register`, `room-gate-signin` (the wall);
 * `room-ready` (readiness page root); `room-meet` (principle page root).
 *
 * Gate 7b note: this file exercises the gate from the OUTSIDE only — an unauthenticated
 * browser and a signed-in-but-unregistered browser. It cannot prove the database would
 * refuse a hand-rolled request; that is what src/tests/p1114-no-anon-surface.test.ts and
 * e2e/integration/p1114-room-rpcs.spec.ts cover. Neither file alone is the whole boundary.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

const GATE_HEADING = 'This is for people coming to the event';
const GATE_BODY =
  'Register for the event to see the Clarity Meeting Principle and who has opted in.';

test.describe('P1114 rev2: the registration gate', () => {
  let event: TestEvent;
  let host: TestUser;
  let registered: TestUser;
  let unregistered: TestUser;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 Gate Host' });
    event = await createTestEvent(host.user.id, new Date());
    registered = await createTestUser({ email: generateTestEmail(), name: 'P1114 Gate Registered' });
    unregistered = await createTestUser({ email: generateTestEmail(), name: 'P1114 Gate Unregistered' });
    await rsvpToEvent(event.id, registered.user.id);
  });

  test.afterAll(async () => {
    await deleteTestEvent(event.id);
    await deleteTestUser(host.user.id);
    await deleteTestUser(registered.user.id);
    await deleteTestUser(unregistered.user.id);
  });

  test('a signed-out visitor sees the gate and nothing about the room', async ({ page }) => {
    await page.goto(`/events/${event.slug}/room`);

    await expect(page.getByTestId('room-gate')).toBeVisible();
    await expect(page.getByText(GATE_HEADING)).toBeVisible();
    await expect(page.getByText(GATE_BODY)).toBeVisible();
    await expect(page.getByTestId('room-gate-register')).toBeVisible();
    await expect(page.getByTestId('room-gate-signin')).toBeVisible();

    // "Learns nothing else about the room" — an acceptance criterion, asserted literally.
    // Not a bare page.getByText('Clarity Meeting Principle') — the approved GATE_BODY
    // copy above legitimately contains that phrase ("...to see the Clarity Meeting
    // Principle..."); a substring match on it would contradict the copy the gate is
    // required to show. Scoped to an actual heading instead, which is what the real
    // principle page renders and the gate must not.
    await expect(page.getByTestId('room-roster')).toHaveCount(0);
    // REVISED 2026-08-21: the roster now groups into three named sections (Opted in /
    // Opted out / Undecided) rather than one "Who opted in" heading — check the group
    // testid rather than a heading string that no longer exists anywhere in the app.
    await expect(page.getByTestId('room-roster-undecided')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Clarity Meeting Principle' })).toHaveCount(0);
    await expect(page.getByRole('slider')).toHaveCount(0);
  });

  test('the gate is the same wall on the readiness and principle routes', async ({ page }) => {
    for (const route of ['ready', 'meet']) {
      await page.goto(`/events/${event.slug}/${route}`);
      await expect(
        page.getByTestId('room-gate'),
        `/events/:slug/${route} did not gate a signed-out visitor. Every door into the room is gated, not just /room — otherwise the gate is decoration.`,
      ).toBeVisible();
    }
  });

  test('"Register for this event" goes to the event page, not a second RSVP path', async ({ page }) => {
    await page.goto(`/events/${event.slug}/room`);
    await page.getByTestId('room-gate-register').click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}(\\?|$|#)`));
  });

  test('a signed-in but unregistered person still sees the gate', async ({ page }) => {
    await setTestSession(page, unregistered.email);
    await page.goto(`/events/${event.slug}/room`);
    await expect(
      page.getByTestId('room-gate'),
      'A signed-in person who never registered for this event reached the room. Registration is the gate, not merely having an account — event_rsvps is what the gate reads.',
    ).toBeVisible();
  });

  test('no room page ever renders a guest-join name field', async ({ page }) => {
    for (const route of ['room', 'ready', 'meet']) {
      await page.goto(`/events/${event.slug}/${route}`);
      await expect(
        page.getByText('What should we call you?'),
        `/events/:slug/${route} still offers name-only entry. The guest door was removed from the room in revision 2; that form belongs to /live now.`,
      ).toHaveCount(0);
    }
  });

  test('neither room page renders the marketing footer', async ({ page }) => {
    for (const route of ['ready', 'meet']) {
      await page.goto(`/events/${event.slug}/${route}`);
      await expect(
        page.getByText('Open Source (AGPL-3.0)'),
        `/events/:slug/${route} renders the site footer. The founder annotated "hide footer"; both pages mount under the compact layout, as the shipped /ready and /meet already do.`,
      ).toHaveCount(0);
    }
  });

  test('a registered, signed-in person passes the gate and lands on readiness with no name field', async ({ page }) => {
    await setTestSession(page, registered.email);
    await page.goto(`/events/${event.slug}/room`);
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/ready$`));
    await expect(page.getByTestId('room-ready')).toBeVisible();
    await expect(page.getByTestId('room-gate')).toHaveCount(0);
    await expect(page.getByText('What should we call you?')).toHaveCount(0);
  });

  test('a registered, signed-in person can reach the principle page directly', async ({ page }) => {
    await setTestSession(page, registered.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('room-meet')).toBeVisible();
    await expect(page.getByTestId('room-gate')).toHaveCount(0);
  });

  test('the event host reaches the room without registering', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/room`);
    await expect(
      page.getByTestId('room-gate'),
      "The event's own host was gated out of their own room's readiness/principle flow — an organizer is registered for their own event by definition, not by an event_rsvps row.",
    ).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/ready$`));
  });

  test('a signed-in but unregistered person sees no Sign in control on the gate', async ({ page }) => {
    await setTestSession(page, unregistered.email);
    await page.goto(`/events/${event.slug}/room`);
    await expect(page.getByTestId('room-gate-register')).toBeVisible();
    await expect(
      page.getByTestId('room-gate-signin'),
      'A person already signed in was offered a Sign in control on the gate — dead and confusing for someone who already has a live session.',
    ).toHaveCount(0);
  });

});
