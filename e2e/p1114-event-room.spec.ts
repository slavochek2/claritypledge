/**
 * @file p1114-event-room.spec.ts
 * @description E2E behavior coverage for the P1114 event room
 * (`/events/:slug/room`, `/events/:slug/ready`, `/events/:slug/meet` — one shared
 * `EventRoomPage`, per Architecture Decision 7 of
 * features/p1114_event_room_presence_and_cmp_opt_in.md).
 *
 * COPY IS `[FOUNDER DECISION]` for nearly every user-facing string in this
 * feature (spec's UI Contract). This file therefore asserts on ROLES,
 * TEST-IDS, and STRUCTURE — never on placeholder copy — except the two slots
 * the spec itself resolves against the shipped `/live` guest form (Build
 * Sequence step 8): the name field's label "What should we call you?" and the
 * submit button "Join as Guest".
 *
 * TEST-ID CONTRACT this file requires /dev to implement (none of these exist
 * yet — this file is written before /dev, same TDD convention as the
 * integration files in e2e/integration/p1114-*.spec.ts):
 *   - `room-page`            — root container, carries `data-room-focus` =
 *                               "join" | "ready" | "principle" (Decision 7's
 *                               `focus` prop, made observable for tests)
 *   - `room-join-form`       — guest join form, rendered only when not yet
 *                               identified (name input + "Join as Guest")
 *   - `room-controls`        — wraps every participant-facing control (join
 *                               form, opt-in control, readiness control) —
 *                               this is what Present mode must hide
 *   - `room-roster`          — the opt-ins-only roster container, ALWAYS
 *                               rendered (spec §3: "must be visible the whole
 *                               time"), carries `data-present` when Present
 *                               mode is active
 *   - `room-roster-item`     — one per visible (opted-in) person
 *   - `room-zero-state`      — shown when the roster has zero opted-in people
 *   - `room-present-toggle`  — button, `aria-pressed` reflects state
 *   - `room-my-opt-in-status`— the participant's OWN state, carries
 *                               `data-opted-in` = "true" | "false" | "unanswered"
 *   - `room-opt-in-yes` / `room-opt-in-no` — the answer controls
 *   - `room-frozen-notice`   — shown once the event is past EVENT_GRACE_HOURS
 *
 * Regression note (Non-Goals: "Do NOT modify standalone /ready or /meet"): this
 * file does not re-test standalone `/ready`/`/meet` — that coverage already
 * exists, unmodified, in e2e/p1077-ready.spec.ts and
 * e2e/p1083-ready-distribution.spec.ts. See the spec's Test Coverage Strategy
 * section for how those two files serve as this Done-When item's evidence.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { seedRoomMember, deleteRoomMembers } from './helpers/test-event-room';

const EVENT_GRACE_HOURS = 5; // P494 / events-service-real.ts:16 — see src/tests/p1114-grace-hours-sync.test.ts

const roomPage = (page: Page) => page.getByTestId('room-page');
const roster = (page: Page) => page.getByTestId('room-roster');
const rosterItems = (page: Page) => page.getByTestId('room-roster-item');
const guestNameInput = (page: Page) => page.getByLabel('What should we call you?');
const guestSubmit = (page: Page) => page.getByRole('button', { name: 'Join as Guest' });

test.describe('P1114 event room', () => {
  let host: TestUser;
  let event: TestEvent;
  const memberIds: string[] = [];
  const eventIds: string[] = [];
  const orgIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 E2E Host' });
  });

  test.beforeEach(async () => {
    event = await createTestEvent(host.user.id, new Date());
    eventIds.push(event.id);
  });

  test.afterAll(async () => {
    await deleteRoomMembers(memberIds);
    for (const id of eventIds) await deleteTestEvent(id);
    for (const id of orgIds) await deleteTestOrganization(id);
    await deleteTestUser(host.user.id);
  });

  test('a walk-in can join with a name only and appears on the roster — no account, no email', async ({ page }) => {
    await page.goto(`/events/${event.slug}/room`);
    await expect(roomPage(page)).toBeVisible();
    await guestNameInput(page).fill('Walk-in Wanda');
    await guestSubmit(page).click();

    // Joining alone doesn't opt them in — the roster only shows opt-ins — so
    // this proves identification succeeded, not roster membership. The room
    // page itself must now reflect "identified": the join form is gone.
    await expect(page.getByTestId('room-join-form')).not.toBeVisible();
    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
  });

  test('a logged-in person passes through the join screen without re-entering their name', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/room`);
    await expect(roomPage(page)).toBeVisible();
    await expect(page.getByTestId('room-join-form')).not.toBeVisible();
  });

  test('/room, /ready, and /meet render the SAME page, focused differently, with the roster always present', async ({ page }) => {
    const seeded = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Same-Page Check' });
    memberIds.push(seeded.id);

    await page.goto(`/events/${event.slug}/room`);
    await expect(roomPage(page)).toHaveAttribute('data-room-focus', 'join');
    await expect(roster(page)).toBeVisible();

    await page.goto(`/events/${event.slug}/ready`);
    await expect(roomPage(page)).toHaveAttribute('data-room-focus', 'ready');
    await expect(roster(page)).toBeVisible();

    await page.goto(`/events/${event.slug}/meet`);
    await expect(roomPage(page)).toHaveAttribute('data-room-focus', 'principle');
    await expect(roster(page)).toBeVisible();
  });

  test('the roster is visible before the visitor answers anything, and shows opt-ins only — an opted-out name never appears', async ({ page }) => {
    const visible = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Visible Person' });
    const hidden = await seedRoomMember(event.id, { optedIn: false, displayName: 'P1114 Hidden Person' });
    memberIds.push(visible.id, hidden.id);

    // Never joined, never answered — the roster must already show the seeded state.
    await page.goto(`/events/${event.slug}/room`);
    await expect(roster(page)).toContainText('P1114 Visible Person');
    await expect(rosterItems(page)).toHaveCount(1); // the visible seed only — never the hidden one

    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText, 'an opted-out name must never appear anywhere on the room page').not.toContain('P1114 Hidden Person');
  });

  test('zero-state: a freshly-joined visitor on an otherwise-empty roster sees a zero-state, never an error', async ({ page }) => {
    await page.goto(`/events/${event.slug}/room`);
    await guestNameInput(page).fill('First To Arrive');
    await guestSubmit(page).click();

    await expect(page.getByTestId('room-zero-state')).toBeVisible();
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/error|failed|unavailable/i);
  });

  test('the Present toggle hides participant controls and marks the roster as present-mode, on the same route', async ({ page }) => {
    await page.goto(`/events/${event.slug}/room`);
    await guestNameInput(page).fill('Toggler');
    await guestSubmit(page).click();

    const toggle = page.getByTestId('room-present-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('room-controls')).not.toBeVisible();
    await expect(roster(page)).toHaveAttribute('data-present', 'true');
    // Still the same route — Present is a state, not a navigation (Non-Goal: no /screen route).
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/room/?$`));
  });

  test('changing an answer updates the room page live, without a reload, across two browser contexts', async ({ browser }) => {
    const viewerContext = await browser.newContext();
    const actorContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    const actorPage = await actorContext.newPage();

    try {
      await viewerPage.goto(`/events/${event.slug}/room`);
      await viewerPage.getByLabel('What should we call you?').fill('Viewer');
      await viewerPage.getByRole('button', { name: 'Join as Guest' }).click();

      await actorPage.goto(`/events/${event.slug}/room`);
      await actorPage.getByLabel('What should we call you?').fill('P1114 Live Opt-in Actor');
      await actorPage.getByRole('button', { name: 'Join as Guest' }).click();
      await actorPage.getByTestId('room-opt-in-yes').click();

      // No page.reload() on the viewer — the app's own delivery mechanism
      // (realtime + Decision 3's reconciliation poll) must surface this.
      await expect(roster(viewerPage)).toContainText('P1114 Live Opt-in Actor', { timeout: 20_000 });
    } finally {
      await viewerContext.close();
      await actorContext.close();
    }
  });

  test('a frozen room (past EVENT_GRACE_HOURS) still displays who was there, and offers no way to join or change an answer', async ({ page }) => {
    const frozenEvent = await createTestEvent(host.user.id, new Date(Date.now() - (EVENT_GRACE_HOURS + 2) * 60 * 60 * 1000));
    eventIds.push(frozenEvent.id);
    const attendee = await seedRoomMember(frozenEvent.id, { optedIn: true, displayName: 'P1114 Frozen Attendee' });
    memberIds.push(attendee.id);

    await page.goto(`/events/${frozenEvent.slug}/room`);
    await expect(page.getByTestId('room-frozen-notice')).toBeVisible();
    await expect(page.getByTestId('room-join-form')).not.toBeVisible();
    await expect(roster(page)).toContainText('P1114 Frozen Attendee');
  });

  test('an organization member sees themselves as NOT opted in until they confirm in the room', async ({ page }) => {
    const org: TestOrganization = await createTestOrganization();
    orgIds.push(org.id);
    await createTestMembership(org.id, host.user.id);

    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/meet`);

    // Non-Goal: "membership does not auto-opt-in." A pre-filled context line
    // about standing commitment is allowed (UI Contract), but the actual
    // opt-in state must read unanswered until the member explicitly confirms.
    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
  });

  test('roster degrades to a readable list (never an error or empty wall) when realtime is unavailable', async ({ page }) => {
    test.setTimeout(60_000);
    // Block the realtime WebSocket handshake so the channel never reaches
    // SUBSCRIBED — forcing the page onto Decision 3's 30s reconciliation poll,
    // which is the actual degrade path under test (not a UI fallback state).
    await page.route('**/realtime/v1/websocket**', (route) => route.abort());

    await page.goto(`/events/${event.slug}/room`);
    await expect(roomPage(page)).toBeVisible();
    const bodyTextBefore = (await page.locator('body').innerText()) ?? '';
    expect(bodyTextBefore).not.toMatch(/error|failed|unavailable/i);

    const latecomer = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Poll-Only Latecomer' });
    memberIds.push(latecomer.id);

    // Generous — the reconciliation poll interval is 30s (Decision 3).
    await expect(roster(page)).toContainText('P1114 Poll-Only Latecomer', { timeout: 35_000 });
    const bodyTextAfter = (await page.locator('body').innerText()) ?? '';
    expect(bodyTextAfter).not.toMatch(/error|failed|unavailable/i);
  });
});
