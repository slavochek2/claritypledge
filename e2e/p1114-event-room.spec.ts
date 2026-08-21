/**
 * @file p1114-event-room.spec.ts
 * @description E2E behavior coverage for the P1114 event room, revision 2 —
 * `/events/:slug/room` (gate), `/events/:slug/ready` (readiness), `/events/:slug/meet`
 * (principle + roster + decision). Every scenario below signs in as a REGISTERED
 * attendee (rsvpToEvent + setTestSession) — the gate itself is e2e/p1114-gate.spec.ts's
 * job, not this file's.
 *
 * TEST-ID CONTRACT this file exercises:
 *   - `room-ready`, `room-meet`      — the two page roots
 *   - `room-roster`                  — the opt-ins-only roster container
 *   - `room-roster-item`             — one per visible (opted-in) person
 *   - `room-zero-state`              — shown when the roster has zero opted-in people
 *   - `room-my-opt-in-status`        — the participant's OWN state, `data-opted-in`
 *   - `room-opt-in-yes` / `room-opt-in-no` — the answer controls
 *   - `room-frozen-notice`           — shown once the event is past EVENT_GRACE_HOURS
 *
 * Regression note (Non-Goals: "Do NOT modify standalone /ready or /meet"): this file
 * does not re-test standalone `/ready`/`/meet` — that coverage stays unmodified in
 * e2e/p1077-ready.spec.ts and e2e/p1083-ready-distribution.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { seedRoomMember, deleteRoomMembers } from './helpers/test-event-room';

const EVENT_GRACE_HOURS = 5; // P494 / events-service-real.ts:16 — see src/tests/p1114-grace-hours-sync.test.ts

const roster = (page: Page) => page.getByTestId('room-roster');
const rosterItems = (page: Page) => page.getByTestId('room-roster-item');

async function signInRegistered(page: Page, event: TestEvent, user: TestUser) {
  await rsvpToEvent(event.id, user.user.id);
  await setTestSession(page, user.email);
}

test.describe('P1114 event room (rev2, registered + signed in)', () => {
  let host: TestUser;
  let event: TestEvent;
  const memberIds: string[] = [];
  const eventIds: string[] = [];
  const orgIds: string[] = [];
  const userIds: string[] = [];

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
    for (const id of userIds) await deleteTestUser(id);
    await deleteTestUser(host.user.id);
  });

  async function freshUser(name: string): Promise<TestUser> {
    const user = await createTestUser({ email: generateTestEmail(), name });
    userIds.push(user.user.id);
    return user;
  }

  test('a registered visitor lands on readiness first, with no name field anywhere', async ({ page }) => {
    const visitor = await freshUser('P1114 First Visit');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/room`);
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/ready$`));
    await expect(page.getByTestId('room-ready')).toBeVisible();
    await expect(page.getByText('What should we call you?')).toHaveCount(0);
  });

  test('setting readiness and continuing lands on the principle page', async ({ page }) => {
    const visitor = await freshUser('P1114 Ready Continue');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('room-meet')).toBeVisible();
  });

  test('the roster is visible before the visitor answers anything, and shows opt-ins only — an opted-out name never appears', async ({ page }) => {
    const visible = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Visible Person' });
    const hidden = await seedRoomMember(event.id, { optedIn: false, displayName: 'P1114 Hidden Person' });
    memberIds.push(visible.id, hidden.id);

    const visitor = await freshUser('P1114 Roster Viewer');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(roster(page)).toContainText('P1114 Visible Person');
    await expect(rosterItems(page)).toHaveCount(1); // the visible seed only — never the hidden one

    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText, 'an opted-out name must never appear anywhere on the room page').not.toContain('P1114 Hidden Person');
  });

  test('zero-state: a freshly-arrived registered visitor on an otherwise-empty roster sees a zero-state, never an error', async ({ page }) => {
    const visitor = await freshUser('P1114 First To Arrive');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);

    await expect(page.getByTestId('room-zero-state')).toBeVisible();
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/error|failed|unavailable/i);
  });

  test('opting in shows the caller\'s own status and appears on the roster; changing an answer updates a SECOND browser live, without a reload', async ({ browser }) => {
    const viewer = await freshUser('P1114 Live Viewer');
    const actor = await freshUser('P1114 Live Opt-in Actor');

    const viewerContext = await browser.newContext();
    const actorContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    const actorPage = await actorContext.newPage();

    try {
      await signInRegistered(viewerPage, event, viewer);
      await viewerPage.goto(`/events/${event.slug}/meet`);
      await expect(viewerPage.getByTestId('room-zero-state')).toBeVisible();

      await signInRegistered(actorPage, event, actor);
      await actorPage.goto(`/events/${event.slug}/meet`);
      await expect(actorPage.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
      await actorPage.getByTestId('room-opt-in-yes').click();
      await expect(actorPage.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'true');

      // No page.reload() on the viewer — the app's own delivery mechanism
      // (realtime + Decision 3's reconciliation poll) must surface this.
      await expect(roster(viewerPage)).toContainText('P1114 Live Opt-in Actor', { timeout: 20_000 });
    } finally {
      await viewerContext.close();
      await actorContext.close();
    }
  });

  test('a frozen room (past EVENT_GRACE_HOURS) still displays who was there, and offers no way to change an answer', async ({ page }) => {
    const frozenEvent = await createTestEvent(host.user.id, new Date(Date.now() - (EVENT_GRACE_HOURS + 2) * 60 * 60 * 1000));
    eventIds.push(frozenEvent.id);
    const attendee = await seedRoomMember(frozenEvent.id, { optedIn: true, displayName: 'P1114 Frozen Attendee' });
    memberIds.push(attendee.id);

    const visitor = await freshUser('P1114 Frozen Visitor');
    await signInRegistered(page, frozenEvent, visitor);
    await page.goto(`/events/${frozenEvent.slug}/meet`);
    await expect(page.getByTestId('room-frozen-notice')).toBeVisible();
    await expect(page.getByTestId('room-opt-in-yes')).toHaveCount(0);
    await expect(roster(page)).toContainText('P1114 Frozen Attendee');
  });

  test('an organization member sees themselves as NOT opted in until they confirm in the room', async ({ page }) => {
    const org: TestOrganization = await createTestOrganization();
    orgIds.push(org.id);
    const member = await freshUser('P1114 Org Member');
    await createTestMembership(org.id, member.user.id);

    await signInRegistered(page, event, member);
    await page.goto(`/events/${event.slug}/meet`);

    // Non-Goal: "membership does not auto-opt-in." The actual opt-in state must
    // read unanswered until the member explicitly confirms.
    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
  });

  test('roster degrades to a readable list (never an error or empty wall) when realtime is unavailable', async ({ page }) => {
    test.setTimeout(60_000);
    // Block the realtime WebSocket handshake so the channel never reaches
    // SUBSCRIBED — forcing the page onto Decision 3's 30s reconciliation poll,
    // which is the actual degrade path under test (not a UI fallback state).
    await page.route('**/realtime/v1/websocket**', (route) => route.abort());

    const visitor = await freshUser('P1114 Poll-Only Visitor');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('room-meet')).toBeVisible();
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

