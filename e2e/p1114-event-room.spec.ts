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
 *   - `room-roster-rating`           — "understood at N/10" on an answered row (2026-08-21)
 *   - `room-roster-all-answered`     — replaces the Undecided group once it empties
 *   - Empty groups render NOTHING (2026-08-21 round 2, founder: "hide groups that have 0").
 *     The only zero-state left is the whole-roster one, which exists because
 *     getRoomRoster returns [] on any failure. Round 4 reversed the OTHER half of that
 *     round-2 call — group headings now carry a count again ("Opted in (2)") — so a
 *     non-empty group's heading DOES show "(N)"; only the zero-member hide survives.
 *   - `room-my-opt-in-status`        — the participant's OWN state, `data-opted-in`,
 *                                      ALWAYS MOUNTED, in all three steps. Reports SERVER
 *                                      state, so it stays "unanswered" through the rating
 *                                      step — nothing is written until Submit. Its visible
 *                                      TEXT is empty during that step (2026-08-21 round 3,
 *                                      founder deleted "Opting in — give a number to
 *                                      confirm"), so assert the attribute there, not text.
 *   - `room-opt-in-yes` / `room-opt-in-no` — the answer controls. NOT disabled any more
 *                                      (2026-08-21 round 2): the rating that gates the
 *                                      answer is now the step AFTER these, not before.
 *   - `room-cancel-answer`           — GONE (2026-08-21 round 3, founder: "you invented
 *                                      it"). The rating step has no cancel; the way out is
 *                                      to answer, then `room-change-choice`. Asserted
 *                                      absent so a reinstatement fails a test.
 *   - `room-change-choice`           — resets the caller's own answer + rating to
 *                                      undecided (2026-08-21)
 *   - `room-frozen-notice`           — shown once the event is past EVENT_GRACE_HOURS
 *
 * THE THREE STEPS this file exercises (2026-08-21 round 2 — the room adopted the shipped
 * /meet's own shape after the founder annotated the previous single-bar build "ugly!"):
 * choosing (two buttons) → rating (the shared ComprehensionRatingCard) → answered. The
 * rating still gates BOTH answers; it is asked after the answer rather than before it, so
 * NOTHING is persisted until the card's Submit.
 *
 * Regression note (Non-Goals: "Do NOT modify standalone /ready or /meet"): this file
 * does not re-test standalone `/ready`/`/meet` — that coverage stays unmodified in
 * e2e/p1077-ready.spec.ts and e2e/p1083-ready-distribution.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { seedRoomMember, deleteRoomMembers, readRoomAnswers } from './helpers/test-event-room';

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
    // Spelled out, not an abbreviated pill (founder, 2026-08-21: "put here what they
    // answered e.g. 'understood at 4/10'").
    await expect(page.getByTestId('room-roster-in')).toContainText('understood at 8/10');
    await expect(page.getByTestId('room-roster-out')).toContainText('P1114 Opted Out Person');
    await expect(page.getByTestId('room-roster-out')).toContainText('understood at 3/10');
    await expect(page.getByTestId('room-roster-undecided')).toContainText('P1114 Undecided Person');
    // Undecided members never carry a rating — it's required at the moment of
    // answering, so an undecided row must never show an "N/10" pill.
    await expect(page.getByTestId('room-roster-undecided').getByTestId('room-roster-rating')).toHaveCount(0);
  });

  test('a freshly-arrived registered visitor sees themselves listed as Undecided, with the empty groups rendering nothing at all', async ({ page }) => {
    // REVISED THREE TIMES on 2026-08-21. First: there is no separate zero-state any
    // more — arriving auto-joins the room (useEventRoomSelf), so the visitor's own row
    // makes the roster non-empty within a moment regardless. Then (round 2): the empty
    // groups stopped rendering "(0) / No one yet." and now render nothing, per the
    // founder's "hide groups that have 0". Then (round 4): the founder asked for the
    // count back on non-empty headings — "Opted in (2)" — reversing only the "(N)"
    // half of the round-2 call; the empty-group hide itself stays.
    const visitor = await freshUser('P1114 First To Arrive');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);

    await expect(page.getByTestId('room-roster-undecided')).toContainText('P1114 First To Arrive');
    await expect(page.getByTestId('room-roster-in')).toHaveCount(0);
    await expect(page.getByTestId('room-roster-out')).toHaveCount(0);
    // Round 4 reversed the "no counts" half of the round-2 call: a non-empty group's
    // heading now shows "(N)" again.
    await expect(page.getByTestId('room-roster-undecided')).toContainText('(1)');
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/error|failed|unavailable/i);
  });

  test('once everyone has answered, the empty Undecided group is replaced by an affirmative line, not by silence', async ({ page }) => {
    // The empty-Undecided moment is the payoff of the public roster: it is when the
    // facilitator's "move yourself out of undecided" has landed for the whole room. With
    // groups hiding themselves at zero, rendering that as a heading quietly vanishing is
    // indistinguishable from "still loading" on a projected screen.
    const answered = await seedRoomMember(event.id, { optedIn: true, comprehensionRating: 9, displayName: 'P1114 All Answered Person' });
    memberIds.push(answered.id);

    // The visitor's OWN row is seeded already-answered. Arriving auto-joins, and an
    // auto-join that landed them undecided would defeat the state under test — so this
    // also pins that join_event_room's upsert never resets an existing answer.
    const viewer = await freshUser('P1114 All Answered Viewer');
    await rsvpToEvent(event.id, viewer.user.id);
    const viewerMember = await seedRoomMember(event.id, {
      profileId: viewer.user.id,
      optedIn: true,
      comprehensionRating: 7,
      displayName: 'P1114 All Answered Viewer',
    });
    memberIds.push(viewerMember.id);

    await setTestSession(page, viewer.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('room-roster-in')).toContainText('P1114 All Answered Person');
    await expect(page.getByTestId('room-roster-undecided')).toHaveCount(0);
    await expect(page.getByTestId('room-roster-all-answered')).toBeVisible();
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
      await expect(viewerPage.getByTestId('room-roster-in')).toHaveCount(0);

      await signInRegistered(actorPage, event, actor);
      await actorPage.goto(`/events/${event.slug}/meet`);
      await expect(actorPage.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');

      // Three steps (2026-08-21 round 2): choose the answer, THEN give the number, and the
      // number is what commits. Tapping "Opt in" alone must persist nothing — asserted
      // explicitly below, because the whole reason this ordering is safe is that an answer
      // without a rating is not a complete answer under "require a rating for both".
      await actorPage.getByTestId('room-opt-in-yes').click();
      await expect(actorPage.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
      // A bare toHaveCount(0) here would pass at t=0 even if the tap DID write, because the
      // row needs a realtime hop to arrive. Wait past that hop first, so this asserts "no
      // write happened" rather than "no write has arrived yet".
      await actorPage.waitForTimeout(1500);
      await expect(viewerPage.getByTestId('room-roster-in')).toHaveCount(0);

      await actorPage.getByRole('button', { name: 'Rate 7' }).click();
      await actorPage.getByRole('button', { name: 'Submit' }).click();
      await expect(actorPage.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'true');

      // No page.reload() on the viewer — the app's own delivery mechanism
      // (realtime + Decision 3's reconciliation poll) must surface this.
      await expect(roster(viewerPage)).toContainText('P1114 Live Opt-in Actor', { timeout: 20_000 });
    } finally {
      await viewerContext.close();
      await actorContext.close();
    }
  });

  test('the three steps run in order, a rating is required for BOTH answers, and "change your choice" resets both', async ({ page }) => {
    const visitor = await freshUser('P1114 Rating Gate Visitor');
    await signInRegistered(page, event, visitor);
    await page.goto(`/events/${event.slug}/meet`);

    // STEP 1 — two buttons, nothing else. Neither disabled (the rating that gates them is
    // now the step after, not before), and no rating row on screen yet: that crammed
    // single bar is what the founder annotated "ugly!".
    await expect(page.getByTestId('room-opt-in-yes')).toBeEnabled();
    await expect(page.getByTestId('room-opt-in-no')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Rate 6' })).toHaveCount(0);

    // STEP 2 — the shared card, with the shipped /meet's own question. Submit is disabled
    // until a number is picked, which is what makes the rating REQUIRED for this answer.
    // The OPT-OUT path is walked first: "require for both" (founder, 2026-08-21), and an
    // opt-out that could skip the number is the exact asymmetry this asserts against.
    await page.getByTestId('room-opt-in-no').click();
    await expect(page.getByText(/How much do you think you understand/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();

    // Nothing is written while the card is up. The status element stays MOUNTED through
    // the rating step (display:none, so read the attribute, not the text) precisely so
    // this stays checkable after the founder removed its visible line.
    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');

    // No cancel control under the card, and none inside it — founder, 2026-08-21
    // ("you invented it"). Asserted, not assumed: this test previously drove the flow
    // THROUGH that button, so its absence has to be the thing that fails if it returns.
    await expect(page.getByTestId('room-cancel-answer')).toHaveCount(0);
    // Exactly ONE "Back" on the page, and it is the page-chrome link at the top — not two.
    // (getByRole name-matching is substring by default, so this also covers the shared
    // card's own `onBack` button reappearing: that would make it two.)
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(1);

    // The only way out of the card is to answer — so the opt-out is committed, then reset
    // through the same control a person would use.
    await page.getByRole('button', { name: 'Rate 2' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('room-my-opt-in-status')).toContainText('You opted out');
    await page.getByTestId('room-change-choice').click();
    await expect(page.getByTestId('room-opt-in-yes')).toBeEnabled();

    // The SAME gate on the opt-in path.
    await page.getByTestId('room-opt-in-yes').click();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await page.getByRole('button', { name: 'Rate 6' }).click();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
    await page.getByRole('button', { name: 'Submit' }).click();

    // STEP 3 — the founder's exact labels, replacing "Accepted…" / "End meeting".
    await expect(page.getByTestId('room-my-opt-in-status')).toContainText('You opted in');
    await expect(page.getByTestId('room-change-choice')).toContainText('Change your choice');
    await expect(page.getByTestId('room-opt-in-yes')).toHaveCount(0);
    // The number moved OFF the status line and onto the roster row, where it is public —
    // it is not merely gone (the status line used to render "You opted in. /10." with an
    // empty number for any row answered before the rating column existed).
    await expect(page.getByTestId('room-my-opt-in-status')).not.toContainText('/10');
    await expect(page.getByTestId('room-roster-in')).toContainText('understood at 6/10');

    await page.getByTestId('room-change-choice').click();
    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'unanswered');
    // Back to step 1, and the rating went with the answer — reopening the card shows a
    // disabled Submit rather than the old 6 still selected.
    await expect(page.getByTestId('room-opt-in-yes')).toBeEnabled();
    await page.getByTestId('room-opt-in-yes').click();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  test('a double-tapped Submit writes exactly ONE answer-history row, not two', async ({ page }) => {
    // event_room_answers is append-only and cascade-counted, and it is the table the
    // spec's research question reads — a duplicate row is corrupted data, not a cosmetic
    // glitch. The disabled-while-submitting styling cannot prevent this on its own: it is
    // driven by React state, so two taps dispatched in the same frame both observe
    // "not submitting" before either re-render lands. A synchronous ref latch is what
    // actually closes the window, and this test is what proves the latch is real.
    const visitor = await freshUser('P1114 Double Tap Visitor');
    await rsvpToEvent(event.id, visitor.user.id);
    // Seeded (undecided) purely so the test holds the member id — arriving would create
    // this row anyway, and join_event_room upserts onto it rather than duplicating.
    const member = await seedRoomMember(event.id, {
      profileId: visitor.user.id,
      displayName: 'P1114 Double Tap Visitor',
    });
    memberIds.push(member.id);
    await setTestSession(page, visitor.email);
    await page.goto(`/events/${event.slug}/meet`);

    await page.getByTestId('room-opt-in-yes').click();
    await page.getByRole('button', { name: 'Rate 5' }).click();

    // Fired from INSIDE the page, three synchronous .click() calls in ONE frame. This is
    // load-bearing and was arrived at the hard way: three awaited Playwright clicks (even
    // under Promise.all) still round-trip over CDP between each one, which gives React
    // time to re-render and disable the button — that version of this test PASSED against
    // a deliberately broken guard, i.e. it proved nothing. Only a same-frame burst
    // reproduces the race the latch exists for.
    await page.evaluate(() => {
      const submit = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Submit',
      );
      if (!submit) throw new Error('Submit button not found — the rating step did not render.');
      submit.click();
      submit.click();
      submit.click();
    });

    await expect(page.getByTestId('room-my-opt-in-status')).toHaveAttribute('data-opted-in', 'true');

    const answers = await readRoomAnswers(member.id);
    expect(
      answers.length,
      `${answers.length} answer-history rows were written by a triple-tapped Submit. Exactly one belongs there; the in-flight latch in EventRoomMeet.tsx is not holding.`,
    ).toBe(1);
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

  test('a first-time registered attendee: "Start event" routes through the readiness question first, not straight to the principle', async ({ page }) => {
    const attendee = await freshRegistered('P1114 Tab E2E First Visit');
    await setTestSession(page, attendee.email);
    await page.goto(`/events/${event.slug}`);

    await page.getByRole('link', { name: 'Start event' }).click();
    await expect(
      page,
      '"Start event" must link to /room (the smart entry point that decides readiness-vs-principle), not straight to /meet — linking to /meet directly bypasses the readiness question entirely, even for a first-time visitor (founder repro, 2026-08-21: a fresh account never saw the slider).',
    ).toHaveURL(new RegExp(`/events/${event.slug}/ready$`));
    await expect(page.getByTestId('room-ready')).toBeVisible();

    await page.goBack();
    await expect(
      page,
      'One Back press from the room did not return to the event page — a real <a> navigation pushes exactly one history entry, unlike the old Radix TabsTrigger whose onValueChange could double-fire per click.',
    ).toHaveURL(new RegExp(`/events/${event.slug}(\\?|$)`));
  });

  test('a returning attendee who already set readiness: "Start event" skips straight to the principle page', async ({ page }) => {
    const attendee = await freshRegistered('P1114 Tab E2E Returning');
    await setTestSession(page, attendee.email);
    // First pass through /ready sets readiness_value — reuses the real flow rather
    // than a seeded fixture, so this exercises exactly what a real return visit does.
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('room-meet')).toBeVisible();

    await page.goto(`/events/${event.slug}`);
    await page.getByRole('link', { name: 'Start event' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet$`));
    await expect(page.getByTestId('room-meet')).toBeVisible();
  });

  test('a signed-out visitor clicking "Start event" reaches the gate, not the room content', async ({ page }) => {
    await page.goto(`/events/${event.slug}`);
    await page.getByRole('link', { name: 'Start event' }).click();
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
