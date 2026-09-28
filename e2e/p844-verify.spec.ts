import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

// Upcoming event, not hosted by the test user. Created per run: a hardcoded test-DB slug
// silently turned every UAT here into an "Event Ended" page once its date passed (P1365).
let EVENT_URL = '';
const EVENTS_LIST_URL = `/events`;

test.describe('P844 — Reduce RSVP Friction', () => {
  let testUserId: string;
  let testUserEmail: string;
  let fixtureHostId: string;
  let fixtureEvent: TestEvent;

  test.beforeAll(async () => {
    const { user, email } = await createTestUser({ prefix: 'test-p844' });
    testUserId = user.id;
    testUserEmail = email;
    const host = await createTestUser({ prefix: 'test-p844-host' });
    fixtureHostId = host.user.id;
    fixtureEvent = await createTestEvent(fixtureHostId, new Date(Date.now() + 7 * 24 * 3600 * 1000), {
      title: 'P844 fixture event',
    });
    EVENT_URL = `/events/${fixtureEvent.slug}`;
  });

  test.afterAll(async () => {
    await deleteTestEvent(fixtureEvent.id);
    await deleteTestUser(fixtureHostId);
    await deleteTestUser(testUserId);
  });

  test('UAT-1: Logged-out visitor sees "Reserve a seat" button label', async ({ page }) => {
    await page.goto(EVENT_URL);
    await expect(page.getByRole('button', { name: 'Reserve a seat' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Sign up to join' })).not.toBeVisible();
  });

  test('UAT-3: Header CTA hidden on /events/:slug', async ({ page }) => {
    await page.goto(EVENT_URL);
    await expect(page.getByRole('link', { name: 'Start a Clarity Session' })).not.toBeVisible({ timeout: 10000 });
  });

  // P1351: the header "Start a Clarity Session" button is retired everywhere; the product's
  // navigation affordance on this page is now the labeled Tools trigger.
  test('UAT-4: Tools trigger visible on /events list page (no regression)', async ({ page }) => {
    await page.goto(EVENTS_LIST_URL);
    await expect(page.getByTestId('event-links-button').filter({ visible: true }).first()).toHaveText(/Tools/, { timeout: 10000 });
  });

  // UAT-5/UAT-6 retargeted to /meet — P1114 round 4 moved Practice Rooms off the event
  // Details page (EVENT_URL) entirely, under the room roster on /meet. The old assertion
  // "not visible on the event page" is vacuous now: it is never on that page for ANY
  // visitor, logged in or not. `/meet` gates on registration (or host), not just
  // sign-in, so each test needs its own registered/unregistered fixture rather than the
  // shared `testUserId` (kept deliberately unregistered, for UAT-2).
  test('UAT-5: Practice Rooms card hidden for logged-out visitors on /meet', async ({ page }) => {
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;
    try {
      host = await createTestUser({ name: 'P844 UAT-5 Host' });
      event = await createTestEvent(host.user.id, undefined, { title: 'P844 UAT-5 Event' });
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Open a room')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Clarity Practice Rooms')).not.toBeVisible();
    } finally {
      if (event) await deleteTestEvent(event.id);
      if (host) await deleteTestUser(host.user.id);
    }
  });

  test('UAT-2: Logged-in non-attendee sees "Reserve a seat"', async ({ page }) => {
    await setTestSession(page, testUserEmail);
    await page.goto(EVENT_URL);
    await expect(page.getByRole('button', { name: 'Reserve a seat' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: "I'm going" })).not.toBeVisible();
  });

  test('UAT-6: Practice Rooms card visible on /meet for a logged-in, registered attendee (no regression)', async ({ page }) => {
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;
    try {
      host = await createTestUser({ name: 'P844 UAT-6 Host' });
      event = await createTestEvent(host.user.id, undefined, { title: 'P844 UAT-6 Event' });
      await rsvpToEvent(event.id, testUserId);
      await setTestSession(page, testUserEmail);
      await page.goto(`/events/${event.slug}/meet`);
      await expect(page.getByText('Open a room')).toBeVisible({ timeout: 10000 });
    } finally {
      if (event) await deleteTestEvent(event.id);
      if (host) await deleteTestUser(host.user.id);
    }
  });

  test('UAT-10: Sticky bar visible for non-host on mobile viewport', async ({ page }) => {
    await setTestSession(page, testUserEmail);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(EVENT_URL);
    await expect(page.locator('[data-testid="rsvp-sticky-bar"]')).toBeVisible({ timeout: 10000 });
  });
});