test.describe('P1114 event page: tab row', () => {
  let host: TestUser;
  let registered: TestUser;
  let event: TestEvent;
  const eventIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 Tab E2E Host' });
    event = await createTestEvent(host.user.id, new Date());
    eventIds.push(event.id);
    registered = await createTestUser({ email: generateTestEmail(), name: 'P1114 Tab E2E Registered' });
    await rsvpToEvent(event.id, registered.user.id);
  });

  test.afterAll(async () => {
    for (const id of eventIds) await deleteTestEvent(id);
    await deleteTestUser(host.user.id);
    await deleteTestUser(registered.user.id);
  });

  test('"Details" is a static label, not an interactive tab — the page carries no Radix tab role at all', async ({ page }) => {
    await page.goto(`/events/${event.slug}`);
    await expect(page.getByText('Details', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]tab=/);
  });

  test('a registered, signed-in attendee: "Clarity Principle" is a real link to /meet, and one Back press returns to the event page', async ({ page }) => {
    await setTestSession(page, registered.email);
    await page.goto(`/events/${event.slug}`);

    await page.getByRole('link', { name: 'Clarity Principle' }).click();
    await expect(
      page,
      'Clicking "Clarity Principle" is a navigation to the standalone room route now, not a same-page tab switch — the old embedded composition collided the room\'s level-track portal with this page\'s own primary nav, both targeting the same dead-center nav slot.',
    ).toHaveURL(new RegExp(`/events/${event.slug}/meet$`));
    await expect(page.getByTestId('room-meet')).toBeVisible();

    await page.goBack();
    await expect(
      page,
      'One Back press from /meet did not return to the event page — a real <a> navigation pushes exactly one history entry, unlike the old Radix TabsTrigger whose onValueChange could double-fire per click.',
    ).toHaveURL(new RegExp(`/events/${event.slug}(\\?|$)`));
  });

  test('a signed-out visitor clicking "Clarity Principle" reaches the gate at /meet, not the room content', async ({ page }) => {
    await page.goto(`/events/${event.slug}`);
    await page.getByRole('link', { name: 'Clarity Principle' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet$`));
    await expect(page.getByTestId('room-gate')).toBeVisible();
    await expect(page.getByTestId('room-meet')).toHaveCount(0);
  });
});
