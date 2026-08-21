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
 *   - `room-roster`                  — the full-roster container (REVISED 2026-08-21:
 *                                      every answer state, not opt-ins-only — see below)
 *   - `room-roster-in` / `room-roster-out` / `room-roster-undecided` — the three grouped
 *                                      sections (2026-08-21)
 *   - `room-roster-item`             — one per visible person, any answer state
 *   - `room-roster-rating`           — the public "N/10" pill on an answered row (2026-08-21)
 *   - No top-level zero-state any more (2026-08-21, retired): a visitor auto-joins on
 *     arrival, so their own row always makes the roster non-empty within a moment —
 *     each group's own "(0)" + "No one yet." covers the empty case instead.
 *   - `room-my-opt-in-status`        — the participant's OWN state, `data-opted-in`,
 *                                      ALWAYS rendered (both undecided and answered)
 *   - `room-opt-in-yes` / `room-opt-in-no` — the answer controls, disabled until a
 *                                      comprehension rating is selected (2026-08-21)
 *   - `room-change-choice`           — resets the caller's own answer + rating to
 *                                      undecided (2026-08-21)
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

  test('the roster shows every answer state — opted-in, opted-out, and undecided — grouped and named, each with its public rating', async ({ page }) => {
    // REVISED 2026-08-21 (decisions.md): the old version of this test locked in the
    // OPPOSITE guarantee ("an opted-out name never appears"). That guarantee was
    // reversed on purpose — see 20260821120000_p1114_public_roster_reversal.sql for the
    // rationale (a facilitator running a live, in-person, projected room deliberately
    // wants "who's still undecided" visible to everyone present).
    const in_ = await seedRoomMember(event.id, { optedIn: true, comprehensionRating: 8, displayName: 'P1114 Opted In Person' });
    const out = await seedRoomMember(event.id, { optedIn: false, comprehensionRating: 3, displayName: 'P1114 Opted Out Person' });
    const undecided = await seedRoomMember(event.id, { displayName: 'P1114 Undecided Person' });
    memberIds.push(in_.id, out.id, undecided.id);

    const visitor = await freshUser('P1114 Roster Viewer');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);

    await expect(page.getByTestId('room-roster-in')).toContainText('P1114 Opted In Person');
    await expect(page.getByTestId('room-roster-in')).toContainText('8/10');
    await expect(page.getByTestId('room-roster-out')).toContainText('P1114 Opted Out Person');
    await expect(page.getByTestId('room-roster-out')).toContainText('3/10');
    await expect(page.getByTestId('room-roster-undecided')).toContainText('P1114 Undecided Person');
    // Undecided members never carry a rating — it's required at the moment of
    // answering, so an undecided row must never show an "N/10" pill.
    await expect(page.getByTestId('room-roster-undecided').getByTestId('room-roster-rating')).toHaveCount(0);
  });

  test('a freshly-arrived registered visitor sees themselves listed as Undecided, and no error', async ({ page }) => {
    // REVISED 2026-08-21 (decisions.md): there is no separate zero-state any more —
    // arriving auto-joins the room (useEventRoomSelf), so the visitor's own row makes
    // the roster non-empty within a moment regardless. What used to be "shows a
    // zero-state" is now "shows yourself, correctly, as undecided."
    const visitor = await freshUser('P1114 First To Arrive');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);

    await expect(page.getByTestId('room-roster-undecided')).toContainText('P1114 First To Arrive');
    await expect(page.getByTestId('room-roster-in')).toContainText('No one yet.');
    await expect(page.getByTestId('room-roster-out')).toContainText('No one yet.');
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
      // Before the actor answers, the viewer sees only their own row, Undecided.
      await expect(roster(viewerPage)).toContainText('P1114 Live Viewer');
      await expect(viewerPage.getByTestId('room-roster-in')).toContainText('No one yet.');

      await signInRegistered(actorPage, event, actor);
      await actorPage.goto(`/events/${event.slug}/meet`);
      await expect(actorPage.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
      // A comprehension rating is required before either decision button is enabled
      // (2026-08-21 reinstatement) — select one first.
      await actorPage.getByRole('button', { name: 'Rate 7' }).click();
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

  test('opt-in/opt-out stay disabled until a rating is picked; "change my choice" resets both the answer and the rating to undecided', async ({ page }) => {
    const visitor = await freshUser('P1114 Rating Gate Visitor');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);

    await expect(page.getByTestId('room-opt-in-yes')).toBeDisabled();
    await expect(page.getByTestId('room-opt-in-no')).toBeDisabled();

    await page.getByRole('button', { name: 'Rate 6' }).click();
    await expect(page.getByTestId('room-opt-in-yes')).toBeEnabled();
    await page.getByTestId('room-opt-in-yes').click();

    await expect(page.getByTestId('room-my-opt-in-status')).toContainText('You opted in.');
    await expect(page.getByTestId('room-my-opt-in-status')).toContainText('6/10');
    // Answered: the live decision buttons are replaced by a locked summary + "change
    // my choice" — founder: a live yes/no toggle gave no feedback an answer registered.
    await expect(page.getByTestId('room-opt-in-yes')).toHaveCount(0);

    await page.getByTestId('room-change-choice').click();
    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
    // Back to the ungated undecided state — the rating was cleared too, not just the answer.
    await expect(page.getByTestId('room-opt-in-yes')).toBeDisabled();
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
  let event: TestEvent;
  const eventIds: string[] = [];
  const userIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 Tab E2E Host' });
    event = await createTestEvent(host.user.id, new Date());
    eventIds.push(event.id);
  });

  test.afterAll(async () => {
    for (const id of eventIds) await deleteTestEvent(id);
    for (const id of userIds) await deleteTestUser(id);
    await deleteTestUser(host.user.id);
  });

  // Each stateful test below gets its OWN registered user rather than sharing one —
  // readiness_value is written by these tests, and sharing a user across tests would
  // couple later tests to execution order (whichever test happens to run first sets
  // the state the next one silently depends on).
  async function freshRegistered(name: string): Promise<TestUser> {
    const user = await createTestUser({ email: generateTestEmail(), name });
    userIds.push(user.user.id);
    await rsvpToEvent(event.id, user.user.id);
    return user;
  }

  test('"Details" is a static label, not an interactive tab — the page carries no Radix tab role at all', async ({ page }) => {
    await page.goto(`/events/${event.slug}`);
    await expect(page.getByText('Details', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]tab=/);
  });

  test('a first-time registered attendee: "View Principle" routes through the readiness question first, not straight to the principle', async ({ page }) => {
    const attendee = await freshRegistered('P1114 Tab E2E First Visit');
    await setTestSession(page, attendee.email);
    await page.goto(`/events/${event.slug}`);

    await page.getByRole('link', { name: 'View Principle' }).click();
    await expect(
      page,
      '"View Principle" must link to /room (the smart entry point that decides readiness-vs-principle), not straight to /meet — linking to /meet directly bypasses the readiness question entirely, even for a first-time visitor (founder repro, 2026-08-21: a fresh account never saw the slider).',
    ).toHaveURL(new RegExp(`/events/${event.slug}/ready$`));
    await expect(page.getByTestId('room-ready')).toBeVisible();

    await page.goBack();
    await expect(
      page,
      'One Back press from the room did not return to the event page — a real <a> navigation pushes exactly one history entry, unlike the old Radix TabsTrigger whose onValueChange could double-fire per click.',
    ).toHaveURL(new RegExp(`/events/${event.slug}(\\?|$)`));
  });

  test('a returning attendee who already set readiness: "View Principle" skips straight to the principle page', async ({ page }) => {
    const attendee = await freshRegistered('P1114 Tab E2E Returning');
    await setTestSession(page, attendee.email);
    // First pass through /ready sets readiness_value — reuses the real flow rather
    // than a seeded fixture, so this exercises exactly what a real return visit does.
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('room-meet')).toBeVisible();

    await page.goto(`/events/${event.slug}`);
    await page.getByRole('link', { name: 'View Principle' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet$`));
    await expect(page.getByTestId('room-meet')).toBeVisible();
  });

  test('a signed-out visitor clicking "View Principle" reaches the gate, not the room content', async ({ page }) => {
    await page.goto(`/events/${event.slug}`);
    await page.getByRole('link', { name: 'View Principle' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/room$`));
    await expect(page.getByTestId('room-gate')).toBeVisible();
    await expect(page.getByTestId('room-meet')).toHaveCount(0);
  });

  test('back navigation: /meet goes back to /ready, and /ready goes back to the event page', async ({ page }) => {
    const attendee = await freshRegistered('P1114 Tab E2E Back Nav');
    await setTestSession(page, attendee.email);
    // Reach /meet via the real flow (through /ready) so this doesn't depend on
    // /room's smart-redirect branch, which the two tests above already cover.
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('room-meet')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/ready$`));

    await page.getByRole('button', { name: 'Back to event' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}(\\?|$)`));
  });
});
